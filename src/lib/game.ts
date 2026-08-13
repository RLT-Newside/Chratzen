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

export type GamePhase = 'lobby' | 'blind' | 'calls' | 'exchange' | 'sleeper' | 'play' | 'settle'

export type GPlayer = {
  id: string
  name: string
  balance: number
  connected: boolean
  /** Wird vom Tischwirt gespielt, hat keine Verbindung und trödelt nie. */
  bot?: boolean
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
  /**
   * Die aufgedeckte Trumpfkarte liegt auf dem Tisch und gehört niemandem — nur
   * der Blinde nimmt sie in die Hand. Dann darf sie beim Neuaufdecken nicht auf
   * den Ablagestapel, sonst wäre sie doppelt im Spiel.
   */
  trumpInHand: boolean
  calls: Record<string, Call>
  /** Index des Spielers, der gerade dran ist. */
  turn: number
  /** Noch ausstehende Ansagen in dieser Ansagerunde. */
  callsLeft: number
  /** Reihenfolge der Ansagen — zeigt, wer vor dem Kratzer dran war. */
  callOrder: string[]
  /**
   * Wer vor dem Kratzer gepasst hat, wird nochmals gefragt: als er dran war,
   * gab es ja noch niemanden, mit dem man hätte mitgehen können.
   */
  secondChance: string[]
  /**
   * Der Geber hat den Trumpf umgedreht und entscheidet, ob er einen Blinden
   * ansagt. Solange das offen ist, bekommt er seine eigene Hand nicht zu sehen
   * — sonst wäre "blind" nur ein Wort.
   */
  blindOffer: string | null
  /** Der Geber hat blind gekratzt. */
  blind: boolean
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
    trumpInHand: false,
    calls: {},
    turn: 0,
    callsLeft: 0,
    callOrder: [],
    secondChance: [],
    blindOffer: null,
    blind: false,
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
function revealTrump(g: Game, card: Card, freshDeal: boolean) {
  g.trump = card
  g.trumpInHand = false
  g.calls = Object.fromEntries(g.players.map((p) => [p.id, 'weiter' as Call]))
  g.awaitLetzter = false
  g.callOrder = []
  g.secondChance = []
  g.blindOffer = null
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
    return
  }

  // Nur direkt nach dem Austeilen: der Geber hat erst den Trumpf gesehen und
  // darf blind kratzen. Nach einem Neuaufdecken kennt er seine Karten längst.
  if (freshDeal) {
    g.phase = 'blind'
    g.blindOffer = g.players[g.dealerIndex].id
    g.turn = g.dealerIndex
    return
  }
  g.phase = 'calls'
}

/**
 * Blinder: der Geber verpflichtet sich auf 2 Stiche, ohne seine Karten gesehen
 * zu haben. Dafür behält er die Trumpfkarte und bekommt vier frische dazu —
 * fünf Karten, von denen vor dem Ausspielen eine verdeckt weggeht.
 */
export function declareBlind(g: Game, playerId: string): string | null {
  if (g.phase !== 'blind') return 'Gerade kein Blinder möglich.'
  if (g.blindOffer !== playerId) return 'Nur der Geber kann blind kratzen.'

  // Die ausgeteilten Karten gehen ungesehen weg; er nimmt die Trumpfkarte vom
  // Tisch und bekommt vier frische dazu.
  for (const c of g.hands[playerId] ?? []) g.discards.push(c)
  g.hands[playerId] = [g.trump as Card]
  g.trumpInHand = true
  for (let k = 0; k < 4; k++) g.hands[playerId].push(draw(g))

  g.blind = true
  g.blindOffer = null
  g.calls[playerId] = 'kratzen'
  // Der Geber hat als Erster gesprochen — deshalb bekommt niemand eine zweite
  // Chance, alle anderen sagen ohnehin nach ihm an.
  g.callOrder = [playerId]
  g.callsLeft = g.players.length - 1
  g.phase = 'calls'
  g.turn = left(g, g.dealerIndex)
  g.message = `${g.players[g.dealerIndex].name} macht einen Blinden und kratzt.`
  return null
}

/** Der Geber verzichtet, schaut seine Karten an, und es geht normal weiter. */
export function declineBlind(g: Game, playerId: string): string | null {
  if (g.phase !== 'blind') return 'Gerade steht kein Blinder zur Wahl.'
  if (g.blindOffer !== playerId) return 'Das entscheidet der Geber.'
  g.blindOffer = null
  g.phase = 'calls'
  g.turn = left(g, g.dealerIndex)
  g.callsLeft = g.players.length
  return null
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
  g.blind = false

  for (let round = 0; round < 4; round++) {
    for (let k = 0; k < g.players.length; k++) {
      g.hands[at(g, g.dealerIndex + 1 + k).id].push(draw(g))
    }
  }
  // Die letzte Karte deckt der Geber auf: sie bestimmt den Trumpf und bleibt
  // auf dem Tisch liegen. Nur ein Blinder nimmt sie später in die Hand.
  revealTrump(g, draw(g), true)
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
  if (g.phase === 'blind') return g.players.find((p) => p.id === g.blindOffer) ?? null
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
    case 'blind':
      return declineBlind(g, actor.id)
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
  g.turn = kratzerIndex(g)
  g.leader = g.turn
}

/**
 * Der Kratzer eröffnet: er tauscht zuerst und spielt den ersten Stich aus.
 * Fehlt er ausnahmsweise, gilt der erste Teilnehmer links vom Geber.
 */
function kratzerIndex(g: Game): number {
  const i = g.players.findIndex((p) => g.calls[p.id] === 'kratzen')
  return i >= 0 ? i : nextParticipant(g, g.dealerIndex)
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
    // Nur ein nachgezogener Trumpf gehört auf den Ablagestapel — die Handkarte
    // des Gebers liegt ja weiterhin bei ihm.
    if (g.trump && !g.trumpInHand) g.discards.push(g.trump)
    g.message = `Niemand spielt — ${g.flips}. neuer Trumpf.`
    revealTrump(g, draw(g), false)
    return
  }
  g.flips = 0
  collectAnte(g)
  g.message = '3× niemand gespielt — neu gemischt, alle legen nach.'
  deal(g)
}

/**
 * Erste Ansagerunde vorbei. Wer vor dem Kratzer gepasst hat, kommt nochmals
 * dran: als er sprach, gab es niemanden, mit dem er hätte mitgehen können.
 */
function afterCalls(g: Game) {
  const kratzer = g.players.find((p) => g.calls[p.id] === 'kratzen')

  if (!kratzer) {
    // Ohne Kratzer gibt es nichts, wozu man mitginge — auch "Letzter" verfällt.
    const letzter = g.players.find((p) => g.calls[p.id] === 'letzter')
    if (letzter) g.calls[letzter.id] = 'weiter'
    nobodyPlays(g)
    return
  }

  const before = g.callOrder.slice(0, g.callOrder.indexOf(kratzer.id))
  g.secondChance = before.filter((id) => g.calls[id] === 'weiter')

  if (g.secondChance.length > 0) {
    g.turn = indexOf(g, g.secondChance[0])
    g.message = `${kratzer.name} kratzt — nochmals fragen, wer vorher gepasst hat.`
    return
  }
  resolveLetzter(g)
}

/** Der Letzte entscheidet als allerletzter, also nach den zweiten Chancen. */
function resolveLetzter(g: Game) {
  const list = g.players.map((p) => g.calls[p.id] ?? 'weiter')
  const letzterIdx = list.indexOf('letzter')

  if (letzterIdx >= 0) {
    if (letzterMustGo(list)) {
      g.calls[g.players[letzterIdx].id] = 'mitgehen'
      g.message = `${g.players[letzterIdx].name} war Letzter und muss mitgehen.`
    } else {
      g.awaitLetzter = true
      g.turn = letzterIdx
      return
    }
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

  // Zweite Chance: gefragt wird der Reihe nach, kratzen geht jetzt nicht mehr.
  if (g.secondChance.length > 0) {
    if (call !== 'mitgehen' && call !== 'weiter') return 'Jetzt nur noch mitgehen oder passen.'
    g.calls[playerId] = call
    g.secondChance = g.secondChance.filter((id) => id !== playerId)
    if (g.secondChance.length > 0) g.turn = indexOf(g, g.secondChance[0])
    else resolveLetzter(g)
    return null
  }

  if (call === 'kratzen' && others.includes('kratzen')) {
    return 'Es kratzt nur einer — du kannst noch mitgehen.'
  }
  if (call === 'mitgehen' && !others.includes('kratzen')) {
    return 'Mitgehen geht nur, wenn schon jemand gekratzt hat.'
  }
  if (call === 'letzter' && others.includes('letzter')) {
    return 'Es kann nur einer "Letzter" sagen.'
  }

  g.calls[playerId] = call
  g.callOrder.push(playerId)
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

  // Schlafkarte: wer seine ganze Hand tauscht, bekommt eine Karte mehr zurück.
  // Der Blinde hat schon fünf und tauscht nie alles — er kriegt keinen Nachschlag.
  const drawCount = discard.length === hand.length ? discard.length + 1 : discard.length
  for (let k = 0; k < drawCount; k++) g.hands[playerId].push(draw(g))
  // Wer mit mehr als vier Karten dasteht, wirft vor dem Ausspielen eine ab.
  if (g.hands[playerId].length > TRICKS_PER_ROUND) g.sleepers.push(playerId)

  g.exchanged[playerId] = true

  const pending = participants(g).filter((p) => !g.exchanged[p.id])
  if (pending.length > 0) {
    g.turn = nextParticipant(g, g.turn)
    return null
  }

  g.phase = g.sleepers.length > 0 ? 'sleeper' : 'play'
  g.turn = kratzerIndex(g)
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
    g.turn = kratzerIndex(g)
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
  /** Die Trumpfkarte liegt nicht mehr auf dem Tisch — der Blinde hat sie genommen. */
  trumpInHand: boolean
  turn: number
  awaitLetzter: boolean
  /** Du hast vor dem Kratzer gepasst und wirst nochmals gefragt. */
  secondChance: boolean
  /** Du bist der Geber und entscheidest über den Blinden — Hand noch verdeckt. */
  blindOffer: boolean
  /** In dieser Runde wurde blind gekratzt. */
  blind: boolean
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
  // Solange der Geber über den Blinden entscheidet, sieht er seine Karten nicht
  // — sonst könnte er nachschauen und trotzdem "blind" ansagen.
  const hand = g.blindOffer === youId ? [] : (g.hands[youId] ?? [])
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
    trumpInHand: g.trumpInHand,
    turn: g.turn,
    awaitLetzter: g.awaitLetzter,
    secondChance: g.secondChance.includes(youId),
    blindOffer: g.blindOffer === youId,
    blind: g.blind,
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
