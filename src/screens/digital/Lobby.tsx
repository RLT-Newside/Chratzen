import { Bot, Check, Copy, LogOut, UserMinus, WifiOff } from 'lucide-react'
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
  onAddBot,
  onLeave,
}: {
  game: ClientGame
  code: string
  hostInfo: HostInfo | null
  onStart: () => void
  onKick: (playerId: string) => void
  onAddBot: () => void
  onLeave: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [pickedIp, setPickedIp] = useState<string | null>(null)
  const isHost = game.youId === game.hostId

  const nics = hostInfo?.interfaces ?? []
  const ip = pickedIp ?? hostInfo?.ip ?? ''
  const address = ip ? `${ip}:${hostInfo?.port}` : null
  const url = address ? `http://${address}` : null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url ? `${url} · Code ${code}` : code)
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
        {url && (
          <>
            <p className="label-caption mt-5">Im Browser öffnen</p>
            <p className="font-heading text-3xl tracking-wide text-white/85 leading-none mt-1 tabular">
              {address}
            </p>
          </>
        )}
        <Button size="sm" className="mt-4 inline-flex items-center gap-2" onClick={copy}>
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Kopiert' : url ? 'Adresse & Code kopieren' : 'Code kopieren'}
        </Button>
      </Card>

      {hostInfo && !url && (
        <Card className="mt-3 border-amber-400/30">
          <div className="flex gap-3">
            <WifiOff className="w-5 h-5 text-amber-300/80 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200/85 leading-relaxed">
              Kein lokales Netz gefunden. Schalte den Hotspot ein oder verbinde dich mit
              einem WLAN — mit reinen Mobildaten können die anderen dein Gerät nicht
              erreichen.
            </p>
          </div>
        </Card>
      )}

      {url && (
        <>
          <p className="text-center text-xs text-white/40 mt-3 leading-relaxed">
            Die anderen tippen <span className="text-white/70">{address}</span> in einen
            beliebigen Browser und treten mit dem Code bei — ohne App. Dein Bildschirm bleibt
            an, solange der Tisch läuft.
          </p>

          {nics.length > 1 && (
            <div className="mt-3">
              <p className="label-caption text-center mb-2">
                Klappt nicht? Andere Adresse vorlesen
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {nics.map((nic) => (
                  <button
                    key={nic.ip}
                    type="button"
                    onClick={() => setPickedIp(nic.ip)}
                    className={`press-scale text-[11px] px-2.5 py-1.5 rounded-lg tabular ${
                      nic.ip === ip ? 'bg-brand/20 text-brand' : 'glass text-white/45'
                    }`}
                  >
                    {nic.ip}
                    <span className="text-white/30 ml-1">
                      {nic.kind === 'hotspot' ? 'Hotspot' : nic.kind === 'wlan' ? 'WLAN' : nic.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {nics[0]?.kind !== 'hotspot' && (
            <p className="text-center text-[11px] text-white/30 mt-3 leading-relaxed">
              Tipp: Öffentliche WLANs blockieren oft Gerät-zu-Gerät. Wenn niemand
              reinkommt, Hotspot einschalten und alle darauf verbinden.
            </p>
          )}
        </>
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
              {p.bot && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-400/15 text-sky-300 flex items-center gap-1">
                  <Bot className="w-3 h-3" /> Bot
                </span>
              )}
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
        <>
          <Button
            className="w-full mt-3 flex items-center justify-center gap-2"
            disabled={game.players.length >= 8}
            onClick={onAddBot}
          >
            <Bot className="w-4 h-4" /> Bot dazusetzen
          </Button>
          {game.players.length < 2 && (
            <p className="text-xs text-white/35 mt-2 leading-relaxed text-center">
              Allein am Tisch? Setz einen Bot dazu — er kratzt und geht mit, damit
              gespielt wird.
            </p>
          )}

          <Button
            variant="primary"
            size="lg"
            className="w-full mt-6"
            disabled={game.players.length < 2}
            onClick={onStart}
          >
            {game.players.length < 2 ? 'Mindestens zu zweit' : 'Partie starten'}
          </Button>
        </>
      ) : (
        <p className="text-center text-sm text-white/40 mt-8">
          Warten, bis der Host startet …
        </p>
      )}
    </div>
  )
}
