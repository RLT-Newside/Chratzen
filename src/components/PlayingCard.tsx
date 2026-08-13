import { type Card, rankLabel } from '../lib/cards'
import { Eichel, Rosen, Schellen, Schilten } from './suits'

const SUIT_UI = {
  schellen: { Icon: Schellen, color: 'text-amber-500' },
  schilten: { Icon: Schilten, color: 'text-emerald-700' },
  rosen: { Icon: Rosen, color: 'text-rose-600' },
  eichel: { Icon: Eichel, color: 'text-amber-800' },
} as const

const SIZE = {
  sm: 'w-11 h-16 text-base rounded-lg',
  md: 'w-16 h-24 text-2xl rounded-xl',
  lg: 'w-20 h-28 text-3xl rounded-xl',
} as const

export function PlayingCard({
  card,
  size = 'md',
  selected,
  dimmed,
  onClick,
  label,
}: {
  card: Card
  size?: keyof typeof SIZE
  selected?: boolean
  dimmed?: boolean
  onClick?: () => void
  label?: string
}) {
  const { Icon, color } = SUIT_UI[card.suit]
  const interactive = !!onClick

  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={onClick}
      aria-label={label ?? `${rankLabel(card.rank)} ${card.suit}`}
      className={`${SIZE[size]} relative shrink-0 bg-[#faf7f0] border border-black/15 shadow-lg
        flex flex-col items-center justify-center gap-0.5 font-heading text-black
        ${interactive ? 'press-scale cursor-pointer' : 'cursor-default'}
        ${selected ? '-translate-y-3 ring-2 ring-brand' : ''}
        ${dimmed ? 'opacity-35 saturate-50' : ''}
        transition-transform duration-150`}
    >
      <span className="leading-none tabular">{rankLabel(card.rank)}</span>
      <Icon className={`${size === 'sm' ? 'w-4 h-4' : 'w-6 h-6'} ${color}`} />
    </button>
  )
}

export function CardBack({ size = 'sm' }: { size?: keyof typeof SIZE }) {
  return (
    <div
      aria-hidden="true"
      className={`${SIZE[size]} shrink-0 border border-white/10 shadow-md
        bg-[repeating-linear-gradient(45deg,#173d27_0px,#173d27_5px,#12301f_5px,#12301f_10px)]`}
    />
  )
}
