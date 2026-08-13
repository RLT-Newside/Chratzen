/**
 * End-to-End-Check der Transportschicht: Tisch eröffnen, beitreten, eine Runde
 * komplett durchspielen, abrechnen — und einen Verbindungsabbruch mit
 * Wiedereinstieg per Token.
 *
 * Server muss laufen:  npm run server
 * Dann:                npm run smoke
 */
import assert from 'node:assert/strict'
import { WebSocket } from 'ws'
import type { ClientGame } from '../src/lib/game'
import { type ClientMsg, type ServerMsg, decode, encode } from '../src/lib/protocol'

const URL = process.env.SMOKE_URL ?? 'ws://localhost:3001/ws'

type Client = {
  name: string
  socket: WebSocket
  token: string
  code: string
  game: ClientGame | null
  acted: Set<string>
  onMessage: ((msg: ServerMsg) => void)[]
}

function connect(name: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(URL)
    const client: Client = { name, socket, token: '', code: '', game: null, acted: new Set(), onMessage: [] }
    socket.on('open', () => resolve(client))
    socket.on('error', reject)
    socket.on('message', (raw) => {
      const msg = decode<ServerMsg>(String(raw))
      if (!msg) return
      if (msg.t === 'joined') {
        client.token = msg.token
        client.code = msg.code
      }
      if (msg.t === 'error') console.log(`  ⚠ ${client.name}: ${msg.message}`)
      for (const fn of client.onMessage) fn(msg)
    })
  })
}

const send = (c: Client, msg: ClientMsg) => c.socket.send(encode(msg))

/** Wartet auf die erste Nachricht, die `match` erfüllt. */
function waitFor(c: Client, match: (msg: ServerMsg) => boolean, label: string): Promise<ServerMsg> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${label}`)), 5000)
    const fn = (msg: ServerMsg) => {
      if (!match(msg)) return
      clearTimeout(timer)
      c.onMessage.splice(c.onMessage.indexOf(fn), 1)
      resolve(msg)
    }
    c.onMessage.push(fn)
  })
}

/** Reagiert auf jeden Zustand und macht genau einen legalen Zug, wenn dran. */
function drive(c: Client, onSettle: () => void) {
  c.onMessage.push((msg) => {
    if (msg.t !== 'state') return
    const game = msg.game
    c.game = game
    const key = `${game.round}|${game.phase}|${game.turn}|${game.trick.length}|${game.hand.length}|${game.blindOffer}`
    if (c.acted.has(key)) return
    c.acted.add(key)

    if (game.phase === 'settle') return onSettle()
    if (game.blindOffer) return send(c, { t: 'blind', take: false })
    if (game.mustDiscardSleeper) {
      return send(c, { t: 'sleeper', card: `${game.hand[0].suit}-${game.hand[0].rank}` })
    }
    if (!game.yourTurn) return

    if (game.phase === 'calls') {
      const hasKratzer = game.players.some((p) => p.call === 'kratzen')
      send(c, { t: 'call', call: hasKratzer || game.awaitLetzter ? 'mitgehen' : 'kratzen' })
    } else if (game.phase === 'exchange') {
      send(c, { t: 'exchange', cards: game.hand.slice(0, 2).map((x) => `${x.suit}-${x.rank}`) })
    } else if (game.phase === 'play') {
      send(c, { t: 'play', card: game.legal[0] })
    }
  })
}

async function main() {
  const host = await connect('Anna')
  send(host, { t: 'create', name: 'Anna', ante: 100 })
  await waitFor(host, (m) => m.t === 'joined', 'Tisch eröffnen')
  assert.ok(host.code, 'kein Raumcode erhalten')
  // Ohne Stichpause, sonst dauert der Lauf unnötig lange.
  send(host, { t: 'setPause', ms: 0 })
  console.log(`Tisch ${host.code} eröffnet`)

  const clients: Client[] = [host]
  for (const name of ['Beat', 'Chiara']) {
    const c = await connect(name)
    send(c, { t: 'join', code: host.code, name })
    await waitFor(c, (m) => m.t === 'joined', `${name} beitreten`)
    clients.push(c)
  }
  console.log('3 Spieler in der Lobby')

  const settled = new Promise<void>((resolve) => {
    for (const c of clients) drive(c, () => c === host && resolve())
  })
  send(host, { t: 'start' })
  await settled

  const s = host.game?.settlement
  assert.ok(s, 'keine Abrechnung im Zustand')
  const paid = Object.values(s.payouts).reduce((a, b) => a + b, 0)
  assert.equal(paid, s.potBefore, 'Ausschüttung ≠ Pott')
  console.log(`Runde abgerechnet — Pott ${s.potBefore}, neuer Pott ${s.potAfter}`)

  // Nächste Runde austeilen lassen, damit der Reconnect echte Karten prüft.
  for (const c of clients) c.onMessage.length = 0
  const beat = clients[1]

  // Der Geber wechselt reihum; wer neu dran ist, sieht seine Hand erst nach der
  // Blind-Entscheidung. Also erst ablehnen, dann auf die Karten warten.
  for (const c of clients) {
    c.onMessage.push((m) => {
      if (m.t === 'state' && m.game.blindOffer) send(c, { t: 'blind', take: false })
    })
  }

  const dealt = waitFor(
    beat,
    (m) => m.t === 'state' && m.game.phase !== 'settle' && m.game.hand.length === 4,
    'neue Runde',
  )
  send(host, { t: 'next' })
  beat.game = ((await dealt) as Extract<ServerMsg, { t: 'state' }>).game
  console.log(`Runde ${beat.game.round} ausgeteilt`)

  // Verbindungsabbruch mitten in der Partie → Wiedereinstieg per Token.
  const handBefore = beat.game.hand.length
  beat.socket.close()
  await new Promise((r) => setTimeout(r, 200))

  const again = await connect('Beat')
  send(again, { t: 'rejoin', code: beat.code, token: beat.token })
  const restored = (await waitFor(again, (m) => m.t === 'state', 'Wiedereinstieg')) as Extract<
    ServerMsg,
    { t: 'state' }
  >
  assert.equal(restored.game.hand.length, handBefore, 'Hand nach Reconnect verändert')
  assert.ok(
    restored.game.players.find((p) => p.name === 'Beat')?.connected,
    'nicht als verbunden markiert',
  )
  console.log(`Reconnect ok — ${handBefore} Karten wieder da`)

  for (const c of clients) c.socket.close()
  again.socket.close()
  console.log('\n✓ Transportschicht ok')
  process.exit(0)
}

main().catch((err) => {
  console.error('✗ Smoke-Test fehlgeschlagen:', err)
  process.exit(1)
})
