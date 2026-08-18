import { describe, expect, it } from 'vitest'
import { TableHost } from './host'
import type { ClientMsg, Outgoing, ServerMsg } from './protocol'

/**
 * Der Tischwirt ohne Transport — genau so läuft er auch im Host-Handy,
 * wo das native Plugin nur die Strings durchreicht.
 */
function pick<T extends ServerMsg['t']>(out: Outgoing[], to: string, t: T) {
  return out.find((o) => o.to === to && o.msg.t === t)?.msg as Extract<ServerMsg, { t: T }> | undefined
}

/** Steuerbare Uhr — sonst läuft eine Stichpause im Test nie ab. */
let NOW = 1_000_000

function makeHost() {
  NOW = 1_000_000
  let n = 0
  return new TableHost({ randomId: () => `id${n++}`, now: () => NOW })
}

function openTable(host: TableHost) {
  const out = host.receive('c-anna', { t: 'create', name: 'Anna', ante: 100 })
  const joined = pick(out, 'c-anna', 'joined')
  if (!joined) throw new Error('kein joined')
  return joined
}

const join = (host: TableHost, conn: string, code: string, name: string): Outgoing[] =>
  host.receive(conn, { t: 'join', code, name })

describe('TableHost', () => {
  it('eröffnet einen Tisch und schickt dem Ersteller Code, Token und Zustand', () => {
    const host = makeHost()
    const out = host.receive('c-anna', { t: 'create', name: 'Anna', ante: 100 })

    const joined = pick(out, 'c-anna', 'joined')
    expect(joined?.code).toHaveLength(4)
    expect(joined?.token).toBeTruthy()

    const state = pick(out, 'c-anna', 'state')
    expect(state?.game.players.map((p) => p.name)).toEqual(['Anna'])
    expect(state?.game.isHost).toBe(true)
    // Alle Antworten gehen nur an diese eine Verbindung.
    expect(new Set(out.map((o) => o.to))).toEqual(new Set(['c-anna']))
  })

  it('verteilt jeden Zustand an alle Verbindungen — jeweils redigiert', () => {
    const host = makeHost()
    const { code } = openTable(host)
    const out = join(host, 'c-beat', code, 'Beat')

    const forAnna = pick(out, 'c-anna', 'state')
    const forBeat = pick(out, 'c-beat', 'state')
    expect(forAnna?.game.youId).not.toBe(forBeat?.game.youId)
    expect(forBeat?.game.isHost).toBe(false)
    expect(forAnna?.game.players).toHaveLength(2)
  })

  it('deckt fremde Hände nicht auf', () => {
    const host = makeHost()
    const { code } = openTable(host)
    join(host, 'c-beat', code, 'Beat')
    const out = host.receive('c-anna', { t: 'start' })

    const forBeat = pick(out, 'c-beat', 'state')
    expect(forBeat?.game.hand).toHaveLength(4)
    // Von den anderen gibt es nur die Kartenzahl, nie die Karten.
    expect(forBeat?.game.players.every((p) => typeof p.cards === 'number')).toBe(true)
    expect(JSON.stringify(forBeat)).not.toContain('"deck"')
    expect(forBeat?.game.deckLeft).toBeGreaterThan(0)
  })

  it('lehnt Beitritt zu unbekanntem oder laufendem Tisch ab', () => {
    const host = makeHost()
    const { code } = openTable(host)
    expect(pick(join(host, 'c-x', 'ZZZZ', 'X'), 'c-x', 'error')?.message).toMatch(/nicht gefunden/)

    join(host, 'c-beat', code, 'Beat')
    host.receive('c-anna', { t: 'start' })
    expect(pick(join(host, 'c-x', code, 'X'), 'c-x', 'error')?.message).toMatch(/läuft bereits/)
  })

  it('meldet Aktionen ohne Sitzung als Fehler statt zu crashen', () => {
    const host = makeHost()
    for (const msg of [{ t: 'start' }, { t: 'next' }, { t: 'force' }] as ClientMsg[]) {
      expect(pick(host.receive('c-fremd', msg), 'c-fremd', 'error')?.message).toMatch(/Nicht an einem Tisch/)
    }
  })

  it('lässt nach Verbindungsabbruch per Token zurück an denselben Platz', () => {
    const host = makeHost()
    const { code } = openTable(host)
    const beatToken = pick(join(host, 'c-beat', code, 'Beat'), 'c-beat', 'joined')?.token as string
    host.receive('c-anna', { t: 'start' })

    host.disconnect('c-beat')
    const away = pick(host.receive('c-anna', { t: 'force' }), 'c-anna', 'state')
    expect(away?.game.players.find((p) => p.name === 'Beat')?.connected).toBe(false)

    const back = pick(host.receive('c-beat2', { t: 'rejoin', code, token: beatToken }), 'c-beat2', 'state')
    expect(back?.game.hand).toHaveLength(4)
    expect(back?.game.players.find((p) => p.name === 'Beat')?.connected).toBe(true)
  })

  it('in der Lobby getrennte Spieler verlassen den Tisch, der Host wandert weiter', () => {
    const host = makeHost()
    const { code } = openTable(host)
    join(host, 'c-beat', code, 'Beat')

    host.disconnect('c-anna')
    const out = join(host, 'c-cara', code, 'Cara')
    const state = pick(out, 'c-beat', 'state')
    expect(state?.game.players.map((p) => p.name)).toEqual(['Beat', 'Cara'])
    expect(state?.game.isHost).toBe(true)
  })

  it('Rauswurf in der Lobby benachrichtigt den Betroffenen und entwertet sein Token', () => {
    const host = makeHost()
    const { code } = openTable(host)
    const token = pick(join(host, 'c-beat', code, 'Beat'), 'c-beat', 'joined')?.token as string

    const out = host.receive('c-anna', { t: 'kick', playerId: 'id3' })
    expect(pick(out, 'c-beat', 'kicked')).toBeTruthy()
    expect(pick(out, 'c-anna', 'state')?.game.players).toHaveLength(1)

    const retry = host.receive('c-beat3', { t: 'rejoin', code, token })
    expect(pick(retry, 'c-beat3', 'error')?.message).toMatch(/abgelaufen/)
  })

  it('setzt Bots nur als Host und nur in der Lobby', () => {
    const host = makeHost()
    const { code } = openTable(host)
    join(host, 'c-beat', code, 'Beat')

    expect(pick(host.receive('c-beat', { t: 'addBot' }), 'c-beat', 'error')?.message).toMatch(
      /Nur der Host/,
    )

    const out = host.receive('c-anna', { t: 'addBot' })
    const state = pick(out, 'c-anna', 'state')
    expect(state?.game.players.map((p) => p.bot ?? false)).toEqual([false, false, true])

    host.receive('c-anna', { t: 'start' })
    expect(pick(host.receive('c-anna', { t: 'addBot' }), 'c-anna', 'error')?.message).toMatch(
      /nur in der Lobby/,
    )
  })

  it('spielt eine ganze Runde allein gegen Bots — der Mensch macht nichts', () => {
    const host = makeHost()
    openTable(host)
    host.receive('c-anna', { t: 'addBot' })
    host.receive('c-anna', { t: 'addBot' })

    // Ohne Stichpause, sonst müsste der Test die Uhr weiterdrehen.
    host.receive('c-anna', { t: 'setPause', ms: 0 })
    let state = pick(host.receive('c-anna', { t: 'start' }), 'c-anna', 'state')
    expect(state?.game.phase).not.toBe('lobby')

    // Nur ticken: solange ein Bot dran ist, zieht er. Bleibt Anna am Zug,
    // passt sie — mehr braucht es nicht, damit die Bots die Runde tragen.
    for (let i = 0; i < 400; i++) {
      const out = host.tick()
      const pushed = pick(out, 'c-anna', 'state')
      if (pushed) state = pushed
      const game = state?.game
      if (!game || game.phase === 'settle') break

      if (game.blindOffer) {
        state = pick(host.receive('c-anna', { t: 'blind', take: false }), 'c-anna', 'state')
      } else if (game.yourTurn && game.phase === 'calls') {
        state = pick(host.receive('c-anna', { t: 'call', call: 'weiter' }), 'c-anna', 'state')
      } else if (game.yourTurn && game.phase === 'play') {
        state = pick(
          host.receive('c-anna', { t: 'play', card: game.legal[0] }),
          'c-anna',
          'state',
        )
      } else if (game.mustDiscardSleeper) {
        const card = game.hand[0]
        state = pick(
          host.receive('c-anna', { t: 'sleeper', card: `${card.suit}-${card.rank}` }),
          'c-anna',
          'state',
        )
      } else if (game.yourTurn && game.phase === 'exchange') {
        state = pick(host.receive('c-anna', { t: 'exchange', cards: [] }), 'c-anna', 'state')
      }
    }

    const game = state?.game
    expect(game?.phase).toBe('settle')
    expect(game?.settlement).toBeTruthy()
    // Genau ein Kratzer, vier Stiche verteilt, Pott vollständig ausgeschüttet.
    const inGame = game?.players.filter((p) => p.call === 'kratzen' || p.call === 'mitgehen') ?? []
    expect(inGame.filter((p) => p.call === 'kratzen')).toHaveLength(1)
    expect(inGame.reduce((a, p) => a + p.tricks, 0)).toBe(4)
    const s = game?.settlement
    if (!s) throw new Error('keine Abrechnung')
    expect(Object.values(s.payouts).reduce((a, b) => a + b, 0)).toBe(s.potBefore)
  })

  it('lässt den fertigen Stich liegen und räumt ihn erst nach der Pause ab', () => {
    const host = makeHost()
    openTable(host)
    host.receive('c-anna', { t: 'addBot' })
    host.receive('c-anna', { t: 'setPause', ms: 2000 })

    // Bis zum ersten vollen Stich durchspielen.
    let state = pick(host.receive('c-anna', { t: 'start' }), 'c-anna', 'state')
    for (let i = 0; i < 200; i++) {
      const pushed = pick(host.tick(), 'c-anna', 'state')
      if (pushed) state = pushed
      const game = state?.game
      if (!game || game.trickPending) break

      if (game.blindOffer) {
        state = pick(host.receive('c-anna', { t: 'blind', take: false }), 'c-anna', 'state')
      } else if (game.yourTurn && game.phase === 'calls') {
        const call = game.players.some((p) => p.call === 'kratzen') ? 'mitgehen' : 'kratzen'
        state = pick(host.receive('c-anna', { t: 'call', call }), 'c-anna', 'state')
      } else if (game.yourTurn && game.phase === 'exchange') {
        state = pick(host.receive('c-anna', { t: 'exchange', cards: [] }), 'c-anna', 'state')
      } else if (game.mustDiscardSleeper) {
        const c = game.hand[0]
        state = pick(
          host.receive('c-anna', { t: 'sleeper', card: `${c.suit}-${c.rank}` }),
          'c-anna',
          'state',
        )
      } else if (game.yourTurn && game.phase === 'play') {
        state = pick(host.receive('c-anna', { t: 'play', card: game.legal[0] }), 'c-anna', 'state')
      }
    }

    const held = state?.game
    if (!held?.trickPending) throw new Error('kein fertiger Stich')
    // Von jedem Teilnehmer liegt eine Karte, der Gewinner steht schon fest.
    const inGame = held.players.filter((p) => p.call === 'kratzen' || p.call === 'mitgehen')
    expect(held.trick).toHaveLength(inGame.length)
    expect(held.players.find((p) => p.id === held.trickPending)?.tricks).toBe(1)

    // Zu früh: nichts passiert.
    NOW += 1000
    host.tick()
    expect(pick(host.tick(), 'c-anna', 'state')).toBeUndefined()

    NOW += 1500
    const cleared = pick(host.tick(), 'c-anna', 'state')
    expect(cleared?.game.trick).toEqual([])
    expect(cleared?.game.trickPending).toBeNull()
  })

  it('stellt die Pause nur auf Ansage des Hosts um', () => {
    const host = makeHost()
    const { code } = openTable(host)
    join(host, 'c-beat', code, 'Beat')

    expect(pick(host.receive('c-beat', { t: 'setPause', ms: 3000 }), 'c-beat', 'error')?.message)
      .toMatch(/Nur der Host/)

    expect(pick(host.receive('c-anna', { t: 'setPause', ms: 2000 }), 'c-anna', 'state')?.game.trickPauseMs)
      .toBe(2000)
    // Unsinnige Werte werden eingefangen.
    expect(pick(host.receive('c-anna', { t: 'setPause', ms: -5 }), 'c-anna', 'state')?.game.trickPauseMs)
      .toBe(0)
    expect(pick(host.receive('c-anna', { t: 'setPause', ms: 99_999 }), 'c-anna', 'state')?.game.trickPauseMs)
      .toBe(5000)
  })

  it('liefert fremde Kontostände nur, wenn der Host sie freigibt', () => {
    const host = makeHost()
    const { code } = openTable(host)
    join(host, 'c-beat', code, 'Beat')
    host.receive('c-anna', { t: 'start' })

    // Standard: alle sehen alles.
    let forBeat = pick(host.tick(), 'c-beat', 'state') ?? pick(host.receive('c-beat', { t: 'force' }), 'c-beat', 'state')
    expect(forBeat?.game.showBalances).toBe(true)
    expect(forBeat?.game.players.map((p) => p.balance)).toEqual([-100, -100])

    // Verdeckt: fremde Stände verlassen den Server gar nicht erst.
    forBeat = pick(host.receive('c-anna', { t: 'setBalances', show: false }), 'c-beat', 'state')
    expect(forBeat?.game.showBalances).toBe(false)
    const me = forBeat?.game.players.find((p) => p.id === forBeat?.game.youId)
    const other = forBeat?.game.players.find((p) => p.id !== forBeat?.game.youId)
    expect(me?.balance).toBe(-100)
    expect(other?.balance).toBe(0)

    // Der Host sieht seinen eigenen Stand weiterhin.
    const forAnna = pick(host.receive('c-anna', { t: 'setBalances', show: false }), 'c-anna', 'state')
    expect(forAnna?.game.players.find((p) => p.id === forAnna?.game.youId)?.balance).toBe(-100)
  })

  it('stellt die Kontostände nur auf Ansage des Hosts um', () => {
    const host = makeHost()
    const { code } = openTable(host)
    join(host, 'c-beat', code, 'Beat')

    expect(pick(host.receive('c-beat', { t: 'setBalances', show: false }), 'c-beat', 'error')?.message)
      .toMatch(/Nur der Host/)
    expect(pick(host.receive('c-anna', { t: 'setBalances', show: false }), 'c-anna', 'state')?.game.showBalances)
      .toBe(false)
  })

  it('lässt einen erzwungenen Zug den Letzten nicht in die Sackgasse schicken', () => {
    // Der Letzte muss mitgehen; ein erzwungenes "weiter" würde abgelehnt und
    // die Runde hinge. Der Host-Eingriff muss deshalb mitgehen wählen.
    const host = makeHost()
    const { code } = openTable(host)
    join(host, 'c-beat', code, 'Beat')
    join(host, 'c-cara', code, 'Cara')
    host.receive('c-anna', { t: 'setPause', ms: 0 })

    // Ohne Annotation dreht sich die Typinferenz im Kreis, weil die Schleife
    // `state` liest und neu setzt.
    type StateMsg = Extract<ServerMsg, { t: 'state' }> | undefined
    let state: StateMsg = pick(host.receive('c-anna', { t: 'start' }), 'c-anna', 'state')
    const conn = (id: string) => (id === 'id0' ? 'c-anna' : id === 'id3' ? 'c-beat' : 'c-cara')

    // Blinden ablehnen, dann: einer kratzt, einer sagt Letzter, Rest passt.
    if (state?.game.blindOffer) {
      state = pick(host.receive('c-anna', { t: 'blind', take: false }), 'c-anna', 'state')
    }
    if (state?.game.phase !== 'calls') return

    let letzterId: string | null = null
    for (let i = 0; i < 3 && state?.game.phase === 'calls'; i++) {
      const who: string = state.game.players[state.game.turn].id
      const hasKratzer: boolean = state.game.players.some((p) => p.call === 'kratzen')
      const call: 'kratzen' | 'letzter' | 'weiter' = !hasKratzer
        ? 'kratzen'
        : letzterId === null
          ? 'letzter'
          : 'weiter'
      if (call === 'letzter') letzterId = who
      state = pick(host.receive(conn(who), { t: 'call', call }), conn(who), 'state')
    }

    if (!state?.game.awaitLetzter || !letzterId) return
    expect(state.game.letzterForced).toBe(true)

    // Der Letzte reagiert nicht — der Host springt ein.
    host.disconnect(conn(letzterId))
    const out = host.receive('c-anna', { t: 'force' })
    const after = pick(out, 'c-anna', 'state')
    expect(pick(out, 'c-anna', 'error')).toBeUndefined()
    expect(after?.game.awaitLetzter).toBe(false)
    expect(after?.game.players.find((p) => p.id === letzterId)?.call).toBe('mitgehen')
  })

  it('gibt die Host-Rolle nie an einen Bot weiter', () => {
    const host = makeHost()
    const { code } = openTable(host)
    join(host, 'c-beat', code, 'Beat')
    host.receive('c-anna', { t: 'addBot' })
    host.receive('c-anna', { t: 'start' })

    host.disconnect('c-anna')
    const state = pick(host.tick(), 'c-beat', 'state') ?? pick(host.receive('c-beat', { t: 'force' }), 'c-beat', 'state')
    const newHost = state?.game.players.find((p) => p.id === state?.game.hostId)
    expect(newHost?.bot ?? false).toBe(false)
    expect(newHost?.name).toBe('Beat')
  })

  it('räumt den Tisch ab, sobald der letzte Spieler in der Lobby weg ist', () => {
    const host = makeHost()
    openTable(host)
    expect(host.roomCount).toBe(1)
    host.disconnect('c-anna')
    expect(host.roomCount).toBe(0)
  })
})
