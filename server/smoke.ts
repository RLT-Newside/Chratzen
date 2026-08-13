/**
 * End-to-End-Check der Socket-Schicht: Raum eröffnen, beitreten, eine Runde
 * komplett durchspielen, abrechnen — und einen Verbindungsabbruch mit
 * Wiedereinstieg per Token.
 *
 * Server muss laufen:  npm run server
 * Dann:                npm run smoke
 */
import assert from 'node:assert/strict'
import { type Socket, io } from 'socket.io-client'
import type { ClientGame } from '../src/lib/game'

const URL = process.env.SMOKE_URL ?? 'http://localhost:3001'

type Client = {
  name: string
  socket: Socket
  token: string
  code: string
  game: ClientGame | null
  acted: Set<string>
}

const connect = () =>
  new Promise<Socket>((resolve, reject) => {
    const s = io(URL, { transports: ['websocket'], timeout: 4000 })
    s.on('connect', () => resolve(s))
    s.on('connect_error', reject)
  })

const emitAck = <T>(s: Socket, event: string, payload: object) =>
  new Promise<T>((resolve) => s.emit(event, payload, resolve))

/** Reagiert auf jeden State-Push und macht genau einen legalen Zug, wenn dran. */
function drive(c: Client, onSettle: (c: Client) => void) {
  c.socket.on('state', ({ game }: { game: ClientGame }) => {
    c.game = game
    const key = `${game.round}|${game.phase}|${game.turn}|${game.trick.length}|${game.hand.length}`
    if (c.acted.has(key)) return
    c.acted.add(key)

    if (game.phase === 'settle') return onSettle(c)
    if (game.mustDiscardSleeper) {
      return c.socket.emit('game:sleeper', { card: `${game.hand[0].suit}-${game.hand[0].rank}` })
    }
    if (!game.yourTurn) return

    if (game.phase === 'calls') {
      const hasKratzer = game.players.some((p) => p.call === 'kratzen')
      const call = game.awaitLetzter ? 'mitgehen' : hasKratzer ? 'mitgehen' : 'kratzen'
      c.socket.emit('game:call', { call })
    } else if (game.phase === 'exchange') {
      c.socket.emit('game:exchange', {
        cards: game.hand.slice(0, 2).map((x) => `${x.suit}-${x.rank}`),
      })
    } else if (game.phase === 'play') {
      c.socket.emit('game:play', { card: game.legal[0] })
    }
  })
  c.socket.on('error:msg', (m: string) => console.log(`  ⚠ ${c.name}: ${m}`))
}

async function main() {
  const clients: Client[] = []
  let settled = 0

  const host = await connect()
  const created = await emitAck<{ ok: boolean; code: string; token: string }>(host, 'room:create', {
    name: 'Anna',
    ante: 100,
  })
  assert.ok(created.ok, 'Raum konnte nicht eröffnet werden')
  clients.push({ name: 'Anna', socket: host, token: created.token, code: created.code, game: null, acted: new Set() })
  console.log(`Raum ${created.code} eröffnet`)

  for (const name of ['Beat', 'Chiara']) {
    const s = await connect()
    const joined = await emitAck<{ ok: boolean; code: string; token: string }>(s, 'room:join', {
      code: created.code,
      name,
    })
    assert.ok(joined.ok, `${name} konnte nicht beitreten`)
    clients.push({ name, socket: s, token: joined.token, code: created.code, game: null, acted: new Set() })
  }
  console.log('3 Spieler in der Lobby')

  const done = new Promise<void>((resolve) => {
    for (const c of clients) {
      drive(c, (who) => {
        settled += 1
        if (who.game?.youId === who.game?.hostId && settled >= 1) {
          const s = who.game?.settlement
          assert.ok(s, 'keine Abrechnung im State')
          const paid = Object.values(s.payouts).reduce((a, b) => a + b, 0)
          assert.equal(paid, s.potBefore, 'Ausschüttung ≠ Pott')
          console.log(`Runde abgerechnet — Pott ${s.potBefore}, neuer Pott ${s.potAfter}`)
          resolve()
        }
      })
    }
  })

  host.emit('game:start')
  await done

  // Nächste Runde austeilen lassen, damit der Reconnect echte Karten prüft.
  for (const c of clients) c.socket.removeAllListeners('state')
  const beat = clients[1]
  const dealt = new Promise<ClientGame>((resolve) => {
    beat.socket.on('state', ({ game }: { game: ClientGame }) => {
      if (game.phase !== 'settle' && game.hand.length === 4) resolve(game)
    })
  })
  host.emit('game:next')
  beat.game = await dealt
  console.log(`Runde ${beat.game.round} ausgeteilt`)

  // Verbindungsabbruch mitten in der Partie → Wiedereinstieg per Token.
  const handBefore = beat.game.hand.length
  beat.socket.disconnect()
  await new Promise((r) => setTimeout(r, 200))

  const again = await connect()
  const back = await emitAck<{ ok: boolean }>(again, 'room:rejoin', {
    code: beat.code,
    token: beat.token,
  })
  assert.ok(back.ok, 'Wiedereinstieg fehlgeschlagen')

  const restored = await new Promise<ClientGame>((resolve) =>
    again.once('state', ({ game }: { game: ClientGame }) => resolve(game)),
  )
  assert.equal(restored.hand.length, handBefore, 'Hand nach Reconnect verändert')
  assert.ok(restored.players.find((p) => p.name === 'Beat')?.connected, 'nicht als verbunden markiert')
  console.log(`Reconnect ok — ${handBefore} Karten wieder da`)

  for (const c of clients) c.socket.disconnect()
  again.disconnect()
  console.log('\n✓ Socket-Schicht ok')
  process.exit(0)
}

main().catch((err) => {
  console.error('✗ Smoke-Test fehlgeschlagen:', err)
  process.exit(1)
})
