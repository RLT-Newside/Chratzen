import { useCallback, useMemo } from 'react'
import { ANTE_OPTIONS } from '../lib/money'
import {
  type Call,
  type Entry,
  MAX_TRUMP_FLIPS,
  bannerCalls,
  isPlaying,
  settleRound,
  validateCalls,
  validateTricks,
} from '../lib/rules'
import { usePersistedState } from './usePersistedState'

export type Player = { id: string; name: string; balance: number }

/** calls → Ansagen, tricks → Stiche, settle → Abrechnung bestätigen. */
export type Phase = 'calls' | 'tricks' | 'settle'

export type LogRow = { name: string; call: Call; tricks: number; delta: number }
export type LogEntry = {
  round: number
  pot: number
  note?: string
  rows: LogRow[]
}

export type CompanionState = {
  ante: number
  players: Player[]
  dealerIndex: number
  pot: number
  round: number
  /** Wie oft in dieser Runde schon ein neuer Trumpf aufgedeckt wurde. */
  flips: number
  banner: boolean
  calls: Record<string, Call>
  tricks: Record<string, number>
  phase: Phase
  log: LogEntry[]
  /** Ein Schnappschuss-Stack für "Rückgängig" (max. 10). */
  past: Omit<CompanionState, 'past'>[]
}

const STORAGE_KEY = 'chratzen.companion.v1'

export const emptyState: CompanionState = {
  ante: ANTE_OPTIONS[1],
  players: [],
  dealerIndex: 0,
  pot: 0,
  round: 1,
  flips: 0,
  banner: false,
  calls: {},
  tricks: {},
  phase: 'calls',
  log: [],
  past: [],
}

function blankCalls(players: Player[]): Record<string, Call> {
  return Object.fromEntries(players.map((p) => [p.id, 'weiter' as Call]))
}

function blankTricks(players: Player[]): Record<string, number> {
  return Object.fromEntries(players.map((p) => [p.id, 0]))
}

/** Jeder zahlt den Grundeinsatz in den Pott. */
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
        call: state.calls[p.id] ?? 'weiter',
        tricks: state.tricks[p.id] ?? 0,
      })),
    [state.players, state.calls, state.tricks],
  )

  const settlement = useMemo(() => settleRound(state.pot, entries), [state.pot, entries])

  const callError = useMemo(
    () => validateCalls(entries.map((e) => e.call)),
    [entries],
  )
  const trickError = useMemo(() => validateTricks(entries), [entries])

  /** Runde starten: Pott aus Strafen übernehmen, sonst neu anten. */
  const beginRound = useCallback((s: CompanionState, pot: number, round: number): CompanionState => {
    const next: CompanionState = {
      ...s,
      pot,
      round,
      flips: 0,
      banner: false,
      calls: blankCalls(s.players),
      tricks: blankTricks(s.players),
      phase: 'calls',
    }
    return pot === 0 ? collectAnte(next) : next
  }, [])

  /**
   * Spielerliste + Grundeinsatz setzen. Bestehende Kontostände bleiben erhalten,
   * damit man am Stammtisch jemanden nachtragen kann.
   */
  const configure = useCallback(
    (names: string[], ante: number) => {
      setState((s) => {
        const players: Player[] = names.map((name, i) => {
          const old = s.players[i]
          return { id: old?.id ?? `p${i}-${name}-${Math.random().toString(36).slice(2, 7)}`, name, balance: old?.balance ?? 0 }
        })
        const fresh: CompanionState = { ...s, ante, players, past: [] }
        // Läuft schon eine Runde? Dann nur Roster aktualisieren, nicht neu anten.
        if (s.players.length > 0 && s.pot > 0) {
          return { ...fresh, calls: { ...blankCalls(players), ...s.calls }, tricks: { ...blankTricks(players), ...s.tricks } }
        }
        return beginRound({ ...fresh, dealerIndex: 0, log: [] }, 0, 1)
      })
    },
    [setState, beginRound],
  )

  const setCall = useCallback(
    (id: string, call: Call) => setState((s) => ({ ...s, calls: { ...s.calls, [id]: call } })),
    [setState],
  )

  const toggleBanner = useCallback(
    () =>
      setState((s) => {
        const on = !s.banner
        if (!on) return { ...s, banner: false, calls: blankCalls(s.players) }
        const forced = bannerCalls(s.players.length, s.dealerIndex)
        return {
          ...s,
          banner: true,
          calls: Object.fromEntries(s.players.map((p, i) => [p.id, forced[i]])),
        }
      }),
    [setState],
  )

  /** Alle sagen "Weiter": neuen Trumpf aufdecken — nach 3× neu mischen + neu anten. */
  const allPassed = useCallback(
    () =>
      setState((s) => {
        const flips = s.flips + 1
        const base = { ...snapshot(s), calls: blankCalls(s.players), banner: false }
        if (flips < MAX_TRUMP_FLIPS) return { ...base, flips }
        const reshuffled = collectAnte({ ...base, flips: 0 })
        return {
          ...reshuffled,
          log: [
            ...s.log,
            { round: s.round, pot: reshuffled.pot, note: '3× niemand gespielt — neu gemischt, alle nachgelegt', rows: [] },
          ],
        }
      }),
    [setState],
  )

  const confirmCalls = useCallback(() => setState((s) => ({ ...s, phase: 'tricks' })), [setState])
  const backToCalls = useCallback(() => setState((s) => ({ ...s, phase: 'calls' })), [setState])
  const backToTricks = useCallback(() => setState((s) => ({ ...s, phase: 'tricks' })), [setState])

  const setTricks = useCallback(
    (id: string, n: number) =>
      setState((s) => ({ ...s, tricks: { ...s.tricks, [id]: Math.max(0, Math.min(4, n)) } })),
    [setState],
  )

  const confirmTricks = useCallback(() => setState((s) => ({ ...s, phase: 'settle' })), [setState])

  /** Abrechnung buchen und die nächste Runde eröffnen. */
  const applySettlement = useCallback(
    () =>
      setState((s) => {
        const rows: LogRow[] = []
        const players = s.players.map((p) => {
          const call = s.calls[p.id] ?? 'weiter'
          const delta = (settlement.payouts[p.id] ?? 0) - (settlement.penalties[p.id] ?? 0)
          if (isPlaying(call)) rows.push({ name: p.name, call, tricks: s.tricks[p.id] ?? 0, delta })
          return { ...p, balance: p.balance + delta }
        })
        const booked: CompanionState = {
          ...snapshot(s),
          players,
          dealerIndex: (s.dealerIndex + 1) % s.players.length,
          log: [...s.log, { round: s.round, pot: settlement.potBefore, rows }],
        }
        return beginRound(booked, settlement.potAfter, s.round + 1)
      }),
    [setState, settlement, beginRound],
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
    entries,
    settlement,
    callError,
    trickError,
    canUndo: state.past.length > 0,
    configure,
    setCall,
    toggleBanner,
    allPassed,
    confirmCalls,
    backToCalls,
    backToTricks,
    setTricks,
    confirmTricks,
    applySettlement,
    adjust,
    undo,
    reset,
  }
}
