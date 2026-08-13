/**
 * Zwei Wege zum Tischwirt:
 *
 * - Gast: nackter WebSocket zu einem Server oder zum Host-Handy.
 * - Host: der Tischwirt läuft direkt in dieser WebView. Ein natives Plugin
 *   nimmt die Verbindungen der Gäste an und reicht nur die Strings durch —
 *   die Spiellogik bleibt hier in TypeScript.
 */
import { type PluginListenerHandle, registerPlugin } from '@capacitor/core'
import { TableHost } from './host'
import { type ClientMsg, type Outgoing, type ServerMsg, decode, encode } from './protocol'

export const DEFAULT_HOST_PORT = 3001
/** Fester WS-Pfad — trennt den Upgrade sauber von den statischen Dateien. */
const WS_PATH = '/ws'
/** Verbindungs-ID des Hosts selbst — der spielt ohne Socket mit. */
const SELF = 'self'

export type Handlers = {
  onOpen: () => void
  onClose: () => void
  onMessage: (msg: ServerMsg) => void
  onError: (text: string) => void
}

export type Transport = {
  send: (msg: ClientMsg) => void
  close: () => void
}

export type NetInterface = { name: string; ip: string; kind: 'hotspot' | 'wlan' | 'other' }

/**
 * Der Host lauscht auf allen Interfaces — die Adressen sind gleichwertig.
 * Die Liste dient nur dazu, den Gästen die richtige vorzulesen.
 */
export type HostInfo = { ip: string; port: number; interfaces: NetInterface[] }

type ChratzenHostPlugin = {
  start(o: { port: number }): Promise<HostInfo>
  stop(): Promise<void>
  send(o: { connId: string; data: string }): Promise<void>
  addListener(
    event: 'open' | 'message' | 'close',
    cb: (data: { connId: string; data?: string }) => void,
  ): Promise<PluginListenerHandle>
}

export const NativeHost = registerPlugin<ChratzenHostPlugin>('ChratzenHost')

/** `192.168.1.42:3001` oder `https://…` → passende WebSocket-URL. */
export function toWsUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '')
  if (!trimmed) {
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${WS_PATH}`
  }
  if (/^wss?:\/\//.test(trimmed)) return trimmed
  if (/^https:\/\//.test(trimmed)) return `${trimmed.replace(/^https:/, 'wss:')}${WS_PATH}`
  if (/^http:\/\//.test(trimmed)) return `${trimmed.replace(/^http:/, 'ws:')}${WS_PATH}`
  return `ws://${trimmed}${WS_PATH}`
}

export function createWsTransport(url: string, h: Handlers): Transport {
  let socket: WebSocket
  try {
    socket = new WebSocket(toWsUrl(url))
  } catch {
    h.onError('Ungültige Serveradresse.')
    return { send: () => {}, close: () => {} }
  }

  socket.onopen = () => h.onOpen()
  socket.onclose = () => h.onClose()
  socket.onerror = () => h.onError(url ? `Kein Tisch unter ${url}` : 'Kein Server erreichbar.')
  socket.onmessage = (ev) => {
    const msg = decode<ServerMsg>(String(ev.data))
    if (msg) h.onMessage(msg)
  }

  return {
    send: (msg) => socket.readyState === WebSocket.OPEN && socket.send(encode(msg)),
    close: () => socket.close(),
  }
}

/**
 * Host-Betrieb: Tischwirt in dieser WebView, Gäste kommen über das Plugin rein.
 * `onReady` liefert die Adresse, die die anderen eintippen müssen.
 */
export function createHostTransport(
  h: Handlers,
  onReady: (info: HostInfo | null) => void,
  port = DEFAULT_HOST_PORT,
): Transport {
  const table = new TableHost()
  const listeners: PluginListenerHandle[] = []
  let alive = true

  const dispatch = (out: Outgoing[]) => {
    for (const { to, msg } of out) {
      if (to === SELF) h.onMessage(msg)
      else NativeHost.send({ connId: to, data: encode(msg) }).catch(() => {})
    }
  }

  const boot = async () => {
    try {
      listeners.push(
        await NativeHost.addListener('message', ({ connId, data }) => {
          const msg = decode<ClientMsg>(String(data ?? ''))
          if (msg) dispatch(table.receive(connId, msg))
        }),
        await NativeHost.addListener('close', ({ connId }) => dispatch(table.disconnect(connId))),
      )
      const info = await NativeHost.start({ port })
      if (!alive) return NativeHost.stop().catch(() => {})
      onReady(info)
      h.onOpen()
    } catch {
      onReady(null)
      h.onError('Tisch konnte nicht geöffnet werden. Port belegt?')
      h.onClose()
    }
  }
  boot()

  const timer = setInterval(() => dispatch(table.tick()), 5_000)

  return {
    send: (msg) => dispatch(table.receive(SELF, msg)),
    close: () => {
      alive = false
      clearInterval(timer)
      for (const l of listeners) l.remove().catch(() => {})
      NativeHost.stop().catch(() => {})
      onReady(null)
    },
  }
}
