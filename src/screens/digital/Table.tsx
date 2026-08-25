import { HelpCircle, LogOut, Shield, UserMinus, UserPlus, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { HelpSheet } from '../../components/HelpSheet'
import { CardBack, PlayingCard } from '../../components/PlayingCard'
import { Button, Card, SectionTitle, Segmented } from '../../components/ui'
import { PHASE_HELP } from '../../content/rules'
import { type CardId, RANK_NAME, cardId, sortHand } from '../../lib/cards'
import type { ClientGame } from '../../lib/game'
import { formatChf } from '../../lib/money'
import { type Call, drawCount } from '../../lib/rules'
import { Kasse } from './Kasse'
import { PausePicker } from './PausePicker'

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
  onBlind,
  onNext,
  onKick,
  onForce,
  onSetPause,
  onSetBalances,
  onLeave,
}: {
  game: ClientGame
  onCall: (c: Call) => void
  onExchange: (ids: CardId[]) => void
  onSleeper: (id: CardId) => void
  onPlay: (id: CardId) => void
  onBlind: (take: boolean) => void
  onNext: () => void
  onKick: (playerId: string) => void
  onForce: () => void
  onSetPause: (ms: number) => void
  onSetBalances: (show: boolean) => void
  onLeave: () => void
}) {
  const [selected, setSelected] = useState<CardId[]>([])
  const [manage, setManage] = useState(false)
  const [kasse, setKasse] = useState(false)
  const [help, setHelp] = useState(false)

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
  // "Letzter" lohnt sich nur, solange offen ist, ob jemand mitgeht.
  const canLetzter =
    hasKratzer && !others.some((p) => p.call === 'mitgehen' || p.call === 'letzter')

  return (
    <div className="px-4 pt-4 pb-6 animate-fade-in min-h-screen flex flex-col">
      {/* Pott, Trumpf, Runde */}
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="label-caption">Pott · Runde {game.round}</p>
          <p className="font-heading text-5xl text-brand leading-none tabular pot-glow">
            {formatChf(game.pot)}
          </p>
          {/* Der eigene Stand ist immer sichtbar — er ist der Grund, warum man spielt. */}
          <button
            type="button"
            onClick={() => setKasse(true)}
            className="press-scale mt-1 flex items-center gap-1.5 text-xs"
          >
            <Wallet className="w-3.5 h-3.5 text-white/30" />
            <span className="text-white/40">Dein Stand</span>
            <span
              className={`tabular font-medium ${
                (you?.balance ?? 0) > 0
                  ? 'text-emerald-400'
                  : (you?.balance ?? 0) < 0
                    ? 'text-red-400'
                    : 'text-white/40'
              }`}
            >
              {(you?.balance ?? 0) > 0 ? '+' : ''}
              {formatChf(you?.balance ?? 0)}
            </span>
          </button>
        </div>
        {game.trump && (
          <div className="text-center">
            <p className="label-caption mb-1">Trumpf</p>
            <PlayingCard card={game.trump} size="md" />
            {/* Normalerweise liegt die Trumpfkarte auf dem Tisch. Nur der
                Blinde nimmt sie in die Hand — das gehört angeschrieben. */}
            {game.trumpInHand && (
              <p className="text-[10px] text-brand/60 mt-1">
                {game.dealerIndex === game.players.findIndex((p) => p.id === game.youId)
                  ? 'bei dir'
                  : `bei ${game.players[game.dealerIndex]?.name}`}
              </p>
            )}
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
        {/* Die Hilfe kennt die Phase — sie öffnet direkt beim passenden Kapitel,
            statt Neulinge im Regelwerk suchen zu lassen. */}
        <Button variant="ghost" size="sm" onClick={() => setHelp(true)} aria-label="Regeln und Hilfe">
          <HelpCircle className="w-5 h-5" />
        </Button>
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

      {manage && (
        <div className="mt-3 glass rounded-xl p-3 space-y-4">
          <PausePicker value={game.trickPauseMs} onChange={onSetPause} compact />
          <div>
            <SectionTitle>Kontostände</SectionTitle>
            <Segmented
              value={game.showBalances ? 'alle' : 'eigener'}
              options={[
                { value: 'eigener', label: 'Nur eigener' },
                { value: 'alle', label: 'Alle sehen alles' },
              ]}
              onChange={(v) => onSetBalances(v === 'alle')}
            />
          </div>
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

      {/* Stich in der Mitte */}
      <div className="flex-1 grid place-items-center py-6 min-h-[9rem]">
        {game.trick.length > 0 ? (
          <div className="flex gap-2">
            {game.trick.map((t) => {
              const p = game.players.find((x) => x.id === t.playerId)
              const wins = game.trickPending === t.playerId
              return (
                <div key={cardId(t.card)} className="text-center">
                  <div className={wins ? 'ring-2 ring-brand rounded-xl' : ''}>
                    <PlayingCard card={t.card} size="md" dimmed={!!game.trickPending && !wins} />
                  </div>
                  <p
                    className={`text-[10px] mt-1 truncate max-w-16 ${
                      wins ? 'text-brand' : 'text-white/40'
                    }`}
                  >
                    {wins ? `${p?.name} sticht` : p?.name}
                  </p>
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
          {game.blindOffer ? (
            // Verdeckt, weil der Geber sie noch nicht sehen darf.
            [0, 1, 2, 3].map((i) => <CardBack key={i} size="md" />)
          ) : (
            <>
              <CardBack />
              <CardBack />
            </>
          )}
        </div>
      )}

      {/* Aktionsleiste */}
      <div className="safe-bottom">
        {game.phase === 'blind' &&
          (game.blindOffer ? (
            <div>
              <p className="text-center text-xs text-white/50 leading-relaxed mb-3">
                Du hast ausgeteilt und nur den Trumpf gesehen. Beim Blinden kratzt du,
                ohne deine Karten zu kennen — dafür bekommst du den{' '}
                {RANK_NAME[game.trump?.rank ?? 6]} vom Tisch und vier frische dazu. Deine
                ausgeteilten Karten gehen ungesehen weg. Mit fünf auf der Hand frisst der
                Tausch die überzählige: wirfst du drei ab, kommen zwei zurück.
              </p>
              <div className="flex gap-2">
                <Button size="lg" className="flex-1" onClick={() => onBlind(false)}>
                  Karten anschauen
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  className="flex-1"
                  onClick={() => onBlind(true)}
                >
                  Blinden machen
                </Button>
              </div>
            </div>
          ) : (
            <WaitLine name={active?.name} what="überlegt sich einen Blinden" />
          ))}

        {game.phase === 'calls' &&
          (game.yourTurn ? (
            <div className="grid grid-cols-4 gap-1.5">
              {game.awaitLetzter ? (
                <>
                  <p className="col-span-4 text-center text-xs text-white/45 mb-1">
                    {game.letzterForced
                      ? 'Du warst Letzter und sonst geht niemand mit — du musst.'
                      : 'Du warst Letzter — jetzt entscheiden.'}
                  </p>
                  <Button
                    variant="primary"
                    className={game.letzterForced ? 'col-span-4' : 'col-span-2'}
                    onClick={() => onCall('mitgehen')}
                  >
                    Mitgehen
                  </Button>
                  {!game.letzterForced && (
                    <Button className="col-span-2" onClick={() => onCall('weiter')}>
                      Passen
                    </Button>
                  )}
                </>
              ) : game.secondChance ? (
                <>
                  <p className="col-span-4 text-center text-xs text-white/45 mb-1">
                    {game.players.find((p) => p.call === 'kratzen')?.name} kratzt. Gehst du
                    doch mit?
                  </p>
                  {/* Solange niemand mitgegangen ist, steht auch hier "Letzter" offen. */}
                  <Button variant="primary" className="col-span-2" onClick={() => onCall('mitgehen')}>
                    Mitgehen
                  </Button>
                  {canLetzter && (
                    <Button onClick={() => onCall('letzter')}>Letzter</Button>
                  )}
                  <Button className={canLetzter ? '' : 'col-span-2'} onClick={() => onCall('weiter')}>
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
                  <Button disabled={!canLetzter} onClick={() => onCall('letzter')}>
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
                ? hand.length > 4
                  ? 'Nichts tauschen — dann eine abwerfen'
                  : 'Keine Karten tauschen'
                : `${selected.length} weg, ${drawCount(hand.length, selected.length)} neu`}
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
      {kasse && <Kasse game={game} onClose={() => setKasse(false)} />}
      {help && (
        <HelpSheet
          initial={PHASE_HELP[game.phase].section}
          hint={PHASE_HELP[game.phase].hint}
          onClose={() => setHelp(false)}
        />
      )}
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
