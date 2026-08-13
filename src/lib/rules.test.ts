import { describe, expect, it } from 'vitest'
import { formatChf, settleUp, splitByWeight } from './money'
import {
  type Call,
  bannerCalls,
  demoteOtherKratzer,
  letzterMustGo,
  settleRound,
  validateRound,
  validateTricks,
} from './rules'

const e = (playerId: string, call: 'kratzen' | 'mitgehen' | 'weiter', tricks: number) => ({
  playerId,
  call,
  tricks,
})

describe('splitByWeight', () => {
  it('verliert keinen Rappen (Largest-Remainder)', () => {
    expect(splitByWeight(100, [2, 1])).toEqual([67, 33])
    expect(splitByWeight(100, [2, 1, 1])).toEqual([50, 25, 25])
    expect(splitByWeight(0, [1, 1])).toEqual([0, 0])
    for (const total of [1, 7, 33, 250, 999]) {
      for (const w of [[1, 1, 1], [3, 1], [2, 1, 1], [4]]) {
        expect(splitByWeight(total, w).reduce((a, b) => a + b, 0)).toBe(total)
      }
    }
  })
})

describe('settleRound — Ausschüttung', () => {
  it('1 Kratzer (2 Stiche) + 1 Mitgeher (1 Stich) → 2/3 : 1/3', () => {
    const s = settleRound(300, [e('k', 'kratzen', 2), e('m', 'mitgehen', 1)])
    expect(s.payouts).toEqual({ k: 200, m: 100 })
    expect(s.penalties).toEqual({})
    expect(s.potAfter).toBe(0)
  })

  it('1 Kratzer + 2 Mitgeher (2/1/1) → 1/2 : 1/4 : 1/4', () => {
    const s = settleRound(400, [e('k', 'kratzen', 2), e('a', 'mitgehen', 1), e('b', 'mitgehen', 1)])
    expect(s.payouts).toEqual({ k: 200, a: 100, b: 100 })
    expect(s.potAfter).toBe(0)
  })

  it('Kratzer allein macht alle 4 Stiche → ganzer Pott', () => {
    const s = settleRound(250, [e('k', 'kratzen', 4)])
    expect(s.payouts).toEqual({ k: 250 })
  })

  it('Kratzer bekommt doppelt, auch wenn der Mitgeher gleich viele Stiche hat', () => {
    const s = settleRound(300, [e('k', 'kratzen', 2), e('m', 'mitgehen', 2)])
    expect(s.payouts).toEqual({ k: 200, m: 100 })
    expect(s.penalties).toEqual({})
  })

  it('mehr Stiche als nötig bringen kein zusätzliches Geld', () => {
    const gierig = settleRound(300, [e('k', 'kratzen', 3), e('m', 'mitgehen', 1)])
    const knapp = settleRound(300, [e('k', 'kratzen', 2), e('m', 'mitgehen', 2)])
    expect(gierig.payouts).toEqual(knapp.payouts)
  })

  it('verfehlter Kratzer bekommt nichts, die Mitgeher teilen hälftig', () => {
    const s = settleRound(300, [
      e('k', 'kratzen', 1),
      e('a', 'mitgehen', 2),
      e('b', 'mitgehen', 1),
    ])
    expect(s.payouts).toEqual({ a: 150, b: 150 })
    expect(s.penalties).toEqual({ k: 300 })
  })
})

describe('settleRound — Strafen', () => {
  it('Kratzer unter 2 Stichen zahlt den vollen Pott nach und geht leer aus', () => {
    const s = settleRound(300, [e('k', 'kratzen', 1), e('m', 'mitgehen', 3)])
    expect(s.penalties).toEqual({ k: 300 })
    expect(s.payouts).toEqual({ m: 300 })
    expect(s.potAfter).toBe(300)
  })

  it('Mitgeher ohne Stich zahlt den vollen Pott nach', () => {
    const s = settleRound(300, [e('k', 'kratzen', 4), e('m', 'mitgehen', 0)])
    expect(s.penalties).toEqual({ m: 300 })
    expect(s.potAfter).toBe(300)
  })

  it('mehrere Verlierer zahlen je den vollen Pott', () => {
    const s = settleRound(200, [
      e('k', 'kratzen', 1),
      e('a', 'mitgehen', 3),
      e('b', 'mitgehen', 0),
    ])
    expect(s.penalties).toEqual({ k: 200, b: 200 })
    expect(s.potAfter).toBe(400)
  })

  it('Aussteiger (weiter) bekommen nichts und zahlen nichts', () => {
    const s = settleRound(300, [e('k', 'kratzen', 4), e('w', 'weiter', 0)])
    expect(s.payouts).toEqual({ k: 300 })
    expect(s.penalties).toEqual({})
  })
})

describe('settleRound — Invarianten', () => {
  it('schüttet immer exakt den Pott aus und der neue Pott sind die Strafen', () => {
    const splits: [number, number, number][] = [
      [4, 0, 0],
      [3, 1, 0],
      [2, 1, 1],
      [1, 2, 1],
      [0, 2, 2],
    ]
    for (const pot of [50, 100, 250, 333]) {
      for (const [a, b, cc] of splits) {
        const s = settleRound(pot, [
          e('k', 'kratzen', a),
          e('m1', 'mitgehen', b),
          e('m2', 'mitgehen', cc),
        ])
        expect(Object.values(s.payouts).reduce((x, y) => x + y, 0)).toBe(pot)
        expect(s.potAfter).toBe(Object.values(s.penalties).reduce((x, y) => x + y, 0))
      }
    }
  })
})

describe('Ansagen', () => {
  it('Letzter muss mitgehen, wenn sonst niemand mitgeht', () => {
    expect(letzterMustGo(['kratzen', 'weiter', 'letzter'])).toBe(true)
    expect(letzterMustGo(['kratzen', 'mitgehen', 'letzter'])).toBe(false)
  })

  it('es kratzt nur einer — ein neuer verdrängt den alten', () => {
    const roles: Record<string, Call> = { a: 'kratzen', b: 'mitgehen', c: 'weiter' }
    expect(demoteOtherKratzer({ ...roles, c: 'kratzen' }, 'c')).toEqual({
      a: 'weiter',
      b: 'mitgehen',
      c: 'kratzen',
    })
    // Wer schon kratzt und nochmals tippt, bleibt Kratzer.
    expect(demoteOtherKratzer(roles, 'a')).toEqual(roles)
  })

  it('Bannerrunde: Geber kratzt, Rest geht mit', () => {
    expect(bannerCalls(4, 2)).toEqual(['mitgehen', 'mitgehen', 'kratzen', 'mitgehen'])
  })
})

describe('validateTricks', () => {
  it('verlangt genau 4 Stiche bei den Teilnehmern', () => {
    expect(validateTricks([e('k', 'kratzen', 2), e('m', 'mitgehen', 2)])).toBeNull()
    expect(validateTricks([e('k', 'kratzen', 2), e('m', 'mitgehen', 1)])).toMatch(/genau 4/)
    expect(validateTricks([e('k', 'kratzen', 3), e('w', 'weiter', 1)])).toMatch(/Nur Kratzer/)
  })
})

describe('validateRound', () => {
  it('verlangt genau einen Kratzer', () => {
    expect(validateRound([e('a', 'mitgehen', 2), e('b', 'mitgehen', 2)])).toMatch(/muss kratzen/)
    expect(validateRound([e('a', 'kratzen', 2), e('b', 'kratzen', 2)])).toMatch(/nur einer/)
    expect(validateRound([e('k', 'kratzen', 2), e('m', 'mitgehen', 2)])).toBeNull()
  })

  it('prüft die Stiche erst, wenn der Kratzer stimmt', () => {
    // Ohne Kratzer ist die Stichzahl zweitrangig — zuerst kommt die Rolle.
    expect(validateRound([e('a', 'mitgehen', 4)])).toMatch(/muss kratzen/)
    expect(validateRound([e('k', 'kratzen', 3)])).toMatch(/genau 4/)
  })

  it('eine leere Runde wurde schlicht nicht gespielt', () => {
    expect(validateRound([e('a', 'weiter', 0), e('b', 'weiter', 0)])).toMatch(/muss kratzen/)
  })
})

describe('settleUp', () => {
  const players = (...balances: number[]) =>
    balances.map((balance, i) => ({ id: `p${i}`, balance }))

  it('gleicht mit einer Zahlung aus, wenn nur zwei betroffen sind', () => {
    expect(settleUp(players(-450, 450))).toEqual([{ from: 'p0', to: 'p1', amount: 450 }])
  })

  it('lässt niemanden mit offenem Saldo zurück', () => {
    const cases = [
      [-300, 100, 200],
      [-250, -150, 400],
      [-100, -100, -100, 300],
      [500, -125, -125, -250],
      [0, 0, 0],
    ]
    for (const balances of cases) {
      const list = players(...balances)
      const net = new Map(list.map((p) => [p.id, p.balance]))
      for (const t of settleUp(list)) {
        net.set(t.from, (net.get(t.from) as number) + t.amount)
        net.set(t.to, (net.get(t.to) as number) - t.amount)
        expect(t.amount).toBeGreaterThan(0)
      }
      for (const rest of net.values()) expect(rest).toBe(0)
    }
  })

  it('gibt einen offenen Pott vorher gleichmässig zurück', () => {
    // Alle haben je 1.00 eingelegt, es liegt noch alles im Pott.
    const list = players(-100, -100, -100)
    expect(settleUp(list, 300)).toEqual([])
  })

  it('rechnet den Pott-Rappen sauber weg', () => {
    const list = players(-100, -100, -100)
    const transfers = settleUp(list, 299)
    const moved = transfers.reduce((a, t) => a + t.amount, 0)
    expect(moved).toBeLessThanOrEqual(1)
  })

  it('braucht keine Zahlung, wenn alle auf null sind', () => {
    expect(settleUp(players(0, 0))).toEqual([])
    expect(settleUp([])).toEqual([])
  })
})

describe('formatChf', () => {
  it('formatiert Rappen als CHF', () => {
    expect(formatChf(250)).toBe('2.50')
    expect(formatChf(-50)).toBe('-0.50')
    expect(formatChf(0)).toBe('0.00')
  })
})
