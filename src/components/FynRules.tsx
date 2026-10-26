import { X } from 'lucide-react'
import { useEffect } from 'react'
import { FYN_ROUNDS } from '../lib/fyn'

/** Regeln von Fuck Your Neighbour als Bottom-Sheet — kurz genug für eine Seite. */
export function FynRules({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 animate-fade-in">
      <button
        type="button"
        aria-label="Regeln schliessen"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div className="relative glass-elevated rounded-t-3xl max-w-lg w-full mx-auto max-h-[85vh] overflow-y-auto p-5 safe-bottom">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-heading text-3xl tracking-wide leading-none">REGELN</h2>
            <p className="label-caption mt-1">Fuck Your Neighbour · 2–6 Spieler</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schliessen"
            className="press-scale w-9 h-9 rounded-xl grid place-items-center text-white/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-sm text-white/70 leading-relaxed">
          <Section title="Ablauf">
            11 Runden, Karten pro Spieler: {FYN_ROUNDS.join(' → ')}. Der Geber wechselt jede
            Runde. Kein Trumpf, keine Farbe bedienen — die höchste Karte holt den Stich.
          </Section>
          <Section title="Ansage">
            Reihum sagt jeder, wie viele Stiche er macht; der Geber zuletzt. Er darf die
            Summe aller Ansagen nicht auf die Kartenzahl bringen — irgendwer muss
            danebenliegen. Niemand sagt zweimal in Folge 0.
          </Section>
          <Section title="Stechen">
            Liegt die höchste Karte doppelt, spielen nur diese Spieler nochmals um den
            Stich; alle anderen werfen eine beliebige Karte ab. Ist keine Karte mehr da,
            erbt die höchste Karte, die nur einer gelegt hat.
          </Section>
          <Section title="Stirnrunde">
            Bei einer Karte sieht jeder nur die Karten der anderen, nie die eigene — und
            sagt an, ob er den Stich macht.
          </Section>
          <Section title="Punkte">
            Genau getroffen: 10 pro Stich (0 angesagt und 0 gemacht gibt 0). Daneben: −10
            pro Stich Abweichung.
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label-caption mb-1">{title}</p>
      <p>{children}</p>
    </div>
  )
}
