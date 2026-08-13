import { Check, Copy, LogOut, UserMinus } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, SectionTitle } from '../../components/ui'
import type { ClientGame } from '../../lib/game'
import { formatChf } from '../../lib/money'
import type { HostInfo } from '../../lib/transport'

export function Lobby({
  game,
  code,
  hostInfo,
  onStart,
  onKick,
  onLeave,
}: {
  game: ClientGame
  code: string
  hostInfo: HostInfo | null
  onStart: () => void
  onKick: (playerId: string) => void
  onLeave: () => void
}) {
  const [copied, setCopied] = useState(false)
  const isHost = game.youId === game.hostId
  const address = hostInfo?.ip ? `${hostInfo.ip}:${hostInfo.port}` : null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address ? `${address} · ${code}` : code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Kein Clipboard-Zugriff (http, alter Browser) — Code steht ja gross da.
    }
  }

  return (
    <div className="px-5 pt-6 pb-10 animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-heading text-4xl tracking-wide leading-none">LOBBY</h1>
        <Button variant="ghost" size="sm" onClick={onLeave} aria-label="Verlassen">
          <LogOut className="w-5 h-5" />
        </Button>
      </div>

      <Card className="text-center py-7">
        <p className="label-caption">Raumcode</p>
        <p className="font-heading text-7xl tracking-[0.2em] text-brand leading-none mt-2 pot-glow">
          {code}
        </p>
        {address && (
          <>
            <p className="label-caption mt-5">Adresse für die anderen</p>
            <p className="font-heading text-3xl tracking-wider text-white/85 leading-none mt-1 tabular">
              {address}
            </p>
          </>
        )}
        <Button size="sm" className="mt-4 inline-flex items-center gap-2" onClick={copy}>
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Kopiert' : address ? 'Adresse & Code kopieren' : 'Code kopieren'}
        </Button>
      </Card>

      {address && (
        <p className="text-center text-xs text-white/40 mt-3 leading-relaxed">
          Dieses Gerät führt den Tisch. Die anderen öffnen Chratzen → Digital → Server auf{' '}
          <span className="text-white/70">{address}</span> setzen und mit dem Code beitreten.
          Bildschirm bleibt an, solange der Tisch läuft.
        </p>
      )}

      <p className="text-center text-xs text-white/35 mt-3">
        Grundeinsatz {formatChf(game.ante)} pro Spieler und Runde
      </p>

      <div className="mt-8">
        <SectionTitle right={<span className="text-xs text-white/30">{game.players.length}/8</span>}>
          Am Tisch
        </SectionTitle>
        <div className="space-y-2">
          {game.players.map((p) => (
            <div key={p.id} className="glass rounded-2xl p-3.5 flex items-center gap-3">
              <span
                className={`w-2 h-2 rounded-full ${p.connected ? 'bg-emerald-400' : 'bg-white/20'}`}
              />
              <span className="flex-1 truncate text-sm font-medium">{p.name}</span>
              {p.id === game.hostId && <span className="label-caption">Host</span>}
              {p.id === game.youId && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand/15 text-brand">Du</span>
              )}
              {isHost && p.id !== game.youId && (
                <button
                  type="button"
                  aria-label={`${p.name} entfernen`}
                  onClick={() => onKick(p.id)}
                  className="press-scale w-8 h-8 rounded-lg grid place-items-center text-white/30 hover:text-red-300 hover:bg-red-500/10"
                >
                  <UserMinus className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {isHost ? (
        <Button
          variant="primary"
          size="lg"
          className="w-full mt-8"
          disabled={game.players.length < 2}
          onClick={onStart}
        >
          {game.players.length < 2 ? 'Warte auf Mitspieler …' : 'Partie starten'}
        </Button>
      ) : (
        <p className="text-center text-sm text-white/40 mt-8">
          Warten, bis der Host startet …
        </p>
      )}
    </div>
  )
}
