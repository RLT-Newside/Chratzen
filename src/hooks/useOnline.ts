import { useCallback, useEffect, useRef, useState } from 'react'
import { type Socket, io } from 'socket.io-client'
import type { ClientGame } from '../lib/game'
import type { Call } from '../lib/rules'

const SESSION_KEY = 'chratzen.session.v1'

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

  useEffect(() => {
    // Gleicher Origin — im Dev leitet der Vite-Proxy /socket.io an :3001 weiter.
    const socket = io({ transports: ['websocket', 'polling'] })
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

    return () => {
      socket.removeAllListeners()
      socket.disconnect()
    }
  }, [])

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
