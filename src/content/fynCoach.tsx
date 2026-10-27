/**
 * Coach der FYN-Übungsrunde — wie `coach.tsx`, nur für Fuck Your Neighbour.
 * Meldet sich einmal pro Thema; Stechen und Stirnrunde kommen erst später im
 * Spiel, deshalb hört er nach der ersten Runde nicht ganz auf.
 */
import type { ReactNode } from 'react'
import type { FynClientGame } from '../lib/fyn'
import type { Lesson } from './coach'

export type FynLessonId =
  | 'willkommen'
  | 'ansage'
  | 'geber'
  | 'null'
  | 'spielen'
  | 'stechen'
  | 'stirn'
  | 'abrechnung'
  | 'fertig'

const B = ({ children }: { children: ReactNode }) => (
  <span className="text-white/90 font-medium">{children}</span>
)

/** Grobe Stichschätzung: hohe Karten zählen, mit mehr Gegnern weniger. */
function estimate(game: FynClientGame): number {
  const opponents = game.players.length - 1
  return Math.round(game.hand.reduce((s, c) => s + ((c.rank - 6) / 8) ** opponents, 0))
}

/** Was die anderen schon angesagt haben, und ob du als Letzter dran bist. */
function bidSituation(game: FynClientGame) {
  const others = game.players.filter((p) => p.id !== game.youId)
  const sum = others.reduce((s, p) => s + (p.bid ?? 0), 0)
  const last = others.every((p) => p.bid != null)
  const forbidden = last ? game.cardsThisRound - sum : null
  const blocked =
    forbidden != null && forbidden >= 0 && forbidden <= game.cardsThisRound && !game.legalBids.includes(forbidden)
  return { sum, forbidden, blocked }
}

function settleBody(game: FynClientGame): ReactNode {
  const you = game.players.find((p) => p.id === game.youId)
  const delta = game.settlement?.[game.youId] ?? 0
  if (!you) return null
  if (you.bid === you.tricks) {
    return (
      <>
        Genau getroffen: {you.bid} angesagt, {you.tricks} gemacht — <B>{delta} Punkte</B>.
        {you.bid === 0 && ' Null richtig bringt nichts, kostet aber auch nichts.'}
      </>
    )
  }
  return (
    <>
      Daneben: {you.bid} angesagt, {you.tricks} gemacht. Jeder Stich Abweichung kostet 10 —
      also <B>{delta} Punkte</B>. Zu viele Stiche sind genauso schlecht wie zu wenige.
    </>
  )
}

export function nextFynLesson(game: FynClientGame, seen: Set<string>): Lesson<FynLessonId> | null {
  const others = game.players.filter((p) => p.id !== game.youId).map((p) => p.name)
  const bidTurn = game.phase === 'bids' && game.yourTurn
  const situation = bidSituation(game)
  const stechen = game.contenders.length > 0 && game.contenders.length < game.players.length
  const you = game.players.find((p) => p.id === game.youId)

  const all: Lesson<FynLessonId>[] = [
    {
      id: 'willkommen',
      title: 'Willkommen bei FYN',
      cta: 'Los geht’s',
      body: (
        <>
          Du spielst gegen {others.join(' und ') || 'zwei Bots'}. <B>11 Runden</B>, erst
          sechs Karten, dann jede Runde eine weniger bis auf eine — und wieder hoch. Kein
          Trumpf, keine Farbe bedienen: <B>die höchste Karte holt den Stich</B>.
        </>
      ),
    },
    {
      id: 'ansage',
      title: 'Stiche ansagen',
      cta: 'Verstanden',
      body: (
        <>
          <p>
            Sag an, wie viele Stiche du <B>genau</B> machst. Getroffen gibt 10 pro Stich,
            daneben kostet 10 pro Stich Abweichung — zu viele genauso wie zu wenige.
          </p>
          <p className="mt-2">
            Faustregel: Asse und Könige holen meist einen, kleine Karten fast nie. Deine
            Hand sieht nach etwa <B>{estimate(game)}</B> aus.
          </p>
        </>
      ),
    },
    {
      id: 'geber',
      title: 'Fuck your neighbour',
      cta: 'Verstanden',
      body: (
        <>
          Du sagst als Letzter an. Die anderen haben zusammen {situation.sum} angesagt, es
          gibt {game.cardsThisRound} Stiche — du darfst <B>nicht {situation.forbidden}</B>{' '}
          sagen, sonst ginge die Summe auf. Irgendwer muss danebenliegen; daher der Name.
        </>
      ),
    },
    {
      id: 'null',
      title: 'Nicht zweimal null',
      cta: 'Verstanden',
      body: (
        <>
          Letzte Runde hast du 0 angesagt — <B>zweimal in Folge 0</B> ist verboten. Diesmal
          musst du dich auf mindestens einen Stich festlegen.
        </>
      ),
    },
    {
      id: 'spielen',
      title: 'Ausspielen',
      cta: 'Verstanden',
      body: (
        <>
          Jede Karte ist erlaubt. Brauchst du noch Stiche, leg <B>hoch</B>; hast du genug,
          wirf <B>tief</B> ab, damit dir keiner ungewollt zufällt. Du stehst bei{' '}
          {you?.tricks ?? 0} von {you?.bid ?? 0}.
        </>
      ),
    },
    {
      id: 'stechen',
      title: 'Stechen',
      cta: 'Verstanden',
      body: (
        <>
          Die höchste Karte lag doppelt. Nur diese Spieler spielen nochmals um den Stich —
          alle anderen <B>werfen eine Karte ab</B>, die nicht zählt. Das kostet jeden eine
          Karte, also gibt es diese Runde einen Stich weniger. Ist keine Karte mehr da,
          erbt die höchste Karte, die nur einer gelegt hat.
        </>
      ),
    },
    {
      id: 'stirn',
      title: 'Stirnrunde',
      cta: 'Verstanden',
      body: (
        <>
          Eine Karte, und die hältst du an die Stirn: <B>du siehst nur die der anderen</B>,
          nie deine eigene. Liegt bei den anderen nichts Hohes, stehen deine Chancen gut —
          sag 1. Sitzt drüben ein Ass, eher 0.
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
      title: 'Das war eine Runde',
      cta: 'Weiterspielen',
      final: true,
      body: (
        <>
          Ansagen, spielen, abrechnen — und das elfmal. Ich melde mich nur noch, wenn etwas
          Neues kommt: Stechen oder die Stirnrunde. Die Regeln liegen unter dem Fragezeichen
          oben.
        </>
      ),
    },
  ]

  const fits: Record<FynLessonId, boolean> = {
    willkommen: true,
    ansage: bidTurn && !game.forehead,
    // Nur wenn die Summenregel wirklich greift — in der Stirnrunde kann sie weichen.
    geber: bidTurn && situation.blocked,
    // 0 fehlt, ohne dass die Summenregel schuld ist.
    null: bidTurn && !game.legalBids.includes(0) && situation.forbidden !== 0,
    spielen: game.phase === 'play' && game.yourTurn && !stechen,
    stechen: stechen,
    stirn: game.forehead,
    abrechnung: game.phase === 'settle' && !!game.settlement,
    fertig: game.round > 1,
  }

  return all.find((l) => !seen.has(l.id) && fits[l.id]) ?? null
}
