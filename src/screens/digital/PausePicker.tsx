import { SectionTitle, Segmented } from '../../components/ui'

export const PAUSE_OPTIONS = [
  { value: 0, label: 'Aus' },
  { value: 1000, label: '1 s' },
  { value: 2000, label: '2 s' },
  { value: 3000, label: '3 s' },
]

/**
 * Wie lange ein fertiger Stich liegen bleibt. Gilt für den ganzen Tisch —
 * eine Pause pro Spieler ginge nicht, alle sehen denselben Zustand.
 */
export function PausePicker({
  value,
  onChange,
  compact,
}: {
  value: number
  onChange: (ms: number) => void
  compact?: boolean
}) {
  return (
    <div className={compact ? '' : 'mt-6'}>
      <SectionTitle>Stich liegen lassen</SectionTitle>
      <Segmented value={value} options={PAUSE_OPTIONS} onChange={onChange} />
      {!compact && (
        <p className="text-xs text-white/35 mt-2 leading-relaxed">
          So lange bleibt der fertige Stich auf dem Tisch, damit alle die letzte Karte
          sehen.
        </p>
      )}
    </div>
  )
}
