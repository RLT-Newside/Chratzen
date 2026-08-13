import { describe, expect, it } from 'vitest'
import { botCall, botDiscard, botExchange, botName, botPlay, expectedTricks } from './bot'
import { type Card, type Rank, type Suit, cardId } from './cards'

const c = (suit: Suit, rank: Rank): Card => ({ suit, rank })
const TRUMP: Suit = 'rosen'

/** Vier Trümpfe von oben — damit gewinnt man alles. */
const monster = [c('rosen', 14), c('rosen', 13), c('rosen', 12), c('rosen', 11)]
/** Nichts als kleine Fremdfarben. */
const junk = [c('eichel', 6), c('schilten', 7), c('schellen', 8), c('eichel', 9)]
/** Ein Trumpf-Ass und sonst wenig — reicht für einen Stich, nicht für zwei. */
const mittel = [c('rosen', 14), c('eichel', 6), c('schilten', 7), c('schellen', 8)]

describe('Handbewertung', () => {
  it('bewertet Trümpfe höher als Fremdfarben', () => {
    expect(expectedTricks(monster, TRUMP)).toBeGreaterThan(expectedTricks(junk, TRUMP))
    expect(expectedTricks(junk, TRUMP)).toBe(0)
  })
})

describe('botCall', () => {
  const call = (hand: Card[], over: Partial<Parameters<typeof botCall>[0]> = {}) =>
    botCall({
      hand,
      trump: TRUMP,
      someoneKratzed: false,
      awaitLetzter: false,
      isLastToSpeak: false,
      ...over,
    })

  it('kratzt mit starker Hand', () => {
    expect(call(monster)).toBe('kratzen')
  })

  it('passt mit Müll', () => {
    expect(call(junk)).toBe('weiter')
    expect(call(junk, { isLastToSpeak: true })).toBe('weiter')
  })

  it('kratzt nie, wenn schon jemand gekratzt hat', () => {
    expect(call(monster, { someoneKratzed: true })).toBe('mitgehen')
    expect(call(junk, { someoneKratzed: true })).toBe('weiter')
  })

  it('nimmt als Letzter auch eine mittlere Hand, damit gespielt wird', () => {
    expect(call(mittel)).toBe('weiter')
    expect(call(mittel, { isLastToSpeak: true })).toBe('kratzen')
  })

  it('entscheidet sich als Letzter nur zwischen mitgehen und passen', () => {
    expect(call(monster, { awaitLetzter: true })).toBe('mitgehen')
    expect(call(junk, { awaitLetzter: true })).toBe('weiter')
  })
})

describe('botExchange', () => {
  it('behält Trümpfe und hohe Karten', () => {
    expect(botExchange(monster, TRUMP)).toEqual([])
    const gemischt = [c('rosen', 6), c('eichel', 14), c('schilten', 7), c('schellen', 8)]
    expect(botExchange(gemischt, TRUMP)).toEqual(['schilten-7', 'schellen-8'])
  })

  it('tauscht höchstens 4 Karten', () => {
    expect(botExchange([...junk, c('eichel', 10)], TRUMP)).toHaveLength(4)
  })
})

describe('botDiscard', () => {
  it('wirft die schwächste Karte ab', () => {
    const hand = [c('rosen', 6), c('eichel', 14), c('schilten', 7)]
    expect(botDiscard(hand, TRUMP)).toBe('schilten-7')
  })
})

describe('botPlay', () => {
  it('spielt vorne die stärkste Karte aus', () => {
    expect(botPlay('me', mittel, [], TRUMP)).toBe('rosen-14')
  })

  it('sticht mit Trumpf, wenn die Farbe den Stich nicht holt', () => {
    const hand = [c('eichel', 6), c('rosen', 14)]
    const trick = [{ playerId: 'a', card: c('eichel', 13) }]
    expect(botPlay('me', hand, trick, TRUMP)).toBe('rosen-14')
  })

  it('bedient, wenn die Farbe reicht — der Trumpf bleibt liegen', () => {
    const hand = [c('eichel', 14), c('rosen', 6)]
    const trick = [{ playerId: 'a', card: c('eichel', 13) }]
    expect(botPlay('me', hand, trick, TRUMP)).toBe('eichel-14')
  })

  it('muss bedienen, wenn Trumpf angespielt ist', () => {
    // Bei angespieltem Trumpf gibt es kein Ausweichen — auch nicht auf eine
    // wertlose Fremdfarbe.
    const hand = [c('eichel', 6), c('rosen', 7)]
    const trick = [{ playerId: 'a', card: c('rosen', 14) }]
    expect(botPlay('me', hand, trick, TRUMP)).toBe('rosen-7')
  })

  it('gewinnt den Stich so billig wie möglich', () => {
    const hand = [c('eichel', 7), c('eichel', 13), c('eichel', 14)]
    const trick = [{ playerId: 'a', card: c('eichel', 12) }]
    expect(botPlay('me', hand, trick, TRUMP)).toBe('eichel-13')
  })

  it('wirft die schwächste Karte ab, wenn der Stich nicht zu holen ist', () => {
    const hand = [c('eichel', 8), c('schilten', 9), c('schilten', 6)]
    const trick = [{ playerId: 'a', card: c('rosen', 14) }]
    expect(botPlay('me', hand, trick, TRUMP)).toBe('schilten-6')
  })

  it('sticht mit Trumpf, wenn die Farbe fehlt', () => {
    const hand = [c('rosen', 6), c('schilten', 9)]
    const trick = [{ playerId: 'a', card: c('eichel', 14) }]
    expect(botPlay('me', hand, trick, TRUMP)).toBe(cardId(c('rosen', 6)))
  })
})

describe('botName', () => {
  it('vergibt keinen Namen doppelt', () => {
    expect(botName([])).toBe('Sepp')
    expect(botName(['Sepp', 'Vreni'])).toBe('Köbi')
  })
})
