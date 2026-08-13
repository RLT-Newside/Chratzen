import { formatChf } from '../../lib/money'

export function PotHeader({ pot, ante, round }: { pot: number; ante: number; round: number }) {
  return (
    <div className="text-center pt-2 pb-5">
      <p className="label-caption">Pott · Runde {round}</p>
      <p className="font-heading text-brand leading-none pot-glow tabular text-[4.5rem] mt-1">
        {formatChf(pot)}
      </p>
      <p className="text-xs text-white/40 mt-2">Einsatz {formatChf(ante)}</p>
    </div>
  )
}
