import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { FynRules } from './components/FynRules'
import { HelpSheet } from './components/HelpSheet'
import { RULE_SECTIONS } from './content/rules'
import { createFyn, redactFyn, startFynRound } from './lib/fyn'
import { MainMenu } from './screens/MainMenu'
import { Practice } from './screens/Practice'
import { Tutorial } from './screens/Tutorial'
import { FynTable } from './screens/digital/FynTable'

test('alle Regelabschnitte rendern', () => {
  for (const s of RULE_SECTIONS) expect(renderToString(<s.Body />).length).toBeGreaterThan(50)
})

test('Hilfe, Tutorial und Übungsrunde rendern', () => {
  expect(renderToString(<HelpSheet onClose={() => {}} initial="stechen" hint="x" />)).toContain('SPIELHILFE')
  expect(renderToString(<Tutorial onExit={() => {}} onPlay={() => {}} />)).toContain('CHRATZEN LERNEN')
  expect(renderToString(<Practice onExit={() => {}} />)).toContain('Übungstisch')
})

test('Menü und FYN-Tisch rendern in jeder Phase', () => {
  const g = createFyn('p0')
  g.players = ['Anna', 'Beat', 'Cara'].map((name, i) => ({ id: `p${i}`, name, balance: 0, connected: true }))
  const noop = () => {}
  const table = () =>
    renderToString(
      <FynTable
        game={redactFyn(g, 'p0')}
        onBid={noop}
        onPlay={noop}
        onNext={noop}
        onKick={noop}
        onForce={noop}
        onSetPause={noop}
        onLeave={noop}
      />,
    )
  expect(renderToString(<MainMenu onSelect={noop} />)).toContain('JCARDS')
  expect(renderToString(<FynRules onClose={noop} />)).toContain('Stirnrunde')

  startFynRound(g)
  g.turn = 0
  expect(table()).toContain('Wie viele Stiche')

  g.round = 6
  startFynRound(g)
  expect(table()).toContain('an deiner Stirn')

  g.phase = 'over'
  g.settlement = { p0: 10, p1: -10, p2: 0 }
  expect(table()).toContain('Endstand')
})
