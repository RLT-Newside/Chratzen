/**
 * Der Coach der Übungsrunde: kurze Einwürfe, die zur Spielphase passen und
 * sagen, was jetzt zu tun ist. Anders als die Spielhilfe (`HelpSheet`) ist er
 * nicht zum Nachschlagen da — er meldet sich von selbst, einmal pro Thema.
 */
import type { ReactNode } from 'react'
import { RANK_NAME, SUIT_LABEL } from '../lib/cards'
import type { ClientGame } from '../lib/game'
import { formatChf } from '../lib/money'

export type LessonId =
  | 'willkommen'
  | 'blind'
  | 'ansagen'
  | 'tausch'
  | 'schlafkarte'
  | 'stechen'
  | 'abrechnung'
  | 'fertig'

export type Lesson = {
  id: LessonId
  title: string
  body: ReactNode
  /** Beschriftung des Wegklick-Knopfs. */
  cta?: string
  /** Letzte Lektion: die Übung ist durchgespielt. */
  final?: boolean
}

const B = ({ children }: { children: ReactNode }) => (
  <span className="text-white/90 font-medium">{children}</span>
)

/** Wie stark ist die Hand? Grob, aber genug für einen ersten Rat. */
function assess(game: ClientGame) {
  const trumpSuit = game.trump?.suit ?? null
  const trumps = game.hand.filter((c) => c.suit === trumpSuit)
  const highTrumps = trumps.filter((c) => c.rank >= 12).length
  const aces = game.hand.filter((c) => c.suit !== trumpSuit && c.rank === 14).length

  const score = trumps.length + highTrumps + aces
  return {
    trumps: trumps.length,
    highTrumps,
    aces,
    advice:
      score >= 4
        ? ('kratzen' as const)
        : score >= 2
          ? ('mitgehen' as const)
          : ('weiter' as const),
  }
}

function callAdvice(game: ClientGame): ReactNode {
  const { trumps, highTrumps, aces, advice } = assess(game)
  const trumpName = game.trump ? SUIT_LABEL[game.trump.suit] : 'Trumpf'

  const bestand = [
    trumps > 0 ? `${trumps}× ${trumpName}` : `kein ${trumpName}`,
    highTrumps > 0 ? `davon ${highTrumps} hoch` : null,
    aces > 0 ? `${aces} Ass ausserhalb` : null,
  ]
    .filter(Boolean)
    .join(', ')

  if (advice === 'kratzen') {
    return (
      <>
        Deine Hand: {bestand}. Das reicht für zwei Stiche — <B>Kratzen</B> ist hier die
        Ansage. Du bekommst dann den doppelten Anteil am Pott.
      </>
    )
  }
  if (advice === 'mitgehen') {
    return (
      <>
        Deine Hand: {bestand}. Für zwei Stiche ist das dünn, für einen reicht es meist —{' '}
        <B>Mitgehen</B>, sobald jemand gekratzt hat. Kratzt niemand, kannst du selber
        kratzen oder passen.
      </>
    )
  }
  return (
    <>
      Deine Hand: {bestand}. Damit holst du selten einen Stich — <B>Weiter</B> kostet dich
      nichts. Passen ist kein Versagen, sondern die häufigste Ansage am Tisch.
    </>
  )
}

function settleBody(game: ClientGame): ReactNode {
  const s = game.settlement
  const you = game.players.find((p) => p.id === game.youId)
  if (!s || !you) return null

  const payout = s.payouts[you.id] ?? 0
  const penalty = s.penalties[you.id] ?? 0

  if (payout > 0) {
    return (
      <>
        Du hast dein Soll geschafft und bekommst <B>{formatChf(payout)}</B> aus dem Pott.
        Der Kratzer zählt dabei doppelt — mehr Stiche als nötig bringen kein zusätzliches
        Geld.
      </>
    )
  }
  if (penalty > 0) {
    return (
      <>
        Du hast dein Soll verfehlt: <B>Bete</B>. Du legst {formatChf(penalty)} nach — als
        Kratzer wäre es der doppelte Pott, als Mitgeher der einfache. Genau dieses Geld
        liegt in der nächsten Runde in der Mitte.
      </>
    )
  }
  return (
    <>
      Du warst diese Runde draussen: kein Anteil, aber auch kein Risiko. Der Pott geht an
      die, die angesagt und geliefert haben.
    </>
  )
}

/**
 * Nächste passende Lektion — oder nichts, wenn zur Lage schon alles gesagt ist.
 * Die Reihenfolge ist die Prüfreihenfolge: die erste ungesehene, deren Lage
 * zutrifft, gewinnt.
 */
export function nextLesson(game: ClientGame, seen: Set<LessonId>): Lesson | null {
  const others = game.players.filter((p) => p.id !== game.youId).map((p) => p.name)

  const all: Lesson[] = [
    {
      id: 'willkommen',
      title: 'Willkommen am Übungstisch',
      cta: 'Los geht’s',
      body: (
        <>
          Du spielst gegen {others.join(' und ') || 'zwei Bots'}. Es ist eine echte Partie
          mit den echten Regeln — nur ohne echtes Geld. Jeder hat <B>vier Karten</B>, also
          gibt es vier Stiche. Ich melde mich, wenn du dran bist.
        </>
      ),
    },
    {
      id: 'blind',
      title: 'Der Blinde',
      cta: 'Verstanden',
      body: (
        <>
          Du hast ausgeteilt und siehst nur den Trumpf. Jetzt könntest du <B>blind kratzen</B>:
          ohne deine Karten zu kennen, dafür mit der Trumpfkarte und vier frischen. Mutig —
          für die erste Runde nimm ruhig <B>Karten anschauen</B>.
        </>
      ),
    },
    {
      id: 'ansagen',
      title: 'Jetzt wird angesagt',
      cta: 'Verstanden',
      body: (
        <>
          <p>
            Trumpf ist{' '}
            <B>
              {game.trump ? `${RANK_NAME[game.trump.rank]} ${SUIT_LABEL[game.trump.suit]}` : '—'}
            </B>
            . Jede Trumpfkarte schlägt jede Karte anderer Farben.
          </p>
          <p className="mt-2">
            <B>Kratzen</B> = 2 Stiche, <B>Mitgehen</B> = 1 Stich, <B>Weiter</B> = aussetzen.
            Wer sein Soll verfehlt, zahlt Bete.
          </p>
          <p className="mt-2">{callAdvice(game)}</p>
        </>
      ),
    },
    {
      id: 'tausch',
      title: 'Tauschen',
      cta: 'Verstanden',
      body: (
        <>
          Tippe die Karten an, die weg sollen — du bekommst gleich viele zurück. Nichts
          antippen geht auch. Faustregel: kleine Karten in Nicht-Trumpf-Farben sind das
          erste, was man wegwirft.
        </>
      ),
    },
    {
      id: 'schlafkarte',
      title: 'Schlafkarte',
      cta: 'Verstanden',
      body: (
        <>
          Du hast die ganze Hand getauscht und dafür eine Karte mehr gezogen. Eine davon
          geht jetzt verdeckt weg — sie <B>schläft</B> und spielt nicht mit. Wirf weg, was
          am wenigsten sticht.
        </>
      ),
    },
    {
      id: 'stechen',
      title: 'Ausspielen und stechen',
      cta: 'Verstanden',
      body: (
        <>
          <p>
            Du musst die angespielte Farbe <B>bedienen</B>, wenn du sie hast — Trumpf darfst
            du aber immer spielen. Hast du die Farbe nicht, bist du frei.
          </p>
          <p className="mt-2">
            Die App macht es dir leicht: Karten, die gerade nicht erlaubt sind, sind
            abgedunkelt und reagieren nicht.
          </p>
        </>
      ),
    },
    {
      id: 'abrechnung',
      title: 'Abrechnung',
      cta: 'Verstanden',
      body: settleBody(game),
    },
    {
      id: 'fertig',
      title: 'Das war der ganze Ablauf',
      cta: 'Weiterspielen',
      final: true,
      body: (
        <>
          Ansagen, tauschen, vier Stiche, abrechnen — mehr ist es nicht. Spiel so lange
          weiter, wie du magst; ich halte jetzt den Mund. Am echten Tisch findest du alles
          davon wieder unter dem Fragezeichen oben.
        </>
      ),
    },
  ]

  const fits: Record<LessonId, boolean> = {
    willkommen: true,
    blind: game.blindOffer,
    ansagen: game.phase === 'calls' && game.yourTurn,
    tausch: game.phase === 'exchange' && game.yourTurn,
    schlafkarte: game.mustDiscardSleeper,
    stechen: game.phase === 'play' && game.yourTurn,
    abrechnung: game.phase === 'settle' && !!game.settlement,
    // Erst wenn der Spieler selbst weitergeklickt hat — die Runde ist dann durch.
    fertig: game.round > 1,
  }

  return all.find((l) => !seen.has(l.id) && fits[l.id]) ?? null
}
