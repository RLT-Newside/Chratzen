import { MAX_TRUMP_FLIPS } from '../../lib/rules'
import { formatChf } from '../../lib/money'

export function PotHeader({
  pot,
  ante,
  round,
  dealer,
  flips,
}: {
  pot: number
  ante: number
  round: number
  dealer: string
  flips: number
}) {
  return (
    <div className="text-center pt-2 pb-5">
      <p className="label-caption">Pott · Runde {round}</p>
      <p className="font-heading text-brand leading-none pot-glow tabular text-[4.5rem] mt-1">
        {formatChf(pot)}
      </p>
      <div className="flex items-center justify-center gap-2 mt-2 text-xs text-white/40">
        <span>Einsatz {formatChf(ante)}</span>
        <span className="text-white/15">·</span>
        <span>
          Geber: <span className="text-white/70">{dealer}</span>
        </span>
      </div>

      {flips > 0 && (
        <p className="mt-3 inline-block text-[11px] px-3 py-1 rounded-full bg-amber-400/10 text-amber-300/90 border border-amber-400/20">
          {flips}. neuer Trumpf aufgedeckt · noch {MAX_TRUMP_FLIPS - flips} bis neu gemischt wird
        </p>
      )}
    </div>
  )
}
