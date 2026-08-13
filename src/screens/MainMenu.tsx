import { ChevronRight, Coins, Wifi } from 'lucide-react'
import { SUITS } from '../components/suits'

export type Mode = 'menu' | 'companion' | 'digital'

function ModeCard({
  title,
  tag,
  lines,
  icon,
  accent,
  onClick,
  soon,
}: {
  title: string
  tag: string
  lines: string[]
  icon: React.ReactNode
  accent: string
  onClick: () => void
  soon?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press-scale glass rounded-3xl p-5 text-left w-full relative overflow-hidden group"
    >
      <div
        className={`absolute -right-10 -top-10 w-40 h-40 rounded-full blur-3xl opacity-20 ${accent}`}
        aria-hidden="true"
      />
      <div className="relative flex items-start gap-4">
        <div className="shrink-0 w-11 h-11 rounded-2xl glass-elevated grid place-items-center text-brand">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-3xl tracking-wide leading-none">{title}</h2>
            {soon && (
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-white/50">
                bald
              </span>
            )}
          </div>
          <p className="label-caption mt-1.5">{tag}</p>
          <ul className="mt-3 space-y-1">
            {lines.map((l) => (
              <li key={l} className="text-sm text-white/55 leading-snug">
                {l}
              </li>
            ))}
          </ul>
        </div>
        <ChevronRight className="w-5 h-5 text-white/25 mt-1 group-hover:text-white/50 transition-colors" />
      </div>
    </button>
  )
}

export function MainMenu({ onSelect }: { onSelect: (m: Mode) => void }) {
  return (
    <div className="px-5 pt-14 pb-10 animate-fade-in">
      <header className="text-center mb-10">
        <div className="flex justify-center gap-3 mb-5">
          {SUITS.map(({ name, Icon, color }) => (
            <Icon key={name} className={`w-6 h-6 ${color} opacity-80`} />
          ))}
        </div>
        <h1 className="font-heading text-7xl tracking-[0.08em] text-brand leading-none pot-glow">
          CHRATZEN
        </h1>
        <p className="label-caption mt-3">Schweizer Kartenspiel · 36 Jasskarten</p>
      </header>

      <div className="space-y-3">
        <ModeCard
          title="COMPANION"
          tag="Pott-Manager für den Stammtisch"
          lines={[
            'Ihr spielt mit echten Karten.',
            'Die App führt Pott, Ansagen und Kasse.',
            'Bete/Sack werden automatisch verrechnet.',
          ]}
          icon={<Coins className="w-5 h-5" />}
          accent="bg-brand"
          onClick={() => onSelect('companion')}
        />
        <ModeCard
          title="DIGITAL"
          tag="Online Multiplayer mit Lobby"
          lines={[
            'Virtuell am Tisch sitzen.',
            'Austeilen, tauschen und stechen läuft automatisch.',
            'Raumcode teilen, Reconnect inklusive.',
          ]}
          icon={<Wifi className="w-5 h-5" />}
          accent="bg-emerald-400"
          onClick={() => onSelect('digital')}
        />
      </div>

      <p className="text-center text-xs text-white/25 mt-10 leading-relaxed">
        Grundeinsatz frei wählbar · Kratzen = 2 Stiche · Mitgehen = 1 Stich
      </p>
    </div>
  )
}
