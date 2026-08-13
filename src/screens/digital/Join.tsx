import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Button, SectionTitle, Segmented } from '../../components/ui'
import { ANTE_OPTIONS, formatChf } from '../../lib/money'

export function Join({
  connected,
  onCreate,
  onJoin,
  onBack,
}: {
  connected: boolean
  onCreate: (name: string, ante: number) => void
  onJoin: (code: string, name: string) => void
  onBack: () => void
}) {
  const [name, setName] = useState(() => localStorage.getItem('chratzen.name') ?? '')
  const [ante, setAnte] = useState<number>(ANTE_OPTIONS[1])
  const [code, setCode] = useState('')

  const remember = (n: string) => {
    setName(n)
    localStorage.setItem('chratzen.name', n)
  }
  const ready = name.trim().length > 0 && connected

  return (
    <div className="px-5 pt-6 pb-10 animate-fade-in">
      <div className="flex items-center gap-3 mb-8">
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="Zurück">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-heading text-4xl tracking-wide leading-none">DIGITAL</h1>
        <span
          className={`ml-auto text-[11px] px-2 py-1 rounded-full ${
            connected ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/5 text-white/40'
          }`}
        >
          {connected ? 'verbunden' : 'verbinde …'}
        </span>
      </div>

      <SectionTitle>Dein Name</SectionTitle>
      <input
        className="field"
        placeholder="Name"
        value={name}
        maxLength={16}
        autoComplete="off"
        onChange={(e) => remember(e.target.value)}
      />

      <div className="mt-8">
        <SectionTitle>Neuen Tisch eröffnen</SectionTitle>
        <Segmented
          value={ante}
          onChange={setAnte}
          options={ANTE_OPTIONS.map((a) => ({ value: a as number, label: formatChf(a) }))}
        />
        <Button
          variant="primary"
          size="lg"
          className="w-full mt-3"
          disabled={!ready}
          onClick={() => onCreate(name.trim(), ante)}
        >
          Tisch eröffnen
        </Button>
      </div>

      <div className="flex items-center gap-3 my-8">
        <span className="h-px flex-1 bg-white/10" />
        <span className="label-caption">oder</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <SectionTitle>Mit Code beitreten</SectionTitle>
      <div className="flex gap-2">
        <input
          className="field font-heading text-2xl tracking-[0.35em] text-center uppercase"
          placeholder="ABCD"
          value={code}
          maxLength={4}
          autoCapitalize="characters"
          autoComplete="off"
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
        />
        <Button
          size="lg"
          disabled={!ready || code.length !== 4}
          onClick={() => onJoin(code, name.trim())}
        >
          Beitreten
        </Button>
      </div>
    </div>
  )
}
