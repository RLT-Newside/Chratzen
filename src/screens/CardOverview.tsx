import { ArrowLeft } from 'lucide-react'
import { PlayingCard } from '../components/PlayingCard'
import { RANKS, SUITS, SUIT_LABEL } from '../lib/cards'

const DESCENDING = [...RANKS].sort((a, b) => b - a)

/** Zeigt alle 36 Jasskarten gruppiert nach Farbe — zum Nachschauen, nicht zum Spielen. */
export function CardOverview({ onExit }: { onExit: () => void }) {
  return (
    <div className="px-5 pt-8 pb-10 animate-fade-in">
      <header className="flex items-center gap-3 mb-8">
        <button
          type="button"
          onClick={onExit}
          aria-label="Zurück"
          className="press-scale glass-elevated rounded-xl p-2.5 shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="font-heading text-3xl tracking-wide leading-none">KARTEN</h1>
          <p className="label-caption mt-1">36 Jasskarten im Überblick</p>
        </div>
      </header>

      <div className="space-y-7">
        {SUITS.map((suit) => (
          <section key={suit}>
            <h2 className="label-caption mb-3">{SUIT_LABEL[suit]}</h2>
            <div className="flex flex-wrap gap-2.5">
              {DESCENDING.map((rank) => (
                <PlayingCard key={rank} card={{ suit, rank }} size="md" />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
