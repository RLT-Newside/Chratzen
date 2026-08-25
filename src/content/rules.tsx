/**
 * Die Regeln einmal in Prosa — geteilt zwischen Tutorial (`screens/Tutorial`)
 * und der Hilfe im laufenden Spiel (`components/HelpSheet`). Beides zeigt
 * dieselben Abschnitte, nur anders verpackt: das Tutorial führt der Reihe nach
 * durch, die Hilfe klappt den Abschnitt auf, der gerade dran ist.
 */
import type { ReactNode } from 'react'
import { PlayingCard } from '../components/PlayingCard'
import type { Card } from '../lib/cards'
import { RANKS, SUIT_LABEL, SUITS } from '../lib/cards'
import type { GamePhase } from '../lib/game'
import { ANTE_OPTIONS, formatChf } from '../lib/money'
import { TRICKS_PER_ROUND } from '../lib/rules'

export type RuleId =
  | 'ziel'
  | 'karten'
  | 'runde'
  | 'ansagen'
  | 'tausch'
  | 'stechen'
  | 'geld'
  | 'spezial'
  | 'modi'

export type RuleSection = {
  id: RuleId
  title: string
  /** Eine Zeile für Inhaltsverzeichnis und zugeklappte Hilfe. */
  teaser: string
  Body: () => ReactNode
}

/* ---------- Bausteine ---------- */

function P({ children }: { children: ReactNode }) {
  return <p className="text-sm text-white/60 leading-relaxed">{children}</p>
}

function T({ children }: { children: ReactNode }) {
  return <span className="text-white/85 font-medium">{children}</span>
}

function Points({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-sm text-white/60 leading-relaxed">
          <span className="mt-[0.45rem] w-1.5 h-1.5 rounded-full bg-brand/60 shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function Steps({ items }: { items: { title: string; text: ReactNode }[] }) {
  return (
    <ol className="space-y-3">
      {items.map((s, i) => (
        <li key={s.title} className="flex gap-3">
          <span className="shrink-0 w-6 h-6 rounded-lg glass-elevated grid place-items-center font-heading text-brand text-sm leading-none pt-0.5">
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="text-sm text-white/85 font-medium leading-snug">{s.title}</p>
            <p className="text-sm text-white/55 leading-relaxed mt-0.5">{s.text}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="glass rounded-xl px-3.5 py-3 text-sm text-white/60 leading-relaxed border-l-2 border-l-brand/40">
      {children}
    </div>
  )
}

function Rows({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="grid gap-2 px-3 py-2 border-b border-white/10" style={gridCols(head.length)}>
        {head.map((h) => (
          <span key={h} className="label-caption">
            {h}
          </span>
        ))}
      </div>
      {rows.map((r, i) => (
        <div
          key={i}
          className="grid gap-2 px-3 py-2 text-sm text-white/65 border-b border-white/5 last:border-0"
          style={gridCols(head.length)}
        >
          {r.map((cell, j) => (
            <span key={j} className={j === 0 ? 'text-white/85' : ''}>
              {cell}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

const gridCols = (n: number) => ({ gridTemplateColumns: `1.4fr ${'1fr '.repeat(n - 1)}`.trim() })

function Hand({ cards, caption }: { cards: Card[]; caption?: string }) {
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {cards.map((c) => (
          <PlayingCard key={`${c.suit}-${c.rank}`} card={c} size="sm" />
        ))}
      </div>
      {caption && <p className="text-xs text-white/35 mt-2 leading-relaxed">{caption}</p>}
    </div>
  )
}

const card = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank })

/* ---------- Abschnitte ---------- */

export const RULE_SECTIONS: RuleSection[] = [
  {
    id: 'ziel',
    title: 'Worum es geht',
    teaser: 'Stichspiel um einen Pott — angesagt wird, bevor man tauscht.',
    Body: () => (
      <div className="space-y-4">
        <P>
          Chratzen ist ein Schweizer Stichspiel für 2 bis 8 Leute. Jede Runde bekommt jeder{' '}
          <T>{TRICKS_PER_ROUND} Karten</T>, also gibt es {TRICKS_PER_ROUND} Stiche zu holen. Gespielt
          wird um den <T>Pott</T> — das Geld, das vor der Runde in die Mitte gelegt wurde.
        </P>
        <P>
          Der Kern des Spiels: Bevor du tauschst, sagst du an, ob du mitspielst — und
          verpflichtest dich damit auf eine Mindestzahl Stiche.
        </P>
        <Points
          items={[
            <>
              <T>Kratzen</T> — mindestens 2 Stiche. Dafür der doppelte Anteil am Pott.
            </>,
            <>
              <T>Mitgehen</T> — mindestens 1 Stich, einfacher Anteil.
            </>,
            <>
              <T>Weiter</T> — du sitzt die Runde aus. Kein Risiko, kein Geld.
            </>,
          ]}
        />
        <Note>
          Wer sein Soll schafft, holt seinen Anteil. Wer es verfehlt, zahlt <T>Bete</T>: er legt den
          Pott nach — der Kratzer doppelt. Der nächste Pott ist dann grösser, und genau deswegen
          wird es am Tisch schnell mutig.
        </Note>
      </div>
    ),
  },
  {
    id: 'karten',
    title: 'Karten und Trumpf',
    teaser: '36 Jasskarten, 6 bis Ass — Trumpf schlägt jede andere Farbe.',
    Body: () => (
      <div className="space-y-4">
        <P>
          Gespielt wird mit <T>36 Schweizer Jasskarten</T>: vier Farben à neun Werte.
        </P>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/60">
          {SUITS.map((s) => (
            <span key={s}>{SUIT_LABEL[s]}</span>
          ))}
        </div>
        <P>
          Die Werte steigen der Reihe nach: 6, 7, 8, 9, <T>Banner</T> (die 10), Under, Ober, König,{' '}
          <T>Ass</T>. Keine Sonderränge wie im Jass — die Reihenfolge gilt immer.
        </P>
        <Hand
          cards={RANKS.map((r) => card('rosen', r))}
          caption="Rosen von der 6 bis zum Ass — links die schwächste, rechts die stärkste Karte."
        />
        <P>
          Eine Farbe pro Runde ist <T>Trumpf</T>. Jede Trumpfkarte schlägt jede Karte jeder anderen
          Farbe — auch das Ass. Der Trumpf ist die letzte Karte, die der Geber austeilt: sie kommt
          offen auf den Tisch und gehört trotzdem zu seiner Hand.
        </P>
      </div>
    ),
  },
  {
    id: 'runde',
    title: 'Ablauf einer Runde',
    teaser: 'Einlegen, austeilen, ansagen, tauschen, vier Stiche, abrechnen.',
    Body: () => (
      <div className="space-y-4">
        <Steps
          items={[
            {
              title: 'Einlegen',
              text: (
                <>
                  Ist der Pott leer, legen alle den Grundeinsatz ein. Liegt noch Bete aus der
                  letzten Runde drin, wird nicht nachgelegt — dann spielt ihr um das Geld der
                  Verlierer.
                </>
              ),
            },
            {
              title: 'Austeilen',
              text: (
                <>
                  Der Geber teilt einzeln reihum je {TRICKS_PER_ROUND} Karten aus. Seine letzte
                  Karte deckt er auf: sie bestimmt den Trumpf und bleibt seine Karte.
                </>
              ),
            },
            {
              title: 'Ansagen',
              text: <>Reihum: kratzen, mitgehen, weiter — oder «Letzter» und abwarten.</>,
            },
            {
              title: 'Tauschen',
              text: (
                <>
                  Der Kratzer zuerst, dann reihum. 0 bis {TRICKS_PER_ROUND} Karten abwerfen und
                  nachziehen.
                </>
              ),
            },
            {
              title: 'Stechen',
              text: (
                <>
                  Der Kratzer spielt den ersten Stich aus. {TRICKS_PER_ROUND} Stiche, dann ist die
                  Runde durch.
                </>
              ),
            },
            {
              title: 'Abrechnen',
              text: <>Pott verteilen, Bete kassieren — daraus wird der Pott der nächsten Runde.</>,
            },
          ]}
        />
        <Note>
          Wichtig für Neue: <T>angesagt wird vor dem Tauschen</T>. Du verpflichtest dich also auf
          Stiche, ohne zu wissen, was du nachziehst.
        </Note>
      </div>
    ),
  },
  {
    id: 'ansagen',
    title: 'Ansagen',
    teaser: 'Genau einer kratzt. Mitgehen geht erst danach — «Letzter» wartet ab.',
    Body: () => (
      <div className="space-y-4">
        <Points
          items={[
            <>
              <T>Kratzen</T> — du verpflichtest dich auf 2 Stiche. Pro Runde kratzt{' '}
              <T>genau einer</T>; wer nach ihm dran ist, kann nur noch mitgehen oder passen.
            </>,
            <>
              <T>Mitgehen</T> — 1 Stich. Möglich, sobald jemand gekratzt hat: ohne Kratzer gibt es
              niemanden, mit dem man mitgehen könnte.
            </>,
            <>
              <T>Weiter</T> — du bist raus für diese Runde.
            </>,
            <>
              <T>Letzter</T> — ansagbar, solange jemand gekratzt hat und noch niemand mitgegangen
              ist. Du wartest ab, was die anderen tun, und entscheidest zum Schluss. Nur einer pro
              Runde.
            </>,
          ]}
        />
        <Note>
          <T>Zweite Chance:</T> Wer <T>vor</T> dem Kratzer gepasst hat, wird nochmals gefragt — als
          er dran war, stand ja noch kein Kratzer fest. Wer nach dem Kratzer gepasst hat, hatte die
          Wahl bereits.
        </Note>
        <Note>
          <T>Der Letzte wird immer gefragt.</T> Geht bis zu ihm niemand mit, bleibt ihm nur das
          Mitgehen — abwarten hiess ja, im Zweifel einzuspringen. Geht jemand mit, wählt er frei.
        </Note>
        <P>
          Kratzt <T>niemand</T>, wird nicht gespielt: ein neuer Trumpf wird aufgedeckt, bis zu
          dreimal. Hilft das nichts, wird neu gemischt und alle legen nochmals ein.
        </P>
      </div>
    ),
  },
  {
    id: 'tausch',
    title: 'Tauschen',
    teaser: '0 bis 4 Karten weg — die ganze Hand kostet eine Schlafkarte.',
    Body: () => (
      <div className="space-y-4">
        <P>
          Du wirfst 0 bis {TRICKS_PER_ROUND} Karten ab und ziehst gleich viele nach — du landest
          wieder bei {TRICKS_PER_ROUND}.
        </P>
        <P>
          Wer seine <T>ganze Hand</T> tauscht, zieht eine Karte mehr. Vor dem ersten Stich wirft er
          eine davon verdeckt ab: die <T>Schlafkarte</T>. Sie bleibt geheim.
        </P>
        <Rows
          head={['Hand', 'abgeworfen', 'zurück', 'danach']}
          rows={[
            ['4', '2', '2', '4'],
            ['4', '4 (ganze Hand)', '5', '5 → Schlafkarte → 4'],
            ['5 (Blinder)', '3', '2', '4'],
            ['5 (Blinder)', '0', '0', '5 → Schlafkarte → 4'],
          ]}
        />
        <P>Der Kratzer tauscht zuerst, dann geht es reihum weiter.</P>
      </div>
    ),
  },
  {
    id: 'stechen',
    title: 'Stechen',
    teaser: 'Farbe bedienen — Trumpf darfst du trotzdem immer spielen.',
    Body: () => (
      <div className="space-y-4">
        <P>
          Der Kratzer spielt den ersten Stich aus. Danach spielt aus, wer den letzten Stich geholt
          hat.
        </P>
        <Points
          items={[
            <>
              Du hast die angespielte Farbe → du musst <T>bedienen</T>. Stattdessen{' '}
              <T>Trumpf</T> spielen ist aber immer erlaubt.
            </>,
            <>
              Trumpf ist angespielt → nur bedienen, falls du Trumpf hast.
            </>,
            <>Du hast die Farbe nicht → du bist frei und spielst, was du willst.</>,
          ]}
        />
        <P>
          Den Stich holt der <T>höchste Trumpf</T>. Liegt kein Trumpf drin, gewinnt die höchste
          Karte der <T>angespielten</T> Farbe. Karten anderer Farben zählen nicht mit, egal wie hoch
          sie sind.
        </P>
        <Hand
          cards={[card('rosen', 13), card('rosen', 14), card('eichel', 14), card('schellen', 6)]}
          caption="Trumpf ist Schellen: Rosen-König wird angespielt, das Rosen-Ass sticht ihn, das Eichel-Ass zählt nicht mit — und der Schellen-Sechser holt den Stich trotzdem."
        />
        <P>
          Kein Stichzwang: Du musst nicht höher spielen, als was schon liegt, und darfst auch mit
          einem kleinen Trumpf unter einen grossen.
        </P>
      </div>
    ),
  },
  {
    id: 'geld',
    title: 'Geld: Pott, Anteile, Bete',
    teaser: 'Ausgeschüttet wird nach Rolle, nicht nach Stichzahl.',
    Body: () => (
      <div className="space-y-4">
        <P>
          Der <T>Grundeinsatz</T> ist frei wählbar — {ANTE_OPTIONS.map((a) => formatChf(a)).join(' · ')}.
          Alle legen ein, sobald der Pott leer ist.
        </P>
        <P>
          Verteilt wird nach <T>Rolle</T>: der Kratzer bekommt einen doppelten Anteil, jeder
          Mitgeher einen einfachen. Wer sein Soll verfehlt, bekommt nichts. Stiche über dem Minimum
          bringen <T>kein</T> zusätzliches Geld — sie entscheiden nur über geschafft oder Bete.
        </P>
        <Rows
          head={['Runde', 'Ausschüttung']}
          rows={[
            ['Kratzer 2 Stiche, Mitgeher 1', '⅔ : ⅓'],
            ['Kratzer 2, Mitgeher 1, Mitgeher 1', '½ : ¼ : ¼'],
            ['Kratzer 2, Mitgeher 2', '⅔ : ⅓ — trotz gleich vieler Stiche'],
            ['Kratzer 1, Mitgeher 2, Mitgeher 1', '0 : ½ : ½ — Kratzer verfehlt'],
          ]}
        />
        <P>
          <T>Bete</T>: Wer sein Soll verfehlt, legt nach — der Kratzer den <T>doppelten</T> Pott, ein
          Mitgeher ohne Stich den einfachen. Mehrere Verlierer zahlen nebeneinander; zusammen ergeben
          ihre Beträge den Pott der nächsten Runde.
        </P>
        <Rows
          head={['Pott 3.00', 'Bete', 'neuer Pott']}
          rows={[
            ['Kratzer verfehlt', '6.00', '6.00'],
            ['Mitgeher ohne Stich', '3.00', '3.00'],
            ['beide zusammen', '6.00 + 3.00', '9.00'],
          ]}
        />
        <Note>
          Darum ist Kratzen die grosse Ansage: doppelter Anteil, aber auch doppeltes Risiko.
        </Note>
      </div>
    ),
  },
  {
    id: 'spezial',
    title: 'Blinder, Banner, Trumpfwechsel',
    teaser: 'Drei Sonderfälle, die am Tisch regelmässig vorkommen.',
    Body: () => (
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-white/85 font-medium">Blinder</p>
          <P>
            Nur der Geber, und nur direkt nach dem Austeilen: Er kratzt, <T>ohne seine Karten zu
            sehen</T>. Dafür behält er die aufgedeckte Trumpfkarte und bekommt vier frische dazu —
            fünf auf der Hand. Vor dem ersten Stich wirft er eine verdeckt ab. Nach einem
            Trumpfwechsel entfällt das Angebot: da kennt er seine Karten längst.
          </P>
        </div>
        <div className="space-y-2">
          <p className="text-sm text-white/85 font-medium">Bannerrunde</p>
          <P>
            Ist die aufgedeckte Trumpfkarte ein <T>Banner</T> (eine 10), muss der Geber kratzen und
            alle anderen müssen mitgehen — niemand sagt an. Das gilt nur beim{' '}
            <T>Grundpott</T> (Grundeinsatz × Spieler). Liegt schon Bete drauf, wird ganz normal
            angesagt.
          </P>
        </div>
        <div className="space-y-2">
          <p className="text-sm text-white/85 font-medium">Trumpfwechsel</p>
          <P>
            Passen alle, wird ein neuer Trumpf aufgedeckt — bis zu dreimal. Danach wird neu gemischt
            und alle legen nochmals ein. Der Pott wächst, gespielt wurde nichts.
          </P>
        </div>
      </div>
    ),
  },
  {
    id: 'modi',
    title: 'Die zwei Modi der App',
    teaser: 'Companion führt nur die Kasse, Digital spielt das ganze Spiel.',
    Body: () => (
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-white/85 font-medium">Companion</p>
          <P>
            Ihr spielt mit echten Karten am Tisch und sagt selber an. Die App führt nur die Kasse:
            Pro Runde tippt ihr pro Spieler die <T>Rolle</T> (raus / kratzt / mit) und die{' '}
            <T>Stiche</T> ein — zusammen müssen sie {TRICKS_PER_ROUND} ergeben. Ausschüttung, Bete
            und neuer Pott fallen daraus. Braucht keinen Server.
          </P>
        </div>
        <div className="space-y-2">
          <p className="text-sm text-white/85 font-medium">Digital</p>
          <P>
            Virtueller Tisch: Einer eröffnet, die anderen treten mit dem <T>Raumcode</T> bei.
            Austeilen, Tauschen und Stechen macht die App, und sie lässt nur zu, was die Regeln
            erlauben. Wer rausfliegt, kommt per Reconnect zurück an seinen Platz. Zu wenig Leute?
            Der Host setzt in der Lobby Bots dazu.
          </P>
        </div>
        <Note>
          Neu hier? Nimm <T>Digital</T> mit ein paar Bots — die App erlaubt nur regelkonforme Züge,
          da lernst du den Ablauf am schnellsten.
        </Note>
      </div>
    ),
  },
]

export const RULE_BY_ID = Object.fromEntries(RULE_SECTIONS.map((s) => [s.id, s])) as Record<
  RuleId,
  RuleSection
>

/**
 * Welcher Abschnitt gerade hilft — die Hilfe im Spiel öffnet ihn direkt, statt
 * den Neuling im Inhaltsverzeichnis suchen zu lassen.
 */
export const PHASE_HELP: Record<GamePhase, { section: RuleId; hint: string }> = {
  lobby: {
    section: 'runde',
    hint: 'Gleich geht es los: jeder bekommt vier Karten, dann wird angesagt.',
  },
  blind: {
    section: 'spezial',
    hint: 'Der Geber entscheidet, ob er blind kratzt — ohne seine Karten zu sehen.',
  },
  calls: {
    section: 'ansagen',
    hint: 'Kratzen = 2 Stiche, Mitgehen = 1. Angesagt wird vor dem Tauschen.',
  },
  exchange: {
    section: 'tausch',
    hint: 'Karten antippen, die weg sollen — du bekommst gleich viele zurück.',
  },
  sleeper: {
    section: 'tausch',
    hint: 'Ganze Hand getauscht: eine Karte geht verdeckt als Schlafkarte weg.',
  },
  play: {
    section: 'stechen',
    hint: 'Farbe bedienen, Trumpf ist trotzdem immer erlaubt.',
  },
  settle: {
    section: 'geld',
    hint: 'Anteile nach Rolle, Bete für verfehltes Soll — daraus wird der neue Pott.',
  },
}
