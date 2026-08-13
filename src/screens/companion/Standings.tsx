import { useState } from 'react'
import { Card, SectionTitle } from '../../components/ui'
import type { LogEntry, Player } from '../../hooks/useCompanion'
import { formatChf } from '../../lib/money'

export function Standings({
  players,
  ante,
  log,
  onAdjust,
}: {
  players: Player[]
  ante: number
  log: LogEntry[]
  onAdjust: (id: string, delta: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const ranked = [...players].sort((a, b) => b.balance - a.balance)

  return (
    <div className="animate-fade-in">
      <SectionTitle
        right={
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="press-scale text-[11px] text-white/40 hover:text-white/70"
          >
            {editing ? 'Fertig' : 'Korrigieren'}
          </button>
        }
      >
        Kasse
      </SectionTitle>

      <div className="space-y-2">
        {ranked.map((p, i) => (
          <div key={p.id} className="glass rounded-2xl p-3.5 flex items-center gap-3">
            <span className="w-6 font-heading text-xl text-white/20 tabular">{i + 1}</span>
            <span className="flex-1 min-w-0 truncate text-sm font-medium">{p.name}</span>
            {editing && (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => onAdjust(p.id, -ante)}
                  className="press-scale w-8 h-8 rounded-lg glass text-white/60 text-sm"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => onAdjust(p.id, ante)}
                  className="press-scale w-8 h-8 rounded-lg glass text-white/60 text-sm"
                >
                  +
                </button>
              </div>
            )}
            <span
              className={`font-heading text-2xl tabular leading-none w-20 text-right ${
                p.balance > 0 ? 'text-emerald-400' : p.balance < 0 ? 'text-red-400' : 'text-white/35'
              }`}
            >
              {p.balance > 0 ? '+' : ''}
              {formatChf(p.balance)}
            </span>
          </div>
        ))}
      </div>

      {editing && (
        <p className="text-[11px] text-white/30 mt-2 leading-relaxed">
          Korrektur in Schritten von {formatChf(ante)} — für Bargeld-Ausgleich oder Verzähler.
        </p>
      )}

      <div className="mt-8">
        <SectionTitle>Verlauf</SectionTitle>
        {log.length === 0 ? (
          <Card className="text-xs text-white/35">Noch keine Runde abgerechnet.</Card>
        ) : (
          <div className="space-y-2">
            {[...log].reverse().map((entry, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Log ist append-only
              <Card key={`${entry.round}-${i}`} className="p-3">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="label-caption">Runde {entry.round}</span>
                  <span className="text-[11px] text-white/35 tabular">
                    Pott {formatChf(entry.pot)}
                  </span>
                </div>
                {entry.note ? (
                  <p className="text-xs text-amber-300/70">{entry.note}</p>
                ) : (
                  <div className="space-y-1">
                    {entry.rows.map((r) => (
                      <div key={r.name} className="flex items-center justify-between text-xs">
                        <span className="text-white/60 truncate">
                          {r.name}
                          <span className="text-white/25">
                            {' '}
                            · {r.call === 'kratzen' ? 'Kratzer' : 'Mit'} · {r.tricks}
                          </span>
                        </span>
                        <span
                          className={`tabular ${r.delta >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}
                        >
                          {r.delta > 0 ? '+' : ''}
                          {formatChf(r.delta)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
