import { Bluetooth, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../components/ui'
import { type BtDevice, NativeBluetooth, bluetoothError } from '../../lib/transport'

/** Hängt an, was noch fehlt — dasselbe Gerät meldet sich bei der Suche gern mehrmals. */
const merge = (list: BtDevice[], more: BtDevice[]) => [
  ...list,
  ...more.filter((d) => !list.some((x) => x.address === d.address)),
]

/**
 * Gast ohne WLAN: Handys in der Nähe suchen und das des Hosts antippen. Der
 * Host muss dafür in seiner Lobby Bluetooth geöffnet haben.
 */
export function BluetoothPicker({
  disabled,
  connectingTo,
  onPick,
}: {
  disabled: boolean
  connectingTo: string | null
  onPick: (device: BtDevice) => void
}) {
  const [devices, setDevices] = useState<BtDevice[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    const subs = [
      NativeBluetooth.addListener('device', (d) => setDevices((list) => merge(list ?? [], [d]))),
      NativeBluetooth.addListener('scanEnd', () => setSearching(false)),
    ]
    return () => {
      for (const s of subs) s.then((l) => l.remove()).catch(() => {})
    }
  }, [])

  const search = async () => {
    setDevices([])
    setSearching(true)
    setNote(null)
    try {
      const res = await NativeBluetooth.scan()
      // Gekoppelte zuerst, Gefundenes kann schon vor der Antwort eingetroffen sein.
      setDevices((list) => merge(res.devices, list ?? []))
      setSearching(res.searching)
      if (res.locationOff) {
        setNote(
          'Standort ist aus — bis Android 11 findet das Handy so keine neuen Geräte. Gekoppelte stehen trotzdem hier.',
        )
      }
    } catch (e) {
      setSearching(false)
      setNote(bluetoothError(e))
    }
  }

  return (
    <div>
      <Button
        className="w-full flex items-center justify-center gap-2"
        disabled={disabled || searching}
        onClick={search}
      >
        <Bluetooth className="w-4 h-4" />
        {searching ? 'Suche …' : devices ? 'Nochmals suchen' : 'Handys in der Nähe suchen'}
      </Button>

      {devices && devices.length > 0 && (
        <div className="mt-3 space-y-2">
          {devices.map((d) => (
            <button
              key={d.address}
              type="button"
              disabled={disabled || !!connectingTo}
              onClick={() => onPick(d)}
              className="press-scale glass rounded-2xl w-full p-3.5 flex items-center gap-3 text-left disabled:opacity-40"
            >
              <Bluetooth className="w-4 h-4 text-sky-300/80 shrink-0" />
              <span className="flex-1 truncate text-sm font-medium">{d.name}</span>
              {d.address === connectingTo ? (
                <span className="text-[11px] text-emerald-300">verbinde …</span>
              ) : (
                d.paired && <span className="label-caption">gekoppelt</span>
              )}
              <ChevronRight className="w-4 h-4 text-white/25" />
            </button>
          ))}
        </div>
      )}
      {devices?.length === 0 && !searching && (
        <p className="text-xs text-white/35 mt-3 text-center">Kein Handy gefunden.</p>
      )}
      {note && <p className="text-xs text-amber-200/85 mt-3 leading-relaxed">{note}</p>}

      <p className="text-xs text-white/35 mt-2 leading-relaxed">
        Der Host tippt in seiner Lobby auf «Bluetooth öffnen», dann erscheint sein Handy hier.
        Ohne WLAN und ohne Code — dafür brauchen alle die App.
      </p>
    </div>
  )
}
