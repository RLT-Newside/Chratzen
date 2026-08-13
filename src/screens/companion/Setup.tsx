import { ArrowLeft, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, SectionTitle, Segmented } from '../../components/ui'
import { ANTE_OPTIONS, formatChf } from '../../lib/money'

const MIN_PLAYERS = 2
const MAX_PLAYERS = 8

export function Setup({
  initialNames,
  initialAnte,
  onStart,
  onBack,
}: {
  initialNames: string[]
  initialAnte: number
  onStart: (names: string[], ante: number) => void
  onBack: () => void
}) {
  const [names, setNames] = useState<string[]>(
    initialNames.length >= MIN_PLAYERS ? initialNames : ['', '', ''],
  )
  const [ante, setAnte] = useState(initialAnte)

  const filled = names.map((n) => n.trim()).filter(Boolean)
  const ready = filled.length >= MIN_PLAYERS && filled.length === names.length

  return (
    <div className="px-5 pt-6 pb-10 animate-fade-in">
      <div className="flex items-center gap-3 mb-7">
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="Zurück">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-heading text-4xl tracking-wide leading-none">COMPANION</h1>
      </div>

      <SectionTitle>Grundeinsatz</SectionTitle>
      <Segmented
        value={ante}
        onChange={setAnte}
        options={ANTE_OPTIONS.map((a) => ({ value: a as number, label: `${formatChf(a)}` }))}
      />
      <p className="text-xs text-white/35 mt-2">
        Jeder legt {formatChf(ante)} in den Pott, bevor ausgeteilt wird.
      </p>

      <div className="mt-8">
        <SectionTitle right={<span className="text-xs text-white/30">{names.length} Spieler</span>}>
          Spieler
        </SectionTitle>
        <div className="space-y-2">
          {names.map((name, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Zeilen sind rein positionsbasiert
            <div key={i} className="flex items-center gap-2">
              <span className="w-7 shrink-0 text-center font-heading text-xl text-white/25 tabular">
                {i + 1}
              </span>
              <input
                className="field"
                placeholder={`Name Spieler ${i + 1}`}
                value={name}
                autoComplete="off"
                onChange={(ev) =>
                  setNames((prev) => prev.map((n, j) => (j === i ? ev.target.value : n)))
                }
              />
              <button
                type="button"
                aria-label="Spieler entfernen"
                disabled={names.length <= MIN_PLAYERS}
                onClick={() => setNames((prev) => prev.filter((_, j) => j !== i))}
                className="press-scale shrink-0 w-9 h-9 rounded-lg glass grid place-items-center text-white/40 disabled:opacity-20"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <Button
          className="mt-3 w-full flex items-center justify-center gap-2"
          disabled={names.length >= MAX_PLAYERS}
          onClick={() => setNames((prev) => [...prev, ''])}
        >
          <Plus className="w-4 h-4" /> Spieler hinzufügen
        </Button>
      </div>

      <Card className="mt-8 text-xs text-white/45 leading-relaxed">
        Gespielt und angesagt wird am Tisch. Die App führt nur die Kasse: sie sammelt den
        Grundeinsatz ein, schüttet den Pott nach Stichen aus und zieht die Bete ein.
      </Card>

      <Button
        variant="primary"
        size="lg"
        className="mt-6 w-full"
        disabled={!ready}
        onClick={() => onStart(filled, ante)}
      >
        {ready ? 'Spiel starten' : 'Alle Namen ausfüllen'}
      </Button>
    </div>
  )
}
