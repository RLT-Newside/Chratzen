import { ArrowLeft, RotateCcw, Undo2, Users } from 'lucide-react'
import { useState } from 'react'
import { Button, ConfirmDialog } from '../../components/ui'
import { useCompanion } from '../../hooks/useCompanion'
import { PotHeader } from './PotHeader'
import { RoundPhase } from './RoundPhase'
import { Setup } from './Setup'
import { Standings } from './Standings'

export function CompanionMode({ onExit }: { onExit: () => void }) {
  const c = useCompanion()
  const { state } = c
  const [tab, setTab] = useState<'round' | 'kasse'>('round')
  const [editRoster, setEditRoster] = useState(false)
  const [askReset, setAskReset] = useState(false)

  if (state.players.length === 0 || editRoster) {
    return (
      <Setup
        initialNames={state.players.map((p) => p.name)}
        initialAnte={state.ante}
        onBack={() => (editRoster ? setEditRoster(false) : onExit())}
        onStart={(names, ante) => {
          c.configure(names, ante)
          setEditRoster(false)
        }}
      />
    )
  }

  return (
    <div className="px-5 pt-4 pb-28 animate-fade-in">
      <div className="flex items-center justify-between mb-1">
        <Button variant="ghost" size="sm" onClick={onExit} aria-label="Hauptmenü">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={!c.canUndo}
            onClick={c.undo}
            aria-label="Letzte Buchung rückgängig"
          >
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditRoster(true)}
            aria-label="Spieler bearbeiten"
          >
            <Users className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" aria-label="Neue Kasse" onClick={() => setAskReset(true)}>
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <PotHeader pot={state.pot} ante={state.ante} round={state.round} />

      {tab === 'round' ? (
        <RoundPhase
          players={state.players}
          roles={state.roles}
          tricks={state.tricks}
          settlement={c.settlement}
          trickError={c.trickError}
          anybodyIn={c.anybodyIn}
          onSetRole={c.setRole}
          onSetTricks={c.setTricks}
          onAnteAgain={c.anteAgain}
          onSettle={c.applySettlement}
        />
      ) : (
        <Standings
          players={state.players}
          ante={state.ante}
          pot={state.pot}
          log={state.log}
          onAdjust={c.adjust}
          onDissolvePot={c.dissolvePot}
        />
      )}

      <nav className="fixed bottom-0 inset-x-0 max-w-lg mx-auto safe-bottom px-5 pt-3 bg-gradient-to-t from-[#0b0e0c] via-[#0b0e0c]/95 to-transparent">
        <div className="glass-elevated rounded-2xl p-1 flex gap-1">
          {(
            [
              ['round', 'Runde'],
              ['kasse', 'Kasse'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`press-scale flex-1 py-2.5 rounded-xl text-sm font-medium ${
                tab === key ? 'bg-brand text-black' : 'text-white/50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      {askReset && (
        <ConfirmDialog
          title="Neue Kasse?"
          confirmLabel="Alles löschen"
          danger
          body="Kontostände, Pott und Verlauf werden gelöscht. Das lässt sich nicht rückgängig machen."
          onCancel={() => setAskReset(false)}
          onConfirm={() => {
            c.reset()
            setAskReset(false)
          }}
        />
      )}
    </div>
  )
}
