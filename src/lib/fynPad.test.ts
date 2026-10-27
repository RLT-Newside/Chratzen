import { describe, expect, it } from 'vitest'
import { type PadState, bidOrder, checkBids, checkTricks, padCards, padDealer, padOver, padTotals } from './fynPad'

const pad = (rounds: PadState['rounds'] = []): PadState => ({ names: ['Anna', 'Beat', 'Cara'], rounds })

describe('FYN-Block', () => {
  it('Geber wandert, der Spieler nach ihm sagt zuerst an', () => {
    expect(padDealer(pad())).toBe(0)
    expect(bidOrder(pad())).toEqual([1, 2, 0])
    const later = pad([{ bids: [0, 0, 1], tricks: [0, 0, 1] }])
    expect(padDealer(later)).toBe(1)
    expect(padCards(later)).toBe(5)
  })

  it('der Geber darf die Summe nicht aufgehen lassen', () => {
    // 6 Karten: Beat 2, Cara 1 → Anna (Geber) darf nicht 3.
    expect(checkBids(pad(), [3, 2, 1])).toMatch(/Anna gibt/)
    expect(checkBids(pad(), [2, 2, 1])).toBeNull()
    expect(checkBids(pad(), [null, 2, 1])).toMatch(/Noch nicht/)
  })

  it('zweimal in Folge 0 ist verboten', () => {
    const s = pad([{ bids: [1, 0, 2], tricks: [1, 0, 2] }])
    expect(checkBids(s, [1, 0, 1])).toMatch(/Beat: zweimal/)
  })

  it('Stiche dürfen fehlen (Stechen), aber nicht zu viele sein', () => {
    expect(checkTricks(pad(), [2, 2, 1])).toBeNull()
    expect(checkTricks(pad(), [3, 3, 1])).toMatch(/höchstens 6/)
  })

  it('zählt Punkte über alle Runden und endet nach elf', () => {
    const s = pad([
      { bids: [2, 0, 3], tricks: [2, 0, 4] },
      { bids: [1, 1, 1], tricks: [0, 1, 3] },
    ])
    expect(padTotals(s)).toEqual([20 - 10, 0 + 10, -10 - 20])
    expect(padOver(s)).toBe(false)
    expect(padOver(pad(Array(11).fill({ bids: [0, 0, 0], tricks: [0, 0, 0] })))).toBe(true)
  })
})
