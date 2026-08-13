/**
 * Chratzen Multiplayer-Backend — Express + Socket.io.
 * Lobbys leben im RAM; Wiedereinstieg läuft über ein Session-Token, das der
 * Client in localStorage hält. Kein Login, keine DB.
 */
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import express from 'express'
import { Server } from 'socket.io'
import type { Call } from '../src/lib/rules'
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
  redact,
  startRound,
} from '../src/lib/game'

const PORT = Number(process.env.PORT ?? 3001)
const MAX_PLAYERS = 8
/** Räume ohne verbundene Spieler werden nach dieser Zeit entsorgt. */
const ROOM_TTL_MS = 30 * 60 * 1000
/** So lange darf jemand am Zug trödeln, bevor der Host für ihn spielen darf. */
const STALL_MS = 30_000
/** Bremse gegen Raum-Spam: so viele neue Räume pro IP und Zeitfenster. */
const CREATE_LIMIT = 5
const CREATE_WINDOW_MS = 60_000

type Room = {
  code: string
  game: Game
  /** Geheimes Session-Token → öffentliche Spieler-ID. */
  sessions: Map<string, string>
  sockets: Map<string, string>
  emptySince: number | null
  /** Wann der aktuelle Spieler an den Zug kam — Basis für den Stall-Timer. */
  turnSince: number
  turnKey: string
}

const rooms = new Map<string, Room>()
/** socket.id → { code, playerId } */
const links = new Map<string, { code: string; playerId: string }>()

// Ohne 0/O/1/I — am Stammtisch wird der Code vorgelesen.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function newCode(): string {
  let code: string
  do {
    code = Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')
  } while (rooms.has(code))
  return code
}

function cleanName(raw: unknown): string {
  return String(raw ?? '').trim().slice(0, 16) || 'Spieler'
}

const createLog = new Map<string, number[]>()

/** Einfaches Sliding-Window pro IP — hält Bots davon ab, Räume zu fluten. */
function mayCreateRoom(ip: string): boolean {
  const now = Date.now()
  const hits = (createLog.get(ip) ?? []).filter((t) => now - t < CREATE_WINDOW_MS)
  if (hits.length >= CREATE_LIMIT) {
    createLog.set(ip, hits)
    return false
  }
  hits.push(now)
  createLog.set(ip, hits)
  return true
}

const app = express()
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }))

// Nach `npm run build` liefert derselbe Prozess auch das Frontend aus — dann
// braucht der Client keine separate Socket-URL.
const dist = path.resolve(import.meta.dirname, '../dist')
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

const http = createServer(app)
const io = new Server(http, {
  cors: { origin: process.env.CORS_ORIGIN ?? '*' },
})

function broadcast(room: Room) {
  const actor = currentActor(room.game)

  // Zug-Uhr nur zurücksetzen, wenn wirklich ein neuer Zug beginnt.
  const key = `${room.game.round}|${room.game.phase}|${actor?.id ?? '-'}|${room.game.trick.length}`
  if (key !== room.turnKey) {
    room.turnKey = key
    room.turnSince = Date.now()
  }

  // Der Host darf einspringen, sobald jemand weg ist oder zu lange trödelt.
  room.game.forceAllowed =
    !!actor && (!actor.connected || Date.now() - room.turnSince > STALL_MS)

  for (const [playerId, socketId] of room.sockets) {
    io.to(socketId).emit('state', { code: room.code, game: redact(room.game, playerId) })
  }
}

/** Aktion ausführen, Fehler nur an den Auslöser zurückmelden. */
function act(socketId: string, run: (room: Room, playerId: string) => string | null) {
  const link = links.get(socketId)
  if (!link) return io.to(socketId).emit('error:msg', 'Nicht in einem Raum.')
  const room = rooms.get(link.code)
  if (!room) return io.to(socketId).emit('error:msg', 'Raum existiert nicht mehr.')

  const err = run(room, link.playerId)
  if (err) io.to(socketId).emit('error:msg', err)
  broadcast(room)
}

function attach(room: Room, playerId: string, socketId: string) {
  const previous = room.sockets.get(playerId)
  if (previous && previous !== socketId) io.to(previous).emit('error:msg', 'Anderswo verbunden.')
  room.sockets.set(playerId, socketId)
  room.emptySince = null
  links.set(socketId, { code: room.code, playerId })
  const player = room.game.players.find((p) => p.id === playerId)
  if (player) player.connected = true
}

io.on('connection', (socket) => {
  socket.on('room:create', ({ name, ante }: { name: string; ante: number }, ack) => {
    const ip = socket.handshake.address ?? 'unknown'
    if (!mayCreateRoom(ip)) {
      return ack?.({ ok: false, error: 'Zu viele Räume in kurzer Zeit. Kurz warten.' })
    }
    const code = newCode()
    const playerId = randomUUID().slice(0, 8)
    const token = randomUUID()
    const game = createGame(playerId, Number(ante) || 100)
    game.players.push({ id: playerId, name: cleanName(name), balance: 0, connected: true })

    const room: Room = {
      code,
      game,
      sessions: new Map([[token, playerId]]),
      sockets: new Map(),
      emptySince: null,
      turnSince: Date.now(),
      turnKey: '',
    }
    rooms.set(code, room)
    attach(room, playerId, socket.id)

    ack?.({ ok: true, code, token })
    broadcast(room)
  })

  socket.on('room:join', ({ code, name }: { code: string; name: string }, ack) => {
    const room = rooms.get(String(code ?? '').toUpperCase())
    if (!room) return ack?.({ ok: false, error: 'Raum nicht gefunden.' })
    if (room.game.phase !== 'lobby') return ack?.({ ok: false, error: 'Partie läuft bereits.' })
    if (room.game.players.length >= MAX_PLAYERS) return ack?.({ ok: false, error: 'Raum ist voll.' })

    const playerId = randomUUID().slice(0, 8)
    const token = randomUUID()
    room.sessions.set(token, playerId)
    room.game.players.push({ id: playerId, name: cleanName(name), balance: 0, connected: true })
    attach(room, playerId, socket.id)

    ack?.({ ok: true, code: room.code, token })
    broadcast(room)
  })

  socket.on('room:rejoin', ({ code, token }: { code: string; token: string }, ack) => {
    const room = rooms.get(String(code ?? '').toUpperCase())
    const playerId = room?.sessions.get(token)
    if (!room || !playerId) return ack?.({ ok: false, error: 'Sitzung abgelaufen.' })

    attach(room, playerId, socket.id)
    ack?.({ ok: true, code: room.code, token })
    broadcast(room)
  })

  socket.on('game:start', () =>
    act(socket.id, (room, playerId) => {
      if (room.game.hostId !== playerId) return 'Nur der Host startet die Partie.'
      if (room.game.phase !== 'lobby') return 'Partie läuft bereits.'
      if (room.game.players.length < 2) return 'Mindestens 2 Spieler.'
      startRound(room.game)
      return null
    }),
  )

  socket.on('game:call', ({ call }: { call: Call }) =>
    act(socket.id, (room, playerId) => applyCall(room.game, playerId, call)),
  )

  socket.on('game:exchange', ({ cards }: { cards: string[] }) =>
    act(socket.id, (room, playerId) => applyExchange(room.game, playerId, cards ?? [])),
  )

  socket.on('game:sleeper', ({ card }: { card: string }) =>
    act(socket.id, (room, playerId) => applySleeperDiscard(room.game, playerId, card)),
  )

  socket.on('game:play', ({ card }: { card: string }) =>
    act(socket.id, (room, playerId) => playCard(room.game, playerId, card)),
  )

  socket.on('game:next', () => act(socket.id, (room) => nextRound(room.game)))

  socket.on('game:kick', ({ playerId: target }: { playerId: string }) =>
    act(socket.id, (room, playerId) => {
      const err = kickPlayer(room.game, playerId, target)
      if (err) return err
      // Sofort entfernt (Lobby)? Dann Sitzung entwerten und Socket lösen.
      if (!room.game.players.some((p) => p.id === target)) {
        for (const [tok, id] of room.sessions) if (id === target) room.sessions.delete(tok)
        const sid = room.sockets.get(target)
        if (sid) {
          io.to(sid).emit('error:msg', 'Du wurdest vom Host entfernt.')
          io.to(sid).emit('kicked')
          links.delete(sid)
        }
        room.sockets.delete(target)
      }
      return null
    }),
  )

  socket.on('game:force', () => act(socket.id, (room, playerId) => forceMove(room.game, playerId)))

  socket.on('disconnect', () => {
    const link = links.get(socket.id)
    links.delete(socket.id)
    if (!link) return
    const room = rooms.get(link.code)
    if (!room) return

    if (room.sockets.get(link.playerId) === socket.id) room.sockets.delete(link.playerId)
    const player = room.game.players.find((p) => p.id === link.playerId)
    if (player) player.connected = false

    // In der Lobby verschwindet man einfach; in laufender Partie bleibt der
    // Platz reserviert, damit man per Token zurückkommt.
    if (room.game.phase === 'lobby') {
      room.game.players = room.game.players.filter((p) => p.id !== link.playerId)
      for (const [tok, id] of room.sessions) if (id === link.playerId) room.sessions.delete(tok)
    }

    // Host-Rolle darf nie bei einem Offline-Spieler hängen bleiben, sonst kann
    // niemand mehr die nächste Runde starten oder einen Zug erzwingen.
    if (room.game.hostId === link.playerId) {
      const heir = room.game.players.find((p) => p.connected) ?? room.game.players[0]
      if (heir) room.game.hostId = heir.id
    }

    if (room.sockets.size === 0) room.emptySince = Date.now()
    if (room.game.players.length === 0) rooms.delete(room.code)
    else broadcast(room)
  })
})

setInterval(() => {
  const now = Date.now()
  for (const [code, room] of rooms) {
    if (room.emptySince && now - room.emptySince > ROOM_TTL_MS) {
      rooms.delete(code)
      continue
    }
    // Ohne Tick würde der Host nie mitbekommen, dass die Stall-Grenze erreicht ist —
    // es passiert ja gerade nichts, was einen Broadcast auslösen würde.
    const actor = currentActor(room.game)
    const stalled = !!actor && (!actor.connected || now - room.turnSince > STALL_MS)
    if (stalled !== room.game.forceAllowed) broadcast(room)
  }
}, 5_000).unref()

http.listen(PORT, () => console.log(`Chratzen-Server läuft auf :${PORT}`))
