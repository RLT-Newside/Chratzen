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

export type Transfer = { from: string; to: string; amount: number }

/**
 * Wer zahlt wem, damit alle auf null sind — mit möglichst wenigen Zahlungen.
 *
 * Gedacht für den Abend ohne Bargeld: gespielt wird auf Pump, am Schluss zeigt
 * die Liste, wer wem was schuldet. Ein noch offener Pott wird vorher
 * gleichmässig zurückgegeben, sonst ginge die Rechnung nicht auf.
 *
 * Greedy: grösster Schuldner zahlt an grössten Gläubiger. Das ist nicht
 * beweisbar das Minimum, kommt ihm aber sehr nahe und ist am Tisch nachvollziehbar.
 */
export function settleUp(
  players: { id: string; balance: number }[],
  pot = 0,
): Transfer[] {
  if (players.length === 0) return []

  const refund = splitByWeight(pot, players.map(() => 1))
  const open = players.map((p, i) => ({ id: p.id, balance: p.balance + refund[i] }))

  // Stabile Reihenfolge: grösste Beträge zuerst, bei Gleichstand die Sitzordnung.
  const index = new Map(players.map((p, i) => [p.id, i]))
  const byIndex = (a: { id: string }, b: { id: string }) =>
    (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0)

  const debtors = open.filter((p) => p.balance < 0).sort((a, b) => a.balance - b.balance || byIndex(a, b))
  const creditors = open.filter((p) => p.balance > 0).sort((a, b) => b.balance - a.balance || byIndex(a, b))

  const transfers: Transfer[] = []
  let d = 0
  let c = 0
  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(-debtors[d].balance, creditors[c].balance)
    if (amount > 0) transfers.push({ from: debtors[d].id, to: creditors[c].id, amount })
    debtors[d].balance += amount
    creditors[c].balance -= amount
    if (debtors[d].balance === 0) d++
    if (creditors[c].balance === 0) c++
  }
  return transfers
}
