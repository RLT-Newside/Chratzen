import { ChevronDown, GraduationCap, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { RULE_SECTIONS, type RuleId } from '../content/rules'

/**
 * Spielhilfe als Bottom-Sheet. Liegt über dem laufenden Spiel, statt woanders
 * hinzunavigieren — ein Tisch mit offener Verbindung überlebt keinen
 * Seitenwechsel, und mitten in der Ansage will niemand seinen Platz verlieren.
 */
export function HelpSheet({
  onClose,
  initial,
  hint,
  onOpenTutorial,
}: {
  onClose: () => void
  /** Abschnitt, der beim Öffnen schon aufgeklappt ist — passend zur Spielphase. */
  initial?: RuleId
  /** Ein Satz zur aktuellen Lage, ganz oben. */
  hint?: string
  onOpenTutorial?: () => void
}) {
  const [open, setOpen] = useState<RuleId | null>(initial ?? RULE_SECTIONS[0].id)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 animate-fade-in">
      <button
        type="button"
        aria-label="Hilfe schliessen"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />

      <div className="relative glass-elevated rounded-t-3xl max-w-lg w-full mx-auto max-h-[85vh] flex flex-col">
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 shrink-0">
          <div>
            <h2 className="font-heading text-3xl tracking-wide leading-none">SPIELHILFE</h2>
            <p className="label-caption mt-1">Chratzen — Regeln zum Nachschlagen</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schliessen"
            className="press-scale ml-auto glass rounded-xl p-2.5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {hint && (
          <p className="mx-5 mb-3 shrink-0 glass rounded-xl px-3.5 py-2.5 text-sm text-brand/85 leading-relaxed border-l-2 border-l-brand/50">
            {hint}
          </p>
        )}

        <div className="overflow-y-auto px-5 pb-5 safe-bottom space-y-2">
          {RULE_SECTIONS.map(({ id, title, teaser, Body }) => {
            const expanded = open === id
            return (
              <section key={id} className="glass rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : id)}
                  aria-expanded={expanded}
                  className="press-scale w-full text-left px-4 py-3 flex items-center gap-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-heading text-xl tracking-wide leading-none">
                      {title}
                    </span>
                    {!expanded && (
                      <span className="block text-xs text-white/40 leading-snug mt-1.5">
                        {teaser}
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-white/35 shrink-0 transition-transform ${
                      expanded ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {expanded && (
                  <div className="px-4 pb-4">
                    <Body />
                  </div>
                )}
              </section>
            )
          })}

          {onOpenTutorial && (
            <button
              type="button"
              onClick={onOpenTutorial}
              className="press-scale w-full glass rounded-2xl px-4 py-3 flex items-center gap-3 text-left"
            >
              <GraduationCap className="w-5 h-5 text-brand shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-white/85 font-medium">Tutorial von vorn</span>
                <span className="block text-xs text-white/40 leading-snug mt-0.5">
                  Alles der Reihe nach, in neun Kapiteln
                </span>
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
