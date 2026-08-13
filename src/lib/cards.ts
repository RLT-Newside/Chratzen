/** Schweizer Jasskarten-Deck: 36 Karten, 4 Farben à 9 Werte. */

export const SUITS = ['schellen', 'schilten', 'rosen', 'eichel'] as const
export type Suit = (typeof SUITS)[number]

/** 11 = Under, 12 = Ober, 13 = König, 14 = Ass. Die 10 ist das "Banner". */
export const RANKS = [6, 7, 8, 9, 10, 11, 12, 13, 14] as const
export type Rank = (typeof RANKS)[number]

export const BANNER: Rank = 10

export type Card = { suit: Suit; rank: Rank }
export type CardId = string

export function cardId(c: Card): CardId {
  return `${c.suit}-${c.rank}`
}

export function parseCard(id: CardId): Card {
  const [suit, rank] = id.split('-')
  return { suit: suit as Suit, rank: Number(rank) as Rank }
}

export function rankLabel(r: Rank): string {
  return r === 11 ? 'U' : r === 12 ? 'O' : r === 13 ? 'K' : r === 14 ? 'A' : String(r)
}

export const SUIT_LABEL: Record<Suit, string> = {
  schellen: 'Schellen',
  schilten: 'Schilten',
  rosen: 'Rosen',
  eichel: 'Eichel',
}

export function freshDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })))
}

/** Fisher-Yates. */
export function shuffle<T>(items: T[], rnd: () => number = Math.random): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Gewinner eines Stichs: höchster Trumpf, sonst höchste Karte der angespielten
 * Farbe. Kartenrang schlicht 6 < 7 < … < U < O < K < A (kein Puur/Nell).
 */
export function trickWinner(
  played: { playerId: string; card: Card }[],
  trumpSuit: Suit,
): string {
  const lead = played[0].card.suit
  const relevant = played.some((p) => p.card.suit === trumpSuit) ? trumpSuit : lead
  return played
    .filter((p) => p.card.suit === relevant)
    .reduce((best, p) => (p.card.rank > best.card.rank ? p : best)).playerId
}

/**
 * Farbzwang: wer die angespielte Farbe hat, muss sie bedienen. Sonst freie Wahl
 * (Trumpfen erlaubt, aber kein Zwang).
 * ponytail: kein Stichzwang — falls eure Tischregel das verlangt, hier ergänzen.
 */
export function legalCards(hand: Card[], lead: Suit | null): Card[] {
  if (!lead) return hand
  const follow = hand.filter((c) => c.suit === lead)
  return follow.length > 0 ? follow : hand
}

/** Sortierung für die Handanzeige: nach Farbe, innerhalb absteigend. */
export function sortHand(hand: Card[], trumpSuit: Suit | null): Card[] {
  const order = (s: Suit) => (s === trumpSuit ? -1 : SUITS.indexOf(s))
  return [...hand].sort((a, b) => order(a.suit) - order(b.suit) || b.rank - a.rank)
}
