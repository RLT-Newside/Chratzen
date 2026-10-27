import { renderToString } from 'react-dom/server'
import { expect, it } from 'vitest'
import { parseCard } from '../lib/cards'
import { applyBid, createFyn, playFynCard, redactFyn, startFynRound } from '../lib/fyn'
import { nextFynLesson } from './fynCoach'

function table(round = 1) {
  const g = createFyn('p0')
  g.players = ['Du', 'Sepp', 'Vreni'].map((name, i) => ({ id: `p${i}`, name, balance: 0, connected: true }))
  g.round = round
  startFynRound(g)
  return g
}

const lesson = (g: ReturnType<typeof table>, seen: string[], you = 'p0') =>
  nextFynLesson(redactFyn(g, you), new Set(seen))?.id

it('begrüsst zuerst, dann erklärt er die Ansage', () => {
  const g = table()
  expect(lesson(g, [], 'p1')).toBe('willkommen')
  expect(lesson(g, ['willkommen'], 'p1')).toBe('ansage')
})

it('erklärt dem Geber, welche Zahl ihm verboten ist', () => {
  const g = table()
  applyBid(g, 'p1', 2)
  applyBid(g, 'p2', 1)
  const id = lesson(g, ['willkommen', 'ansage'])
  expect(id).toBe('geber')
  // 6 Karten − 3 angesagt = 3 verboten.
  const body = nextFynLesson(redactFyn(g, 'p0'), new Set(['willkommen', 'ansage']))?.body
  expect(renderToString(<>{body}</>).replaceAll('<!-- -->', '')).toContain('nicht 3')
})

it('meldet zweimal null nur, wenn wirklich die Null-Regel greift', () => {
  const g = table()
  g.lastBids = { p1: 0 }
  expect(lesson(g, ['willkommen', 'ansage'], 'p1')).toBe('null')
  expect(lesson(g, ['willkommen', 'ansage'], 'p2')).toBeUndefined()
})

it('Stirnrunde und Stechen kommen auch nach der ersten Runde noch', () => {
  const forehead = table(6)
  const seenAll = ['willkommen', 'ansage', 'geber', 'null', 'spielen', 'abrechnung', 'fertig']
  expect(lesson(forehead, seenAll)).toBe('stirn')

  const g = table(2)
  for (const [id, cards] of Object.entries({
    p0: ['rosen-14', 'rosen-6'],
    p1: ['eichel-14', 'eichel-6'],
    p2: ['schellen-7', 'schellen-8'],
  })) {
    g.hands[id] = cards.map(parseCard)
  }
  applyBid(g, 'p1', 1)
  applyBid(g, 'p2', 0)
  applyBid(g, 'p0', 0)
  playFynCard(g, 'p1', 'eichel-14')
  playFynCard(g, 'p2', 'schellen-7')
  playFynCard(g, 'p0', 'rosen-14')
  expect(lesson(g, seenAll)).toBe('stechen')
})
