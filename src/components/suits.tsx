/** Schweizer Jass-Farben als schlanke Inline-SVGs (keine Icon-Dependency nötig). */

type Props = { className?: string }

export function Schellen({ className = 'w-5 h-5' }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2.5a1.4 1.4 0 0 1 1.4 1.4v.4a5.6 5.6 0 0 1 4.2 5.4v3.4l1.6 2.5a.8.8 0 0 1-.7 1.2H5.5a.8.8 0 0 1-.7-1.2l1.6-2.5V9.7a5.6 5.6 0 0 1 4.2-5.4v-.4A1.4 1.4 0 0 1 12 2.5Z" />
      <circle cx="12" cy="19.4" r="2.1" />
    </svg>
  )
}

export function Schilten({ className = 'w-5 h-5' }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2.4 20 5v6.6c0 4.9-3.4 8.4-8 10-4.6-1.6-8-5.1-8-10V5l8-2.6Z" />
    </svg>
  )
}

export function Rosen({ className = 'w-5 h-5' }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <ellipse key={deg} cx="12" cy="6.4" rx="3.1" ry="4.4" transform={`rotate(${deg} 12 12)`} />
      ))}
      <circle cx="12" cy="12" r="2.6" fill="#0b0e0c" />
    </svg>
  )
}

export function Eichel({ className = 'w-5 h-5' }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 1.8c.5 0 .9.4.9.9v1.4h-1.8V2.7c0-.5.4-.9.9-.9Z" />
      <rect x="4.6" y="4.4" width="14.8" height="4.6" rx="2.3" />
      <path d="M5.6 10.2h12.8v3.4c0 4.3-2.9 8.2-6.4 8.6-3.5-.4-6.4-4.3-6.4-8.6v-3.4Z" />
    </svg>
  )
}

export const SUITS = [
  { name: 'Schellen', Icon: Schellen, color: 'text-amber-300' },
  { name: 'Schilten', Icon: Schilten, color: 'text-emerald-300' },
  { name: 'Rosen', Icon: Rosen, color: 'text-rose-400' },
  { name: 'Eichel', Icon: Eichel, color: 'text-orange-300' },
] as const
