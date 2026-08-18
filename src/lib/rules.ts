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
  /** Bete pro Spieler-ID — Kratzer doppelter Pott, Mitgeher einfacher. */
  penalties: Record<string, number>
  /** Neuer Pott für die nächste Runde = Summe aller Strafen. */
  potAfter: number
}

/**
 * Bete: wer sein Soll verfehlt, legt den Pott nach — der Kratzer doppelt, weil
 * er sich auf mehr verpflichtet hat.
 */
export function penaltyFor(call: Call, tricks: number, potBefore: number): number {
  if (!isPlaying(call) || tricks >= requiredTricks(call)) return 0
  return call === 'kratzen' ? potBefore * 2 : potBefore
}

/**
 * Anteil am Pott: der Kratzer zählt doppelt, ein Mitgeher einfach. Wer sein
 * Soll verfehlt, bekommt nichts — zusätzliche Stiche über dem Minimum bringen
 * kein Geld, sie entscheiden nur über geschafft oder Bete.
 */
export function payoutWeight(call: Call, tricks: number): number {
  if (!isPlaying(call) || tricks < requiredTricks(call)) return 0
  return call === 'kratzen' ? 2 : 1
}

/**
 * Schüttet den Pott aus und berechnet die Strafen.
 *
 * Ausschüttung nach Rolle, nicht nach Stichzahl:
 *   Kratzer (2 Stiche) + Mitgeher (1)            → 2/3 : 1/3
 *   Kratzer (2) + 2 Mitgeher (1/1)               → 1/2 : 1/4 : 1/4
 *   Kratzer (2) + Mitgeher (2)                   → 2/3 : 1/3  — auch bei gleich
 *                                                   vielen Stichen doppelt
 *   Kratzer (1) + Mitgeher (2) + Mitgeher (1)    → 0 : 1/2 : 1/2 — der Kratzer
 *                                                   hat sein Soll verfehlt
 *
 * Strafe (Bete/Sack): Der Kratzer unter 2 Stichen legt den **doppelten** Pott
 * nach, ein Mitgeher ohne Stich den einfachen. Mehrere Verlierer zahlen je ihren
 * vollen Betrag; zusammen ergeben sie den Pott der nächsten Runde.
 */
export function settleRound(potBefore: number, entries: Entry[]): Settlement {
  const players = entries.filter((e) => isPlaying(e.call))

  const shares = splitByWeight(
    potBefore,
    players.map((e) => payoutWeight(e.call, e.tricks)),
  )

  const payouts: Record<string, number> = {}
  const penalties: Record<string, number> = {}

  players.forEach((e, i) => {
    if (shares[i] > 0) payouts[e.playerId] = shares[i]
    const bete = penaltyFor(e.call, e.tricks, potBefore)
    if (bete > 0) penalties[e.playerId] = bete
  })

  // Hat ausnahmsweise niemand sein Soll geschafft, bleibt der Pott liegen,
  // statt sich in Luft aufzulösen.
  const paid = Object.values(payouts).reduce((a, b) => a + b, 0)
  const penalty = Object.values(penalties).reduce((a, b) => a + b, 0)
  return { potBefore, payouts, penalties, potAfter: penalty + (potBefore - paid) }
}

/**
 * Wie viele Karten man nach dem Abwerfen zurückbekommt.
 *
 * Normalfall: so viele, wie man abgeworfen hat — man bleibt bei vier. Wer seine
 * **ganze** Hand tauscht, bekommt eine mehr und wirft vor dem Ausspielen eine
 * Schlafkarte ab. Der Blinde hält fünf Karten; bei ihm frisst der Tausch die
 * überzählige, er landet also wieder bei vier (3 abwerfen → 2 zurück). Tauscht
 * er gar nicht, bleibt die fünfte und geht als Schlafkarte weg.
 */
export function drawCount(handSize: number, discarded: number): number {
  if (discarded > 0 && discarded === handSize) return discarded + 1
  const excess = Math.max(0, handSize - TRICKS_PER_ROUND)
  return Math.max(0, discarded - excess)
}

/**
 * Eine gespielte Runde hat immer **genau einen** Kratzer: ohne Kratzer geht
 * auch niemand mit, dann wird nicht gespielt sondern neu aufgedeckt.
 */
export function validateRound(entries: Entry[]): string | null {
  const kratzer = entries.filter((e) => e.call === 'kratzen').length
  if (kratzer === 0) return 'Einer muss kratzen — sonst wurde die Runde nicht gespielt.'
  if (kratzer > 1) return 'Es kratzt nur einer pro Runde.'
  return validateTricks(entries)
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

/**
 * Es kratzt immer nur einer pro Runde. Setzt jemand neu an, fällt der bisherige
 * Kratzer auf "weiter" zurück — im Companion steht die ganze Runde auf einem
 * Bildschirm, die Änderung ist also sofort sichtbar.
 */
export function demoteOtherKratzer<T extends Call>(
  calls: Record<string, T>,
  keep: string,
): Record<string, T> {
  const out = { ...calls }
  for (const id of Object.keys(out)) {
    if (id !== keep && out[id] === 'kratzen') out[id] = 'weiter' as T
  }
  return out
}
