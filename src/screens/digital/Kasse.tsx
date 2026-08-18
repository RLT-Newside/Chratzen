import { ArrowRight, EyeOff, PartyPopper, X } from 'lucide-react'
import { useMemo } from 'react'
import { Button, Card, SectionTitle } from '../../components/ui'
import type { ClientGame } from '../../lib/game'
import { formatChf, settleUp } from '../../lib/money'

/**
 * Wer steht wie, und wer schuldet wem was. Der eigene Stand ist immer da; die
 * Stände der anderen nur, wenn der Host sie freigegeben hat — dann liefert der
 * Server sie gar nicht erst mit.
 */
export function Kasse({ game, onClose }: { game: ClientGame; onClose: () => void }) {
  const you = game.players.find((p) => p.id === game.youId)
  const name = useMemo(() => new Map(game.players.map((p) => [p.id, p.name])), [game.players])

  // Der offene Pott wird gleichmässig zurückgerechnet, sonst ginge der
  // Ausgleich nicht auf null auf.
  const transfers = useMemo(
    () => (game.showBalances ? settleUp(game.players, game.pot) : []),
    [game.showBalances, game.players, game.pot],
  )

  const ranked = game.showBalances
    ? [...game.players].sort((a, b) => b.balance - a.balance)
    : []

  return (
    <div className="fixed inset-0 z-50 bg-black/70 animate-fade-in overflow-y-auto">
      <button type="button" aria-label="Schliessen" onClick={onClose} className="absolute inset-0" />

      <div className="relative max-w-lg mx-auto px-5 pt-10 pb-10 safe-bottom">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-heading text-4xl tracking-wide leading-none">KASSE</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Schliessen">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <Card className="text-center py-6">
          <p className="label-caption">Dein Stand</p>
          <p
            className={`font-heading text-6xl tabular leading-none mt-1 ${
              (you?.balance ?? 0) > 0
                ? 'text-emerald-400'
                : (you?.balance ?? 0) < 0
                  ? 'text-red-400'
                  : 'text-white/40'
            }`}
          >
            {(you?.balance ?? 0) > 0 ? '+' : ''}
            {formatChf(you?.balance ?? 0)}
          </p>
          {game.pot > 0 && (
            <p className="text-xs text-white/35 mt-3 leading-relaxed px-4">
              {formatChf(game.pot)} liegen noch im Pott. Für die Rechnung unten sind sie
              gleichmässig zurückgerechnet — so sähe es aus, wenn ihr jetzt aufhört.
            </p>
          )}
        </Card>

        {game.showBalances ? (
          <>
            <div className="mt-8">
              <SectionTitle>Plus / Minus</SectionTitle>
              <div className="space-y-2">
                {ranked.map((p, i) => (
                  <div key={p.id} className="glass rounded-2xl p-3.5 flex items-center gap-3">
                    <span className="w-6 font-heading text-xl text-white/20 tabular">{i + 1}</span>
                    <span className="flex-1 min-w-0 truncate text-sm font-medium">
                      {p.name}
                      {p.id === game.youId && <span className="text-brand"> · du</span>}
                    </span>
                    <span
                      className={`font-heading text-2xl tabular leading-none w-20 text-right ${
                        p.balance > 0
                          ? 'text-emerald-400'
                          : p.balance < 0
                            ? 'text-red-400'
                            : 'text-white/35'
                      }`}
                    >
                      {p.balance > 0 ? '+' : ''}
                      {formatChf(p.balance)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8">
              <SectionTitle>Ausgleich</SectionTitle>
              {transfers.length === 0 ? (
                <Card className="flex items-center gap-3 text-sm text-white/50">
                  <PartyPopper className="w-4 h-4 text-brand shrink-0" />
                  Alle bei null — niemand schuldet jemandem etwas.
                </Card>
              ) : (
                <div className="space-y-2">
                  {transfers.map((t) => {
                    const mine = t.from === game.youId || t.to === game.youId
                    return (
                      <div
                        key={`${t.from}-${t.to}`}
                        className={`rounded-2xl p-3.5 flex items-center gap-2 ${
                          mine ? 'glass-elevated border border-brand/25' : 'glass'
                        }`}
                      >
                        <span className="text-sm font-medium truncate">{name.get(t.from)}</span>
                        <ArrowRight className="w-4 h-4 text-white/25 shrink-0" />
                        <span className="text-sm font-medium truncate flex-1">
                          {name.get(t.to)}
                        </span>
                        <span className="font-heading text-2xl text-brand tabular leading-none">
                          {formatChf(t.amount)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <Card className="mt-8 flex gap-3">
            <EyeOff className="w-5 h-5 text-white/30 shrink-0 mt-0.5" />
            <p className="text-xs text-white/45 leading-relaxed">
              Die Stände der anderen sind verdeckt. Der Host kann sie im
              Verwalten-Bereich freigeben — dann steht hier auch, wer wem was schuldet.
            </p>
          </Card>
        )}
      </div>
    </div>
  )
}
