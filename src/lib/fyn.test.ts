import { describe, expect, it } from 'vitest'
import { type Card, cardId, parseCard } from './cards'
import {
  FYN_ROUNDS,
  NOBODY,
  applyBid,
  createFyn,
  finishFynTrick,
  fynScore,
  legalBids,
  nextFynRound,
  playFynCard,
  redactFyn,
  startFynRound,
} from './fyn'
import { TableHost } from './host'
import type { Outgoing } from './protocol'

function makeFyn(n: number) {
  const g = createFyn('p0')
  g.players = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `S${i}`,
    balance: 0,
    connected: true,
  }))
  startFynRound(g)
  return g
}

/** Hände fest vorgeben: `['eichel-14', …]` pro Spieler. */
function rig(g: ReturnType<typeof makeFyn>, hands: string[][]) {
  g.players.forEach((p, i) => {
    g.hands[p.id] = hands[i].map(parseCard)
  })
}

/** Alle sagen der Reihe nach an — `bids` in Spielerreihenfolge. */
function bidAll(g: ReturnType<typeof makeFyn>, bids: number[]) {
  for (let k = 0; k < g.players.length; k++) {
    const p = g.players[g.turn]
    expect(applyBid(g, p.id, bids[g.turn])).toBeNull()
  }
}

const play = (g: ReturnType<typeof makeFyn>, card: string) =>
  playFynCard(g, g.players[g.turn].id, card)

describe('FYN', () => {
  it('punktet genau getroffen 10 pro Stich, sonst −10 pro Abweichung', () => {
    expect(fynScore(2, 2)).toBe(20)
    expect(fynScore(2, 3)).toBe(-10)
    expect(fynScore(3, 1)).toBe(-20)
    expect(fynScore(0, 0)).toBe(0)
  })

  it('teilt nach Rundentabelle aus, der Spieler nach dem Geber sagt an', () => {
    const g = makeFyn(3)
    expect(Object.values(g.hands).every((h) => h.length === FYN_ROUNDS[0])).toBe(true)
    expect(g.turn).toBe(1)
  })

  it('der Letzte darf die Summe nicht auf die Kartenzahl bringen', () => {
    const g = makeFyn(3)
    applyBid(g, 'p1', 2)
    applyBid(g, 'p2', 1)
    // Geber p0 sagt als Letzter: 2 + 1 + 3 = 6 Karten → 3 verboten.
    expect(legalBids(g, 'p0')).not.toContain(3)
    expect(applyBid(g, 'p0', 3)).toMatch(/Summe/)
    expect(applyBid(g, 'p0', 4)).toBeNull()
  })

  it('verbietet zweimal in Folge 0, in der Stirnrunde weicht dann die Summenregel', () => {
    const g = makeFyn(2)
    g.round = 6 // 1 Karte
    startFynRound(g)
    g.lastBids = { p0: 0, p1: 0 }
    expect(applyBid(g, 'p1', 0)).toMatch(/0/)
    applyBid(g, 'p1', 1)
    // p0: 0 verboten (Vorrunde), 1 bringt Summe auf … 2 ≠ 1 → erlaubt.
    expect(legalBids(g, 'p0')).toEqual([1])

    const h = makeFyn(2)
    h.round = 6
    startFynRound(h)
    h.lastBids = { p0: 0 }
    applyBid(h, 'p1', 0)
    // 0 verboten, 1 macht die Summe 1 — beides zu: die Summenregel weicht.
    expect(legalBids(h, 'p0')).toEqual([1])
  })

  it('höchste Karte holt den Stich, Farbe zählt nicht', () => {
    const g = makeFyn(3)
    rig(g, [['rosen-6'], ['schellen-9'], ['eichel-13']])
    bidAll(g, [0, 0, 1])
    play(g, 'schellen-9')
    play(g, 'eichel-13')
    play(g, 'rosen-6')
    expect(g.trickPending).toBe('p2')
  })

  it('Gleichstand mit Karten auf der Hand: Stechen, die anderen werfen ab', () => {
    const g = makeFyn(3)
    rig(g, [['rosen-6', 'rosen-7'], ['schellen-14', 'schellen-6'], ['eichel-14', 'eichel-8']])
    bidAll(g, [0, 1, 0])
    play(g, 'schellen-14')
    play(g, 'eichel-14')
    play(g, 'rosen-6')
    expect(g.trickPending).toBeNull()
    expect(g.contenders).toEqual(['p1', 'p2'])
    // Zweite Lage: p0 wirft ab — seine 7 schlägt zwar die 6, zählt aber nicht.
    play(g, 'schellen-6')
    play(g, 'eichel-8')
    play(g, 'rosen-7')
    expect(g.trickPending).toBe('p2')
    finishFynTrick(g)
    expect(g.phase).toBe('settle')
    expect(g.settlement).toEqual({ p0: 0, p1: -10, p2: -10 })
  })

  it('Gleichstand in der letzten Karte: die höchste einzelne Karte erbt', () => {
    const g = makeFyn(3)
    rig(g, [['rosen-9'], ['schellen-14'], ['eichel-14']])
    bidAll(g, [1, 0, 0])
    play(g, 'schellen-14')
    play(g, 'eichel-14')
    play(g, 'rosen-9')
    expect(g.trickPending).toBe('p0')
  })

  it('ohne Erben holt niemand den Stich', () => {
    const g = makeFyn(2)
    rig(g, [['rosen-9'], ['schellen-9']])
    bidAll(g, [1, 1])
    play(g, 'schellen-9')
    play(g, 'rosen-9')
    expect(g.trickPending).toBe(NOBODY)
    finishFynTrick(g)
    expect(g.settlement).toEqual({ p0: -10, p1: -10 })
  })

  it('Stirnrunde: eigene Karte verdeckt, fremde sichtbar, danach wird automatisch gespielt', () => {
    const g = makeFyn(2)
    g.round = 6
    startFynRound(g)
    const own = redactFyn(g, 'p0')
    expect(own.hand).toEqual([])
    expect(own.players.find((p) => p.id === 'p1')?.forehead).toEqual(g.hands.p1[0])
    expect(own.players.find((p) => p.id === 'p0')?.forehead).toBeNull()
    applyBid(g, 'p1', legalBids(g, 'p1')[0])
    applyBid(g, 'p0', legalBids(g, 'p0')[0])
    expect(g.trick).toHaveLength(2)
    expect(g.trickPending).not.toBeNull()
  })

  it('nach 11 Runden ist Schluss, "next" startet neu', () => {
    const g = makeFyn(2)
    g.round = FYN_ROUNDS.length
    startFynRound(g)
    rig(g, [['rosen-6'], ['rosen-7']])
    bidAll(g, [0, 1])
    play(g, 'rosen-7')
    play(g, 'rosen-6')
    finishFynTrick(g)
    expect(g.phase).toBe('over')
    expect(g.players.find((p) => p.id === 'p1')?.balance).toBe(10)
    expect(nextFynRound(g)).toBeNull()
    expect(g.round).toBe(1)
    expect(g.players.every((p) => p.balance === 0)).toBe(true)
  })

  it('läuft am Tischwirt mit Bots eine ganze Partie durch', () => {
    let n = 0
    let now = 0
    const host = new TableHost({ randomId: () => `id${n++}`, now: () => now })
    host.receive('c', { t: 'create', name: 'Anna', ante: 0, game: 'fyn' })
    host.receive('c', { t: 'addBot' })
    host.receive('c', { t: 'addBot' })
    host.receive('c', { t: 'setPause', ms: 0 })
    let out: Outgoing[] = host.receive('c', { t: 'start' })
    const state = () => {
      const s = [...out].reverse().find((o) => o.to === 'c' && o.msg.t === 'state')?.msg
      return s?.t === 'state' && s.game.kind === 'fyn' ? s.game : null
    }
    for (let i = 0; i < 2000 && state()?.phase !== 'over'; i++) {
      const g = state()
      now += 100
      if (g?.yourTurn && g.phase === 'bids') out = host.receive('c', { t: 'bid', bid: g.legalBids[0] })
      else if (g?.yourTurn && g.phase === 'play') {
        out = host.receive('c', { t: 'play', card: cardId(g.hand[0] as Card) })
      } else if (g?.phase === 'settle') out = host.receive('c', { t: 'next' })
      else out = host.tick()
      if (out.length === 0) out = [{ to: 'c', msg: { t: 'state', code: '', game: g as never } }]
    }
    expect(state()?.phase).toBe('over')
    expect(state()?.round).toBe(11)
  })
})
