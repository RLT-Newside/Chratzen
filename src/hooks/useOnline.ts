import { Capacitor } from '@capacitor/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type Socket, io } from 'socket.io-client'
import type { ClientGame } from '../lib/game'
import type { Call } from '../lib/rules'

const SESSION_KEY = 'chratzen.session.v1'
const SERVER_KEY = 'chratzen.server'

/**
 * Im Browser wird die App vom Socket-Server selbst ausgeliefert — gleicher
 * Origin, keine URL nötig. In der APK gibt es keinen Origin-Server, dort muss
 * die Adresse gesetzt werden (z. B. `192.168.1.42:3001` für das Gerät im WLAN,
 * das den Tisch hostet).
 */
export function getServerUrl(): string {
  return localStorage.getItem(SERVER_KEY) ?? ''
}

export function setServerUrl(raw: string) {
  const value = raw.trim().replace(/\/+$/, '')
  if (!value) return localStorage.removeItem(SERVER_KEY)
  localStorage.setItem(SERVER_KEY, /^https?:\/\//.test(value) ? value : `http://${value}`)
}

/** In der App gibt es keinen Origin-Server — dort ist die Adresse Pflicht. */
export const isNative = Capacitor.isNativePlatform()

type Session = { code: string; token: string }
type Ack = { ok: boolean; code?: string; token?: string; error?: string }

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function useOnline() {
  const socketRef = useRef<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [game, setGame] = useState<ClientGame | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [server, setServer] = useState(getServerUrl)

  useEffect(() => {
    // Ohne Adresse: gleicher Origin — im Dev leitet der Vite-Proxy /socket.io an :3001.
    if (isNative && !server) return
    const socket = server
      ? io(server, { transports: ['websocket', 'polling'] })
      : io({ transports: ['websocket', 'polling'] })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      // Nach Verbindungsabbruch automatisch zurück in die laufende Partie.
      const session = readSession()
      if (session) {
        socket.emit('room:rejoin', session, (ack: Ack) => {
          if (ack?.ok) setCode(session.code)
          else localStorage.removeItem(SESSION_KEY)
        })
      }
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on('state', ({ code: c, game: g }: { code: string; game: ClientGame }) => {
      setCode(c)
      setGame(g)
    })
    socket.on('error:msg', (msg: string) => setError(msg))
    socket.on('kicked', () => {
      localStorage.removeItem(SESSION_KEY)
      setGame(null)
      setCode(null)
    })

    socket.on('connect_error', () =>
      setError(server ? `Kein Server unter ${server}` : 'Kein Server erreichbar.'),
    )

    return () => {
      socket.removeAllListeners()
      socket.disconnect()
    }
  }, [server])

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 3500)
    return () => clearTimeout(t)
  }, [error])

  const enter = useCallback((event: 'room:create' | 'room:join', payload: object) => {
    return new Promise<string | null>((resolve) => {
      socketRef.current?.emit(event, payload, (ack: Ack) => {
        if (!ack?.ok) {
          setError(ack?.error ?? 'Fehlgeschlagen.')
          return resolve(ack?.error ?? 'Fehlgeschlagen.')
        }
        localStorage.setItem(SESSION_KEY, JSON.stringify({ code: ack.code, token: ack.token }))
        setCode(ack.code ?? null)
        resolve(null)
      })
    })
  }, [])

  const send = useCallback(
    (event: string, payload?: object) => socketRef.current?.emit(event, payload ?? {}),
    [],
  )

  const leave = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    setGame(null)
    setCode(null)
    socketRef.current?.disconnect()
    socketRef.current?.connect()
  }, [])

  return {
    connected,
    game,
    code,
    error,
    server,
    isNative,
    /** Serveradresse wechseln — baut die Verbindung neu auf. */
    changeServer: (url: string) => {
      setServerUrl(url)
      setServer(getServerUrl())
    },
    create: (name: string, ante: number) => enter('room:create', { name, ante }),
    join: (roomCode: string, name: string) =>
      enter('room:join', { code: roomCode.toUpperCase(), name }),
    leave,
    start: () => send('game:start'),
    call: (call: Call) => send('game:call', { call }),
    exchange: (cards: string[]) => send('game:exchange', { cards }),
    sleeper: (card: string) => send('game:sleeper', { card }),
    play: (card: string) => send('game:play', { card }),
    next: () => send('game:next'),
    kick: (playerId: string) => send('game:kick', { playerId }),
    force: () => send('game:force'),
  }
}
