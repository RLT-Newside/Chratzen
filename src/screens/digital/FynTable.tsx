import { HelpCircle, LogOut, Shield, Trophy, UserMinus, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { FynRules } from '../../components/FynRules'
import { CardBack, PlayingCard } from '../../components/PlayingCard'
import { Button, Card } from '../../components/ui'
import { type CardId, cardId } from '../../lib/cards'
import { type FynClientGame, NOBODY } from '../../lib/fyn'
import { PausePicker } from './PausePicker'

const signed = (n: number) => (n > 0 ? `+${n}` : String(n))
const tone = (n: number) => (n > 0 ? 'text-emerald-400' : n < 0 ? 'text-red-400' : 'text-white/40')

export function FynTable({
  game,
  onBid,
  onPlay,
  onNext,
  onKick,
  onForce,
  onSetPause,
  onLeave,
}: {
  game: FynClientGame
  onBid: (bid: number) => void
  onPlay: (id: CardId) => void
  onNext: () => void
  onKick: (playerId: string) => void
  onForce: () => void
  onSetPause: (ms: number) => void
  onLeave: () => void
}) {
  const [manage, setManage] = useState(false)
  const [help, setHelp] = useState(false)

  const you = game.players.find((p) => p.id === game.youId)
  const others = game.players.filter((p) => p.id !== game.youId)
  const active = game.players[game.turn]
  const hand = [...game.hand].sort((a, b) => b.rank - a.rank)
  const canPlay = game.phase === 'play' && game.yourTurn
  const stechen = game.contenders.length > 0 && game.contenders.length < game.players.length
  const done = game.phase === 'settle' || game.phase === 'over'

  return (
    <div className="px-4 pt-4 pb-6 animate-fade-in min-h-screen flex flex-col">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="label-caption">
            Runde {game.round}/{game.rounds} · {game.cardsThisRound}{' '}
            {game.cardsThisRound === 1 ? 'Karte' : 'Karten'}
          </p>
          <p className="font-heading text-5xl text-brand leading-none tabular pot-glow">
            {you?.balance ?? 0}
          </p>
          <p className="text-xs text-white/40 mt-1">
            Deine Punkte
            {you?.bid != null && (
              <span className="text-white/60">
                {' '}
                · Ansage {you.bid} · {you.tricks} St
              </span>
            )}
          </p>
        </div>
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
        <Button variant="ghost" size="sm" onClick={() => setHelp(true)} aria-label="Regeln">
          <HelpCircle className="w-5 h-5" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onLeave} aria-label="Tisch verlassen">
          <LogOut className="w-5 h-5" />
        </Button>
      </div>

      {/* Mitspieler — in der Stirnrunde mit ihrer Karte an der Stirn. */}
      <div className="flex gap-2 overflow-x-auto mt-5 pb-1 -mx-1 px-1">
        {others.map((p) => (
          <div
            key={p.id}
            className={`glass rounded-xl px-3 py-2 shrink-0 min-w-[7rem] ${
              p.id === active?.id && !done ? 'ring-1 ring-brand/60' : ''
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
            <div className="flex items-center gap-1.5 mt-1.5 text-[10px] tabular">
              <span className={tone(p.balance)}>{p.balance} P</span>
              <span className="text-white/35 ml-auto">
                {p.bid == null ? '–' : `${p.tricks}/${p.bid}`} St
              </span>
            </div>
            {p.forehead && (
              <div className="mt-2 flex justify-center">
                <PlayingCard card={p.forehead} size="sm" />
              </div>
            )}
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
        ))}
      </div>

      {manage && (
        <div className="mt-3 glass rounded-xl p-3">
          <PausePicker value={game.trickPauseMs} onChange={onSetPause} compact />
        </div>
      )}

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

      {/* Stich in der Mitte; Karten aus früheren Lagen des Stechens blass. */}
      <div className="flex-1 grid place-items-center py-6 min-h-[9rem]">
        {done ? (
          <Results game={game} onNext={onNext} />
        ) : game.trick.length > 0 ? (
          <div className="flex flex-wrap justify-center gap-2">
            {game.trick.map((t, i) => {
              const p = game.players.find((x) => x.id === t.playerId)
              const wins = game.trickPending === t.playerId && i >= game.layerStart
              return (
                <div key={cardId(t.card)} className="text-center">
                  <div className={wins ? 'ring-2 ring-brand rounded-xl' : ''}>
                    <PlayingCard
                      card={t.card}
                      size="md"
                      dimmed={i < game.layerStart || (!!game.trickPending && !wins)}
                    />
                  </div>
                  <p className={`text-[10px] mt-1 truncate max-w-16 ${wins ? 'text-brand' : 'text-white/40'}`}>
                    {wins ? `${p?.name} sticht` : p?.name}
                  </p>
                </div>
              )
            })}
            {game.trickPending === NOBODY && (
              <p className="w-full text-center text-xs text-white/40">Niemand holt den Stich.</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-white/25">
            {game.phase === 'play' ? 'Bereit zum Ausspielen' : 'Warten auf die Ansagen …'}
          </p>
        )}
      </div>

      {/* Deine Hand — jede Karte ist erlaubt. */}
      {!done && (
        <div className="flex flex-wrap justify-center gap-1.5 pb-4 pt-2">
          {game.forehead ? (
            <div className="text-center">
              <CardBack size="md" />
              <p className="text-[10px] text-white/40 mt-1">an deiner Stirn</p>
            </div>
          ) : (
            hand.map((c) => (
              <PlayingCard
                key={cardId(c)}
                card={c}
                size="md"
                onClick={canPlay ? () => onPlay(cardId(c)) : undefined}
              />
            ))
          )}
        </div>
      )}

      <div className="safe-bottom">
        {game.phase === 'bids' &&
          (game.yourTurn ? (
            <div>
              <p className="text-center text-xs text-white/45 mb-2">
                {game.forehead ? 'Machst du den Stich?' : 'Wie viele Stiche machst du?'}
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {Array.from({ length: game.cardsThisRound + 1 }, (_, k) => (
                  <Button
                    key={k}
                    size="lg"
                    variant={game.legalBids.includes(k) ? 'primary' : 'subtle'}
                    disabled={!game.legalBids.includes(k)}
                    className="min-w-12"
                    onClick={() => onBid(k)}
                  >
                    {k}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <WaitLine name={active?.name} what="sagt an" />
          ))}

        {game.phase === 'play' &&
          (game.yourTurn ? (
            <p className="text-center text-sm text-brand">
              {stechen && !game.contenders.includes(game.youId)
                ? 'Stechen — wirf eine Karte ab'
                : stechen
                  ? 'Stechen — deine Karte!'
                  : 'Du bist am Zug — Karte antippen'}
            </p>
          ) : (
            <WaitLine name={active?.name} what="spielt" />
          ))}
      </div>

      {help && <FynRules onClose={() => setHelp(false)} />}
    </div>
  )
}

function WaitLine({ name, what }: { name?: string; what: string }) {
  return (
    <p className="text-center text-sm text-white/35">
      <span className="text-white/70">{name}</span> {what} …
    </p>
  )
}

/** Abrechnung der Runde — nach der elften als Endstand. */
function Results({ game, onNext }: { game: FynClientGame; onNext: () => void }) {
  const over = game.phase === 'over'
  const rows = [...game.players].sort((a, b) => b.balance - a.balance)

  return (
    <Card className="w-full">
      <p className="label-caption mb-3 flex items-center gap-1.5">
        {over && <Trophy className="w-3.5 h-3.5 text-brand" />}
        {over ? `Endstand — ${rows[0]?.name} gewinnt` : `Runde ${game.round} abgerechnet`}
      </p>
      <div className="space-y-1.5">
        {rows.map((p) => {
          const delta = game.settlement?.[p.id] ?? 0
          return (
            <div key={p.id} className="flex items-center gap-2 text-sm">
              <span className="truncate flex-1">
                {p.name}
                <span className="text-white/30 text-xs">
                  {' '}
                  · {p.bid ?? 0} angesagt · {p.tricks} St
                </span>
              </span>
              <span className={`tabular text-xs ${tone(delta)}`}>{signed(delta)}</span>
              <span className="tabular font-heading text-xl w-12 text-right">{p.balance}</span>
            </div>
          )
        })}
      </div>
      {game.isHost ? (
        <Button variant="primary" size="lg" className="w-full mt-4" onClick={onNext}>
          {over ? 'Neue Partie' : 'Nächste Runde'}
        </Button>
      ) : (
        <p className="text-center text-xs text-white/35 mt-4">
          Host startet {over ? 'eine neue Partie' : 'die nächste Runde'} …
        </p>
      )}
    </Card>
  )
}
