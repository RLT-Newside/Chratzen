/**
 * Nachrichtenformat zwischen Gast und Tischwirt.
 *
 * Bewusst reines JSON über einen nackten WebSocket statt socket.io: derselbe
 * Draht funktioniert dann sowohl beim Node-Server als auch beim Host-Handy,
 * das die Verbindungen über ein natives Plugin annimmt.
 */
import type { CardId } from './cards'
import type { ClientGame } from './game'
import type { Call } from './rules'

export type ClientMsg =
  | { t: 'create'; name: string; ante: number }
  | { t: 'join'; code: string; name: string }
  | { t: 'rejoin'; code: string; token: string }
  | { t: 'start' }
  | { t: 'call'; call: Call }
  | { t: 'exchange'; cards: CardId[] }
  | { t: 'sleeper'; card: CardId }
  | { t: 'play'; card: CardId }
  | { t: 'next' }
  | { t: 'kick'; playerId: string }
  | { t: 'force' }
  | { t: 'addBot' }

export type ServerMsg =
  | { t: 'joined'; code: string; token: string }
  | { t: 'state'; code: string; game: ClientGame }
  | { t: 'error'; message: string }
  | { t: 'kicked' }

/** Eine ausgehende Nachricht an genau eine Verbindung. */
export type Outgoing = { to: string; msg: ServerMsg }

export function encode(msg: ClientMsg | ServerMsg): string {
  return JSON.stringify(msg)
}

export function decode<T extends ClientMsg | ServerMsg>(raw: string): T | null {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed.t === 'string' ? (parsed as T) : null
  } catch {
    return null
  }
}
