import { Capacitor } from '@capacitor/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientGame } from '../lib/game'
import type { ClientMsg } from '../lib/protocol'
import {
  type HostInfo,
  type Transport,
  createHostTransport,
  createWsTransport,
} from '../lib/transport'
import type { Call } from '../lib/rules'

const SESSION_KEY = 'chratzen.session.v1'
const SERVER_KEY = 'chratzen.server'

type Session = { code: string; token: string }

/** Gast an einem fremden Tisch, oder dieses Gerät ist selbst der Tisch. */
type Mode = { kind: 'guest'; url: string } | { kind: 'host' }

export const isNative = Capacitor.isNativePlatform()

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
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

  const [mode, setMode] = useState<Mode>(() => ({ kind: 'guest', url: getServerUrl() }))
  const [connected, setConnected] = useState(false)
  const [game, setGame] = useState<ClientGame | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hostInfo, setHostInfo] = useState<HostInfo | null>(null)

  useEffect(() => {
    const handlers = {
      onOpen: () => {
        setConnected(true)
        const queued = pending.current
        pending.current = null
        if (queued) return transportRef.current?.send(queued)
        // Nach Verbindungsabbruch automatisch zurück in die laufende Partie.
        const session = readSession()
        if (session) transportRef.current?.send({ t: 'rejoin', ...session })
      },
      onClose: () => setConnected(false),
      onError: (text: string) => setError(text),
      onMessage: (msg: import('../lib/protocol').ServerMsg) => {
        switch (msg.t) {
          case 'joined':
            localStorage.setItem(SESSION_KEY, JSON.stringify({ code: msg.code, token: msg.token }))
            setCode(msg.code)
            break
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
        : createWsTransport(mode.url, handlers)
    transportRef.current = transport

    return () => {
      transportRef.current = null
      setConnected(false)
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
    force: () => send({ t: 'force' }),
  }
}
