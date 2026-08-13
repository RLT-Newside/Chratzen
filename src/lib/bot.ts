/**
 * Mitspieler für den Fall, dass gerade niemand sonst am Tisch sitzt.
 *
 * Bewusst eine Heuristik, kein Löser: bei vier Karten und vier Stichen bringt
 * Suchen wenig, und ein Bot, der am Stammtischtempo nachvollziehbar spielt, ist
 * mehr wert als einer, der perfekt spielt.
 */
import { type Card, type CardId, type Suit, cardId, legalCards, trickWinner } from './cards'
import type { Call } from './rules'

/** Wie viel eine Karte wert ist — Trumpf zählt deutlich mehr. */
function value(card: Card, trump: Suit): number {
  const base = card.rank - 5 // 6 → 1 … Ass → 9
  return card.suit === trump ? base + 12 : base
}

/**
 * Grobe Schätzung, wie viele Stiche die Hand holt. Hohe Trümpfe sind fast
 * sicher, kleine Trümpfe oft, ein blankes Ass manchmal.
 */
export function expectedTricks(hand: Card[], trump: Suit): number {
  return hand.reduce((sum, c) => {
    if (c.suit === trump) return sum + (c.rank >= 12 ? 1 : 0.6)
    if (c.rank === 14) return sum + 0.7
    if (c.rank === 13) return sum + 0.35
    return sum
  }, 0)
}

/** Ab hier lohnt sich das Kratzen (Soll: 2 Stiche). */
const KRATZ = 1.8
/**
 * Als Letzter, wenn sonst niemand will — sonst wird ewig neu aufgedeckt.
 * Tiefer angesetzt, weil vor dem Ausspielen noch bis zu vier Karten getauscht
 * werden: die Schätzung oben ist die vom schlechtesten Moment.
 */
const KRATZ_LAST = 1.0
/** Ab hier lohnt sich das Mitgehen (Soll: 1 Stich). */
const MIT = 0.8

export function botCall(opts: {
  hand: Card[]
  trump: Suit
  someoneKratzed: boolean
  /** Der Bot wartet als "Letzter" und muss sich jetzt entscheiden. */
  awaitLetzter: boolean
  /** Nach ihm sagt niemand mehr an. */
  isLastToSpeak: boolean
}): Call {
  const score = expectedTricks(opts.hand, opts.trump)

  // Nach dem Kratzer bleibt nur mitgehen oder passen.
  if (opts.someoneKratzed || opts.awaitLetzter) return score >= MIT ? 'mitgehen' : 'weiter'

  if (score >= KRATZ) return 'kratzen'
  if (opts.isLastToSpeak && score >= KRATZ_LAST) return 'kratzen'
  return 'weiter'
}

/** Trümpfe und hohe Karten bleiben, der Rest fliegt raus (höchstens 4). */
export function botExchange(hand: Card[], trump: Suit): CardId[] {
  return hand
    .filter((c) => c.suit !== trump && c.rank < 13)
    .slice(0, 4)
    .map(cardId)
}

/** Schlafkarte: die schwächste Karte geht weg. */
export function botDiscard(hand: Card[], trump: Suit): CardId {
  return cardId([...hand].sort((a, b) => value(a, trump) - value(b, trump))[0])
}

/**
 * Ausspielen: vorne die stärkste Karte, sonst den Stich möglichst billig
 * gewinnen — und wenn er nicht zu holen ist, die schwächste Karte abwerfen.
 */
export function botPlay(
  me: string,
  hand: Card[],
  trick: { playerId: string; card: Card }[],
  trump: Suit,
): CardId {
  const options = legalCards(hand, trick[0]?.card.suit ?? null)
  const byValue = [...options].sort((a, b) => value(a, trump) - value(b, trump))

  if (trick.length === 0) return cardId(byValue[byValue.length - 1])

  // Ob eine Karte reicht, entscheidet dieselbe Funktion wie im echten Stich.
  const winners = byValue.filter(
    (c) => trickWinner([...trick, { playerId: me, card: c }], trump) === me,
  )
  return cardId(winners[0] ?? byValue[0])
}

const BOT_NAMES = ['Sepp', 'Vreni', 'Köbi', 'Heidi', 'Res', 'Trudi', 'Ueli', 'Bethli']

/** Erster freier Name, damit am Tisch niemand doppelt heisst. */
export function botName(taken: string[]): string {
  return BOT_NAMES.find((n) => !taken.includes(n)) ?? `Bot ${taken.length + 1}`
}
