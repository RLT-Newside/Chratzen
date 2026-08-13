import { LogOut, Shield, UserMinus, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CardBack, PlayingCard } from '../../components/PlayingCard'
import { Button, Card } from '../../components/ui'
import { type CardId, cardId, sortHand } from '../../lib/cards'
import type { ClientGame } from '../../lib/game'
import { formatChf } from '../../lib/money'
import type { Call } from '../../lib/rules'

const CALL_BADGE: Record<Call, { label: string; cls: string } | null> = {
  weiter: { label: 'raus', cls: 'bg-white/5 text-white/30' },
  kratzen: { label: 'kratzt', cls: 'bg-brand/20 text-brand' },
  mitgehen: { label: 'mit', cls: 'bg-emerald-400/15 text-emerald-300' },
  letzter: { label: 'letzter', cls: 'bg-sky-400/15 text-sky-300' },
}

export function Table({
  game,
  onCall,
  onExchange,
  onSleeper,
  onPlay,
  onNext,
  onKick,
  onForce,
  onLeave,
}: {
  game: ClientGame
  onCall: (c: Call) => void
  onExchange: (ids: CardId[]) => void
  onSleeper: (id: CardId) => void
  onPlay: (id: CardId) => void
  onNext: () => void
  onKick: (playerId: string) => void
  onForce: () => void
  onLeave: () => void
}) {
  const [selected, setSelected] = useState<CardId[]>([])
  const [manage, setManage] = useState(false)

  // Auswahl gehört immer zur aktuellen Phase — beim Wechsel wegwerfen.
  useEffect(() => setSelected([]), [game.phase])

  const you = game.players.find((p) => p.id === game.youId)
  const others = game.players.filter((p) => p.id !== game.youId)
  const active = game.players[game.turn]
  const trumpSuit = game.trump?.suit ?? null
  const hand = sortHand(game.hand, trumpSuit)
  const inPlay = game.phase === 'play'
  const selecting = game.phase === 'exchange' && game.yourTurn
  const discarding = game.mustDiscardSleeper

  const toggle = (id: CardId) =>
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : discarding
          ? [id]
          : prev.length < 4
            ? [...prev, id]
            : prev,
    )

  const onCardClick = (id: CardId) => {
    if (inPlay && game.yourTurn && game.legal.includes(id)) return onPlay(id)
    if (selecting || discarding) return toggle(id)
  }

  // Es kratzt nur einer: wer schon einen Kratzer am Tisch hat, kann nur mitgehen.
  const hasKratzer = others.some((p) => p.call === 'kratzen')
  const hasLetzter = others.some((p) => p.call === 'letzter')

  return (
    <div className="px-4 pt-4 pb-6 animate-fade-in min-h-screen flex flex-col">
      {/* Pott, Trumpf, Runde */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="label-caption">Pott · Runde {game.round}</p>
          <p className="font-heading text-5xl text-brand leading-none tabular pot-glow">
            {formatChf(game.pot)}
          </p>
        </div>
        {game.trump && (
          <div className="text-center">
            <p className="label-caption mb-1">Trumpf</p>
            <PlayingCard card={game.trump} size="sm" />
          </div>
        )}
        {game.isHost && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setManage((v) => !v)}
            aria-label="Tisch verwalten"
            className={manage ? 'text-brand' : ''}
          >
            <Shield className="w-5 h-5" />
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onLeave} aria-label="Tisch verlassen">
          <LogOut className="w-5 h-5" />
        </Button>
      </div>

      {/* Mitspieler */}
      <div className="flex gap-2 overflow-x-auto mt-5 pb-1 -mx-1 px-1">
        {others.map((p) => {
          const badge = CALL_BADGE[p.call]
          const isActive = p.id === active?.id
          return (
            <div
              key={p.id}
              className={`glass rounded-xl px-3 py-2 shrink-0 min-w-[7rem] ${
                isActive ? 'ring-1 ring-brand/60' : ''
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${p.connected ? 'bg-emerald-400' : 'bg-red-400/60'}`}
                />
                <span className="text-xs font-medium truncate">{p.name}</span>
                {game.players.indexOf(p) === game.dealerIndex && (
                  <span className="text-[9px] text-white/30 uppercase">Geber</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                {badge && game.phase !== 'lobby' && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${badge.cls}`}>
                    {badge.label}
                  </span>
                )}
                <span className="text-[10px] text-white/35 tabular ml-auto">
                  {p.cards} K · {p.tricks} St
                </span>
              </div>

              {manage && (
                <button
                  type="button"
                  onClick={() => onKick(p.id)}
                  className={`press-scale mt-2 w-full py-1 rounded-md text-[10px] flex items-center justify-center gap-1 ${
                    game.pendingKicks.includes(p.id)
                      ? 'bg-emerald-400/15 text-emerald-300'
                      : 'bg-red-500/10 text-red-300/80'
                  }`}
                >
                  {game.pendingKicks.includes(p.id) ? (
                    <>
                      <UserPlus className="w-3 h-3" /> doch behalten
                    </>
                  ) : (
                    <>
                      <UserMinus className="w-3 h-3" /> nach der Runde raus
                    </>
                  )}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {game.canForce && game.actorId && game.actorId !== game.youId && (
        <div className="mt-3 glass rounded-xl px-3 py-2 flex items-center gap-3 border-amber-400/25">
          <p className="flex-1 text-xs text-amber-200/85 leading-snug">
            {game.players.find((p) => p.id === game.actorId)?.name} reagiert nicht.
          </p>
          <Button size="sm" onClick={onForce}>
            Zug übernehmen
          </Button>
        </div>
      )}

      {game.message && (
        <p className="mt-3 text-xs text-center text-amber-300/80 leading-relaxed">{game.message}</p>
      )}

      {/* Stich in der Mitte */}
      <div className="flex-1 grid place-items-center py-6 min-h-[9rem]">
        {game.trick.length > 0 ? (
          <div className="flex gap-2">
            {game.trick.map((t) => {
              const p = game.players.find((x) => x.id === t.playerId)
              return (
                <div key={cardId(t.card)} className="text-center">
                  <PlayingCard card={t.card} size="md" />
                  <p className="text-[10px] text-white/40 mt-1 truncate max-w-16">{p?.name}</p>
                </div>
              )
            })}
          </div>
        ) : game.phase === 'settle' ? (
          <Settle game={game} onNext={onNext} />
        ) : (
          <p className="text-sm text-white/25">
            {game.phase === 'play' ? 'Bereit zum Ausspielen' : 'Warten auf die Ansagen …'}
          </p>
        )}
      </div>

      {/* Deine Hand */}
      {hand.length > 0 && (
        <div className="flex justify-center gap-1.5 pb-4 pt-2">
          {hand.map((c) => {
            const id = cardId(c)
            const playable = inPlay && game.yourTurn && game.legal.includes(id)
            const pickable = selecting || discarding
            return (
              <PlayingCard
                key={id}
                card={c}
                size="md"
                selected={selected.includes(id)}
                dimmed={inPlay && game.yourTurn && !playable}
                onClick={playable || pickable ? () => onCardClick(id) : undefined}
              />
            )
          })}
        </div>
      )}
      {hand.length === 0 && game.phase !== 'settle' && (
        <div className="flex justify-center gap-1.5 pb-4 pt-2 opacity-40">
          <CardBack />
          <CardBack />
        </div>
      )}

      {/* Aktionsleiste */}
      <div className="safe-bottom">
        {game.phase === 'calls' &&
          (game.yourTurn ? (
            <div className="grid grid-cols-4 gap-1.5">
              {game.awaitLetzter ? (
                <>
                  <Button variant="primary" className="col-span-2" onClick={() => onCall('mitgehen')}>
                    Mitgehen
                  </Button>
                  <Button className="col-span-2" onClick={() => onCall('weiter')}>
                    Passen
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant={hasKratzer ? 'subtle' : 'primary'}
                    disabled={hasKratzer}
                    onClick={() => onCall('kratzen')}
                  >
                    Kratzen
                  </Button>
                  <Button disabled={!hasKratzer} onClick={() => onCall('mitgehen')}>
                    Mitgehen
                  </Button>
                  <Button disabled={hasLetzter} onClick={() => onCall('letzter')}>
                    Letzter
                  </Button>
                  <Button onClick={() => onCall('weiter')}>Weiter</Button>
                </>
              )}
            </div>
          ) : (
            <WaitLine name={active?.name} what="sagt an" />
          ))}

        {game.phase === 'exchange' &&
          (game.yourTurn ? (
            <Button variant="primary" size="lg" className="w-full" onClick={() => onExchange(selected)}>
              {selected.length === 0
                ? 'Keine Karten tauschen'
                : selected.length === 4
                  ? 'Alle 4 tauschen (5 neue)'
                  : `${selected.length} tauschen`}
            </Button>
          ) : (
            <WaitLine name={active?.name} what="tauscht" />
          ))}

        {game.phase === 'sleeper' &&
          (discarding ? (
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={selected.length !== 1}
              onClick={() => onSleeper(selected[0])}
            >
              {selected.length === 1 ? 'Schlafkarte abwerfen' : 'Schlafkarte wählen'}
            </Button>
          ) : (
            <WaitLine what="Schlafkarte wird abgeworfen" />
          ))}

        {game.phase === 'play' &&
          (game.yourTurn ? (
            <p className="text-center text-sm text-brand">Du bist am Zug — Karte antippen</p>
          ) : (
            <WaitLine name={active?.name} what="spielt" />
          ))}

        {game.phase === 'settle' && you && (
          <p className="text-center text-xs text-white/35">
            Dein Stand: {you.balance > 0 ? '+' : ''}
            {formatChf(you.balance)}
          </p>
        )}
      </div>
    </div>
  )
}

function WaitLine({ name, what }: { name?: string; what: string }) {
  return (
    <p className="text-center text-sm text-white/35">
      {name ? (
        <>
          <span className="text-white/70">{name}</span> {what} …
        </>
      ) : (
        `${what} …`
      )}
    </p>
  )
}

function Settle({ game, onNext }: { game: ClientGame; onNext: () => void }) {
  const s = game.settlement
  if (!s) return null
  const rows = game.players.filter((p) => p.call === 'kratzen' || p.call === 'mitgehen')

  return (
    <Card className="w-full">
      <p className="label-caption mb-3">Abrechnung · Pott {formatChf(s.potBefore)}</p>
      <div className="space-y-1.5">
        {rows.map((p) => {
          const delta = (s.payouts[p.id] ?? 0) - (s.penalties[p.id] ?? 0)
          return (
            <div key={p.id} className="flex items-center justify-between text-sm">
              <span className="truncate">
                {p.name}
                <span className="text-white/30 text-xs">
                  {' '}
                  · {p.call === 'kratzen' ? 'Kratzer' : 'Mit'} · {p.tricks} St
                </span>
              </span>
              <span
                className={`tabular font-heading text-xl ${
                  delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-white/40'
                }`}
              >
                {delta > 0 ? '+' : ''}
                {formatChf(delta)}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
        <span className="label-caption">Neuer Pott</span>
        <span className="font-heading text-2xl text-brand tabular">{formatChf(s.potAfter)}</span>
      </div>
      {game.youId === game.hostId ? (
        <Button variant="primary" size="lg" className="w-full mt-4" onClick={onNext}>
          Nächste Runde
        </Button>
      ) : (
        <p className="text-center text-xs text-white/35 mt-4">Host startet die nächste Runde …</p>
      )}
    </Card>
  )
}
