/**
 * Chratzen-Server für den Betrieb auf einem Rechner (Cloud, Pi, Laptop).
 * Dünne WebSocket-Schicht über `TableHost` — dieselbe Logik läuft im Host-Handy
 * über das native Plugin.
 */
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import express from 'express'
import { WebSocket, WebSocketServer } from 'ws'
import { TableHost } from '../src/lib/host'
import { type ClientMsg, decode, encode } from '../src/lib/protocol'

const PORT = Number(process.env.PORT ?? 3001)
/** Bremse gegen Raum-Spam: so viele neue Tische pro IP und Zeitfenster. */
const CREATE_LIMIT = 5
const CREATE_WINDOW_MS = 60_000
/** Grösster akzeptierter Frame — ein Zug ist ein paar hundert Byte. */
const MAX_FRAME = 4096

const app = express()
const host = new TableHost({ randomId: () => randomUUID().slice(0, 12) })

app.get('/health', (_req, res) => res.json({ ok: true, rooms: host.roomCount }))

// Nach `npm run build` liefert derselbe Prozess auch das Frontend aus — dann
// braucht der Client keine separate Serveradresse.
const dist = path.resolve(import.meta.dirname, '../dist')
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

const http = createServer(app)
// Eigener Pfad, damit express-static und der Vite-Dev-Proxy sich nicht in die
// Quere kommen. Das Handy-Plugin nimmt jeden Pfad an.
const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: MAX_FRAME })

const sockets = new Map<string, WebSocket>()
const createLog = new Map<string, number[]>()

/** Einfaches Sliding-Window pro IP — hält Bots davon ab, Tische zu fluten. */
function mayCreate(ip: string): boolean {
  const now = Date.now()
  const hits = (createLog.get(ip) ?? []).filter((t) => now - t < CREATE_WINDOW_MS)
  createLog.set(ip, hits)
  if (hits.length >= CREATE_LIMIT) return false
  hits.push(now)
  return true
}

function flush(out: { to: string; msg: unknown }[]) {
  for (const { to, msg } of out) {
    const socket = sockets.get(to)
    if (socket?.readyState === WebSocket.OPEN) socket.send(encode(msg as never))
  }
}

wss.on('connection', (socket, req) => {
  const connId = randomUUID()
  const ip = req.socket.remoteAddress ?? 'unknown'
  sockets.set(connId, socket)

  socket.on('message', (raw) => {
    const msg = decode<ClientMsg>(String(raw))
    if (!msg) return

    if (msg.t === 'create' && !mayCreate(ip)) {
      return socket.send(encode({ t: 'error', message: 'Zu viele Tische in kurzer Zeit. Kurz warten.' }))
    }
    flush(host.receive(connId, msg))
  })

  socket.on('close', () => {
    sockets.delete(connId)
    flush(host.disconnect(connId))
  })
  socket.on('error', () => socket.close())
})

// Kurzer Takt: die Bots ziehen im Tickrhythmus, man kann ihnen zuschauen.
setInterval(() => flush(host.tick()), 800).unref()

http.listen(PORT, () => console.log(`Chratzen-Server läuft auf :${PORT}`))
