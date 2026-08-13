import { Button, SectionTitle, Stepper } from '../../components/ui'
import type { Player } from '../../hooks/useCompanion'
import { TRICKS_PER_ROUND, type Call, isPlaying, requiredTricks } from '../../lib/rules'

export function TricksPhase({
  players,
  calls,
  tricks,
  error,
  onSetTricks,
  onBack,
  onConfirm,
}: {
  players: Player[]
  calls: Record<string, Call>
  tricks: Record<string, number>
  error: string | null
  onSetTricks: (id: string, n: number) => void
  onBack: () => void
  onConfirm: () => void
}) {
  const playing = players.filter((p) => isPlaying(calls[p.id] ?? 'weiter'))
  const total = playing.reduce((a, p) => a + (tricks[p.id] ?? 0), 0)

  return (
    <div className="animate-fade-in">
      <SectionTitle
        right={
          <span className={`text-xs tabular ${total === TRICKS_PER_ROUND ? 'text-brand' : 'text-white/40'}`}>
            {total}/{TRICKS_PER_ROUND} Stiche
          </span>
        }
      >
        Stiche eintragen
      </SectionTitle>

      <div className="space-y-2">
        {playing.map((p) => {
          const call = calls[p.id] as Call
          const got = tricks[p.id] ?? 0
          const need = requiredTricks(call)
          const failed = got < need
          return (
            <div key={p.id} className="glass rounded-2xl p-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">{p.name}</p>
                <p className={`text-[11px] mt-0.5 ${failed ? 'text-red-300/80' : 'text-emerald-300/80'}`}>
                  {call === 'kratzen' ? 'Kratzt' : 'Geht mit'} · braucht {need}
                  {failed ? ' · Bete' : ' ✓'}
                </p>
              </div>
              <Stepper value={got} onChange={(n) => onSetTricks(p.id, n)} max={TRICKS_PER_ROUND} />
            </div>
          )
        })}
      </div>

      {error && <p className="mt-3 text-xs text-red-300/90 text-center">{error}</p>}

      <div className="flex gap-2 mt-5">
        <Button size="lg" onClick={onBack} className="flex-1">
          Zurück
        </Button>
        <Button
          variant="primary"
          size="lg"
          className="flex-[2]"
          disabled={!!error}
          onClick={onConfirm}
        >
          Abrechnen
        </Button>
      </div>
    </div>
  )
}
