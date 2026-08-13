/**
 * Chratzen-Regelwerk — rein funktional, ohne UI/State.
 * Gilt für beide Modi (Companion + Digital).
 */
import { splitByWeight } from './money'

/** 4 Karten pro Spieler ⇒ 4 Stiche pro Runde. */
export const TRICKS_PER_ROUND = 4

/** Wie oft der Trumpf neu aufgedeckt wird, bevor neu gemischt + neu geantet wird. */
export const MAX_TRUMP_FLIPS = 3

export type Call = 'weiter' | 'kratzen' | 'mitgehen' | 'letzter'

/** Mindeststiche, zu denen sich eine Ansage verpflichtet. 0 = nicht im Spiel. */
export function requiredTricks(call: Call): number {
  return call === 'kratzen' ? 2 : call === 'mitgehen' ? 1 : 0
}

export function isPlaying(call: Call): boolean {
  return call === 'kratzen' || call === 'mitgehen'
}

/**
 * "Letzter" wartet ab: geht sonst niemand mit, muss er mitgehen.
 * Geht jemand anders mit, entscheidet er frei (→ bleibt offen, die UI fragt nach).
 */
export function letzterMustGo(calls: Call[]): boolean {
  return calls.some((c) => c === 'kratzen') && !calls.some((c) => c === 'mitgehen')
}

/** Bannerrunde: Trumpfkarte ist eine 10 ⇒ Geber kratzt, alle anderen gehen mit. */
export function bannerCalls(playerCount: number, dealerIndex: number): Call[] {
  return Array.from({ length: playerCount }, (_, i) => (i === dealerIndex ? 'kratzen' : 'mitgehen'))
}

export type Entry = {
  playerId: string
  call: Call
  /** Erzielte Stiche in dieser Runde. */
  tricks: number
}

export type Settlement = {
  potBefore: number
  /** Anteil am Pott pro Spieler-ID (nur Teilnehmer mit ≥1 Stich). */
  payouts: Record<string, number>
  /** Strafe pro Spieler-ID — jeweils der volle Pott. */
  penalties: Record<string, number>
  /** Neuer Pott für die nächste Runde = Summe aller Strafen. */
  potAfter: number
}

/**
 * Schüttet den Pott aus und berechnet die Strafen.
 *
 * Ausschüttung: gewichtet nach erzielten Stichen.
 *   1 Kratzer (2 Stiche) + 1 Mitgeher (1 Stich) → 2/3 : 1/3
 *   1 Kratzer (2) + 2 Mitgeher (1/1)            → 1/2 : 1/4 : 1/4
 *
 * Strafe (Bete/Sack): Kratzer unter 2 Stichen oder Mitgeher ohne Stich zahlt
 * den vollen Pott nach. Mehrere Verlierer zahlen je den vollen Betrag.
 */
export function settleRound(potBefore: number, entries: Entry[]): Settlement {
  const players = entries.filter((e) => isPlaying(e.call))

  const shares = splitByWeight(
    potBefore,
    players.map((e) => e.tricks),
  )

  const payouts: Record<string, number> = {}
  const penalties: Record<string, number> = {}

  players.forEach((e, i) => {
    if (shares[i] > 0) payouts[e.playerId] = shares[i]
    if (e.tricks < requiredTricks(e.call)) penalties[e.playerId] = potBefore
  })

  const potAfter = Object.values(penalties).reduce((a, b) => a + b, 0)
  return { potBefore, payouts, penalties, potAfter }
}

/** Stiche müssen exakt auf 4 aufgehen und dürfen nur an Teilnehmer gehen. */
export function validateTricks(entries: Entry[]): string | null {
  const total = entries.reduce((a, e) => a + e.tricks, 0)
  if (entries.some((e) => !isPlaying(e.call) && e.tricks > 0)) {
    return 'Nur Kratzer und Mitgeher können Stiche machen.'
  }
  if (total !== TRICKS_PER_ROUND) {
    return `Es müssen genau ${TRICKS_PER_ROUND} Stiche verteilt sein (aktuell ${total}).`
  }
  return null
}

/** Ansagen sind gültig, wenn mitgegangen wird erst nachdem jemand gekratzt hat. */
export function validateCalls(calls: Call[]): string | null {
  if (calls.some((c) => c === 'letzter')) return 'Bitte "Letzter" noch auflösen.'
  const kratzer = calls.filter((c) => c === 'kratzen').length
  const mitgeher = calls.filter((c) => c === 'mitgehen').length
  if (mitgeher > 0 && kratzer === 0) return 'Mitgehen geht nur, wenn jemand gekratzt hat.'
  return null
}
