import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Button, SectionTitle, Segmented } from '../../components/ui'
import { ANTE_OPTIONS, formatChf } from '../../lib/money'

export function Join({
  connected,
  server,
  isNative,
  onChangeServer,
  onCreate,
  onJoin,
  onBack,
}: {
  connected: boolean
  server: string
  isNative: boolean
  onChangeServer: (url: string) => void
  onCreate: (name: string, ante: number) => void
  onJoin: (code: string, name: string) => void
  onBack: () => void
}) {
  const [name, setName] = useState(() => localStorage.getItem('chratzen.name') ?? '')
  const [ante, setAnte] = useState<number>(ANTE_OPTIONS[1])
  const [code, setCode] = useState('')
  const [serverDraft, setServerDraft] = useState(server)
  const [showServer, setShowServer] = useState(isNative && !server)

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

      <SectionTitle
        right={
          <button
            type="button"
            onClick={() => setShowServer((v) => !v)}
            className="press-scale text-[11px] text-white/40 hover:text-white/70"
          >
            Server
          </button>
        }
      >
        Dein Name
      </SectionTitle>
      <input
        className="field"
        placeholder="Name"
        value={name}
        maxLength={16}
        autoComplete="off"
        onChange={(e) => remember(e.target.value)}
      />

      {showServer && (
        <div className="mt-3 glass rounded-xl p-3">
          <p className="text-[11px] text-white/45 leading-relaxed mb-2">
            Adresse des Geräts, das den Tisch hostet. Im gleichen WLAN reicht die lokale
            IP, z. B. <span className="text-white/70">192.168.1.42:3001</span>.
          </p>
          <div className="flex gap-2">
            <input
              className="field"
              placeholder="192.168.1.42:3001"
              value={serverDraft}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              inputMode="url"
              onChange={(e) => setServerDraft(e.target.value)}
            />
            <Button
              size="md"
              disabled={serverDraft.trim() === server}
              onClick={() => onChangeServer(serverDraft)}
            >
              Setzen
            </Button>
          </div>
          {server && (
            <p className="text-[11px] text-white/30 mt-2 truncate">
              Aktuell: {server}
              {!isNative && ' — leer lassen für den Server dieser Website'}
            </p>
          )}
        </div>
      )}

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
