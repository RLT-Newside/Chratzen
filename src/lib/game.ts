/**
 * Server-autoritative Chratzen-Engine für den digitalen Modus.
 * Mutiert den übergebenen Zustand; Aktionen geben bei Regelverstoss einen
 * Fehlertext zurück (sonst null).
 */
import {
  BANNER,
  type Card,
  type CardId,
  type Suit,
  cardId,
  freshDeck,
  legalCards,
  shuffle,
  trickWinner,
} from './cards'
import {
  type Call,
  MAX_TRUMP_FLIPS,
  type Settlement,
  TRICKS_PER_ROUND,
  bannerCalls,
  isPlaying,
  letzterMustGo,
  settleRound,
} from './rules'

export type GamePhase = 'lobby' | 'calls' | 'exchange' | 'sleeper' | 'play' | 'settle'

export type GPlayer = {
  id: string
  name: string
  balance: number
  connected: boolean
}

export type Game = {
  ante: number
  players: GPlayer[]
  hostId: string
  dealerIndex: number
  pot: number
  round: number
  flips: number
  banner: boolean
  phase: GamePhase
  deck: Card[]
  discards: Card[]
  hands: Record<string, Card[]>
  trump: Card | null
  calls: Record<string, Call>
  /** Index des Spielers, der gerade dran ist. */
  turn: number
  /** Noch ausstehende Ansagen in dieser Ansagerunde. */
  callsLeft: number
  awaitLetzter: boolean
  exchanged: Record<string, boolean>
  /** Spieler mit 5 Karten, die noch eine Schlafkarte abwerfen müssen. */
  sleepers: string[]
  trick: { playerId: string; card: Card }[]
  leader: number
  tricksWon: Record<string, number>
  trickHistory: { winner: string; cards: { playerId: string; card: Card }[] }[]
  settlement: Settlement | null
  message: string | null
  /** Vom Host markiert; fliegen beim Start der nächsten Runde raus. */
  pendingKicks: string[]
  /** Setzt der Server: darf der Host den aktuellen Zug gerade erzwingen? */
  forceAllowed: boolean
}

export function createGame(hostId: string, ante: number): Game {
  return {
    ante,
    players: [],
    hostId,
    dealerIndex: 0,
    pot: 0,
    round: 1,
    flips: 0,
    banner: false,
    phase: 'lobby',
    deck: [],
    discards: [],
    hands: {},
    trump: null,
    calls: {},
    turn: 0,
    callsLeft: 0,
    awaitLetzter: false,
    exchanged: {},
    sleepers: [],
    trick: [],
    leader: 0,
    tricksWon: {},
    trickHistory: [],
    settlement: null,
    message: null,
    pendingKicks: [],
    forceAllowed: false,
  }
}

const at = (g: Game, i: number) => g.players[i % g.players.length]
const indexOf = (g: Game, id: string) => g.players.findIndex((p) => p.id === id)
const left = (g: Game, i: number) => (i + 1) % g.players.length
const participants = (g: Game) => g.players.filter((p) => isPlaying(g.calls[p.id] ?? 'weiter'))

function draw(g: Game): Card {
  if (g.deck.length === 0) {
    g.deck = shuffle(g.discards)
    g.discards = []
  }
  // Mit 36 Karten und ≤8 Spielern kann das nur nach vielen Tauschrunden leerlaufen;
  // der Reshuffle oben deckt den Fall ab.
  return g.deck.pop() as Card
}

function collectAnte(g: Game) {
  for (const p of g.players) p.balance -= g.ante
  g.pot += g.ante * g.players.length
}

/** Trumpf aufdecken und prüfen, ob es eine Bannerrunde ist. */
function revealTrump(g: Game, card: Card) {
  g.trump = card
  g.calls = Object.fromEntries(g.players.map((p) => [p.id, 'weiter' as Call]))
  g.awaitLetzter = false
  g.turn = left(g, g.dealerIndex)
  g.callsLeft = g.players.length
  g.banner = card.rank === BANNER

  if (g.banner) {
    const forced = bannerCalls(g.players.length, g.dealerIndex)
    g.players.forEach((p, i) => {
      g.calls[p.id] = forced[i]
    })
    g.message = 'Bannerrunde! Der Geber kratzt, alle anderen gehen mit.'
    beginExchange(g)
  } else {
    g.phase = 'calls'
  }
}

/** Karten einzeln reihum austeilen; die letzte Karte des Gebers ist der Trumpf. */
function deal(g: Game) {
  g.deck = shuffle(freshDeck())
  g.discards = []
  g.hands = Object.fromEntries(g.players.map((p) => [p.id, [] as Card[]]))
  g.trickHistory = []
  g.tricksWon = Object.fromEntries(g.players.map((p) => [p.id, 0]))
  g.exchanged = {}
  g.sleepers = []
  g.trick = []

  let last: Card | null = null
  for (let round = 0; round < 4; round++) {
    for (let k = 0; k < g.players.length; k++) {
      const p = at(g, g.dealerIndex + 1 + k)
      last = draw(g)
      g.hands[p.id].push(last)
    }
  }
  revealTrump(g, last as Card)
}

/**
 * Neue Runde eröffnen: markierte Spieler entfernen, Pott auffüllen (falls leer),
 * austeilen, Trumpf zeigen. Bleiben weniger als 2 Spieler, geht es zurück in die Lobby.
 */
export function startRound(g: Game) {
  const removed = dropPendingKicks(g)
  if (g.players.length < 2) {
    g.phase = 'lobby'
    g.trump = null
    g.hands = {}
    g.message = 'Zu wenige Spieler — zurück in die Lobby.'
    return
  }
  g.flips = 0
  g.settlement = null
  g.message = null
  if (g.pot === 0) collectAnte(g)
  deal(g)
  if (removed.length > 0) g.message = `${removed.join(', ')} wurde vom Tisch genommen.`
}

/** Entfernt einen Spieler restlos aus dem Zustand. */
function removePlayer(g: Game, id: string): string | null {
  const i = indexOf(g, id)
  if (i < 0) return null
  const [gone] = g.players.splice(i, 1)
  delete g.hands[id]
  delete g.calls[id]
  delete g.tricksWon[id]
  delete g.exchanged[id]
  g.sleepers = g.sleepers.filter((x) => x !== id)
  if (g.players.length > 0 && g.dealerIndex >= g.players.length) g.dealerIndex = 0
  if (g.hostId === id && g.players[0]) g.hostId = g.players[0].id
  return gone.name
}

function dropPendingKicks(g: Game): string[] {
  const names = g.pendingKicks.map((id) => removePlayer(g, id)).filter((n): n is string => !!n)
  g.pendingKicks = []
  return names
}

/**
 * Host wirft jemanden raus. In der Lobby sofort, in laufender Partie erst zur
 * nächsten Runde — sonst würden Stiche und Pott mitten in der Runde nicht mehr aufgehen.
 */
export function kickPlayer(g: Game, hostId: string, targetId: string): string | null {
  if (g.hostId !== hostId) return 'Nur der Host kann jemanden entfernen.'
  if (targetId === hostId) return 'Du kannst dich nicht selbst entfernen.'
  if (indexOf(g, targetId) < 0) return 'Spieler nicht am Tisch.'

  if (g.phase === 'lobby') {
    removePlayer(g, targetId)
    return null
  }
  if (g.pendingKicks.includes(targetId)) {
    g.pendingKicks = g.pendingKicks.filter((x) => x !== targetId)
    return null
  }
  g.pendingKicks.push(targetId)
  return null
}

/** Wer ist gerade am Zug (in der Schlafkarten-Phase der erste offene Sleeper)? */
export function currentActor(g: Game): GPlayer | null {
  if (g.phase === 'sleeper') return g.players.find((p) => p.id === g.sleepers[0]) ?? null
  if (g.phase === 'lobby' || g.phase === 'settle') return null
  return g.players[g.turn] ?? null
}

/**
 * Host spielt für jemanden, der nicht reagiert: passen, nicht tauschen,
 * erste legale Karte. Der Server entscheidet über `forceAllowed`, wann das geht.
 */
export function forceMove(g: Game, hostId: string): string | null {
  if (g.hostId !== hostId) return 'Nur der Host kann einen Zug erzwingen.'
  if (!g.forceAllowed) return 'Noch zu früh — der Spieler ist dran.'

  const actor = currentActor(g)
  if (!actor) return 'Gerade ist niemand am Zug.'

  switch (g.phase) {
    case 'calls':
      return applyCall(g, actor.id, 'weiter')
    case 'exchange':
      return applyExchange(g, actor.id, [])
    case 'sleeper':
      return applySleeperDiscard(g, actor.id, cardId(g.hands[actor.id][0]))
    case 'play': {
      const lead = g.trick[0]?.card.suit ?? null
      return playCard(g, actor.id, cardId(legalCards(g.hands[actor.id], lead)[0]))
    }
    default:
      return 'Hier gibt es nichts zu erzwingen.'
  }
}

function beginExchange(g: Game) {
  g.phase = 'exchange'
  const inGame = participants(g)
  if (inGame.length === 0) return
  g.turn = nextParticipant(g, g.dealerIndex)
  g.leader = g.turn
}

/** Nächster noch spielender Spieler links von `from`. */
function nextParticipant(g: Game, from: number): number {
  for (let k = 1; k <= g.players.length; k++) {
    const i = (from + k) % g.players.length
    if (isPlaying(g.calls[g.players[i].id] ?? 'weiter')) return i
  }
  return from
}

/** Alle haben gepasst: neuen Trumpf aufdecken — nach 3× neu mischen und nachlegen. */
function nobodyPlays(g: Game) {
  g.flips += 1
  if (g.flips < MAX_TRUMP_FLIPS) {
    if (g.trump) g.discards.push(g.trump)
    g.message = `Niemand spielt — ${g.flips}. neuer Trumpf.`
    revealTrump(g, draw(g))
    return
  }
  g.flips = 0
  collectAnte(g)
  g.message = '3× niemand gespielt — neu gemischt, alle legen nach.'
  deal(g)
}

/** Ansagen abgeschlossen? Dann Letzter auflösen bzw. weiter zum Tausch. */
function afterCalls(g: Game) {
  const list = g.players.map((p) => g.calls[p.id] ?? 'weiter')
  const letzterIdx = list.indexOf('letzter')

  if (letzterIdx >= 0) {
    if (letzterMustGo(list)) {
      g.calls[g.players[letzterIdx].id] = 'mitgehen'
      g.message = `${g.players[letzterIdx].name} war Letzter und muss mitgehen.`
    } else if (list.some((c) => c === 'kratzen')) {
      g.awaitLetzter = true
      g.turn = letzterIdx
      return
    } else {
      // Niemand hat gekratzt — "Letzter" verfällt.
      g.calls[g.players[letzterIdx].id] = 'weiter'
    }
  }

  if (!g.players.some((p) => g.calls[p.id] === 'kratzen')) {
    nobodyPlays(g)
    return
  }
  beginExchange(g)
}

export function applyCall(g: Game, playerId: string, call: Call): string | null {
  if (g.phase !== 'calls') return 'Gerade keine Ansagen möglich.'
  const i = indexOf(g, playerId)
  if (i < 0) return 'Unbekannter Spieler.'
  if (i !== g.turn) return 'Du bist nicht am Zug.'

  const others = g.players.filter((p) => p.id !== playerId).map((p) => g.calls[p.id] ?? 'weiter')

  if (g.awaitLetzter) {
    if (call !== 'mitgehen' && call !== 'weiter') return 'Als Letzter: mitgehen oder passen.'
    g.calls[playerId] = call
    g.awaitLetzter = false
    beginExchange(g)
    return null
  }

  if (call === 'mitgehen' && !others.includes('kratzen')) {
    return 'Mitgehen geht nur, wenn schon jemand gekratzt hat.'
  }
  if (call === 'letzter' && others.includes('letzter')) {
    return 'Es kann nur einer "Letzter" sagen.'
  }

  g.calls[playerId] = call
  g.callsLeft -= 1
  g.turn = left(g, g.turn)
  if (g.callsLeft === 0) afterCalls(g)
  return null
}

export function applyExchange(g: Game, playerId: string, discard: CardId[]): string | null {
  if (g.phase !== 'exchange') return 'Gerade kein Kartentausch.'
  if (indexOf(g, playerId) !== g.turn) return 'Du bist nicht am Zug.'
  if (!isPlaying(g.calls[playerId] ?? 'weiter')) return 'Du bist diese Runde nicht dabei.'
  if (discard.length > 4) return 'Höchstens 4 Karten tauschen.'

  const hand = g.hands[playerId]
  const ids = new Set(discard)
  if (ids.size !== discard.length) return 'Doppelte Karte gewählt.'
  if (!discard.every((id) => hand.some((c) => cardId(c) === id))) return 'Karte nicht auf der Hand.'

  g.hands[playerId] = hand.filter((c) => !ids.has(cardId(c)))
  for (const c of hand.filter((c) => ids.has(cardId(c)))) g.discards.push(c)

  // Schlafkarte: wer alle 4 tauscht, bekommt 5 neue und wirft danach 1 verdeckt ab.
  const drawCount = discard.length === 4 ? 5 : discard.length
  for (let k = 0; k < drawCount; k++) g.hands[playerId].push(draw(g))
  if (drawCount === 5) g.sleepers.push(playerId)

  g.exchanged[playerId] = true

  const pending = participants(g).filter((p) => !g.exchanged[p.id])
  if (pending.length > 0) {
    g.turn = nextParticipant(g, g.turn)
    return null
  }

  g.phase = g.sleepers.length > 0 ? 'sleeper' : 'play'
  g.turn = nextParticipant(g, g.dealerIndex)
  g.leader = g.turn
  return null
}

export function applySleeperDiscard(g: Game, playerId: string, card: CardId): string | null {
  if (g.phase !== 'sleeper') return 'Gerade keine Schlafkarte abzuwerfen.'
  if (!g.sleepers.includes(playerId)) return 'Du hast keine Schlafkarte.'
  const hand = g.hands[playerId]
  const idx = hand.findIndex((c) => cardId(c) === card)
  if (idx < 0) return 'Karte nicht auf der Hand.'

  g.discards.push(hand[idx])
  hand.splice(idx, 1)
  g.sleepers = g.sleepers.filter((id) => id !== playerId)

  if (g.sleepers.length === 0) {
    g.phase = 'play'
    g.turn = nextParticipant(g, g.dealerIndex)
    g.leader = g.turn
  }
  return null
}

export function playCard(g: Game, playerId: string, card: CardId): string | null {
  if (g.phase !== 'play') return 'Gerade kein Ausspielen.'
  if (indexOf(g, playerId) !== g.turn) return 'Du bist nicht am Zug.'

  const hand = g.hands[playerId]
  const chosen = hand.find((c) => cardId(c) === card)
  if (!chosen) return 'Karte nicht auf der Hand.'

  const lead = g.trick[0]?.card.suit ?? null
  if (!legalCards(hand, lead).some((c) => cardId(c) === card)) {
    return 'Farbe muss bedient werden.'
  }

  g.hands[playerId] = hand.filter((c) => cardId(c) !== card)
  g.trick.push({ playerId, card: chosen })

  const inGame = participants(g)
  if (g.trick.length < inGame.length) {
    g.turn = nextParticipant(g, g.turn)
    return null
  }

  const winner = trickWinner(g.trick, (g.trump as Card).suit)
  g.tricksWon[winner] = (g.tricksWon[winner] ?? 0) + 1
  g.trickHistory.push({ winner, cards: g.trick })
  for (const t of g.trick) g.discards.push(t.card)
  g.trick = []
  g.leader = indexOf(g, winner)
  g.turn = g.leader

  if (g.trickHistory.length === TRICKS_PER_ROUND) {
    g.phase = 'settle'
    g.settlement = settleRound(
      g.pot,
      inGame.map((p) => ({
        playerId: p.id,
        call: g.calls[p.id] as Call,
        tricks: g.tricksWon[p.id] ?? 0,
      })),
    )
  }
  return null
}

/** Abrechnung buchen und die nächste Runde starten. */
export function nextRound(g: Game): string | null {
  if (g.phase !== 'settle' || !g.settlement) return 'Runde läuft noch.'
  const s = g.settlement
  for (const p of g.players) {
    p.balance += (s.payouts[p.id] ?? 0) - (s.penalties[p.id] ?? 0)
  }
  g.pot = s.potAfter
  g.dealerIndex = left(g, g.dealerIndex)
  g.round += 1
  startRound(g)
  return null
}

// ---------------------------------------------------------------------------
// Sicht für einen einzelnen Spieler — fremde Hände und der Reststapel bleiben
// geheim.

export type ClientGame = {
  ante: number
  players: (GPlayer & { cards: number; call: Call; tricks: number })[]
  hostId: string
  youId: string
  dealerIndex: number
  pot: number
  round: number
  flips: number
  banner: boolean
  phase: GamePhase
  hand: Card[]
  trump: Card | null
  turn: number
  awaitLetzter: boolean
  yourTurn: boolean
  legal: CardId[]
  mustDiscardSleeper: boolean
  trick: { playerId: string; card: Card }[]
  trickHistory: { winner: string; cards: { playerId: string; card: Card }[] }[]
  settlement: Settlement | null
  message: string | null
  deckLeft: number
  /** Spieler, die beim Rundenwechsel entfernt werden. */
  pendingKicks: string[]
  /** ID des Spielers, auf den gerade gewartet wird. */
  actorId: string | null
  /** Darf der Host den Zug jetzt erzwingen? */
  canForce: boolean
  isHost: boolean
}

export function redact(g: Game, youId: string): ClientGame {
  const hand = g.hands[youId] ?? []
  const yourTurn = g.players[g.turn]?.id === youId
  const lead = g.trick[0]?.card.suit ?? null

  return {
    ante: g.ante,
    players: g.players.map((p) => ({
      ...p,
      cards: (g.hands[p.id] ?? []).length,
      call: g.calls[p.id] ?? 'weiter',
      tricks: g.tricksWon[p.id] ?? 0,
    })),
    hostId: g.hostId,
    youId,
    dealerIndex: g.dealerIndex,
    pot: g.pot,
    round: g.round,
    flips: g.flips,
    banner: g.banner,
    phase: g.phase,
    hand,
    trump: g.trump,
    turn: g.turn,
    awaitLetzter: g.awaitLetzter,
    yourTurn: yourTurn && g.phase !== 'sleeper',
    legal:
      g.phase === 'play' && yourTurn ? legalCards(hand, lead as Suit | null).map(cardId) : [],
    mustDiscardSleeper: g.phase === 'sleeper' && g.sleepers.includes(youId),
    trick: g.trick,
    trickHistory: g.trickHistory,
    settlement: g.settlement,
    message: g.message,
    deckLeft: g.deck.length,
    pendingKicks: g.pendingKicks,
    actorId: currentActor(g)?.id ?? null,
    canForce: g.forceAllowed && g.hostId === youId,
    isHost: g.hostId === youId,
  }
}
