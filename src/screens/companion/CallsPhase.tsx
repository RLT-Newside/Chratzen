import { Button, Card, SectionTitle } from '../../components/ui'
import type { Player } from '../../hooks/useCompanion'
import { type Call, letzterMustGo } from '../../lib/rules'

const OPTIONS: { value: Call; label: string; on: string }[] = [
  { value: 'weiter', label: 'Weiter', on: 'bg-white/15 text-white/80' },
  { value: 'kratzen', label: 'Kratzt', on: 'bg-brand text-black' },
  { value: 'mitgehen', label: 'Mit', on: 'bg-emerald-400 text-black' },
  { value: 'letzter', label: 'Letzter', on: 'bg-sky-400 text-black' },
]

export function CallsPhase({
  players,
  dealerIndex,
  calls,
  banner,
  error,
  onSetCall,
  onToggleBanner,
  onAllPassed,
  onConfirm,
}: {
  players: Player[]
  dealerIndex: number
  calls: Record<string, Call>
  banner: boolean
  error: string | null
  onSetCall: (id: string, call: Call) => void
  onToggleBanner: () => void
  onAllPassed: () => void
  onConfirm: () => void
}) {
  const list = players.map((p) => calls[p.id] ?? 'weiter')
  const everybodyOut = list.every((c) => c === 'weiter')
  const forcedIn = letzterMustGo(list)
  const letzte = players.filter((p) => calls[p.id] === 'letzter')

  return (
    <div className="animate-fade-in">
      <SectionTitle
        right={
          <button
            type="button"
            onClick={onToggleBanner}
            className={`press-scale text-[11px] px-3 py-1 rounded-full border ${
              banner
                ? 'bg-brand/20 border-brand/40 text-brand'
                : 'glass text-white/40 border-white/10'
            }`}
          >
            Bannerrunde
          </button>
        }
      >
        Ansagen
      </SectionTitle>

      {banner && (
        <Card className="mb-3 text-xs text-brand/90 leading-relaxed border-brand/20">
          Trumpf ist ein Banner (10): Der Geber muss kratzen, alle anderen müssen mitgehen.
        </Card>
      )}

      <div className="space-y-2">
        {players.map((p, i) => {
          const call = calls[p.id] ?? 'weiter'
          return (
            <div key={p.id} className="glass rounded-2xl p-3">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="font-medium text-sm truncate">{p.name}</span>
                {i === dealerIndex && (
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/10 text-white/45">
                    Geber
                  </span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    disabled={banner}
                    onClick={() => onSetCall(p.id, o.value)}
                    className={`press-scale py-2 rounded-lg text-xs font-medium disabled:opacity-50 ${
                      call === o.value ? o.on : 'bg-white/[0.04] text-white/45 hover:bg-white/[0.08]'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {letzte.length > 0 && (
        <Card className="mt-3 border-sky-400/20">
          <p className="text-xs text-white/60 leading-relaxed mb-3">
            {forcedIn
              ? 'Niemand sonst geht mit — der Letzte muss mitgehen.'
              : 'Es geht schon jemand mit — der Letzte darf jetzt frei entscheiden.'}
          </p>
          <div className="space-y-2">
            {letzte.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="flex-1 text-sm truncate">{p.name}</span>
                <Button size="sm" onClick={() => onSetCall(p.id, 'mitgehen')}>
                  Geht mit
                </Button>
                {!forcedIn && (
                  <Button size="sm" onClick={() => onSetCall(p.id, 'weiter')}>
                    Passt
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {error && !everybodyOut && (
        <p className="mt-3 text-xs text-red-300/90 text-center">{error}</p>
      )}

      {everybodyOut ? (
        <Button variant="primary" size="lg" className="mt-5 w-full" onClick={onAllPassed}>
          Niemand spielt — neuer Trumpf
        </Button>
      ) : (
        <Button
          variant="primary"
          size="lg"
          className="mt-5 w-full"
          disabled={!!error}
          onClick={onConfirm}
        >
          Weiter zu den Stichen
        </Button>
      )}
    </div>
  )
}
