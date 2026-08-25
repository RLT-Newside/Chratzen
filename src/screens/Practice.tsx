import { GraduationCap, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../components/ui'
import { type Lesson, type LessonId, nextLesson } from '../content/coach'
import { usePractice } from '../hooks/usePractice'
import { Table } from './digital/Table'

/**
 * Übungsrunde mit Coach: ein echter Tisch gegen Bots, aber jemand sagt dir,
 * was gerade passiert. Der Coach meldet sich pro Thema einmal — wer alles
 * kennt, spielt einfach weiter.
 */
export function Practice({ onExit }: { onExit: () => void }) {
  const p = usePractice('Du')
  const [seen, setSeen] = useState<Set<LessonId>>(() => new Set())
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [open, setOpen] = useState(true)

  // Erst die offene Lektion wegklicken, dann die nächste — sonst überholen sich
  // die Einwürfe, sobald mehrere Bedingungen gleichzeitig zutreffen.
  useEffect(() => {
    if (!p.game || lesson) return
    const next = nextLesson(p.game, seen)
    if (next) {
      setLesson(next)
      setOpen(true)
    }
  }, [p.game, lesson, seen])

  const dismiss = () => {
    if (!lesson) return
    setSeen((prev) => new Set(prev).add(lesson.id))
    setLesson(null)
  }

  if (!p.game) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-white/40">
        Übungstisch wird aufgebaut …
      </div>
    )
  }

  return (
    <>
      <Table
        game={p.game}
        onCall={p.call}
        onExchange={p.exchange}
        onSleeper={p.sleeper}
        onPlay={p.play}
        onBlind={p.blind}
        onNext={p.next}
        onKick={p.kick}
        onForce={p.force}
        onSetPause={p.setPause}
        onSetBalances={p.setBalances}
        onLeave={onExit}
      />

      {lesson && (
        <div className="fixed top-0 inset-x-0 z-40 max-w-lg mx-auto px-3 safe-top pointer-events-none">
          <div className="pointer-events-auto glass-elevated rounded-2xl mt-2 shadow-xl shadow-black/40">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="press-scale w-full flex items-center gap-2.5 px-4 pt-3 pb-2 text-left"
            >
              <GraduationCap className="w-4 h-4 text-brand shrink-0" />
              <span className="label-caption text-brand/80">Coach</span>
              {!open && (
                <span className="text-sm text-white/70 truncate ml-1">{lesson.title}</span>
              )}
              <X
                className={`w-4 h-4 text-white/30 ml-auto shrink-0 transition-transform ${
                  open ? '' : 'rotate-45'
                }`}
              />
            </button>

            {open && (
              <div className="px-4 pb-4">
                <p className="font-heading text-2xl tracking-wide leading-none">{lesson.title}</p>
                <div className="text-sm text-white/65 leading-relaxed mt-2.5">{lesson.body}</div>
                <div className="flex gap-2 mt-4">
                  <Button variant="primary" size="md" className="flex-1" onClick={dismiss}>
                    {lesson.cta ?? 'Verstanden'}
                  </Button>
                  {lesson.final && (
                    <Button size="md" className="flex-1" onClick={onExit}>
                      Übung beenden
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {p.error && (
        <div className="fixed bottom-6 inset-x-4 max-w-lg mx-auto z-50 animate-fade-in">
          <div className="rounded-xl bg-red-500/15 border border-red-500/30 backdrop-blur px-4 py-3 text-sm text-red-200 text-center">
            {p.error}
          </div>
        </div>
      )}
    </>
  )
}
