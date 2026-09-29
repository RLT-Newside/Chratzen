import { Capacitor } from '@capacitor/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientGame } from '../lib/game'
import type { ClientMsg } from '../lib/protocol'
import {
  type BluetoothInfo,
  type HostInfo,
  type Transport,
  NativeBluetooth,
  bluetoothError,
  createBluetoothTransport,
  createHostTransport,
  createWsTransport,
} from '../lib/transport'
import type { Call } from '../lib/rules'

const SESSION_KEY = 'chratzen.session.v1'
const SERVER_KEY = 'chratzen.server'

/** `bt`: Adresse des Host-Handys, falls der Platz per Bluetooth besetzt wurde. */
type Session = { code: string; token: string; bt?: string }

/** Gast an einem fremden Tisch (WebSocket oder Bluetooth), oder dieses Gerät ist selbst der Tisch. */
type Mode = { kind: 'guest'; url: string } | { kind: 'bluetooth'; address: string } | { kind: 'host' }

export const isNative = Capacitor.isNativePlatform()

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

/** Nach einem Neustart zurück an den Bluetooth-Tisch — eine Adresse zum Eintippen gibt es dort nicht. */
function initialMode(): Mode {
  const bt = readSession()?.bt
  return bt && isNative ? { kind: 'bluetooth', address: bt } : { kind: 'guest', url: getServerUrl() }
}

/**
 * Im Browser wird die App vom Server selbst ausgeliefert — gleicher Origin,
 * keine Adresse nötig. In der APK gibt es keinen Origin-Server, dort muss die
 * Adresse des hostenden Geräts stehen, z. B. `192.168.1.42:3001`.
 */
export function getServerUrl(): string {
  return localStorage.getItem(SERVER_KEY) ?? ''
}

export function setServerUrl(raw: string) {
  const value = raw.trim().replace(/\/+$/, '')
  if (!value) localStorage.removeItem(SERVER_KEY)
  else localStorage.setItem(SERVER_KEY, value)
}

export function useOnline() {
  const transportRef = useRef<Transport | null>(null)
  /** Nachricht, die abgeschickt wird, sobald die Verbindung offen ist. */
  const pending = useRef<ClientMsg | null>(null)

  const [mode, setMode] = useState<Mode>(initialMode)
  const [connected, setConnected] = useState(false)
  const [game, setGame] = useState<ClientGame | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hostInfo, setHostInfo] = useState<HostInfo | null>(null)
  /** Host: Tisch ist auch per Bluetooth offen. */
  const [bluetooth, setBluetooth] = useState<BluetoothInfo | null>(null)
  /** Bluetooth-Gast: erster Verbindungsaufbau läuft. */
  const [linking, setLinking] = useState(false)

  useEffect(() => {
    setLinking(mode.kind === 'bluetooth')
    const handlers = {
      onOpen: () => {
        setConnected(true)
        setLinking(false)
        const queued = pending.current
        pending.current = null
        if (queued) return transportRef.current?.send(queued)
        // Nach Verbindungsabbruch automatisch zurück in die laufende Partie.
        const session = readSession()
        if (session) transportRef.current?.send({ t: 'rejoin', code: session.code, token: session.token })
      },
      onClose: () => {
        setConnected(false)
        setLinking(false)
      },
      onError: (text: string) => setError(text),
      onMessage: (msg: import('../lib/protocol').ServerMsg) => {
        switch (msg.t) {
          case 'joined': {
            const bt = mode.kind === 'bluetooth' ? mode.address : undefined
            localStorage.setItem(SESSION_KEY, JSON.stringify({ code: msg.code, token: msg.token, bt }))
            setCode(msg.code)
            break
          }
          case 'state':
            setCode(msg.code)
            setGame(msg.game)
            break
          case 'error':
            setError(msg.message)
            break
          case 'kicked':
            localStorage.removeItem(SESSION_KEY)
            setGame(null)
            setCode(null)
            break
        }
      },
    }

    // Ohne Adresse und ohne Origin-Server (APK) gibt es nichts zu verbinden.
    if (mode.kind === 'guest' && isNative && !mode.url) {
      setConnected(false)
      return
    }

    const transport =
      mode.kind === 'host'
        ? createHostTransport(handlers, setHostInfo)
        : mode.kind === 'bluetooth'
          ? createBluetoothTransport(mode.address, handlers)
          : createWsTransport(mode.url, handlers)
    transportRef.current = transport

    return () => {
      transportRef.current = null
      setConnected(false)
      // Der Host-Transport schliesst auch den Bluetooth-Server.
      setBluetooth(null)
      transport.close()
    }
  }, [mode])

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 3500)
    return () => clearTimeout(t)
  }, [error])

  const connectedRef = useRef(false)
  useEffect(() => {
    connectedRef.current = connected
  }, [connected])

  /** Sofort senden, wenn offen — sonst beim Verbindungsaufbau nachholen. */
  const send = useCallback((msg: ClientMsg) => {
    if (transportRef.current && connectedRef.current) transportRef.current.send(msg)
    else pending.current = msg
  }, [])

  const leave = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    setGame(null)
    setCode(null)
    setHostInfo(null)
    // Modus neu setzen erzwingt einen frischen Transport ohne alte Sitzung.
    setMode({ kind: 'guest', url: getServerUrl() })
  }, [])

  return {
    connected,
    game,
    code,
    error,
    hostInfo,
    bluetooth,
    /** Adresse des Bluetooth-Hosts, zu dem gerade verbunden wird. */
    connectingTo: linking && mode.kind === 'bluetooth' ? mode.address : null,
    isNative,
    isHosting: mode.kind === 'host',
    server: mode.kind === 'guest' ? mode.url : '',

    changeServer: (url: string) => {
      setServerUrl(url)
      setMode({ kind: 'guest', url: getServerUrl() })
    },
    /** Tisch auf diesem Gerät öffnen — die anderen verbinden sich ins WLAN. */
    hostTable: (name: string, ante: number) => {
      localStorage.removeItem(SESSION_KEY)
      pending.current = { t: 'create', name, ante }
      setMode({ kind: 'host' })
    },
    /** Host: Tisch zusätzlich per Bluetooth anbieten — für Gäste mit App, ganz ohne Netz. */
    openBluetooth: () => {
      NativeBluetooth.host().then(setBluetooth, (e) => setError(bluetoothError(e)))
    },
    /** Gast: an den Tisch auf diesem Gerät — per Bluetooth gibt es dort nur einen, also kein Code. */
    joinBluetooth: (address: string, name: string) => {
      // Schon an diesem Tisch gesessen? Dann zurück an den alten Platz statt neu beitreten.
      pending.current = readSession()?.bt === address ? null : { t: 'join', code: '', name }
      setMode({ kind: 'bluetooth', address })
    },
    create: (name: string, ante: number) => send({ t: 'create', name, ante }),
    join: (roomCode: string, name: string) =>
      send({ t: 'join', code: roomCode.toUpperCase(), name }),
    leave,
    start: () => send({ t: 'start' }),
    blind: (take: boolean) => send({ t: 'blind', take }),
    call: (call: Call) => send({ t: 'call', call }),
    exchange: (cards: string[]) => send({ t: 'exchange', cards }),
    sleeper: (card: string) => send({ t: 'sleeper', card }),
    play: (card: string) => send({ t: 'play', card }),
    next: () => send({ t: 'next' }),
    kick: (playerId: string) => send({ t: 'kick', playerId }),
    addBot: () => send({ t: 'addBot' }),
    setPause: (ms: number) => send({ t: 'setPause', ms }),
    setBalances: (show: boolean) => send({ t: 'setBalances', show }),
    force: () => send({ t: 'force' }),
  }
}
