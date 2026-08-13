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

function makeHost() {
  let n = 0
  return new TableHost({ randomId: () => `id${n++}`, now: () => 1_000_000 })
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

  it('räumt den Tisch ab, sobald der letzte Spieler in der Lobby weg ist', () => {
    const host = makeHost()
    openTable(host)
    expect(host.roomCount).toBe(1)
    host.disconnect('c-anna')
    expect(host.roomCount).toBe(0)
  })
})
