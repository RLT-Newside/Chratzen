import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger' | 'subtle'
  size?: 'sm' | 'md' | 'lg'
}

const VARIANTS = {
  primary: 'bg-brand text-black font-bold hover:bg-brand/90 disabled:bg-brand/30 disabled:text-black/40',
  subtle: 'glass text-white/85 hover:bg-white/[0.08]',
  ghost: 'text-white/50 hover:text-white/85',
  danger: 'bg-red-500/12 text-red-300 border border-red-500/25 hover:bg-red-500/20',
} as const

const SIZES = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2.5 text-sm rounded-xl',
  lg: 'px-5 py-3.5 text-base rounded-2xl',
} as const

export function Button({ variant = 'subtle', size = 'md', className = '', ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`press-scale disabled:opacity-40 disabled:pointer-events-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    />
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`glass rounded-2xl p-4 ${className}`}>{children}</div>
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="label-caption">{children}</h2>
      {right}
    </div>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="glass rounded-xl p-1 flex gap-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={`press-scale flex-1 py-2 rounded-lg text-sm font-medium ${
            o.value === value ? 'bg-brand text-black' : 'text-white/55 hover:text-white/85'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 4,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="weniger"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className="press-scale w-9 h-9 rounded-lg glass text-white/70 disabled:opacity-25 text-lg leading-none"
      >
        −
      </button>
      <span className="w-8 text-center font-heading text-2xl tabular text-brand">{value}</span>
      <button
        type="button"
        aria-label="mehr"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className="press-scale w-9 h-9 rounded-lg glass text-white/70 disabled:opacity-25 text-lg leading-none"
      >
        +
      </button>
    </div>
  )
}
