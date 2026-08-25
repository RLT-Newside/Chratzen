import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientGame } from '../lib/game'
import type { ClientMsg, ServerMsg } from '../lib/protocol'
import type { Call } from '../lib/rules'
import { type Transport, createLocalTransport } from '../lib/transport'

/** Übungsrunde: Grundeinsatz 1.00 — echtes Geld ist hier ohnehin keines im Spiel. */
const PRACTICE_ANTE = 100
/** Zwei Bots, damit es einen Kratzer und einen Mitgeher geben kann. */
const BOTS = 2
/** Grosszügige Stichpause: Anfänger sollen sehen, welche Karte gestochen hat. */
const PRACTICE_PAUSE_MS = 1800

/**
 * Ein vollständiger Tisch gegen Bots, ganz ohne Netz und ohne Sitzung.
 * Es ist dieselbe Engine wie am echten Tisch — die Übungsrunde kann also nichts
 * erlauben, was später verboten wäre.
 */
export function usePractice(name: string) {
  const transportRef = useRef<Transport | null>(null)
  const [game, setGame] = useState<ClientGame | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Hochzählen startet den Tisch neu — der alte Transport wird abgeräumt. */
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    setGame(null)
    const transport = createLocalTransport({
      onOpen: () => {
        transport.send({ t: 'create', name, ante: PRACTICE_ANTE })
        for (let i = 0; i < BOTS; i++) transport.send({ t: 'addBot' })
        transport.send({ t: 'setPause', ms: PRACTICE_PAUSE_MS })
        transport.send({ t: 'start' })
      },
      onClose: () => {},
      onError: setError,
      onMessage: (msg: ServerMsg) => {
        if (msg.t === 'state') setGame(msg.game)
        else if (msg.t === 'error') setError(msg.message)
      },
    })
    transportRef.current = transport

    return () => {
      transportRef.current = null
      transport.close()
    }
  }, [name, attempt])

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 3500)
    return () => clearTimeout(t)
  }, [error])

  const send = useCallback((msg: ClientMsg) => transportRef.current?.send(msg), [])

  return {
    game,
    error,
    restart: () => setAttempt((n) => n + 1),
    call: (call: Call) => send({ t: 'call', call }),
    exchange: (cards: string[]) => send({ t: 'exchange', cards }),
    sleeper: (card: string) => send({ t: 'sleeper', card }),
    play: (card: string) => send({ t: 'play', card }),
    blind: (take: boolean) => send({ t: 'blind', take }),
    next: () => send({ t: 'next' }),
    kick: (playerId: string) => send({ t: 'kick', playerId }),
    setPause: (ms: number) => send({ t: 'setPause', ms }),
    setBalances: (show: boolean) => send({ t: 'setBalances', show }),
    force: () => send({ t: 'force' }),
  }
}
