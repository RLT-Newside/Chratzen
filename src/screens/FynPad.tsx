import { ArrowLeft, HelpCircle, Plus, RotateCcw, Trophy, Undo2, X } from 'lucide-react'
import { useState } from 'react'
import { FynRules } from '../components/FynRules'
import { Button, Card, ConfirmDialog, SectionTitle, Stepper } from '../components/ui'
import { usePersistedState } from '../hooks/usePersistedState'
import { FYN_MAX_PLAYERS, fynScore } from '../lib/fyn'
import {
  type PadRound,
  type PadState,
  bidOrder,
  checkBids,
  checkTricks,
  emptyPad,
  padCards,
  padDealer,
  padOver,
  padRound,
  padTotals,
} from '../lib/fynPad'

const signed = (n: number) => (n > 0 ? `+${n}` : String(n))
const tone = (n: number) => (n > 0 ? 'text-emerald-400' : n < 0 ? 'text-red-400' : 'text-white/40')

/**
 * Block für FYN mit echten Karten: pro Runde Ansagen, dann Stiche eintippen.
 * Die laufende Eingabe lebt nur im Speicher — fertige Runden sind gespeichert.
 */
export function FynPad({ onExit }: { onExit: () => void }) {
  const [pad, setPad] = usePersistedState<PadState>('jcards.fynpad.v1', emptyPad)
  const [help, setHelp] = useState(false)
  const [askReset, setAskReset] = useState(false)
  /** Per Rückgängig wieder geöffnete Runde — ihre Zahlen kommen zurück in die Eingabe. */
  const [reopened, setReopened] = useState<PadRound | null>(null)

  const undo = () => {
    setReopened(pad.rounds[pad.rounds.length - 1])
    setPad({ ...pad, rounds: pad.rounds.slice(0, -1) })
  }

  if (pad.names.length === 0) {
    return <PadSetup onBack={onExit} onStart={(names) => setPad({ names, rounds: [] })} />
  }

  return (
    <div className="px-5 pt-4 pb-10 animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <Button variant="ghost" size="sm" onClick={onExit} aria-label="Hauptmenü">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => setHelp(true)} aria-label="Regeln">
            <HelpCircle className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" aria-label="Neue Partie" onClick={() => setAskReset(true)}>
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {padOver(pad) ? (
        <Final
          pad={pad}
          onAgain={() => setPad({ ...pad, rounds: [] })}
          onUndo={undo}
        />
      ) : (
        // Neue Runde, neue Eingabe: der key setzt den Entwurf zurück.
        <RoundEntry
          key={pad.rounds.length}
          pad={pad}
          initial={reopened}
          onDone={(bids, tricks) => {
            setReopened(null)
            setPad({ ...pad, rounds: [...pad.rounds, { bids, tricks }] })
          }}
          onUndo={pad.rounds.length > 0 ? undo : undefined}
        />
      )}

      <History pad={pad} />

      {help && <FynRules onClose={() => setHelp(false)} />}
      {askReset && (
        <ConfirmDialog
          title="Neue Partie?"
          confirmLabel="Alles löschen"
          danger
          body="Alle Runden und Punkte werden gelöscht, die Spieler auch."
          onCancel={() => setAskReset(false)}
          onConfirm={() => {
            setPad(emptyPad)
            setAskReset(false)
          }}
        />
      )}
    </div>
  )
}

function RoundEntry({
  pad,
  initial,
  onDone,
  onUndo,
}: {
  pad: PadState
  initial: PadRound | null
  onDone: (bids: number[], tricks: number[]) => void
  onUndo?: () => void
}) {
  const n = padCards(pad)
  const dealer = padDealer(pad)
  const zeros = () => pad.names.map(() => 0)
  const [bids, setBids] = useState<number[]>(() => initial?.bids ?? zeros())
  const [tricks, setTricks] = useState<number[]>(() => initial?.tricks ?? zeros())
  const [step, setStep] = useState<'bids' | 'tricks'>(initial ? 'tricks' : 'bids')

  const error = step === 'bids' ? checkBids(pad, bids) : checkTricks(pad, tricks)
  const set = (list: number[], i: number, v: number) => list.map((x, j) => (j === i ? v : x))

  return (
    <>
      <Card className="text-center py-5">
        <p className="label-caption">
          Runde {padRound(pad)}/11 · {pad.names[dealer]} gibt
        </p>
        <p className="font-heading text-6xl text-brand leading-none mt-1 pot-glow">
          {n} {n === 1 ? 'KARTE' : 'KARTEN'}
        </p>
        {n === 1 && <p className="text-xs text-white/45 mt-2">Stirnrunde — Karte an die Stirn.</p>}
      </Card>

      <div className="mt-6">
        <SectionTitle
          right={
            onUndo && step === 'bids' ? (
              <button
                type="button"
                onClick={onUndo}
                className="press-scale text-[11px] text-white/40 hover:text-white/70 flex items-center gap-1"
              >
                <Undo2 className="w-3 h-3" /> Letzte Runde
              </button>
            ) : undefined
          }
        >
          {step === 'bids' ? 'Ansagen' : 'Gemachte Stiche'}
        </SectionTitle>
        <div className="space-y-2">
          {bidOrder(pad).map((i) => (
            <div key={pad.names[i]} className="glass rounded-2xl p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{pad.names[i]}</p>
                <p className="text-[11px] text-white/35">
                  {step === 'bids' ? (
                    i === dealer ? 'Geber · sagt zuletzt' : ' '
                  ) : (
                    <>
                      {bids[i]} angesagt ·{' '}
                      <span className={tone(fynScore(bids[i], tricks[i]))}>
                        {signed(fynScore(bids[i], tricks[i]))}
                      </span>
                    </>
                  )}
                </p>
              </div>
              {step === 'bids' ? (
                <Stepper value={bids[i]} max={n} onChange={(v) => setBids(set(bids, i, v))} />
              ) : (
                <Stepper value={tricks[i]} max={n} onChange={(v) => setTricks(set(tricks, i, v))} />
              )}
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-amber-300/85 text-center mt-3">{error}</p>}

      {step === 'bids' ? (
        <Button
          variant="primary"
          size="lg"
          className="w-full mt-4"
          disabled={!!error}
          onClick={() => setStep('tricks')}
        >
          Ansagen fertig — spielen
        </Button>
      ) : (
        <div className="flex gap-2 mt-4">
          <Button size="lg" onClick={() => setStep('bids')}>
            Ansagen
          </Button>
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            disabled={!!error}
            onClick={() => onDone(bids, tricks)}
          >
            Runde abrechnen
          </Button>
        </div>
      )}
    </>
  )
}

/** Punkte pro Runde, Zeile für Zeile — und unten die Summe. */
function History({ pad }: { pad: PadState }) {
  if (pad.rounds.length === 0) return null
  const totals = padTotals(pad)
  return (
    <div className="mt-8">
      <SectionTitle>Block</SectionTitle>
      <div className="glass rounded-2xl p-3 overflow-x-auto">
        <table className="w-full text-xs tabular">
          <thead>
            <tr className="text-white/40">
              <th className="text-left font-normal pb-2 pr-2">R</th>
              {pad.names.map((name) => (
                <th key={name} className="text-right font-normal pb-2 px-1 truncate max-w-16">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pad.rounds.map((r, k) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Runden sind rein positionsbasiert
              <tr key={k}>
                <td className="text-white/30 pr-2">{k + 1}</td>
                {pad.names.map((name, i) => (
                  <td key={name} className={`text-right px-1 ${tone(fynScore(r.bids[i], r.tricks[i]))}`}>
                    {signed(fynScore(r.bids[i], r.tricks[i]))}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-white/10">
              <td className="pt-2 text-white/40">Σ</td>
              {totals.map((t, i) => (
                <td key={pad.names[i]} className="pt-2 text-right px-1 font-heading text-lg">
                  {t}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Final({ pad, onAgain, onUndo }: { pad: PadState; onAgain: () => void; onUndo: () => void }) {
  const totals = padTotals(pad)
  const ranking = pad.names.map((name, i) => ({ name, total: totals[i] })).sort((a, b) => b.total - a.total)
  return (
    <Card>
      <p className="label-caption mb-3 flex items-center gap-1.5">
        <Trophy className="w-3.5 h-3.5 text-brand" /> Endstand — {ranking[0].name} gewinnt
      </p>
      <div className="space-y-1.5">
        {ranking.map((r, k) => (
          <div key={r.name} className="flex items-center gap-2 text-sm">
            <span className="w-5 text-white/30 tabular">{k + 1}.</span>
            <span className="flex-1 truncate">{r.name}</span>
            <span className="font-heading text-xl tabular">{r.total}</span>
          </div>
        ))}
      </div>
      <Button variant="primary" size="lg" className="w-full mt-4" onClick={onAgain}>
        Neue Partie, gleiche Runde
      </Button>
      <Button size="md" className="w-full mt-2 flex items-center justify-center gap-2" onClick={onUndo}>
        <Undo2 className="w-4 h-4" /> Letzte Runde korrigieren
      </Button>
    </Card>
  )
}

function PadSetup({ onBack, onStart }: { onBack: () => void; onStart: (names: string[]) => void }) {
  const [names, setNames] = useState(['', '', ''])
  const filled = names.map((n) => n.trim())
  // Namen sind Schlüssel im Block — doppelt geht nicht.
  const ready = filled.every(Boolean) && new Set(filled).size === filled.length

  return (
    <div className="px-5 pt-6 pb-10 animate-fade-in">
      <div className="flex items-center gap-3 mb-7">
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="Zurück">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-heading text-4xl tracking-wide leading-none">FYN BLOCK</h1>
      </div>

      <SectionTitle right={<span className="text-xs text-white/30">{names.length} Spieler</span>}>
        Spieler in Sitzreihenfolge
      </SectionTitle>
      <div className="space-y-2">
        {names.map((name, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Zeilen sind rein positionsbasiert
          <div key={i} className="flex items-center gap-2">
            <span className="w-7 shrink-0 text-center font-heading text-xl text-white/25 tabular">{i + 1}</span>
            <input
              className="field"
              placeholder={i === 0 ? 'Gibt zuerst' : `Name Spieler ${i + 1}`}
              value={name}
              maxLength={16}
              autoComplete="off"
              onChange={(ev) => setNames((prev) => prev.map((n, j) => (j === i ? ev.target.value : n)))}
            />
            <button
              type="button"
              aria-label="Spieler entfernen"
              disabled={names.length <= 2}
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
        disabled={names.length >= FYN_MAX_PLAYERS}
        onClick={() => setNames((prev) => [...prev, ''])}
      >
        <Plus className="w-4 h-4" /> Spieler hinzufügen
      </Button>

      <Card className="mt-8 text-xs text-white/45 leading-relaxed">
        Gespielt wird mit echten Karten. Die App führt nur den Block: Ansagen prüfen,
        Stiche eintragen, Punkte zählen.
      </Card>

      <Button variant="primary" size="lg" className="mt-6 w-full" disabled={!ready} onClick={() => onStart(filled)}>
        {ready ? 'Partie starten' : 'Alle Namen ausfüllen, keine doppelt'}
      </Button>
    </div>
  )
}
