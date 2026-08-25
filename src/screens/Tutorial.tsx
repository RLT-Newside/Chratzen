import { ArrowLeft, ArrowRight, Coins, GraduationCap, List, Wifi } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/ui'
import { RULE_SECTIONS } from '../content/rules'

/**
 * Regeln der Reihe nach, ein Kapitel pro Bildschirm — für alle, die Chratzen
 * noch nie gespielt haben. Wer nur etwas nachschlagen will, nimmt die
 * Spielhilfe (`HelpSheet`); die zeigt dieselben Abschnitte als Liste.
 */
export function Tutorial({
  onExit,
  onPlay,
}: {
  onExit: () => void
  onPlay: (mode: 'companion' | 'digital' | 'practice') => void
}) {
  const [step, setStep] = useState(0)
  const [showToc, setShowToc] = useState(false)
  const top = useRef<HTMLDivElement>(null)

  const section = RULE_SECTIONS[step]
  const last = step === RULE_SECTIONS.length - 1

  // Neues Kapitel heisst neuer Text — sonst steht man mittendrin.
  useEffect(() => {
    top.current?.scrollIntoView({ block: 'start' })
  }, [step])

  const go = (next: number) => {
    setStep(Math.min(Math.max(next, 0), RULE_SECTIONS.length - 1))
    setShowToc(false)
  }

  return (
    <div className="px-5 pt-6 pb-10 animate-fade-in min-h-screen flex flex-col">
      <div ref={top} />

      <header className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onExit} aria-label="Zurück">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-3xl tracking-wide leading-none">CHRATZEN LERNEN</h1>
          <p className="label-caption mt-1">
            Kapitel {step + 1} von {RULE_SECTIONS.length}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowToc((v) => !v)}
          aria-label="Kapitel wählen"
          className={showToc ? 'text-brand' : ''}
        >
          <List className="w-5 h-5" />
        </Button>
      </header>

      {/* Fortschritt: ein Strich pro Kapitel, angetippt springt man hin. */}
      <div className="flex gap-1 mt-4">
        {RULE_SECTIONS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => go(i)}
            aria-label={`Kapitel ${i + 1}: ${s.title}`}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= step ? 'bg-brand' : 'bg-white/12'
            }`}
          />
        ))}
      </div>

      {showToc && (
        <nav className="glass rounded-2xl mt-4 overflow-hidden">
          {RULE_SECTIONS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => go(i)}
              className={`press-scale w-full text-left px-4 py-2.5 flex gap-3 border-b border-white/5 last:border-0 ${
                i === step ? 'bg-white/[0.06]' : ''
              }`}
            >
              <span className="font-heading text-lg text-brand/70 leading-none w-4 shrink-0 pt-0.5">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm text-white/85">{s.title}</span>
                <span className="block text-xs text-white/35 leading-snug">{s.teaser}</span>
              </span>
            </button>
          ))}
        </nav>
      )}

      <main className="flex-1 mt-7">
        <h2 className="font-heading text-4xl tracking-wide leading-none text-brand">
          {section.title}
        </h2>
        <p className="text-sm text-white/40 mt-2 mb-5 leading-relaxed">{section.teaser}</p>
        <section.Body />

        {last && (
          <div className="mt-8 space-y-2">
            <p className="label-caption">Und jetzt?</p>
            <Button
              variant="primary"
              size="lg"
              className="w-full flex items-center justify-center gap-2"
              onClick={() => onPlay('practice')}
            >
              <GraduationCap className="w-4 h-4" />
              Übungsrunde mit Coach
            </Button>
            <Button
              size="lg"
              className="w-full flex items-center justify-center gap-2"
              onClick={() => onPlay('digital')}
            >
              <Wifi className="w-4 h-4" />
              Digital spielen
            </Button>
            <Button
              size="lg"
              className="w-full flex items-center justify-center gap-2"
              onClick={() => onPlay('companion')}
            >
              <Coins className="w-4 h-4" />
              Companion — mit echten Karten
            </Button>
          </div>
        )}
      </main>

      <div className="flex gap-2 mt-8 safe-bottom">
        <Button size="lg" className="flex-1" disabled={step === 0} onClick={() => go(step - 1)}>
          Zurück
        </Button>
        {!last && (
          <Button
            variant="primary"
            size="lg"
            className="flex-1 flex items-center justify-center gap-2"
            onClick={() => go(step + 1)}
          >
            Weiter
            <ArrowRight className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
