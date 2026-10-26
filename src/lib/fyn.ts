/**
 * Fuck Your Neighbour — Stichansage-Spiel mit 36 Jasskarten, ohne Trumpf und
 * ohne Farbzwang: die höchste Karte holt den Stich, die Farbe zählt nicht.
 *
 * Gleiche Rolle wie `game.ts`: mutiert den Zustand, Aktionen geben bei
 * Regelverstoss einen Fehlertext zurück (sonst null).
 */
import { type Card, type CardId, cardId, freshDeck, shuffle } from './cards'
import type { GPlayer } from './game'

/** Karten pro Spieler, Runde für Runde: runter auf eine und wieder rauf. */
export const FYN_ROUNDS = [6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6] as const
/** 6 × 6 = 36 — mehr Spieler gehen mit einem Jassdeck nicht auf. */
export const FYN_MAX_PLAYERS = 6
export const POINTS_PER_TRICK = 10
/** Niemand holt den Stich — bei Gleichstand in der letzten Karte ohne Erben. */
export const NOBODY = '-'

export type FynPhase = 'lobby' | 'bids' | 'play' | 'settle' | 'over'

export type FynGame = {
  kind: 'fyn'
  /** `balance` sind hier die Punkte. */
  players: GPlayer[]
  hostId: string
  dealerIndex: number
  /** 1 … 11. */
  round: number
  phase: FynPhase
  hands: Record<string, Card[]>
  bids: Record<string, number>
  /** Ansagen der Vorrunde — zweimal in Folge 0 ist verboten. */
  lastBids: Record<string, number>
  turn: number
  bidsLeft: number
  /** Alle Karten des laufenden Stichs, auch die aus dem Stechen. */
  trick: { playerId: string; card: Card }[]
  /** Ab hier beginnt die laufende Lage — davor liegen frühere Stechen. */
  layerStart: number
  /** Wer noch um den Stich spielt. Mehr als alle anderen heisst: Stechen. */
  contenders: string[]
  /** Gewinner des fertigen Stichs (oder NOBODY), der noch kurz liegen bleibt. */
  trickPending: string | null
  trickPauseMs: number
  leader: number
  tricksWon: Record<string, number>
  /** Punkte der letzten Runde pro Spieler. */
  settlement: Record<string, number> | null
  message: string | null
  pendingKicks: string[]
  forceAllowed: boolean
}

export function createFyn(hostId: string): FynGame {
  return {
    kind: 'fyn',
    players: [],
    hostId,
    dealerIndex: 0,
    round: 1,
    phase: 'lobby',
    hands: {},
    bids: {},
    lastBids: {},
    turn: 0,
    bidsLeft: 0,
    trick: [],
    layerStart: 0,
    contenders: [],
    trickPending: null,
    trickPauseMs: 1000,
    leader: 0,
    tricksWon: {},
    settlement: null,
    message: null,
    pendingKicks: [],
    forceAllowed: false,
  }
}

const indexOf = (g: FynGame, id: string) => g.players.findIndex((p) => p.id === id)
const left = (g: FynGame, i: number) => (i + 1) % g.players.length
export const cardsThisRound = (g: FynGame) => FYN_ROUNDS[g.round - 1] ?? 0
/** In der 1-Karten-Runde hält jeder seine Karte an die Stirn. */
export const isForehead = (g: FynGame) => cardsThisRound(g) === 1

/** Punkte einer Runde: genau getroffen 10 pro Stich, sonst −10 pro Abweichung. */
export function fynScore(bid: number, tricks: number): number {
  return bid === tricks ? POINTS_PER_TRICK * tricks : -POINTS_PER_TRICK * Math.abs(bid - tricks)
}

/**
 * Erlaubte Ansagen. Der Letzte darf die Summe aller Ansagen nicht auf die
 * Kartenzahl bringen — irgendwer muss danebenliegen, daher der Name. Und
 * niemand sagt zweimal in Folge 0.
 *
 * In der 1-Karten-Runde kann beides zusammen den Letzten matt setzen (Vorrunde
 * 0, die anderen alle 0). Dann weicht die Summenregel.
 */
export function legalBids(g: FynGame, playerId: string): number[] {
  const n = cardsThisRound(g)
  const all = Array.from({ length: n + 1 }, (_, k) => k).filter(
    (k) => !(k === 0 && g.lastBids[playerId] === 0),
  )
  if (g.bidsLeft !== 1) return all
  const others = g.players.reduce((s, p) => s + (p.id === playerId ? 0 : (g.bids[p.id] ?? 0)), 0)
  const allowed = all.filter((k) => others + k !== n)
  return allowed.length > 0 ? allowed : all
}

export function fynActor(g: FynGame): GPlayer | null {
  if (g.trickPending) return null
  if (g.phase !== 'bids' && g.phase !== 'play') return null
  return g.players[g.turn] ?? null
}

function removePlayer(g: FynGame, id: string) {
  const i = indexOf(g, id)
  if (i < 0) return null
  const [gone] = g.players.splice(i, 1)
  delete g.hands[id]
  delete g.bids[id]
  delete g.lastBids[id]
  delete g.tricksWon[id]
  if (g.players.length > 0 && g.dealerIndex >= g.players.length) g.dealerIndex = 0
  if (g.hostId === id && g.players[0]) g.hostId = g.players[0].id
  return gone.name
}

/** Neue Runde: Rauswürfe vollziehen, austeilen, der Spieler nach dem Geber sagt an. */
export function startFynRound(g: FynGame) {
  const removed = g.pendingKicks.map((id) => removePlayer(g, id)).filter(Boolean)
  g.pendingKicks = []
  if (g.players.length < 2) {
    g.phase = 'lobby'
    g.hands = {}
    g.message = 'Zu wenige Spieler — zurück in die Lobby.'
    return
  }
  const n = cardsThisRound(g)
  const deck = shuffle(freshDeck())
  g.hands = Object.fromEntries(g.players.map((p) => [p.id, deck.splice(0, n)]))
  g.bids = {}
  g.tricksWon = Object.fromEntries(g.players.map((p) => [p.id, 0]))
  g.trick = []
  g.layerStart = 0
  g.contenders = []
  g.trickPending = null
  g.settlement = null
  g.phase = 'bids'
  g.turn = left(g, g.dealerIndex)
  g.leader = g.turn
  g.bidsLeft = g.players.length
  g.message = removed.length > 0 ? `${removed.join(', ')} wurde vom Tisch genommen.` : null
}

export function applyBid(g: FynGame, playerId: string, bid: number): string | null {
  if (g.phase !== 'bids') return 'Gerade keine Ansagen.'
  if (indexOf(g, playerId) !== g.turn) return 'Du bist nicht am Zug.'
  if (!legalBids(g, playerId).includes(bid)) {
    if (bid === 0 && g.lastBids[playerId] === 0) return 'Zweimal in Folge 0 geht nicht.'
    return g.bidsLeft === 1
      ? 'Als Letzter darfst du die Summe nicht aufgehen lassen.'
      : 'Ungültige Ansage.'
  }
  g.bids[playerId] = bid
  g.bidsLeft -= 1
  g.turn = left(g, g.turn)
  if (g.bidsLeft > 0) return null

  g.phase = 'play'
  g.turn = g.leader
  beginTrick(g)
  // Stirnrunde: keiner kennt seine Karte, es gibt nichts zu wählen.
  if (isForehead(g)) {
    for (let k = 0; k < g.players.length; k++) {
      const p = g.players[g.turn]
      playFynCard(g, p.id, cardId(g.hands[p.id][0]))
    }
  }
  return null
}

function beginTrick(g: FynGame) {
  g.trick = []
  g.layerStart = 0
  g.contenders = g.players.map((p) => p.id)
}

/** Karte legen — jede Karte ist erlaubt. */
export function playFynCard(g: FynGame, playerId: string, card: CardId): string | null {
  if (g.phase !== 'play') return 'Gerade kein Ausspielen.'
  if (g.trickPending) return 'Der Stich wird noch gezeigt.'
  if (indexOf(g, playerId) !== g.turn) return 'Du bist nicht am Zug.'
  const hand = g.hands[playerId]
  const chosen = hand.find((c) => cardId(c) === card)
  if (!chosen) return 'Karte nicht auf der Hand.'

  g.hands[playerId] = hand.filter((c) => cardId(c) !== card)
  g.trick.push({ playerId, card: chosen })
  g.turn = left(g, g.turn)
  if (g.trick.length - g.layerStart < g.players.length) return null

  // Lage komplett: nur die Karten der Anwärter zählen.
  const layer = g.trick.slice(g.layerStart).filter((t) => g.contenders.includes(t.playerId))
  const top = Math.max(...layer.map((t) => t.card.rank))
  const tied = layer.filter((t) => t.card.rank === top)

  if (tied.length === 1) return settleTrick(g, tied[0].playerId)

  const handsLeft = (g.hands[g.players[0].id] ?? []).length
  if (handsLeft > 0) {
    // Stechen: die Gleichen spielen nochmals, alle anderen werfen eine Karte ab.
    g.contenders = tied.map((t) => t.playerId)
    g.layerStart = g.trick.length
    g.turn = g.leader
    g.message = `Stechen: ${tied.map((t) => nameOf(g, t.playerId)).join(' gegen ')}.`
    return null
  }

  // Erben: keine Karte mehr fürs Stechen — die höchste Karte, die nur einer
  // gelegt hat, holt den Stich.
  const counts = new Map<number, string[]>()
  for (const t of layer) counts.set(t.card.rank, [...(counts.get(t.card.rank) ?? []), t.playerId])
  const heir = [...counts.entries()].filter(([, ids]) => ids.length === 1).sort((a, b) => b[0] - a[0])[0]
  g.message = heir ? `Gleichstand — ${nameOf(g, heir[1][0])} erbt den Stich.` : 'Gleichstand — niemand holt den Stich.'
  return settleTrick(g, heir ? heir[1][0] : NOBODY)
}

const nameOf = (g: FynGame, id: string) => g.players.find((p) => p.id === id)?.name ?? '?'

function settleTrick(g: FynGame, winner: string): null {
  if (winner !== NOBODY) g.tricksWon[winner] = (g.tricksWon[winner] ?? 0) + 1
  g.trickPending = winner
  return null
}

/** Stich abräumen; sind die Hände leer, wird abgerechnet. */
export function finishFynTrick(g: FynGame): void {
  const winner = g.trickPending
  if (!winner) return
  g.trickPending = null
  if (winner !== NOBODY) g.leader = indexOf(g, winner)
  g.turn = g.leader
  beginTrick(g)

  if ((g.hands[g.players[0].id] ?? []).length > 0) return

  g.settlement = Object.fromEntries(
    g.players.map((p) => [p.id, fynScore(g.bids[p.id] ?? 0, g.tricksWon[p.id] ?? 0)]),
  )
  for (const p of g.players) p.balance += g.settlement[p.id]
  g.lastBids = { ...g.bids }
  g.phase = g.round >= FYN_ROUNDS.length ? 'over' : 'settle'
}

/** Nächste Runde — oder nach dem Endstand eine neue Partie am selben Tisch. */
export function nextFynRound(g: FynGame): string | null {
  if (g.phase === 'over') {
    for (const p of g.players) p.balance = 0
    g.round = 1
    g.lastBids = {}
  } else if (g.phase === 'settle') {
    g.round += 1
  } else return 'Runde läuft noch.'
  g.dealerIndex = left(g, g.dealerIndex)
  startFynRound(g)
  return null
}

/** Wie in `game.ts`: in der Lobby sofort, sonst zur nächsten Runde. */
export function kickFyn(g: FynGame, hostId: string, targetId: string): string | null {
  if (g.hostId !== hostId) return 'Nur der Host kann jemanden entfernen.'
  if (targetId === hostId) return 'Du kannst dich nicht selbst entfernen.'
  if (indexOf(g, targetId) < 0) return 'Spieler nicht am Tisch.'
  if (g.phase === 'lobby') {
    removePlayer(g, targetId)
    return null
  }
  g.pendingKicks = g.pendingKicks.includes(targetId)
    ? g.pendingKicks.filter((x) => x !== targetId)
    : [...g.pendingKicks, targetId]
  return null
}

/** Host spielt für jemanden, der nicht reagiert: kleinste erlaubte Ansage, erste Karte. */
export function forceFyn(g: FynGame, hostId: string): string | null {
  if (g.hostId !== hostId) return 'Nur der Host kann einen Zug erzwingen.'
  if (!g.forceAllowed) return 'Noch zu früh — der Spieler ist dran.'
  const actor = fynActor(g)
  if (!actor) return 'Gerade ist niemand am Zug.'
  if (g.phase === 'bids') return applyBid(g, actor.id, legalBids(g, actor.id)[0])
  return playFynCard(g, actor.id, cardId(g.hands[actor.id][0]))
}

// ---------------------------------------------------------------------------
// Bot: zählt hohe Karten und spielt dann auf seine Ansage hin.

/** Wie oft eine Karte gegen `opponents` Gegner durchkommt — grob. */
function strength(card: Card, opponents: number): number {
  // 6 → 0 … Ass → 1, mit mehr Gegnern seltener vorne.
  return ((card.rank - 6) / 8) ** opponents
}

export function botBid(g: FynGame, id: string): number {
  const legal = legalBids(g, id)
  const opponents = g.players.length - 1
  let want: number
  if (isForehead(g)) {
    // Eigene Karte unbekannt — nur die Stirnen der anderen zählen.
    const best = Math.max(...g.players.filter((p) => p.id !== id).map((p) => g.hands[p.id][0].rank))
    want = best <= 9 ? 1 : 0
  } else {
    want = Math.round(g.hands[id].reduce((s, c) => s + strength(c, opponents), 0))
  }
  return legal.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a))
}

export function botFynPlay(g: FynGame, id: string): CardId {
  const hand = [...g.hands[id]].sort((a, b) => a.rank - b.rank)
  const contending = g.contenders.includes(id)
  const needs = (g.bids[id] ?? 0) > (g.tricksWon[id] ?? 0)
  // Wer noch Stiche braucht und mitspielt, legt die höchste — sonst die tiefste.
  return cardId(contending && needs ? hand[hand.length - 1] : hand[0])
}

// ---------------------------------------------------------------------------
// Sicht für einen einzelnen Spieler.

export type FynClientGame = {
  kind: 'fyn'
  players: (GPlayer & {
    cards: number
    bid: number | null
    tricks: number
    /** Die Karte an der Stirn — nur in der Stirnrunde und nie die eigene. */
    forehead: Card | null
  })[]
  hostId: string
  youId: string
  dealerIndex: number
  round: number
  rounds: number
  cardsThisRound: number
  phase: FynPhase
  hand: Card[]
  forehead: boolean
  turn: number
  yourTurn: boolean
  legalBids: number[]
  trick: { playerId: string; card: Card }[]
  layerStart: number
  contenders: string[]
  trickPending: string | null
  trickPauseMs: number
  settlement: Record<string, number> | null
  message: string | null
  pendingKicks: string[]
  actorId: string | null
  canForce: boolean
  isHost: boolean
}

export function redactFyn(g: FynGame, youId: string): FynClientGame {
  const forehead = isForehead(g) && g.phase === 'bids'
  const yourTurn = !g.trickPending && g.players[g.turn]?.id === youId
  return {
    kind: 'fyn',
    players: g.players.map((p) => ({
      ...p,
      cards: (g.hands[p.id] ?? []).length,
      bid: g.bids[p.id] ?? null,
      tricks: g.tricksWon[p.id] ?? 0,
      forehead: forehead && p.id !== youId ? (g.hands[p.id]?.[0] ?? null) : null,
    })),
    hostId: g.hostId,
    youId,
    dealerIndex: g.dealerIndex,
    round: g.round,
    rounds: FYN_ROUNDS.length,
    cardsThisRound: cardsThisRound(g),
    phase: g.phase,
    // Die eigene Stirnkarte sieht man nicht.
    hand: forehead ? [] : (g.hands[youId] ?? []),
    forehead,
    turn: g.turn,
    yourTurn: yourTurn && (g.phase === 'bids' || g.phase === 'play'),
    legalBids: g.phase === 'bids' && yourTurn ? legalBids(g, youId) : [],
    trick: g.trick,
    layerStart: g.layerStart,
    contenders: g.contenders,
    trickPending: g.trickPending,
    trickPauseMs: g.trickPauseMs,
    settlement: g.settlement,
    message: g.message,
    pendingKicks: g.pendingKicks,
    actorId: fynActor(g)?.id ?? null,
    canForce: g.forceAllowed && g.hostId === youId,
    isHost: g.hostId === youId,
  }
}
