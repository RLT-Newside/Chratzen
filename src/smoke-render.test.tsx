import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { HelpSheet } from './components/HelpSheet'
import { RULE_SECTIONS } from './content/rules'
import { Practice } from './screens/Practice'
import { Tutorial } from './screens/Tutorial'

test('alle Regelabschnitte rendern', () => {
  for (const s of RULE_SECTIONS) expect(renderToString(<s.Body />).length).toBeGreaterThan(50)
})

test('Hilfe, Tutorial und Übungsrunde rendern', () => {
  expect(renderToString(<HelpSheet onClose={() => {}} initial="stechen" hint="x" />)).toContain('SPIELHILFE')
  expect(renderToString(<Tutorial onExit={() => {}} onPlay={() => {}} />)).toContain('CHRATZEN LERNEN')
  expect(renderToString(<Practice onExit={() => {}} />)).toContain('Übungstisch')
})
