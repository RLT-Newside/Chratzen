import { useCallback, useMemo } from 'react'
import { ANTE_OPTIONS, splitByWeight } from '../lib/money'
import {
  type Call,
  type Entry,
  demoteOtherKratzer,
  isPlaying,
  settleRound,
  validateTricks,
} from '../lib/rules'
import { usePersistedState } from './usePersistedState'

export type Player = { id: string; name: string; balance: number }

/** Im Companion-Modus nur die Rollen, die für die Kasse zählen. */
export type Role = Extract<Call, 'weiter' | 'kratzen' | 'mitgehen'>

export type LogRow = { name: string; role: Role; tricks: number; delta: number }
export type LogEntry = {
  round: number
  pot: number
  note?: string
  rows: LogRow[]
}

/**
 * Der Companion führt nur die Kasse — gespielt und angesagt wird am Tisch.
 * Deshalb kein Geber, kein Trumpf, keine Ansagerunde: pro Runde braucht es nur,
 * wer mitgespielt hat und wie viele Stiche er geholt hat.
 */
export type CompanionState = {
  ante: number
  players: Player[]
  pot: number
  round: number
  roles: Record<string, Role>
  tricks: Record<string, number>
  log: LogEntry[]
  /** Schnappschuss-Stack für "Rückgängig" (max. 10). */
  past: Omit<CompanionState, 'past'>[]
}

const STORAGE_KEY = 'chratzen.companion.v2'

export const emptyState: CompanionState = {
  ante: ANTE_OPTIONS[1],
  players: [],
  pot: 0,
  round: 1,
  roles: {},
  tricks: {},
  log: [],
  past: [],
}

const blankRoles = (players: Player[]): Record<string, Role> =>
  Object.fromEntries(players.map((p) => [p.id, 'weiter' as Role]))

const blankTricks = (players: Player[]): Record<string, number> =>
  Object.fromEntries(players.map((p) => [p.id, 0]))

/** Jeder legt den Grundeinsatz in den Pott. */
function collectAnte(s: CompanionState): CompanionState {
  return {
    ...s,
    pot: s.pot + s.ante * s.players.length,
    players: s.players.map((p) => ({ ...p, balance: p.balance - s.ante })),
  }
}

function snapshot(s: CompanionState): CompanionState {
  const { past: _drop, ...rest } = s
  return { ...s, past: [...s.past, rest].slice(-10) }
}

export function useCompanion() {
  const [state, setState] = usePersistedState<CompanionState>(STORAGE_KEY, emptyState)

  const entries: Entry[] = useMemo(
    () =>
      state.players.map((p) => ({
        playerId: p.id,
        call: state.roles[p.id] ?? 'weiter',
        tricks: state.tricks[p.id] ?? 0,
      })),
    [state.players, state.roles, state.tricks],
  )

  const settlement = useMemo(() => settleRound(state.pot, entries), [state.pot, entries])
  const trickError = useMemo(() => validateTricks(entries), [entries])
  const anybodyIn = useMemo(() => entries.some((e) => isPlaying(e.call)), [entries])

  /** Runde eröffnen: Pott aus den Strafen übernehmen, sonst neu einlegen. */
  const beginRound = useCallback(
    (s: CompanionState, pot: number, round: number): CompanionState => {
      const next: CompanionState = {
        ...s,
        pot,
        round,
        roles: blankRoles(s.players),
        tricks: blankTricks(s.players),
      }
      return pot === 0 ? collectAnte(next) : next
    },
    [],
  )

  /**
   * Spielerliste und Grundeinsatz setzen. Bestehende Kontostände bleiben, damit
   * man am Stammtisch jemanden nachtragen kann.
   */
  const configure = useCallback(
    (names: string[], ante: number) => {
      setState((s) => {
        const players: Player[] = names.map((name, i) => {
          const old = s.players[i]
          return {
            id: old?.id ?? `p${i}-${Math.random().toString(36).slice(2, 8)}`,
            name,
            balance: old?.balance ?? 0,
          }
        })
        const fresh: CompanionState = { ...s, ante, players, past: [] }
        // Läuft schon eine Runde? Dann nur die Liste anpassen, nicht neu einlegen.
        if (s.players.length > 0 && s.pot > 0) {
          return {
            ...fresh,
            roles: { ...blankRoles(players), ...s.roles },
            tricks: { ...blankTricks(players), ...s.tricks },
          }
        }
        return beginRound({ ...fresh, log: [] }, 0, 1)
      })
    },
    [setState, beginRound],
  )

  const setRole = useCallback(
    (id: string, role: Role) =>
      setState((s) => {
        // Es kratzt nur einer: ein neuer Kratzer verdrängt den bisherigen.
        const roles =
          role === 'kratzen'
            ? demoteOtherKratzer({ ...s.roles, [id]: role }, id)
            : { ...s.roles, [id]: role }

        // Wer raus ist, kann keine Stiche haben.
        const tricks = { ...s.tricks }
        for (const [pid, r] of Object.entries(roles)) if (r === 'weiter') tricks[pid] = 0

        return { ...s, roles, tricks }
      }),
    [setState],
  )

  const setTricks = useCallback(
    (id: string, n: number) =>
      setState((s) => ({ ...s, tricks: { ...s.tricks, [id]: Math.max(0, Math.min(4, n)) } })),
    [setState],
  )

  /** Niemand hat gespielt oder es wurde neu gemischt: alle legen nochmals ein. */
  const anteAgain = useCallback(
    () =>
      setState((s) => {
        const next = collectAnte(snapshot(s))
        return {
          ...next,
          roles: blankRoles(s.players),
          tricks: blankTricks(s.players),
          log: [...s.log, { round: s.round, pot: next.pot, note: 'Alle nochmals eingelegt', rows: [] }],
        }
      }),
    [setState],
  )

  /** Abrechnung buchen und die nächste Runde eröffnen. */
  const applySettlement = useCallback(
    () =>
      setState((s) => {
        const rows: LogRow[] = []
        const players = s.players.map((p) => {
          const role = s.roles[p.id] ?? 'weiter'
          const delta = (settlement.payouts[p.id] ?? 0) - (settlement.penalties[p.id] ?? 0)
          if (isPlaying(role)) rows.push({ name: p.name, role, tricks: s.tricks[p.id] ?? 0, delta })
          return { ...p, balance: p.balance + delta }
        })
        const booked: CompanionState = {
          ...snapshot(s),
          players,
          log: [...s.log, { round: s.round, pot: settlement.potBefore, rows }],
        }
        return beginRound(booked, settlement.potAfter, s.round + 1)
      }),
    [setState, settlement, beginRound],
  )

  /**
   * Feierabend: was im Pott liegt, kommt gleichmässig zurück. Erst danach geht
   * der Ausgleich untereinander auf null auf.
   */
  const dissolvePot = useCallback(
    () =>
      setState((s) => {
        if (s.pot === 0) return s
        const shares = splitByWeight(s.pot, s.players.map(() => 1))
        return {
          ...snapshot(s),
          pot: 0,
          players: s.players.map((p, i) => ({ ...p, balance: p.balance + shares[i] })),
          roles: blankRoles(s.players),
          tricks: blankTricks(s.players),
          log: [
            ...s.log,
            { round: s.round, pot: s.pot, note: 'Pott aufgelöst und zurückgegeben', rows: [] },
          ],
        }
      }),
    [setState],
  )

  /** Manuelle Korrektur eines Kontostands (verzählt, Bargeld ausgeglichen …). */
  const adjust = useCallback(
    (id: string, delta: number) =>
      setState((s) => ({
        ...snapshot(s),
        players: s.players.map((p) => (p.id === id ? { ...p, balance: p.balance + delta } : p)),
      })),
    [setState],
  )

  const undo = useCallback(
    () =>
      setState((s) => {
        const prev = s.past.at(-1)
        return prev ? { ...prev, past: s.past.slice(0, -1) } : s
      }),
    [setState],
  )

  const reset = useCallback(() => setState(emptyState), [setState])

  return {
    state,
    settlement,
    trickError,
    anybodyIn,
    canUndo: state.past.length > 0,
    configure,
    setRole,
    setTricks,
    anteAgain,
    applySettlement,
    dissolvePot,
    adjust,
    undo,
    reset,
  }
}
