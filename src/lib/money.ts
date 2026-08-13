/** Geld wird überall in Rappen (Integer) gerechnet — keine Float-Rundungsfehler. */

export const ANTE_OPTIONS = [50, 100, 200] as const

export function formatChf(rappen: number): string {
  const sign = rappen < 0 ? '-' : ''
  const abs = Math.abs(rappen)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/**
 * Teilt `total` nach Gewichten auf — Largest-Remainder, damit die Summe der
 * Anteile exakt `total` ergibt (kein verlorener Rappen im Pott).
 * Bei Gleichstand im Rest gewinnt der frühere Index (Sitzreihenfolge).
 */
export function splitByWeight(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= 0) return weights.map(() => 0)

  const shares = weights.map((w) => Math.floor((total * w) / sum))
  let rest = total - shares.reduce((a, b) => a + b, 0)

  const order = weights
    .map((w, i) => ({ i, rem: (total * w) % sum }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i)

  for (let k = 0; rest > 0; k++, rest--) shares[order[k % order.length].i] += 1
  return shares
}
