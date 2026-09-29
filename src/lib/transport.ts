/**
 * Wege zum Tischwirt:
 *
 * - Gast: nackter WebSocket zu einem Server oder zum Host-Handy — oder, ohne
 *   WLAN, Bluetooth zum Host-Handy (nur in der App).
 * - Host: der Tischwirt läuft direkt in dieser WebView. Native Plugins
 *   nehmen die Verbindungen der Gäste an, per WLAN und per Bluetooth, und
 *   reichen nur die Strings durch — die Spiellogik bleibt hier in TypeScript.
 */
import { type PluginListenerHandle, registerPlugin } from '@capacitor/core'
import { TableHost } from './host'
import { type ClientMsg, type Outgoing, type ServerMsg, decode, encode } from './protocol'

export const DEFAULT_HOST_PORT = 3001
/** Fester WS-Pfad — trennt den Upgrade sauber von den statischen Dateien. */
const WS_PATH = '/ws'
/** Taktgeber für Bot-Züge und Aufräumarbeiten. */
const BOT_TICK_MS = 800
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

export type BtDevice = { address: string; name: string; paired: boolean }
/** `visible`: taucht ein paar Minuten in der Suche der Gäste auf. */
export type BluetoothInfo = { name: string; visible: boolean }

type ChratzenBluetoothPlugin = {
  /** Host: Tisch zusätzlich per Bluetooth anbieten. Nochmals aufrufen macht wieder sichtbar. */
  host(): Promise<BluetoothInfo>
  /** Gekoppelte Geräte sofort, gefundene kommen als `device`, am Ende `scanEnd`. */
  scan(): Promise<{ devices: BtDevice[]; searching: boolean; locationOff: boolean }>
  connect(o: { address: string }): Promise<{ connId: string }>
  send(o: { connId: string; data: string }): Promise<void>
  disconnect(o: { connId: string }): Promise<void>
  stop(): Promise<void>
  addListener(
    event: 'message' | 'close',
    cb: (data: { connId: string; data?: string }) => void,
  ): Promise<PluginListenerHandle>
  addListener(event: 'device', cb: (device: BtDevice) => void): Promise<PluginListenerHandle>
  addListener(event: 'scanEnd', cb: () => void): Promise<PluginListenerHandle>
}

export const NativeBluetooth = registerPlugin<ChratzenBluetoothPlugin>('ChratzenBluetooth')

/** Das Plugin meldet Codes, die Texte stehen hier. */
const BLUETOOTH_ERRORS: Record<string, string> = {
  unavailable: 'Dieses Gerät hat kein Bluetooth.',
  denied: 'Ohne die Berechtigung «Geräte in der Nähe» geht Bluetooth nicht.',
  location: 'Bis Android 11 sucht das Handy nur mit Standort-Berechtigung nach Geräten.',
  off: 'Bluetooth ist ausgeschaltet.',
  listen: 'Bluetooth-Tisch konnte nicht geöffnet werden.',
  connect: 'Tisch nicht erreichbar. Ist der Host in der Nähe und hat Bluetooth geöffnet?',
}

export function bluetoothError(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code
  return BLUETOOTH_ERRORS[String(code)] ?? 'Bluetooth hat nicht geklappt.'
}

/** Bluetooth-Verbindungen tragen diese Vorsilbe — so weiss der Host, über welches Plugin die Antwort geht. */
const isBluetooth = (connId: string) => connId.startsWith('bt:')
/** Nach einem Abbruch so lange warten bis zum nächsten Versuch. */
const RETRY_MS = 3000

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
 * Gast per Bluetooth. Reisst die Verbindung ab — ausser Reichweite, Host-Handy
 * kurz weg —, wird still neu verbunden; `onOpen` schickt dann das Rejoin.
 * Klappt schon der erste Versuch nicht, bleibt es bei der Meldung: dann war es
 * wohl das falsche Gerät, und ein Dauerversuch würde die nächste Suche abwürgen.
 */
export function createBluetoothTransport(address: string, h: Handlers): Transport {
  let alive = true
  let connId: string | null = null
  let opened = false
  let retry: ReturnType<typeof setTimeout> | undefined

  const connect = async () => {
    try {
      const res = await NativeBluetooth.connect({ address })
      if (!alive) return NativeBluetooth.disconnect(res).catch(() => {})
      connId = res.connId
      opened = true
      h.onOpen()
    } catch (e) {
      if (!alive) return
      if (opened) {
        retry = setTimeout(connect, RETRY_MS)
        return
      }
      h.onError(bluetoothError(e))
      h.onClose()
    }
  }

  // Die Ereignisse gelten für alle Verbindungen des Plugins — nur die eigene zählt.
  const subs = [
    NativeBluetooth.addListener('message', (e) => {
      if (e.connId !== connId) return
      const msg = decode<ServerMsg>(String(e.data ?? ''))
      if (msg) h.onMessage(msg)
    }),
    NativeBluetooth.addListener('close', (e) => {
      if (e.connId !== connId) return
      connId = null
      h.onClose()
      if (alive) retry = setTimeout(connect, RETRY_MS)
    }),
  ]
  // Erst lauschen, dann verbinden — sonst ginge die erste Antwort verloren.
  Promise.all(subs).then(() => {
    if (alive) connect()
  })

  return {
    send: (msg) => {
      if (connId) NativeBluetooth.send({ connId, data: encode(msg) }).catch(() => {})
    },
    close: () => {
      alive = false
      clearTimeout(retry)
      for (const s of subs) s.then((l) => l.remove()).catch(() => {})
      if (connId) NativeBluetooth.disconnect({ connId }).catch(() => {})
      connId = null
    },
  }
}

/**
 * Host-Betrieb: Tischwirt in dieser WebView, Gäste kommen über die Plugins rein
 * — per WLAN sofort, per Bluetooth, sobald der Host es in der Lobby öffnet.
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
  /** Der eine Tisch auf diesem Gerät. */
  let code = ''

  const dispatch = (out: Outgoing[]) => {
    for (const { to, msg } of out) {
      if (to === SELF) {
        if (msg.t === 'joined') code = msg.code
        h.onMessage(msg)
      } else {
        const wire = isBluetooth(to) ? NativeBluetooth : NativeHost
        wire.send({ connId: to, data: encode(msg) }).catch(() => {})
      }
    }
  }

  const receive = ({ connId, data }: { connId: string; data?: string }) => {
    const msg = decode<ClientMsg>(String(data ?? ''))
    if (!msg) return
    // Per Bluetooth wählt der Gast ein Gerät statt eines Codes — hier steht nur
    // ein Tisch. Übers WLAN bleibt der Code Pflicht: dort kann jeder im Netz anklopfen.
    if (msg.t === 'join' && !msg.code && isBluetooth(connId)) msg.code = code
    dispatch(table.receive(connId, msg))
  }
  const drop = ({ connId }: { connId: string }) => dispatch(table.disconnect(connId))

  const boot = async () => {
    try {
      listeners.push(
        await NativeHost.addListener('message', receive),
        await NativeHost.addListener('close', drop),
        await NativeBluetooth.addListener('message', receive),
        await NativeBluetooth.addListener('close', drop),
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

  // Kurzer Takt: die Bots ziehen im Tickrhythmus, man kann ihnen zuschauen.
  const timer = setInterval(() => dispatch(table.tick()), BOT_TICK_MS)

  return {
    send: (msg) => dispatch(table.receive(SELF, msg)),
    close: () => {
      alive = false
      clearInterval(timer)
      for (const l of listeners) l.remove().catch(() => {})
      NativeHost.stop().catch(() => {})
      NativeBluetooth.stop().catch(() => {})
      onReady(null)
    },
  }
}

/**
 * Übungstisch: Der Tischwirt läuft in dieser WebView, es gibt aber keine Gäste
 * und kein Netz — die Mitspieler sind Bots. Dieselbe Engine wie am echten Tisch,
 * damit die Übungsrunde nichts erlaubt, was das Spiel später verbietet.
 */
export function createLocalTransport(h: Handlers): Transport {
  const table = new TableHost({ fixedCode: 'UEBG' })

  const dispatch = (out: Outgoing[]) => {
    // Alles, was nicht an uns geht, hat keinen Empfänger — Bots sitzen im Host.
    for (const { to, msg } of out) if (to === SELF) h.onMessage(msg)
  }

  // Erst nach der Rückgabe öffnen: der Aufrufer hält den Transport sonst noch
  // nicht und könnte die erste Nachricht nicht abschicken.
  const opened = setTimeout(() => h.onOpen(), 0)
  const timer = setInterval(() => dispatch(table.tick()), BOT_TICK_MS)

  return {
    send: (msg) => dispatch(table.receive(SELF, msg)),
    close: () => {
      clearTimeout(opened)
      clearInterval(timer)
      h.onClose()
    },
  }
}
