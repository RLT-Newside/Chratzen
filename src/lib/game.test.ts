import { describe, expect, it } from 'vitest'
import { type Card, cardId, legalCards } from './cards'
import {
  type Game,
  applyCall,
  applyExchange,
  applySleeperDiscard,
  createGame,
  currentActor,
  declareBlind,
  declineBlind,
  finishTrick,
  forceMove,
  kickPlayer,
  nextRound,
  playCard,
  redact,
  startRound,
} from './game'
import { TRICKS_PER_ROUND, isPlaying } from './rules'

function makeGame(names: string[], ante = 100): Game {
  const g = createGame('p0', ante)
  g.players = names.map((name, i) => ({ id: `p${i}`, name, balance: 0, connected: true }))
  return g
}

/**
 * Teilt aus, bis es keine Bannerrunde ist, und lehnt den Blinden ab — für alle
 * Tests, die den normalen Ansageablauf prüfen wollen.
 */
function freshDeal(names: string[], ante = 100): Game {
  const g = makeGame(names, ante)
  do {
    g.pot = 0
    for (const p of g.players) p.balance = 0
    startRound(g)
  } while (g.banner)
  declineBlind(g, g.players[g.dealerIndex].id)
  return g
}

/** Spielt eine Runde mit zufälligen, aber immer legalen Zügen bis zur Abrechnung. */
function autoplay(g: Game) {
  for (let guard = 0; guard < 2000 && g.phase !== 'settle'; guard++) {
    expectNoDuplicates(g)
    // Der fertige Stich liegt kurz; im Test gibt es keine Uhr, also sofort weg.
    if (g.trickPending) {
      finishTrick(g)
      continue
    }
    if (g.phase === 'blind') {
      // Mal so, mal so — beide Wege müssen sauber durchlaufen.
      const dealer = g.players[g.dealerIndex]
      const decide = Math.random() < 0.3 ? declareBlind : declineBlind
      expect(decide(g, dealer.id)).toBeNull()
    } else if (g.phase === 'calls') {
      const p = g.players[g.turn]
      const hasKratzer = g.players.some((x) => g.calls[x.id] === 'kratzen')
      const call = g.awaitLetzter
        ? 'mitgehen'
        : !hasKratzer
          ? 'kratzen'
          : Math.random() < 0.6
            ? 'mitgehen'
            : 'weiter'
      expect(applyCall(g, p.id, call)).toBeNull()
    } else if (g.phase === 'exchange') {
      const p = g.players[g.turn]
      const n = Math.floor(Math.random() * 5)
      expect(applyExchange(g, p.id, g.hands[p.id].slice(0, n).map(cardId))).toBeNull()
    } else if (g.phase === 'sleeper') {
      const id = g.sleepers[0]
      expect(g.hands[id]).toHaveLength(5)
      expect(applySleeperDiscard(g, id, cardId(g.hands[id][0]))).toBeNull()
    } else if (g.phase === 'play') {
      const p = g.players[g.turn]
      const lead = g.trick[0]?.card.suit ?? null
      const pick = legalCards(g.hands[p.id], lead, g.trump?.suit ?? null)[0] as Card
      expect(playCard(g, p.id, cardId(pick))).toBeNull()
    } else {
      throw new Error(`unerwartete Phase ${g.phase}`)
    }
  }
  expect(g.phase).toBe('settle')
}

const chips = (g: Game) => g.players.reduce((a, p) => a + p.balance, 0) + g.pot

/**
 * Jede Karte existiert genau einmal — auf einer Hand, im Stapel, im Ablagestapel
 * oder im laufenden Stich. Die aufgedeckte Trumpfkarte zählt als eigene Karte
 * auf dem Tisch, ausser der Blinde hat sie in die Hand genommen.
 */
function everyCard(g: Game): string[] {
  const all = [
    ...g.deck,
    ...g.discards,
    ...Object.values(g.hands).flat(),
    ...g.trick.map((t) => t.card),
  ].map(cardId)
  if (g.trump && !g.trumpInHand) all.push(cardId(g.trump))
  return all
}

function expectNoDuplicates(g: Game) {
  const all = everyCard(g)
  const seen = new Set(all)
  if (seen.size !== all.length) {
    const doppelt = all.filter((c, i) => all.indexOf(c) !== i)
    throw new Error(`Karte doppelt im Spiel: ${[...new Set(doppelt)].join(', ')}`)
  }
  expect(all).toHaveLength(36)
}

describe('Austeilen', () => {
  it('gibt jedem 4 Karten; die Trumpfkarte liegt auf dem Tisch und gehört niemandem', () => {
    const g = makeGame(['A', 'B', 'C'])
    startRound(g)
    expect(g.pot).toBe(300)
    for (const p of g.players) expect(g.hands[p.id]).toHaveLength(4)

    // Der Trumpf darf auf keiner Hand liegen — sonst hätte ihn jemand doppelt.
    const trumpId = cardId(g.trump as Card)
    for (const p of g.players) {
      expect(g.hands[p.id].map(cardId)).not.toContain(trumpId)
    }
    expect(g.trumpInHand).toBe(false)
    // 36 − 3×4 ausgeteilt − 1 aufgedeckt
    expect(g.deck).toHaveLength(23)
    expectNoDuplicates(g)
  })

  it('Bannerrunde: Trumpf 10 ⇒ Geber kratzt, alle anderen gehen mit', () => {
    const g = makeGame(['A', 'B', 'C'])
    for (let i = 0; i < 200; i++) {
      startRound(g)
      if (g.banner) break
      g.pot = 0
      for (const p of g.players) p.balance = 0
    }
    if (!g.banner) return // extrem unwahrscheinlich, aber kein Testfehler
    expect(g.phase).toBe('exchange')
    expect(g.calls[g.players[g.dealerIndex].id]).toBe('kratzen')
    for (const [i, p] of g.players.entries()) {
      if (i !== g.dealerIndex) expect(g.calls[p.id]).toBe('mitgehen')
    }
  })
})

describe('Alle passen', () => {
  it('deckt einen neuen Trumpf auf, ohne die Hände neu zu geben', () => {
    const g = freshDeal(['A', 'B', 'C'])

    const before = cardId(g.trump as Card)
    const handsBefore = g.players.map((p) => g.hands[p.id].map(cardId).join())

    for (let k = 0; k < g.players.length; k++) applyCall(g, g.players[g.turn].id, 'weiter')

    expect(g.flips).toBe(1)
    expect(cardId(g.trump as Card)).not.toBe(before)
    expect(g.players.map((p) => g.hands[p.id].map(cardId).join())).toEqual(handsBefore)
    expect(g.pot).toBe(300) // kein neuer Grundeinsatz beim blossen Umdrehen
  })

  it('mischt nach dem 3. Mal neu und alle legen nochmals ein', () => {
    const g = freshDeal(['A', 'B', 'C'])

    let guard = 0
    while (g.flips < 2 && guard++ < 20) {
      if (g.phase !== 'calls' || g.banner) break
      for (let k = 0; k < g.players.length; k++) applyCall(g, g.players[g.turn].id, 'weiter')
    }
    if (g.flips !== 2 || g.banner) return

    for (let k = 0; k < g.players.length; k++) applyCall(g, g.players[g.turn].id, 'weiter')
    expect(g.flips).toBe(0)
    expect(g.pot).toBe(600)
  })
})

describe('Vollständige Runden', () => {
  it('läuft 3–6 Spieler sauber durch und bleibt ein Nullsummenspiel', () => {
    for (const count of [3, 4, 5, 6]) {
      const g = makeGame(Array.from({ length: count }, (_, i) => `P${i}`))
      startRound(g)
      expect(chips(g)).toBe(0)

      for (let round = 0; round < 8; round++) {
        autoplay(g)

        const inGame = g.players.filter((p) => isPlaying(g.calls[p.id]))
        const tricks = inGame.reduce((a, p) => a + (g.tricksWon[p.id] ?? 0), 0)
        expect(tricks).toBe(TRICKS_PER_ROUND)
        // Eine gespielte Runde hat immer genau einen Kratzer — ohne Kratzer
        // wird nicht gespielt, und mehr als einer ist nicht erlaubt.
        expect(inGame.filter((p) => g.calls[p.id] === 'kratzen')).toHaveLength(1)
        expect(g.trickHistory).toHaveLength(TRICKS_PER_ROUND)
        for (const p of inGame) expect(g.hands[p.id]).toHaveLength(0)

        const s = g.settlement
        if (!s) throw new Error('keine Abrechnung')
        expect(Object.values(s.payouts).reduce((a, b) => a + b, 0)).toBe(g.pot)

        nextRound(g)
        // Alles, was den Spielern fehlt, liegt im Pott — und umgekehrt.
        expect(chips(g)).toBe(0)
      }
    }
  })
})

describe('Host-Rechte', () => {
  it('wirft in der Lobby sofort raus, nur der Host darf das', () => {
    const g = makeGame(['A', 'B', 'C'])
    expect(kickPlayer(g, 'p1', 'p2')).toMatch(/Nur der Host/)
    expect(kickPlayer(g, 'p0', 'p0')).toMatch(/selbst/)
    expect(kickPlayer(g, 'p0', 'p2')).toBeNull()
    expect(g.players.map((p) => p.id)).toEqual(['p0', 'p1'])
  })

  it('wirft mitten in der Partie erst zur nächsten Runde raus — Abrechnung wird vorher gebucht', () => {
    const g = makeGame(['A', 'B', 'C'])
    startRound(g)
    autoplay(g)

    expect(kickPlayer(g, 'p0', 'p2')).toBeNull()
    expect(g.players).toHaveLength(3) // läuft ja noch
    expect(g.pendingKicks).toEqual(['p2'])

    const s = g.settlement
    if (!s) throw new Error('keine Abrechnung')
    const kickedAfterBooking =
      (g.players.find((p) => p.id === 'p2')?.balance ?? 0) +
      (s.payouts.p2 ?? 0) -
      (s.penalties.p2 ?? 0)

    nextRound(g)
    expect(g.players.map((p) => p.id)).toEqual(['p0', 'p1'])
    expect(g.hands.p2).toBeUndefined()
    // Nur der Weggeworfene fehlt in der Bilanz — sonst stimmt die Kasse weiter.
    // (Summe statt Vergleich, sonst stolpert Object.is über -0.)
    expect(chips(g) + kickedAfterBooking).toBe(0)
  })

  it('erneutes Kicken hebt die Markierung wieder auf', () => {
    const g = makeGame(['A', 'B', 'C'])
    startRound(g)
    kickPlayer(g, 'p0', 'p1')
    kickPlayer(g, 'p0', 'p1')
    expect(g.pendingKicks).toEqual([])
  })

  it('unter 2 Spielern geht es zurück in die Lobby', () => {
    const g = makeGame(['A', 'B', 'C'])
    startRound(g)
    autoplay(g)
    kickPlayer(g, 'p0', 'p1')
    kickPlayer(g, 'p0', 'p2')
    nextRound(g)
    expect(g.phase).toBe('lobby')
    expect(g.players).toHaveLength(1)
  })

  it('Zug erzwingen geht nur als Host und nur wenn der Server es freigibt', () => {
    const g = freshDeal(['A', 'B', 'C'])

    expect(forceMove(g, 'p1')).toMatch(/Nur der Host/)
    expect(forceMove(g, 'p0')).toMatch(/zu früh/)

    g.forceAllowed = true
    const stuck = currentActor(g)
    if (!stuck) throw new Error('niemand am Zug')
    expect(forceMove(g, 'p0')).toBeNull()
    expect(g.calls[stuck.id]).toBe('weiter')
    expect(currentActor(g)?.id).not.toBe(stuck.id)
  })

  it('erzwungene Züge bringen eine hängende Runde zu Ende', () => {
    const g = makeGame(['A', 'B', 'C'])
    startRound(g)
    for (let i = 0; i < 200 && g.phase !== 'settle'; i++) {
      // Während der Stich liegt, ist niemand am Zug — im Test sofort abräumen.
      if (g.trickPending) {
        finishTrick(g)
        continue
      }
      // Ohne einen Kratzer würde ewig neu aufgedeckt — den setzen wir normal.
      const noKratzer = !g.players.some((p) => g.calls[p.id] === 'kratzen')
      if (g.phase === 'calls' && noKratzer) {
        expect(applyCall(g, g.players[g.turn].id, 'kratzen')).toBeNull()
        continue
      }
      g.forceAllowed = true
      expect(forceMove(g, 'p0')).toBeNull()
    }
    expect(g.phase).toBe('settle')
  })
})

describe('Kartenbestand', () => {
  it('deckt jede Karte genau einmal auf, auch über mehrere Trumpfwechsel', () => {
    const g = makeGame(['A', 'B', 'C', 'D'])
    startRound(g)
    expectNoDuplicates(g)

    // Der erste Trumpf liegt in der Hand des Gebers und darf beim Neuaufdecken
    // nicht im Ablagestapel landen — sonst wird er ein zweites Mal ausgeteilt.
    expect(g.trumpInHand).toBe(false)
    const trumpId = cardId(g.trump as Card)
    for (const p of g.players) expect(g.hands[p.id].map(cardId)).not.toContain(trumpId)

    declineBlind(g, g.players[g.dealerIndex].id)
    for (let flip = 0; flip < 3 && !g.banner; flip++) {
      for (let k = 0; k < g.players.length && g.phase === 'calls'; k++) {
        applyCall(g, g.players[g.turn].id, 'weiter')
      }
      expectNoDuplicates(g)
    }
  })

  it('bleibt auch nach vielen Tauschrunden sauber', () => {
    for (let round = 0; round < 12; round++) {
      const g = makeGame(['A', 'B', 'C', 'D', 'E', 'F'])
      startRound(g)
      autoplay(g)
      expectNoDuplicates(g)
    }
  })
})

describe('Bedienen oder stechen', () => {
  const c = (suit: 'schellen' | 'schilten' | 'rosen' | 'eichel', rank: number) =>
    ({ suit, rank }) as Card
  const ids = (cards: Card[]) => cards.map(cardId).sort()

  it('lässt Trumpf zu, auch wenn man die angespielte Farbe hätte', () => {
    const hand = [c('rosen', 7), c('rosen', 13), c('schellen', 6), c('eichel', 14)]
    // Trumpf Schellen, angespielt sind Rosen: bedienen oder mit Schellen stechen.
    expect(ids(legalCards(hand, 'rosen', 'schellen'))).toEqual(
      ids([c('rosen', 7), c('rosen', 13), c('schellen', 6)]),
    )
    // Die Fremdfarbe bleibt gesperrt.
    expect(ids(legalCards(hand, 'rosen', 'schellen'))).not.toContain('eichel-14')
  })

  it('verlangt bei angespieltem Trumpf weiterhin bedienen', () => {
    const hand = [c('schellen', 6), c('rosen', 14)]
    expect(ids(legalCards(hand, 'schellen', 'schellen'))).toEqual(['schellen-6'])
  })

  it('gibt ohne die angespielte Farbe die ganze Hand frei', () => {
    const hand = [c('schellen', 6), c('eichel', 14)]
    expect(ids(legalCards(hand, 'rosen', 'schellen'))).toEqual(ids(hand))
  })

  it('lässt beim Ausspielen alles zu', () => {
    const hand = [c('schellen', 6), c('eichel', 14)]
    expect(ids(legalCards(hand, null, 'schellen'))).toEqual(ids(hand))
  })

  it('die Engine nimmt den Trumpf an, obwohl die Farbe bedienbar wäre', () => {
    const g = freshDeal(['A', 'B', 'C'])
    applyCall(g, g.players[g.turn].id, 'kratzen')
    while (g.phase === 'calls') applyCall(g, g.players[g.turn].id, 'mitgehen')
    while (g.phase === 'exchange') applyExchange(g, g.players[g.turn].id, [])
    while (g.phase === 'sleeper') {
      const id = g.sleepers[0]
      applySleeperDiscard(g, id, cardId(g.hands[id][0]))
    }
    expect(g.phase).toBe('play')

    const trump = (g.trump as Card).suit
    const lead = (['schellen', 'schilten', 'rosen', 'eichel'] as const).find((x) => x !== trump)
    if (!lead) throw new Error('keine Fremdfarbe')

    // Vorderhand spielt die Fremdfarbe an.
    const leader = g.players[g.turn]
    g.hands[leader.id] = [c(lead, 9)]
    expect(playCard(g, leader.id, cardId(c(lead, 9)))).toBeNull()
    if (g.trickPending) return // allein am Tisch, kein Gegenspieler

    // Der Nächste könnte bedienen, darf aber stechen — beides steht zur Wahl.
    const next = g.players[g.turn]
    g.hands[next.id] = [c(lead, 7), c(trump, 6)]
    expect(redact(g, next.id).legal.sort()).toEqual(ids([c(lead, 7), c(trump, 6)]))

    expect(playCard(g, next.id, cardId(c(trump, 6)))).toBeNull()

    // Restliche Teilnehmer mit wertlosen Fremdfarben abfertigen.
    const junk = (['schellen', 'schilten', 'rosen', 'eichel'] as const).find(
      (x) => x !== trump && x !== lead,
    ) as 'schellen'
    for (let rank = 6; g.phase === 'play' && !g.trickPending && rank < 10; rank++) {
      const p = g.players[g.turn]
      g.hands[p.id] = [c(junk, rank)]
      expect(playCard(g, p.id, cardId(c(junk, rank)))).toBeNull()
    }

    // Der kleine Trumpf sticht die höhere Farbkarte.
    expect(g.trickPending).toBe(next.id)
  })
})

describe('Blinder', () => {
  /** Teilt neu aus, bis es keine Bannerrunde ist — die überspringt den Blinden. */
  function dealt(names: string[]): Game {
    const g = makeGame(names)
    do {
      g.pot = 0
      for (const p of g.players) p.balance = 0
      startRound(g)
    } while (g.banner)
    return g
  }

  it('bietet ihn direkt nach dem Austeilen nur dem Geber an', () => {
    const g = dealt(['A', 'B', 'C'])
    expect(g.phase).toBe('blind')
    expect(g.blindOffer).toBe(g.players[g.dealerIndex].id)
    expect(declareBlind(g, g.players[1].id)).toMatch(/Nur der Geber/)
  })

  it('zeigt dem Geber seine Karten nicht, solange er entscheidet', () => {
    const g = dealt(['A', 'B', 'C'])
    const dealer = g.players[g.dealerIndex]

    const mine = redact(g, dealer.id)
    expect(mine.hand).toEqual([])
    expect(mine.blindOffer).toBe(true)
    // Auch sonst darf die Hand nirgends im Zustand auftauchen.
    expect(JSON.stringify(mine)).not.toContain(cardId(g.hands[dealer.id][1]))

    // Die anderen sehen ihre eigenen Karten ganz normal.
    const other = redact(g, g.players[1].id)
    expect(other.hand).toHaveLength(4)
    expect(other.blindOffer).toBe(false)
  })

  it('gibt Trumpf plus vier frische Karten und kratzt automatisch', () => {
    const g = dealt(['A', 'B', 'C'])
    const dealer = g.players[g.dealerIndex]
    const alt = g.hands[dealer.id].map(cardId)

    expect(declareBlind(g, dealer.id)).toBeNull()

    const neu = g.hands[dealer.id].map(cardId)
    expect(neu).toHaveLength(5)
    // Die Trumpfkarte kommt vom Tisch dazu, die vier ausgeteilten sind weg.
    expect(neu).toContain(cardId(g.trump as Card))
    expect(neu.filter((c) => alt.includes(c))).toEqual([])
    expect(g.trumpInHand).toBe(true)

    expect(g.blind).toBe(true)
    expect(g.calls[dealer.id]).toBe('kratzen')
    expect(g.phase).toBe('calls')
    expectNoDuplicates(g)
  })

  it('lässt die anderen normal ansagen, ohne zweite Chance', () => {
    const g = dealt(['A', 'B', 'C'])
    const dealer = g.players[g.dealerIndex]
    declareBlind(g, dealer.id)

    // Der Geber hat als Erster gesprochen — niemand wird nochmals gefragt.
    expect(applyCall(g, g.players[g.turn].id, 'kratzen')).toMatch(/nur einer/)
    expect(applyCall(g, g.players[g.turn].id, 'mitgehen')).toBeNull()
    expect(applyCall(g, g.players[g.turn].id, 'weiter')).toBeNull()
    expect(g.secondChance).toEqual([])
    expect(g.phase).toBe('exchange')
  })

  it('behält fünf Karten über den Tausch und wirft dann eine ab', () => {
    const g = dealt(['A', 'B'])
    const dealer = g.players[g.dealerIndex]
    declareBlind(g, dealer.id)
    while (g.phase === 'calls') applyCall(g, g.players[g.turn].id, 'weiter')

    expect(g.phase).toBe('exchange')
    // Der Blinde tauscht ganz normal — vier Karten, aber keinen Nachschlag.
    expect(applyExchange(g, dealer.id, g.hands[dealer.id].slice(0, 4).map(cardId))).toBeNull()
    expect(g.hands[dealer.id]).toHaveLength(5)

    while (g.phase === 'exchange') applyExchange(g, g.players[g.turn].id, [])
    expect(g.phase).toBe('sleeper')
    expect(g.sleepers).toContain(dealer.id)

    applySleeperDiscard(g, dealer.id, cardId(g.hands[dealer.id][0]))
    while (g.phase === 'sleeper') {
      const id = g.sleepers[0]
      applySleeperDiscard(g, id, cardId(g.hands[id][0]))
    }
    expect(g.hands[dealer.id]).toHaveLength(4)
    expectNoDuplicates(g)
  })

  it('nach dem Verzicht geht es normal weiter', () => {
    const g = dealt(['A', 'B', 'C'])
    const dealer = g.players[g.dealerIndex]
    expect(declineBlind(g, g.players[1].id)).toMatch(/der Geber/)
    expect(declineBlind(g, dealer.id)).toBeNull()

    expect(g.phase).toBe('calls')
    expect(g.blind).toBe(false)
    expect(g.callsLeft).toBe(3)
    expect(redact(g, dealer.id).hand).toHaveLength(4)
    // Links vom Geber fängt an.
    expect(g.turn).toBe((g.dealerIndex + 1) % 3)
  })

  it('wird nach einem Trumpfwechsel nicht mehr angeboten', () => {
    const g = dealt(['A', 'B', 'C'])
    declineBlind(g, g.players[g.dealerIndex].id)
    for (let k = 0; k < 3; k++) applyCall(g, g.players[g.turn].id, 'weiter')

    expect(g.flips).toBe(1)
    expect(g.blindOffer).toBeNull()
    // Der nachgezogene Trumpf kann selbst ein Banner sein — dann geht es direkt
    // in den Tausch. Angeboten wird der Blinde so oder so nicht mehr.
    expect(g.phase).toBe(g.banner ? 'exchange' : 'calls')
  })
})

describe('Der Kratzer eröffnet', () => {
  it('tauscht zuerst und spielt den ersten Stich aus', () => {
    const g = freshDeal(['A', 'B', 'C', 'D'])

    // p1 ist links vom Geber und passt; p2 kratzt.
    applyCall(g, g.players[g.turn].id, 'weiter')
    const kratzer = g.players[g.turn]
    applyCall(g, kratzer.id, 'kratzen')
    while (g.phase === 'calls') applyCall(g, g.players[g.turn].id, 'weiter')

    expect(g.phase).toBe('exchange')
    expect(g.players[g.turn].id).toBe(kratzer.id)

    applyExchange(g, kratzer.id, [])
    while (g.phase === 'exchange') applyExchange(g, g.players[g.turn].id, [])
    while (g.phase === 'sleeper') {
      const id = g.sleepers[0]
      applySleeperDiscard(g, id, cardId(g.hands[id][0]))
    }

    expect(g.phase).toBe('play')
    expect(g.players[g.turn].id).toBe(kratzer.id)
    expect(g.players[g.leader].id).toBe(kratzer.id)
  })
})

describe('Zweite Chance nach dem Kratzer', () => {
  const say = (g: Game, call: 'weiter' | 'kratzen' | 'mitgehen' | 'letzter') =>
    applyCall(g, g.players[g.turn].id, call)

  it('fragt nochmals, wer vor dem Kratzer gepasst hat', () => {
    const g = freshDeal(['A', 'B', 'C'])
    // Reihenfolge ab links vom Geber: p1, p2, p0.
    expect(say(g, 'weiter')).toBeNull() // p1 — konnte noch gar nicht mitgehen
    expect(say(g, 'kratzen')).toBeNull() // p2
    expect(say(g, 'weiter')).toBeNull() // p0 — hatte die Wahl bereits

    expect(g.phase).toBe('calls')
    expect(g.secondChance).toEqual(['p1'])
    expect(g.players[g.turn].id).toBe('p1')

    expect(applyCall(g, 'p1', 'mitgehen')).toBeNull()
    expect(g.phase).toBe('exchange')
    expect(g.calls.p1).toBe('mitgehen')
    expect(g.calls.p0).toBe('weiter')
  })

  it('lässt in der zweiten Chance nicht mehr kratzen', () => {
    const g = freshDeal(['A', 'B', 'C'])
    say(g, 'weiter')
    say(g, 'kratzen')
    say(g, 'weiter')

    expect(applyCall(g, 'p1', 'kratzen')).toMatch(/nur noch mitgehen/)
    expect(applyCall(g, 'p1', 'letzter')).toMatch(/nur noch mitgehen/)
    expect(g.calls.p1).toBe('weiter')
  })

  it('darf auch beim zweiten Mal passen', () => {
    const g = freshDeal(['A', 'B', 'C'])
    say(g, 'weiter')
    say(g, 'kratzen')
    say(g, 'weiter')

    expect(applyCall(g, 'p1', 'weiter')).toBeNull()
    expect(g.phase).toBe('exchange')
    expect(g.players.filter((p) => isPlaying(g.calls[p.id]))).toHaveLength(1)
  })

  it('fragt mehrere der Reihe nach', () => {
    const g = freshDeal(['A', 'B', 'C', 'D'])
    // Reihenfolge: p1, p2, p3, p0.
    say(g, 'weiter')
    say(g, 'weiter')
    say(g, 'kratzen') // p3
    say(g, 'weiter') // p0, nach dem Kratzer

    expect(g.secondChance).toEqual(['p1', 'p2'])
    expect(g.players[g.turn].id).toBe('p1')

    expect(applyCall(g, 'p2', 'mitgehen')).toMatch(/nicht am Zug/)
    applyCall(g, 'p1', 'weiter')
    expect(g.players[g.turn].id).toBe('p2')
    applyCall(g, 'p2', 'mitgehen')
    expect(g.phase).toBe('exchange')
  })

  it('fragt niemanden nochmals, wenn der Kratzer zuerst dran war', () => {
    const g = freshDeal(['A', 'B', 'C'])
    say(g, 'kratzen') // p1
    say(g, 'weiter')
    say(g, 'weiter')

    expect(g.secondChance).toEqual([])
    expect(g.phase).toBe('exchange')
  })

  it('der Letzte entscheidet erst nach den zweiten Chancen', () => {
    const g = freshDeal(['A', 'B', 'C', 'D'])
    say(g, 'weiter') // p1
    say(g, 'letzter') // p2
    say(g, 'kratzen') // p3
    say(g, 'weiter') // p0

    // Erst p1 nochmals fragen …
    expect(g.secondChance).toEqual(['p1'])
    expect(g.awaitLetzter).toBe(false)

    applyCall(g, 'p1', 'mitgehen')
    // … dann darf der Letzte frei wählen, weil schon jemand mitgeht.
    expect(g.awaitLetzter).toBe(true)
    expect(g.players[g.turn].id).toBe('p2')
  })

  it('ohne Kratzer wird niemand nochmals gefragt', () => {
    const g = freshDeal(['A', 'B', 'C'])
    const trumpBefore = g.trump
    say(g, 'weiter')
    say(g, 'weiter')
    say(g, 'weiter')

    expect(g.secondChance).toEqual([])
    expect(g.flips).toBe(1)
    expect(g.trump).not.toBe(trumpBefore)
  })
})

describe('Regelverstösse werden abgelehnt', () => {
  it('nicht am Zug, falsche Karte, Mitgehen ohne Kratzer', () => {
    const g = freshDeal(['A', 'B', 'C'])

    const active = g.players[g.turn]
    const other = g.players[(g.turn + 1) % 3]
    expect(applyCall(g, other.id, 'kratzen')).toMatch(/nicht am Zug/)
    expect(applyCall(g, active.id, 'mitgehen')).toMatch(/gekratzt/)
    expect(playCard(g, active.id, cardId(g.hands[active.id][0]))).toMatch(/kein Ausspielen/)
    expect(applyCall(g, active.id, 'kratzen')).toBeNull()
  })

  it('nach dem ersten Kratzer darf niemand mehr kratzen', () => {
    const g = freshDeal(['A', 'B', 'C'])

    expect(applyCall(g, g.players[g.turn].id, 'kratzen')).toBeNull()

    const second = g.players[g.turn]
    expect(applyCall(g, second.id, 'kratzen')).toMatch(/nur einer/)
    expect(g.calls[second.id]).toBe('weiter')
    expect(applyCall(g, second.id, 'mitgehen')).toBeNull()

    expect(g.players.filter((p) => g.calls[p.id] === 'kratzen')).toHaveLength(1)
  })
})
