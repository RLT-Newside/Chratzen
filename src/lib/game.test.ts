import { describe, expect, it } from 'vitest'
import { type Card, cardId, legalCards } from './cards'
import {
  type Game,
  applyCall,
  applyExchange,
  applySleeperDiscard,
  createGame,
  currentActor,
  forceMove,
  kickPlayer,
  nextRound,
  playCard,
  startRound,
} from './game'
import { TRICKS_PER_ROUND, isPlaying } from './rules'

function makeGame(names: string[], ante = 100): Game {
  const g = createGame('p0', ante)
  g.players = names.map((name, i) => ({ id: `p${i}`, name, balance: 0, connected: true }))
  return g
}

/** Spielt eine Runde mit zufälligen, aber immer legalen Zügen bis zur Abrechnung. */
function autoplay(g: Game) {
  for (let guard = 0; guard < 2000 && g.phase !== 'settle'; guard++) {
    expectNoDuplicates(g)
    if (g.phase === 'calls') {
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
      const pick = legalCards(g.hands[p.id], lead)[0] as Card
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
 * oder im laufenden Stich. Der aufgedeckte Trumpf zählt nur mit, wenn er nicht
 * ohnehin schon in der Hand des Gebers liegt.
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
  it('gibt jedem 4 Karten und deckt die letzte Karte des Gebers als Trumpf auf', () => {
    const g = makeGame(['A', 'B', 'C'])
    startRound(g)
    expect(g.pot).toBe(300)
    for (const p of g.players) expect(g.hands[p.id]).toHaveLength(4)
    const dealerHand = g.hands[g.players[g.dealerIndex].id]
    expect(cardId(dealerHand[dealerHand.length - 1])).toBe(cardId(g.trump as Card))
    // 36 − 3×4 ausgeteilt
    expect(g.deck).toHaveLength(24)
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
    const g = makeGame(['A', 'B', 'C'])
    do {
      g.pot = 0
      for (const p of g.players) p.balance = 0
      startRound(g)
    } while (g.banner)

    const before = cardId(g.trump as Card)
    const handsBefore = g.players.map((p) => g.hands[p.id].map(cardId).join())

    for (let k = 0; k < g.players.length; k++) applyCall(g, g.players[g.turn].id, 'weiter')

    expect(g.flips).toBe(1)
    expect(cardId(g.trump as Card)).not.toBe(before)
    expect(g.players.map((p) => g.hands[p.id].map(cardId).join())).toEqual(handsBefore)
    expect(g.pot).toBe(300) // kein neuer Grundeinsatz beim blossen Umdrehen
  })

  it('mischt nach dem 3. Mal neu und alle legen nochmals ein', () => {
    const g = makeGame(['A', 'B', 'C'])
    do {
      g.pot = 0
      for (const p of g.players) p.balance = 0
      startRound(g)
    } while (g.banner)

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
    const g = makeGame(['A', 'B', 'C'])
    do {
      g.pot = 0
      for (const p of g.players) p.balance = 0
      startRound(g)
    } while (g.banner)

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
    expect(g.trumpInHand).toBe(true)
    const dealerHand = g.hands[g.players[g.dealerIndex].id].map(cardId)
    expect(dealerHand).toContain(cardId(g.trump as Card))

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

describe('Der Kratzer eröffnet', () => {
  it('tauscht zuerst und spielt den ersten Stich aus', () => {
    const g = makeGame(['A', 'B', 'C', 'D'])
    do {
      g.pot = 0
      for (const p of g.players) p.balance = 0
      startRound(g)
    } while (g.banner)

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
  /** Deckt neu auf, bis es keine Bannerrunde ist — die setzt die Ansagen fest. */
  function freshRound(names: string[]): Game {
    const g = makeGame(names)
    do {
      g.pot = 0
      for (const p of g.players) p.balance = 0
      startRound(g)
    } while (g.banner)
    return g
  }

  const say = (g: Game, call: 'weiter' | 'kratzen' | 'mitgehen' | 'letzter') =>
    applyCall(g, g.players[g.turn].id, call)

  it('fragt nochmals, wer vor dem Kratzer gepasst hat', () => {
    const g = freshRound(['A', 'B', 'C'])
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
    const g = freshRound(['A', 'B', 'C'])
    say(g, 'weiter')
    say(g, 'kratzen')
    say(g, 'weiter')

    expect(applyCall(g, 'p1', 'kratzen')).toMatch(/nur noch mitgehen/)
    expect(applyCall(g, 'p1', 'letzter')).toMatch(/nur noch mitgehen/)
    expect(g.calls.p1).toBe('weiter')
  })

  it('darf auch beim zweiten Mal passen', () => {
    const g = freshRound(['A', 'B', 'C'])
    say(g, 'weiter')
    say(g, 'kratzen')
    say(g, 'weiter')

    expect(applyCall(g, 'p1', 'weiter')).toBeNull()
    expect(g.phase).toBe('exchange')
    expect(g.players.filter((p) => isPlaying(g.calls[p.id]))).toHaveLength(1)
  })

  it('fragt mehrere der Reihe nach', () => {
    const g = freshRound(['A', 'B', 'C', 'D'])
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
    const g = freshRound(['A', 'B', 'C'])
    say(g, 'kratzen') // p1
    say(g, 'weiter')
    say(g, 'weiter')

    expect(g.secondChance).toEqual([])
    expect(g.phase).toBe('exchange')
  })

  it('der Letzte entscheidet erst nach den zweiten Chancen', () => {
    const g = freshRound(['A', 'B', 'C', 'D'])
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
    const g = freshRound(['A', 'B', 'C'])
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
    const g = makeGame(['A', 'B', 'C'])
    do {
      g.pot = 0
      for (const p of g.players) p.balance = 0
      startRound(g)
    } while (g.banner)

    const active = g.players[g.turn]
    const other = g.players[(g.turn + 1) % 3]
    expect(applyCall(g, other.id, 'kratzen')).toMatch(/nicht am Zug/)
    expect(applyCall(g, active.id, 'mitgehen')).toMatch(/gekratzt/)
    expect(playCard(g, active.id, cardId(g.hands[active.id][0]))).toMatch(/kein Ausspielen/)
    expect(applyCall(g, active.id, 'kratzen')).toBeNull()
  })

  it('nach dem ersten Kratzer darf niemand mehr kratzen', () => {
    const g = makeGame(['A', 'B', 'C'])
    do {
      g.pot = 0
      for (const p of g.players) p.balance = 0
      startRound(g)
    } while (g.banner)

    expect(applyCall(g, g.players[g.turn].id, 'kratzen')).toBeNull()

    const second = g.players[g.turn]
    expect(applyCall(g, second.id, 'kratzen')).toMatch(/nur einer/)
    expect(g.calls[second.id]).toBe('weiter')
    expect(applyCall(g, second.id, 'mitgehen')).toBeNull()

    expect(g.players.filter((p) => g.calls[p.id] === 'kratzen')).toHaveLength(1)
  })
})
