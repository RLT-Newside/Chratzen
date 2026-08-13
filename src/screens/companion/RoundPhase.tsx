import { useState } from 'react'
import { Button, Card, ConfirmDialog, SectionTitle, Stepper } from '../../components/ui'
import type { Player, Role } from '../../hooks/useCompanion'
import { formatChf } from '../../lib/money'
import { TRICKS_PER_ROUND, type Settlement, isPlaying, requiredTricks } from '../../lib/rules'

const ROLES: { value: Role; label: string; on: string }[] = [
  { value: 'weiter', label: 'Raus', on: 'bg-white/15 text-white/80' },
  { value: 'kratzen', label: 'Kratzt', on: 'bg-brand text-black' },
  { value: 'mitgehen', label: 'Mit', on: 'bg-emerald-400 text-black' },
]

/**
 * Ein Bildschirm für die ganze Runde: wer war dabei, wie viele Stiche.
 * Angesagt und gespielt wird am Tisch — die App rechnet nur.
 */
export function RoundPhase({
  players,
  roles,
  tricks,
  settlement,
  roundError,
  anybodyIn,
  onSetRole,
  onSetTricks,
  onAnteAgain,
  onSettle,
}: {
  players: Player[]
  roles: Record<string, Role>
  tricks: Record<string, number>
  settlement: Settlement
  roundError: string | null
  anybodyIn: boolean
  onSetRole: (id: string, role: Role) => void
  onSetTricks: (id: string, n: number) => void
  onAnteAgain: () => void
  onSettle: () => void
}) {
  const total = players.reduce((a, p) => a + (tricks[p.id] ?? 0), 0)
  const kratzer = players.find((p) => roles[p.id] === 'kratzen') ?? null

  /** Wechsel des Kratzers erst nach Rückfrage — sonst verschiebt sich still Geld. */
  const [askSwap, setAskSwap] = useState<Player | null>(null)

  const chooseRole = (p: Player, role: Role) => {
    if (role === 'kratzen' && kratzer && kratzer.id !== p.id) return setAskSwap(p)
    onSetRole(p.id, role)
  }

  return (
    <div className="animate-fade-in">
      <SectionTitle
        right={
          <span className={`text-xs tabular ${total === TRICKS_PER_ROUND ? 'text-brand' : 'text-white/40'}`}>
            {total}/{TRICKS_PER_ROUND} Stiche
          </span>
        }
      >
        Runde eintragen
      </SectionTitle>

      <div className="space-y-2">
        {players.map((p) => {
          const role = roles[p.id] ?? 'weiter'
          const playing = isPlaying(role)
          const got = tricks[p.id] ?? 0
          const need = requiredTricks(role)
          const delta = (settlement.payouts[p.id] ?? 0) - (settlement.penalties[p.id] ?? 0)

          return (
            <div key={p.id} className="glass rounded-2xl p-3">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="font-medium text-sm truncate flex-1">{p.name}</span>
                {playing && (
                  <span
                    className={`font-heading text-xl tabular leading-none ${
                      delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-white/30'
                    }`}
                  >
                    {delta > 0 ? '+' : ''}
                    {formatChf(delta)}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="grid grid-cols-3 gap-1.5 flex-1">
                  {ROLES.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => chooseRole(p, r.value)}
                      className={`press-scale py-2 rounded-lg text-xs font-medium ${
                        role === r.value ? r.on : 'bg-white/[0.04] text-white/45 hover:bg-white/[0.08]'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                {playing && (
                  <Stepper
                    value={got}
                    onChange={(n) => onSetTricks(p.id, n)}
                    max={TRICKS_PER_ROUND}
                  />
                )}
              </div>

              {playing && (
                <p
                  className={`text-[11px] mt-2 ${got < need ? 'text-red-300/80' : 'text-emerald-300/70'}`}
                >
                  braucht {need} ·{' '}
                  {got < need
                    ? 'Bete, zahlt den Pott nach'
                    : role === 'kratzen'
                      ? 'geschafft, doppelter Anteil'
                      : 'geschafft, einfacher Anteil'}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {anybodyIn ? (
        <>
          <Card className="mt-4 flex items-center justify-between">
            <span className="label-caption">Neuer Pott</span>
            <span className="font-heading text-3xl text-brand tabular leading-none">
              {formatChf(settlement.potAfter)}
            </span>
          </Card>
          <p className="text-xs text-white/35 mt-2 text-center leading-relaxed">
            {settlement.potAfter > 0
              ? 'Kommt aus den Strafen — nächste Runde ohne neuen Grundeinsatz.'
              : 'Pott ist leer — nächste Runde legen alle wieder ein.'}
          </p>

          {roundError && <p className="mt-3 text-xs text-red-300/90 text-center">{roundError}</p>}

          <Button
            variant="primary"
            size="lg"
            className="mt-4 w-full"
            disabled={!!roundError}
            onClick={onSettle}
          >
            Buchen &amp; nächste Runde
          </Button>
        </>
      ) : (
        <>
          <p className="text-xs text-white/35 mt-4 text-center leading-relaxed">
            Niemand eingetragen. Hat keiner gespielt und ihr habt neu gemischt, legen alle
            nochmals ein.
          </p>
          <Button size="lg" className="mt-3 w-full" onClick={onAnteAgain}>
            Alle legen nochmals ein
          </Button>
        </>
      )}

      {askSwap && kratzer && (
        <ConfirmDialog
          title="Kratzer wechseln?"
          confirmLabel={`${askSwap.name} kratzt`}
          body={
            <>
              Es kratzt nur einer pro Runde. Aktuell steht{' '}
              <span className="text-brand">{kratzer.name}</span> als Kratzer.
              <br />
              <span className="text-white/85">{askSwap.name}</span> übernimmt, und{' '}
              {kratzer.name} fällt auf <span className="text-white/85">raus</span> zurück —
              inklusive seiner Stiche.
            </>
          }
          onCancel={() => setAskSwap(null)}
          onConfirm={() => {
            onSetRole(askSwap.id, 'kratzen')
            setAskSwap(null)
          }}
        />
      )}
    </div>
  )
}
