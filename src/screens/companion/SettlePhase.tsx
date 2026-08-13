import { Button, Card, SectionTitle } from '../../components/ui'
import type { Player } from '../../hooks/useCompanion'
import { formatChf } from '../../lib/money'
import type { Call, Settlement } from '../../lib/rules'
import { isPlaying } from '../../lib/rules'

export function SettlePhase({
  players,
  calls,
  tricks,
  settlement,
  onBack,
  onConfirm,
}: {
  players: Player[]
  calls: Record<string, Call>
  tricks: Record<string, number>
  settlement: Settlement
  onBack: () => void
  onConfirm: () => void
}) {
  const rows = players
    .filter((p) => isPlaying(calls[p.id] ?? 'weiter'))
    .map((p) => ({
      player: p,
      call: calls[p.id] as Call,
      tricks: tricks[p.id] ?? 0,
      payout: settlement.payouts[p.id] ?? 0,
      penalty: settlement.penalties[p.id] ?? 0,
    }))

  return (
    <div className="animate-fade-in">
      <SectionTitle right={<span className="text-xs text-white/40">Pott {formatChf(settlement.potBefore)}</span>}>
        Abrechnung
      </SectionTitle>

      <div className="space-y-2">
        {rows.map((r) => {
          const delta = r.payout - r.penalty
          return (
            <div key={r.player.id} className="glass rounded-2xl p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{r.player.name}</p>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    {r.call === 'kratzen' ? 'Kratzer' : 'Mitgeher'} · {r.tricks}{' '}
                    {r.tricks === 1 ? 'Stich' : 'Stiche'}
                  </p>
                </div>
                <span
                  className={`font-heading text-3xl tabular leading-none ${
                    delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-white/40'
                  }`}
                >
                  {delta > 0 ? '+' : ''}
                  {formatChf(delta)}
                </span>
              </div>
              {(r.payout > 0 || r.penalty > 0) && (
                <div className="flex gap-3 mt-2 text-[11px] text-white/35">
                  {r.payout > 0 && <span>Anteil +{formatChf(r.payout)}</span>}
                  {r.penalty > 0 && (
                    <span className="text-red-300/70">Bete −{formatChf(r.penalty)}</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Card className="mt-3 flex items-center justify-between">
        <span className="label-caption">Neuer Pott</span>
        <span className="font-heading text-3xl text-brand tabular leading-none">
          {formatChf(settlement.potAfter)}
        </span>
      </Card>
      <p className="text-xs text-white/35 mt-2 text-center leading-relaxed">
        {settlement.potAfter > 0
          ? 'Kommt aus den Strafen — nächste Runde ohne neuen Grundeinsatz.'
          : 'Pott ist leer — nächste Runde legen alle wieder den Grundeinsatz.'}
      </p>

      <div className="flex gap-2 mt-5">
        <Button size="lg" onClick={onBack} className="flex-1">
          Zurück
        </Button>
        <Button variant="primary" size="lg" className="flex-[2]" onClick={onConfirm}>
          Buchen &amp; nächste Runde
        </Button>
      </div>
    </div>
  )
}
