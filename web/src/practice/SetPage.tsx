import * as Dialog from '@radix-ui/react-dialog'
import { ArrowLeft, ArrowRight, BookOpenCheck, Eye, EyeOff, Flag } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { PageError, PageLoading } from '../components/AppShell'
import { CropSheet } from '../components/question-card/CropSheet'
import { SUBJECTS, loadTopic, useResource } from '../content/api'
import type { ExtractedQuestion, Question, TopicFile } from '../content/types'
import { useMediaQuery } from '../lib/media'
import { AnswerPanel } from '../routes/topic/AnswerPanel'
import { AnswerCards } from './AnswerCards'
import { markDone, partIsAnswered, readAnswers, useQuestionAnswers, useSetState } from './answers'
import { MINUTES_PER_MARK, loadQuestion, readSetSpec, setHref, type SetSpec } from './data'
import { PracticeQuestion } from './PracticeQuestion'

/** Loads a set's topic data and extracted questions. Shared with Results. */
export function useSetData(spec: SetSpec | null) {
  return useResource(`set:${spec ? setHref(spec) : 'none'}`, async () => {
    if (!spec) throw new Error('no set')
    const [topic, questions] = await Promise.all([
      loadTopic(spec.subject, spec.topic),
      Promise.all(spec.ids.map((id) => loadQuestion(spec.subject, id))),
    ])
    return { topic, questions }
  })
}

export const setStoreKey = (spec: SetSpec) => `${spec.mode}:${spec.ids.join(',')}`

export function BadSet() {
  return (
    <main id="main">
      <PageError title="This practice set link isn't valid" detail="It may have been cut short when it was copied. Build a new set instead." />
      <p className="mx-auto -mt-10 max-w-[var(--measure)] px-4">
        <Link to="/practice" className="text-ink underline decoration-rule-strong underline-offset-2">
          Build a practice set
        </Link>
      </p>
    </main>
  )
}

export default function SetPage() {
  const [params] = useSearchParams()
  const spec = useMemo(() => readSetSpec(params), [params])
  const data = useSetData(spec)
  if (!spec) return <BadSet />
  if (data.status === 'loading') return <PageLoading label="Loading your practice set" />
  if (data.status === 'error')
    return (
      <main id="main">
        <PageError title="This set didn't load" detail="Check your connection and try again." onRetry={data.retry} />
      </main>
    )
  return <SetScreen spec={spec} topic={data.data.topic} questions={data.data.questions} />
}

function SetScreen({ spec, topic, questions }: { spec: SetSpec; topic: TopicFile; questions: ExtractedQuestion[] }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [set, updateSet] = useSetState(setStoreKey(spec))
  const n = Math.min(questions.length, Math.max(1, Number(params.get('n')) || 1))
  const q = questions[n - 1]
  const meta = topic.questions.find((x) => x.id === q.id)
  const [answers, onAnswer] = useQuestionAnswers(q.id)
  const [activeByQuestion, setActiveByQuestion] = useState<Record<string, string>>({})
  const active = activeByQuestion[q.id] ?? q.parts[0]?.partId ?? ''
  const [view, setView] = useState<'text' | 'scan'>('text')
  const [tab, setTab] = useState<'question' | 'answer'>('question')
  const [checking, setChecking] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const wide = useMediaQuery('(min-width: 64rem)')
  const totalMarks = questions.reduce((sum, x) => sum + (x.marks_total ?? 0), 0)
  const subjectName = SUBJECTS.find((s) => s.code === spec.subject)?.name ?? spec.subject
  const flagged = set.flagged.includes(q.id)

  const go = useCallback(
    (to: number) => {
      const next = new URLSearchParams(params)
      next.set('n', String(to))
      setParams(next, { replace: true })
      setTab('question')
      window.scrollTo({ top: 0 })
    },
    [params, setParams],
  )

  const activate = (partId: string, from: 'question' | 'answer') => {
    setActiveByQuestion((m) => ({ ...m, [q.id]: partId }))
    // Keep the other side in step with where the student is working.
    const selector = from === 'question' ? `#answer-${partId}-title` : `[data-part="${partId}"]`
    requestAnimationFrame(() => document.querySelector(selector)?.scrollIntoView({ block: 'nearest' }))
  }

  const status = questions.map((x) => {
    const a = x.id === q.id ? answers : readAnswers(x.id)
    const done = x.parts.filter((p) => partIsAnswered(a[p.partId])).length
    return { done, total: x.parts.length, flagged: set.flagged.includes(x.id) }
  })
  const unanswered = status.reduce((sum, s) => sum + (s.total - s.done), 0)

  const submit = () => {
    markDone(spec.subject, spec.ids)
    updateSet((s) => ({ ...s, submittedAt: s.submittedAt ?? Date.now() }))
    navigate(setHref(spec, 'results'))
  }
  if (set.submittedAt) return <Navigate to={setHref(spec, 'results')} replace />

  const questionPane = (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-ink px-1.5 font-mono text-sm text-desk">{n}</span>
        <span className="font-mono text-sm">{q.id}</span>
        {meta && (
          <span className="text-sm text-ink-muted">
            {meta.session} {meta.year} · Paper <span className="font-mono">{meta.variant}</span> · Question {meta.question_number}
          </span>
        )}
        <span className="font-mono text-sm">[{q.marks_total}]</span>
        <button
          type="button"
          aria-pressed={flagged}
          onClick={() => updateSet((s) => ({ ...s, flagged: flagged ? s.flagged.filter((id) => id !== q.id) : [...s.flagged, q.id] }))}
          className={`ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm ${flagged ? 'border-mark text-mark' : 'border-rule-strong text-ink hover:bg-paper'}`}
        >
          <Flag size={14} aria-hidden fill={flagged ? 'currentColor' : 'none'} /> {flagged ? 'Flagged' : 'Flag for review'}
        </button>
      </div>
      <div role="group" aria-label="Show the question as" className="inline-flex w-fit rounded-lg bg-rule/60 p-1">
        {(['text', 'scan'] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className={`h-8 rounded-md px-3 text-sm font-medium ${view === v ? 'bg-paper text-ink shadow-sheet' : 'text-ink-muted hover:text-ink'}`}
          >
            {v === 'text' ? 'Text' : 'Original scan'}
          </button>
        ))}
      </div>
      {view === 'text' ? (
        <article className="rounded-[2px] border border-rule bg-paper px-5 py-5 shadow-sheet sm:px-7">
          <PracticeQuestion question={q} answers={answers} onAnswer={onAnswer} active={active} onActivate={(id) => activate(id, 'question')} />
          <p className="m-0 mt-4 border-t border-rule pt-3 font-sans text-xs text-ink-muted">
            Text taken from the paper and checked by hand. Something looks wrong? Switch to Original scan.
          </p>
        </article>
      ) : (
        <div className="flex flex-col gap-3">
          {(meta?.image_paths ?? q.source_images).map((src, i, all) => (
            <CropSheet key={src} src={src} alt={`Original scan of question ${n}, page ${i + 1} of ${all.length}`} sourcePdfUrl={meta?.source_pdf_url ?? ''} sourcePage={meta?.source_pages[i]} />
          ))}
        </div>
      )}
    </div>
  )

  const answerPane = (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="m-0 text-base font-semibold">Your answers</h2>
        <span className="text-xs text-ink-muted">Saved on this device</span>
      </div>
      <SymbolBar />
      <AnswerCards question={q} answers={answers} onAnswer={onAnswer} active={active} onActivate={(id) => activate(id, 'answer')} />
      {spec.mode === 'practice' && meta && (
        <button
          type="button"
          onClick={() => setChecking(true)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-ink bg-paper text-sm font-medium hover:bg-desk"
        >
          <BookOpenCheck size={16} aria-hidden /> Check with the mark scheme
        </button>
      )}
    </div>
  )

  return (
    <div className="flex min-h-dvh flex-col bg-desk text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-paper focus:px-3 focus:py-2">
        Skip to the question
      </a>
      <header className="sticky top-0 z-30 border-b border-rule bg-desk">
        <div className="mx-auto flex h-14 max-w-[100rem] items-center gap-3 px-4 sm:px-6">
          <Link to={`/practice?subject=${spec.subject}&topic=${spec.topic}`} aria-label="Leave the set (your answers stay saved)" className="text-ink-muted hover:text-ink">
            <ArrowLeft size={18} aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 truncate font-serif text-base font-semibold sm:text-lg">{topic.topic.label}</h1>
            <p className="m-0 truncate text-xs text-ink-muted max-sm:hidden">
              {subjectName} {spec.subject} · {spec.mode === 'test' ? 'Test' : 'Practice'} · {questions.length} question{questions.length === 1 ? '' : 's'}
            </p>
          </div>
          {spec.mode === 'test' && <Timer startedAt={set.startedAt} minutes={Math.round(totalMarks * MINUTES_PER_MARK)} />}
          <button type="button" onClick={() => setConfirming(true)} className="h-9 rounded-md border border-ink px-3 text-sm font-medium hover:bg-paper">
            {spec.mode === 'test' ? 'Submit set' : 'Finish'}
          </button>
        </div>
      </header>

      {wide ? (
        <main id="main" className="mx-auto grid w-full max-w-[100rem] flex-1 grid-cols-[minmax(0,1fr)_minmax(24rem,32rem)]">
          <div className="px-6 py-6">{questionPane}</div>
          {/* The answers scroll on their own, so they stay beside the question. */}
          <div className="border-l border-rule">
            <div className="sticky top-14 max-h-[calc(100dvh-3.5rem-4.25rem)] overflow-y-auto overscroll-contain px-6 py-6">{answerPane}</div>
          </div>
        </main>
      ) : (
        <main id="main" className="flex-1 px-4 py-4">
          <div role="tablist" aria-label="Question or answer" className="mb-4 grid grid-cols-2 rounded-lg bg-rule/60 p-1">
            {(['question', 'answer'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`h-9 rounded-md text-sm font-medium ${tab === t ? 'bg-paper text-ink shadow-sheet' : 'text-ink-muted'}`}
              >
                {t === 'question' ? 'Question' : `Answer${q.parts.find((p) => p.partId === active)?.label ? ` ${q.parts.find((p) => p.partId === active)!.label}` : ''}`}
              </button>
            ))}
          </div>
          <div role="tabpanel">{tab === 'question' ? questionPane : answerPane}</div>
        </main>
      )}

      <footer className="sticky bottom-0 z-20 border-t border-rule bg-paper">
        <div className="mx-auto flex max-w-[100rem] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <nav aria-label="Questions in this set" className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {status.map((s, i) => {
              const current = i + 1 === n
              const started = s.done > 0
              return (
                <button
                  key={questions[i].id}
                  type="button"
                  onClick={() => go(i + 1)}
                  aria-current={current ? 'step' : undefined}
                  aria-label={`Question ${i + 1}, ${s.done === s.total ? 'answered' : started ? `${s.done} of ${s.total} parts answered` : 'not started'}${s.flagged ? ', flagged' : ''}`}
                  className={`relative inline-flex h-9 w-9 items-center justify-center rounded-md font-mono text-sm ${
                    current
                      ? 'border-2 border-ink bg-paper'
                      : s.done === s.total
                        ? 'bg-ink text-desk'
                        : started
                          ? 'border-[1.5px] border-ink bg-paper'
                          : 'border-[1.5px] border-dashed border-rule-strong bg-paper'
                  }`}
                >
                  {i + 1}
                  {s.flagged && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-mark" aria-hidden />}
                </button>
              )
            })}
            <span className="ml-2 flex items-center gap-3 text-xs text-ink-muted max-md:hidden" aria-hidden>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm bg-ink" /> Answered
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-rule-strong" /> Not started
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-mark" /> Flagged
              </span>
            </span>
          </nav>
          <div className="flex gap-2">
            <button type="button" onClick={() => go(n - 1)} disabled={n === 1} className="h-10 rounded-lg border border-rule-strong px-4 text-sm disabled:opacity-40">
              Back
            </button>
            {n < questions.length ? (
              <button type="button" onClick={() => go(n + 1)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-medium text-desk">
                Next question <ArrowRight size={16} aria-hidden />
              </button>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className="h-10 rounded-lg bg-ink px-4 text-sm font-medium text-desk">
                {spec.mode === 'test' ? 'Submit set' : 'Finish'}
              </button>
            )}
          </div>
        </div>
      </footer>

      {meta && <AnswerPanel question={checking ? (meta as Question) : null} docked={false} onClose={() => setChecking(false)} />}
      <ConfirmSubmit
        open={confirming}
        onOpenChange={setConfirming}
        onSubmit={submit}
        unanswered={unanswered}
        flagged={set.flagged.length}
        mode={spec.mode}
      />
    </div>
  )
}

function ConfirmSubmit({
  open,
  onOpenChange,
  onSubmit,
  unanswered,
  flagged,
  mode,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
  unanswered: number
  flagged: number
  mode: SetSpec['mode']
}) {
  const notes: ReactNode[] = []
  if (unanswered) notes.push(`${unanswered} part${unanswered === 1 ? '' : 's'} not answered yet.`)
  if (flagged) notes.push(`${flagged} question${flagged === 1 ? '' : 's'} flagged for review.`)
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-paper p-6 text-ink shadow-sheet">
          <Dialog.Title className="m-0 font-serif text-xl font-semibold">{mode === 'test' ? 'Submit this set?' : 'Finish this set?'}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-ink-muted">
            {notes.length ? notes.join(' ') : 'Every part has an answer.'} Next you'll mark your answers against the official mark scheme.
          </Dialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className="h-10 rounded-lg border border-rule-strong px-4 text-sm">Keep going</Dialog.Close>
            <button type="button" onClick={onSubmit} className="h-10 rounded-lg bg-ink px-4 text-sm font-medium text-desk">
              {mode === 'test' ? 'Submit' : 'Finish'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Timer({ startedAt, minutes }: { startedAt: number; minutes: number }) {
  const [now, setNow] = useState(() => Date.now())
  const [shown, setShown] = useState(true)
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  const left = Math.round(minutes * 60 - (now - startedAt) / 1000)
  const abs = Math.abs(left)
  const text = `${left < 0 ? '+' : ''}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`
  return (
    <div className="flex items-center gap-1.5">
      {shown && (
        <span role="timer" aria-label={left < 0 ? `${text} over time` : `${text} left`} className={`font-mono text-lg tabular-nums ${left < 0 ? 'text-mark' : ''}`}>
          {text}
        </span>
      )}
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Hide timer' : 'Show timer'}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:text-ink"
      >
        {shown ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
      </button>
    </div>
  )
}

const SYMBOLS = ['×10', '⁻', '²', '³', 'π', 'ω', 'θ', 'λ', 'Δ', '√', '±', '°', '→', '←']

/** Inserts symbols at the caret of the last answer field used. */
function SymbolBar() {
  const last = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const track = (e: FocusEvent) => {
      const el = e.target
      if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type === 'text')) last.current = el
    }
    document.addEventListener('focusin', track)
    return () => document.removeEventListener('focusin', track)
  }, [])
  const insert = (symbol: string) => {
    const el = last.current
    if (!el || !el.isConnected) return
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? start
    const value = el.value.slice(0, start) + symbol + el.value.slice(end)
    // Set through the native setter so React sees the change.
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.focus()
    el.setSelectionRange(start + symbol.length, start + symbol.length)
  }
  return (
    <div role="toolbar" aria-label="Insert a symbol" className="flex flex-wrap gap-1">
      {SYMBOLS.map((s) => (
        <button
          key={s}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert(s)}
          className="h-8 min-w-8 rounded-md border border-rule bg-paper px-1.5 font-serif text-sm hover:border-rule-strong"
        >
          {s}
        </button>
      ))}
    </div>
  )
}
