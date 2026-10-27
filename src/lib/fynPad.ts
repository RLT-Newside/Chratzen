/**
 * FYN-Block: gespielt wird mit echten Karten, die App schreibt nur auf.
 * Gespeichert werden nur die fertigen Runden — Geber, Rundenzahl und Punkte
 * folgen daraus, und "Rückgängig" heisst schlicht: letzte Runde wieder öffnen.
 */
import { FYN_ROUNDS, allowedBids, fynScore } from './fyn'

export type PadRound = { bids: number[]; tricks: number[] }

export type PadState = {
  /** Sitzreihenfolge; der Erste gibt in Runde 1. */
  names: string[]
  rounds: PadRound[]
}

export const emptyPad: PadState = { names: [], rounds: [] }

export const padRound = (s: PadState) => s.rounds.length + 1
export const padCards = (s: PadState) => FYN_ROUNDS[s.rounds.length] ?? 0
export const padDealer = (s: PadState) => s.rounds.length % Math.max(1, s.names.length)
export const padOver = (s: PadState) => s.rounds.length >= FYN_ROUNDS.length

/** Ansagereihenfolge: links vom Geber beginnend, der Geber zuletzt. */
export function bidOrder(s: PadState): number[] {
  const n = s.names.length
  return Array.from({ length: n }, (_, k) => (padDealer(s) + 1 + k) % n)
}

/** Punkte pro Spieler über alle fertigen Runden. */
export function padTotals(s: PadState): number[] {
  return s.names.map((_, i) => s.rounds.reduce((sum, r) => sum + fynScore(r.bids[i], r.tricks[i]), 0))
}

/** Fehlertext, falls die Ansagen gegen die Regeln verstossen — sonst null. */
export function checkBids(s: PadState, bids: (number | null)[]): string | null {
  if (bids.some((b) => b == null)) return 'Noch nicht alle haben angesagt.'
  const last = s.rounds[s.rounds.length - 1]
  const dealer = padDealer(s)
  for (const i of bidOrder(s)) {
    const others = i === dealer ? bids.reduce<number>((sum, b, j) => sum + (j === i ? 0 : (b ?? 0)), 0) : null
    if (allowedBids(padCards(s), last?.bids[i], others).includes(bids[i] as number)) continue
    if (bids[i] === 0 && last?.bids[i] === 0) return `${s.names[i]}: zweimal in Folge 0 geht nicht.`
    return `${s.names[i]} gibt und darf die Summe nicht auf ${padCards(s)} bringen.`
  }
  return null
}

/** Stechen frisst Karten, ohne Erben holt niemand den Stich — also höchstens, nicht genau. */
export function checkTricks(s: PadState, tricks: number[]): string | null {
  const sum = tricks.reduce((a, b) => a + b, 0)
  return sum > padCards(s) ? `Zusammen ${sum} Stiche — es gibt höchstens ${padCards(s)}.` : null
}
