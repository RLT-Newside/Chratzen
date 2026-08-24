import { type Card, RANK_NAME, SUIT_LABEL, cardId } from '../lib/cards'

const SIZE = {
  sm: 'w-11 h-16 rounded-lg',
  md: 'w-16 h-24 rounded-xl',
  lg: 'w-20 h-28 rounded-xl',
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
  const interactive = !!onClick

  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={onClick}
      aria-label={label ?? `${RANK_NAME[card.rank]} ${SUIT_LABEL[card.suit]}`}
      className={`${SIZE[size]} relative shrink-0 bg-white border border-black/15 shadow-lg overflow-hidden
        ${interactive ? 'press-scale cursor-pointer' : 'cursor-default'}
        ${selected ? '-translate-y-3 ring-2 ring-brand' : ''}
        ${dimmed ? 'opacity-35 saturate-50' : ''}
        transition-transform duration-150`}
    >
      <img
        src={`/cards/${cardId(card)}.gif`}
        alt=""
        draggable={false}
        className="w-full h-full object-contain select-none pointer-events-none"
      />
    </button>
  )
}

export function CardBack({ size = 'sm' }: { size?: keyof typeof SIZE }) {
  return (
    <div
      aria-hidden="true"
      className={`${SIZE[size]} shrink-0 bg-white border border-black/15 shadow-md overflow-hidden`}
    >
      <img
        src="/cards/back.gif"
        alt=""
        draggable={false}
        className="w-full h-full object-contain select-none pointer-events-none"
      />
    </div>
  )
}
