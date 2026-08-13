/**
 * Der Tischwirt: Räume, Sitzungen und Regelaufrufe — ohne jede Abhängigkeit zu
 * Node, Sockets oder DOM. Er nimmt Nachrichten entgegen und gibt zurück, was an
 * welche Verbindung geschickt werden soll.
 *
 * Dadurch läuft dieselbe Logik unverändert im Node-Server (viele Räume) und im
 * Host-Handy, wo ein natives Plugin die Verbindungen durchreicht (ein Raum).
 */
import { botCall, botDiscard, botExchange, botName, botPlay } from './bot'
import { type Card, cardId, legalCards } from './cards'
import {
  type Game,
  applyCall,
  applyExchange,
  applySleeperDiscard,
  createGame,
  currentActor,
  declareBlind,
  declineBlind,
  finishTrick,
  forceMove,
  kickPlayer,
  nextRound,
  playCard,
  redact,
  setTrickPause,
  startRound,
} from './game'
import type { ClientMsg, Outgoing } from './protocol'

export const MAX_PLAYERS = 8
/** So lange darf jemand am Zug trödeln, bevor der Host für ihn spielen darf. */
export const STALL_MS = 30_000
/** Räume ohne verbundene Spieler werden nach dieser Zeit entsorgt. */
export const ROOM_TTL_MS = 30 * 60 * 1000

// Ohne 0/O/1/I — am Stammtisch wird der Code vorgelesen.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

type Room = {
  code: string
  game: Game
  /** Geheimes Session-Token → öffentliche Spieler-ID. */
  sessions: Map<string, string>
  /** Spieler-ID → Verbindungs-ID. */
  conns: Map<string, string>
  emptySince: number | null
  turnSince: number
  turnKey: string
  /** Wann der fertige Stich zum Liegen kam. */
  trickSince: number
}

export type HostOptions = {
  /** Nur ein fixer Raum (Host-Handy) — `create` liefert immer diesen Code. */
  fixedCode?: string
  randomId?: () => string
  now?: () => number
}

function cleanName(raw: unknown): string {
  return String(raw ?? '').trim().slice(0, 16) || 'Spieler'
}

export class TableHost {
  private rooms = new Map<string, Room>()
  /** Verbindungs-ID → Raum + Spieler. */
  private links = new Map<string, { code: string; playerId: string }>()
  private readonly fixedCode?: string
  private readonly randomId: () => string
  private readonly now: () => number

  constructor(opts: HostOptions = {}) {
    this.fixedCode = opts.fixedCode
    this.randomId = opts.randomId ?? (() => Math.random().toString(36).slice(2, 12))
    this.now = opts.now ?? (() => Date.now())
  }

  get roomCount() {
    return this.rooms.size
  }

  /** Für das Host-Handy: der eine Raum, damit die UI Code und Stand kennt. */
  room(code: string): Game | null {
    return this.rooms.get(code)?.game ?? null
  }

  private newCode(): string {
    if (this.fixedCode) return this.fixedCode
    let code: string
    do {
      code = Array.from(
        { length: 4 },
        () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)],
      ).join('')
    } while (this.rooms.has(code))
    return code
  }

  /** Zustand an alle Verbindungen des Raums — jeweils aus deren Sicht. */
  private broadcast(room: Room): Outgoing[] {
    // Pause "Aus" heisst sofort, nicht erst beim nächsten Tick.
    if (room.game.trickPending && room.game.trickPauseMs === 0) finishTrick(room.game)

    const actor = currentActor(room.game)

    // Uhr für die Stichpause: läuft, sobald der Stich entschieden daliegt.
    room.trickSince = room.game.trickPending ? room.trickSince || this.now() : 0

    // Zug-Uhr nur zurücksetzen, wenn wirklich ein neuer Zug beginnt.
    const key = `${room.game.round}|${room.game.phase}|${actor?.id ?? '-'}|${room.game.trick.length}`
    if (key !== room.turnKey) {
      room.turnKey = key
      room.turnSince = this.now()
    }

    // Der Host darf einspringen, sobald jemand weg ist oder zu lange trödelt.
    room.game.forceAllowed =
      !!actor && (!actor.connected || this.now() - room.turnSince > STALL_MS)

    const out: Outgoing[] = []
    for (const [playerId, connId] of room.conns) {
      out.push({ to: connId, msg: { t: 'state', code: room.code, game: redact(room.game, playerId) } })
    }
    return out
  }

  private attach(room: Room, playerId: string, connId: string): void {
    const previous = room.conns.get(playerId)
    if (previous && previous !== connId) this.links.delete(previous)
    room.conns.set(playerId, connId)
    room.emptySince = null
    this.links.set(connId, { code: room.code, playerId })
    const player = room.game.players.find((p) => p.id === playerId)
    if (player) player.connected = true
  }

  private forget(room: Room, playerId: string): void {
    for (const [tok, id] of room.sessions) if (id === playerId) room.sessions.delete(tok)
    const connId = room.conns.get(playerId)
    if (connId) this.links.delete(connId)
    room.conns.delete(playerId)
  }

  disconnect(connId: string): Outgoing[] {
    const link = this.links.get(connId)
    this.links.delete(connId)
    if (!link) return []
    const room = this.rooms.get(link.code)
    if (!room) return []

    if (room.conns.get(link.playerId) === connId) room.conns.delete(link.playerId)
    const player = room.game.players.find((p) => p.id === link.playerId)
    if (player) player.connected = false

    // In der Lobby verschwindet man einfach; in laufender Partie bleibt der
    // Platz reserviert, damit man per Token zurückkommt.
    if (room.game.phase === 'lobby') {
      room.game.players = room.game.players.filter((p) => p.id !== link.playerId)
      for (const [tok, id] of room.sessions) if (id === link.playerId) room.sessions.delete(tok)
    }

    // Host-Rolle darf nie bei einem Offline-Spieler hängen bleiben, sonst kann
    // niemand mehr die nächste Runde starten oder einen Zug erzwingen. Bots
    // scheiden aus: sie drücken keine Knöpfe.
    if (room.game.hostId === link.playerId) {
      const humans = room.game.players.filter((p) => !p.bot)
      const heir = humans.find((p) => p.connected) ?? humans[0]
      if (heir) room.game.hostId = heir.id
    }

    if (room.conns.size === 0) room.emptySince = this.now()
    if (room.game.players.length === 0) {
      this.rooms.delete(room.code)
      return []
    }
    return this.broadcast(room)
  }

  receive(connId: string, msg: ClientMsg): Outgoing[] {
    switch (msg.t) {
      case 'create':
        return this.create(connId, msg.name, msg.ante)
      case 'join':
        return this.join(connId, msg.code, msg.name)
      case 'rejoin':
        return this.rejoin(connId, msg.code, msg.token)
      default:
        return this.inRoom(connId, msg)
    }
  }

  private create(connId: string, name: string, ante: number): Outgoing[] {
    const code = this.newCode()
    if (this.rooms.has(code)) return [{ to: connId, msg: { t: 'error', message: 'Tisch läuft schon.' } }]

    const playerId = this.randomId()
    const token = this.randomId() + this.randomId()
    const game = createGame(playerId, Number(ante) || 100)
    game.players.push({ id: playerId, name: cleanName(name), balance: 0, connected: true })

    const room: Room = {
      code,
      game,
      sessions: new Map([[token, playerId]]),
      conns: new Map(),
      emptySince: null,
      turnSince: this.now(),
      turnKey: '',
      trickSince: 0,
    }
    this.rooms.set(code, room)
    this.attach(room, playerId, connId)

    return [{ to: connId, msg: { t: 'joined', code, token } }, ...this.broadcast(room)]
  }

  private join(connId: string, rawCode: string, name: string): Outgoing[] {
    const room = this.rooms.get(String(rawCode ?? '').toUpperCase())
    const fail = (message: string): Outgoing[] => [{ to: connId, msg: { t: 'error', message } }]

    if (!room) return fail('Tisch nicht gefunden.')
    if (room.game.phase !== 'lobby') return fail('Partie läuft bereits.')
    if (room.game.players.length >= MAX_PLAYERS) return fail('Tisch ist voll.')

    const playerId = this.randomId()
    const token = this.randomId() + this.randomId()
    room.sessions.set(token, playerId)
    room.game.players.push({ id: playerId, name: cleanName(name), balance: 0, connected: true })
    this.attach(room, playerId, connId)

    return [{ to: connId, msg: { t: 'joined', code: room.code, token } }, ...this.broadcast(room)]
  }

  private rejoin(connId: string, rawCode: string, token: string): Outgoing[] {
    const room = this.rooms.get(String(rawCode ?? '').toUpperCase())
    const playerId = room?.sessions.get(token)
    if (!room || !playerId) {
      return [{ to: connId, msg: { t: 'error', message: 'Sitzung abgelaufen.' } }, { to: connId, msg: { t: 'kicked' } }]
    }
    this.attach(room, playerId, connId)
    return [{ to: connId, msg: { t: 'joined', code: room.code, token } }, ...this.broadcast(room)]
  }

  /** Alle Aktionen, die eine bestehende Sitzung voraussetzen. */
  private inRoom(connId: string, msg: ClientMsg): Outgoing[] {
    const link = this.links.get(connId)
    if (!link) return [{ to: connId, msg: { t: 'error', message: 'Nicht an einem Tisch.' } }]
    const room = this.rooms.get(link.code)
    if (!room) return [{ to: connId, msg: { t: 'error', message: 'Tisch existiert nicht mehr.' } }]

    const g = room.game
    const me = link.playerId
    let err: string | null = null
    const extra: Outgoing[] = []

    switch (msg.t) {
      case 'start':
        if (g.hostId !== me) err = 'Nur der Host startet die Partie.'
        else if (g.phase !== 'lobby') err = 'Partie läuft bereits.'
        else if (g.players.length < 2) err = 'Mindestens 2 Spieler.'
        else startRound(g)
        break
      case 'blind':
        err = msg.take ? declareBlind(g, me) : declineBlind(g, me)
        break
      case 'call':
        err = applyCall(g, me, msg.call)
        break
      case 'exchange':
        err = applyExchange(g, me, msg.cards ?? [])
        break
      case 'sleeper':
        err = applySleeperDiscard(g, me, msg.card)
        break
      case 'play':
        err = playCard(g, me, msg.card)
        break
      case 'next':
        err = nextRound(g)
        break
      case 'force':
        err = forceMove(g, me)
        break
      case 'setPause':
        err = setTrickPause(g, me, msg.ms)
        break
      case 'addBot':
        if (g.hostId !== me) err = 'Nur der Host kann Bots setzen.'
        else if (g.phase !== 'lobby') err = 'Bots nur in der Lobby.'
        else if (g.players.length >= MAX_PLAYERS) err = 'Tisch ist voll.'
        else {
          g.players.push({
            id: this.randomId(),
            name: botName(g.players.map((p) => p.name)),
            balance: 0,
            connected: true,
            bot: true,
          })
        }
        break
      case 'kick': {
        err = kickPlayer(g, me, msg.playerId)
        // Sofort entfernt (Lobby)? Dann Sitzung entwerten und Verbindung lösen.
        if (!err && !g.players.some((p) => p.id === msg.playerId)) {
          const victim = room.conns.get(msg.playerId)
          if (victim) {
            extra.push({ to: victim, msg: { t: 'error', message: 'Du wurdest vom Host entfernt.' } })
            extra.push({ to: victim, msg: { t: 'kicked' } })
          }
          this.forget(room, msg.playerId)
        }
        break
      }
      default:
        err = 'Unbekannte Nachricht.'
    }

    const out = err ? [{ to: connId, msg: { t: 'error' as const, message: err } }] : []
    return [...out, ...extra, ...this.broadcast(room)]
  }

  /**
   * Ein Zug pro Tick, wenn ein Bot dran ist. Bewusst nicht alle auf einmal:
   * so ziehen die Bots im Takt des Ticks und man kann zuschauen.
   */
  private stepBot(room: Room): Outgoing[] {
    const g = room.game
    const actor = currentActor(g)
    const trump = g.trump?.suit
    if (!actor?.bot || !trump) return []

    const hand = g.hands[actor.id] ?? []
    let err: string | null = null

    switch (g.phase) {
      case 'blind':
        // ponytail: Bots verzichten immer. Bewerten könnten sie den Blinden nur,
        // indem sie in die eigene Hand schauen — genau das verbietet die Regel.
        err = declineBlind(g, actor.id)
        break
      case 'calls':
        err = applyCall(
          g,
          actor.id,
          botCall({
            hand,
            trump,
            someoneKratzed: g.players.some((p) => g.calls[p.id] === 'kratzen'),
            awaitLetzter: g.awaitLetzter,
            isLastToSpeak: g.callsLeft <= 1,
          }),
        )
        break
      case 'exchange':
        err = applyExchange(g, actor.id, botExchange(hand, trump))
        break
      case 'sleeper':
        err = applySleeperDiscard(g, actor.id, botDiscard(hand, trump))
        break
      case 'play':
        err = playCard(g, actor.id, botPlay(actor.id, hand, g.trick, trump))
        break
      default:
        return []
    }

    // Ein Bot darf die Runde nie blockieren: lehnt die Engine seinen Zug ab,
    // kommt die harmlose Variante.
    if (err) this.fallbackMove(g, actor.id, hand)
    return this.broadcast(room)
  }

  private fallbackMove(g: Game, id: string, hand: Card[]) {
    const lead = g.trick[0]?.card.suit ?? null
    if (g.phase === 'blind') declineBlind(g, id)
    else if (g.phase === 'calls') applyCall(g, id, 'weiter')
    else if (g.phase === 'exchange') applyExchange(g, id, [])
    else if (g.phase === 'sleeper' && hand[0]) applySleeperDiscard(g, id, cardId(hand[0]))
    else if (g.phase === 'play') {
      const legal = legalCards(hand, lead)[0]
      if (legal) playCard(g, id, cardId(legal))
    }
  }

  /**
   * Regelmässig aufrufen: lässt Bots ziehen, räumt tote Räume ab und schickt
   * einen Zustand, sobald die Trödelgrenze erreicht ist — sonst würde der Host
   * nie mitbekommen, dass er einspringen darf, weil ja gerade nichts passiert.
   */
  tick(): Outgoing[] {
    const now = this.now()
    const out: Outgoing[] = []
    for (const [code, room] of this.rooms) {
      if (room.emptySince && now - room.emptySince > ROOM_TTL_MS) {
        this.rooms.delete(code)
        continue
      }

      // Erst den liegenden Stich abräumen, sonst zieht niemand weiter.
      if (room.game.trickPending && now - room.trickSince >= room.game.trickPauseMs) {
        finishTrick(room.game)
        out.push(...this.broadcast(room))
        continue
      }

      const moved = this.stepBot(room)
      if (moved.length > 0) {
        out.push(...moved)
        continue // Der Zustand ist gerade raus, die Trödel-Prüfung kann warten.
      }

      const actor = currentActor(room.game)
      const stalled = !!actor && (!actor.connected || now - room.turnSince > STALL_MS)
      if (stalled !== room.game.forceAllowed) out.push(...this.broadcast(room))
    }
    return out
  }
}
