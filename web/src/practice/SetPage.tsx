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
import { markDone, partIsAnswered, readAnswers, useQuestionAnswers, useSetState } from './answers'
import { MINUTES_PER_MARK, loadQuestion, readSetSpec, setHref, type SetSpec } from './data'
import { InlineAnswer } from './InlineAnswer'
import { drawingTarget, partSummary } from './parts'
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

type Editing = { partId: string | null; focus: boolean }

function SetScreen({ spec, topic, questions }: { spec: SetSpec; topic: TopicFile; questions: ExtractedQuestion[] }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [set, updateSet] = useSetState(setStoreKey(spec))
  const n = Math.min(questions.length, Math.max(1, Number(params.get('n')) || 1))
  const q = questions[n - 1]
  const meta = topic.questions.find((x) => x.id === q.id)
  const [answers, onAnswer] = useQuestionAnswers(q.id)
  const [editingByQuestion, setEditingByQuestion] = useState<Record<string, Editing>>({})
  const [view, setView] = useState<'text' | 'scan'>('text')
  const [checking, setChecking] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const wide = useMediaQuery('(min-width: 64rem)')
  const totalMarks = questions.reduce((sum, x) => sum + (x.marks_total ?? 0), 0)
  const subjectName = SUBJECTS.find((s) => s.code === spec.subject)?.name ?? spec.subject
  const flagged = set.flagged.includes(q.id)
  const leaveHref = `/practice?subject=${spec.subject}&topic=${spec.topic}`

  // A question opens on its first unanswered part, without taking the focus.
  const firstOpen = q.parts.find((p) => !partIsAnswered(answers[p.partId]))?.partId ?? null
  const editing = editingByQuestion[q.id] ?? { partId: firstOpen, focus: false }
  const active = editing.partId ?? ''
  const open = (partId: string | null, focus = true) => setEditingByQuestion((m) => ({ ...m, [q.id]: { partId, focus } }))

  const go = useCallback(
    (to: number) => {
      const next = new URLSearchParams(params)
      next.set('n', String(to))
      setParams(next, { replace: true })
      window.scrollTo({ top: 0 })
      document.getElementById('main')?.scrollTo({ top: 0 })
    },
    [params, setParams],
  )

  const openPart = (partId: string) => {
    open(partId)
    requestAnimationFrame(() => document.querySelector(`[data-part="${partId}"]`)?.scrollIntoView({ block: 'nearest' }))
  }

  const status = questions.map((x) => {
    const a = x.id === q.id ? answers : readAnswers(x.id)
    const done = x.parts.filter((p) => partIsAnswered(a[p.partId])).length
    const marks = x.parts.reduce((sum, p) => sum + (partIsAnswered(a[p.partId]) ? p.marks : 0), 0)
    return { done, total: x.parts.length, marks, flagged: set.flagged.includes(x.id) }
  })
  const unanswered = status.reduce((sum, s) => sum + (s.total - s.done), 0)
  const attempted = status[n - 1].marks

  const toggleFlag = () => updateSet((s) => ({ ...s, flagged: flagged ? s.flagged.filter((id) => id !== q.id) : [...s.flagged, q.id] }))

  const submit = () => {
    markDone(spec.subject, spec.ids)
    updateSet((s) => ({ ...s, submittedAt: s.submittedAt ?? Date.now() }))
    navigate(setHref(spec, 'results'))
  }
  if (set.submittedAt) return <Navigate to={setHref(spec, 'results')} replace />

  const partLabel = (i: number) => q.parts[i]?.label || 'the answer'
  const nextStep = (index: number) =>
    index + 1 < q.parts.length
      ? { label: `Next: ${partLabel(index + 1)}`, run: () => openPart(q.parts[index + 1].partId) }
      : n < questions.length
        ? { label: 'Next question', run: () => go(n + 1) }
        : { label: spec.mode === 'test' ? 'Submit set' : 'Finish', run: () => setConfirming(true) }

  const renderAnswer = (partId: string, index: number) => {
    const part = q.parts[index]
    const step = nextStep(index)
    return (
      <InlineAnswer
        part={part}
        answer={answers[partId] ?? {}}
        onAnswer={(change) => onAnswer(partId, change)}
        editing={editing.partId === partId}
        onEdit={() => open(partId)}
        onDone={() => open(null)}
        onNext={step.run}
        nextLabel={step.label}
        figureCaption={drawingTarget(q, index)?.caption ?? null}
        focus={editing.focus}
        tools={wide ? undefined : <SymbolBar />}
      />
    )
  }

  const sessionLine = meta ? `${meta.session} ${meta.year} · Paper ${meta.variant} · Q${meta.question_number}` : ''

  const document_ = (
    <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-6 px-4 pb-24 pt-6 sm:px-8 lg:px-10 lg:pt-11">
      <header className="flex flex-col gap-3">
        <p className="m-0 font-mono text-xs text-ink-muted">
          {q.id}
          {sessionLine && ` · ${sessionLine}`} · {q.marks_total} marks
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="m-0 mr-auto text-2xl font-semibold tracking-tight">
            Question {n}
            <span className="font-normal text-ink-muted"> of {questions.length}</span>
          </h1>
          <div role="group" aria-label="Show the question as" className="inline-flex rounded-md bg-surface p-0.5">
            {(['text', 'scan'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`h-7 rounded-[5px] px-2.5 text-[13px] ${view === v ? 'bg-paper font-medium text-ink shadow-sheet' : 'text-ink-muted hover:text-ink'}`}
              >
                {v === 'text' ? 'Text' : 'Original scan'}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-pressed={flagged}
            onClick={toggleFlag}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] ${flagged ? 'bg-[color-mix(in_srgb,var(--color-flag)_12%,transparent)] text-flag' : 'text-ink-muted hover:bg-surface hover:text-ink'}`}
          >
            <Flag size={13} aria-hidden fill={flagged ? 'currentColor' : 'none'} /> {flagged ? 'Flagged' : 'Flag'}
          </button>
        </div>
      </header>

      {view === 'text' ? (
        <article aria-label={`Question ${n}`}>
          <PracticeQuestion question={q} answers={answers} onAnswer={onAnswer} active={active} onActivate={(id) => open(id)} renderAnswer={renderAnswer} />
          <p className="m-0 mt-6 border-t border-rule pt-3 text-xs text-ink-muted">
            Text taken from the paper and checked by hand. Something looks wrong? Switch to Original scan.
          </p>
        </article>
      ) : (
        <div className="flex flex-col gap-6">
          {(meta?.image_paths ?? q.source_images).map((src, i, all) => (
            <CropSheet key={src} src={src} alt={`Original scan of question ${n}, page ${i + 1} of ${all.length}`} sourcePdfUrl={meta?.source_pdf_url ?? ''} sourcePage={meta?.source_pages[i]} />
          ))}
          <section aria-labelledby="scan-answers" className="flex flex-col gap-4">
            <h2 id="scan-answers" className="m-0 text-base font-semibold">
              Your answers
            </h2>
            {q.parts.map((p, i) => (
              <div key={p.partId} data-part={p.partId} className="flex flex-col gap-2">
                <p className="m-0 font-mono text-sm font-medium">
                  {p.label || 'Answer'} <span className="font-normal text-ink-muted">[{p.marks}]</span>
                </p>
                {renderAnswer(p.partId, i)}
              </div>
            ))}
          </section>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-rule pt-4" data-print="hide">
        <button type="button" onClick={() => go(n - 1)} disabled={n === 1} className="h-10 rounded-md px-3 text-sm text-ink-muted hover:bg-surface hover:text-ink disabled:opacity-40">
          <ArrowLeft size={15} aria-hidden className="mr-1.5 inline" />
          Previous question
        </button>
        <span className="flex-1" />
        {n < questions.length ? (
          <button type="button" onClick={() => go(n + 1)} className="inline-flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-sm font-medium text-desk hover:opacity-90">
            Next question <ArrowRight size={15} aria-hidden />
          </button>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="h-10 rounded-md bg-ink px-4 text-sm font-medium text-desk hover:opacity-90">
            {spec.mode === 'test' ? 'Submit set' : 'Finish'}
          </button>
        )}
      </div>
    </div>
  )

  const questionList = (
    <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
      {status.map((s, i) => {
        const current = i + 1 === n
        const x = questions[i]
        const m = topic.questions.find((t) => t.id === x.id)
        return (
          <li key={x.id}>
            <button
              type="button"
              onClick={() => go(i + 1)}
              aria-current={current ? 'step' : undefined}
              aria-label={`Question ${i + 1}, ${s.done === s.total ? 'answered' : s.done ? `${s.done} of ${s.total} parts answered` : 'not started'}${s.flagged ? ', flagged' : ''}`}
              className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left ${current ? 'bg-surface font-medium text-ink' : 'text-ink-muted hover:text-ink'}`}
            >
              <span className="truncate">
                {i + 1} · {m ? `${m.session} ${m.year}` : x.id}
                {s.flagged && <Flag size={11} aria-hidden fill="currentColor" className="ml-1.5 inline text-flag" />}
              </span>
              <span className="font-mono text-xs">
                {s.done}/{s.total}
              </span>
            </button>
            {current && (
              <ul className="m-0 flex list-none flex-col gap-px py-1 pl-3 pr-0">
                {q.parts.map((p) => {
                  const on = p.partId === active
                  const done = partIsAnswered(answers[p.partId])
                  return (
                    <li key={p.partId}>
                      <button
                        type="button"
                        onClick={() => openPart(p.partId)}
                        aria-current={on ? 'step' : undefined}
                        className={`grid w-full grid-cols-[8px_4rem_minmax(0,1fr)] items-center gap-1.5 rounded-md px-2 py-1 text-left text-[13px] ${on ? 'bg-accent-tint text-accent' : 'text-ink-muted hover:text-ink'}`}
                      >
                        <span aria-hidden className={`h-[7px] w-[7px] rounded-full ${done ? 'bg-ink' : 'border-[1.5px] border-rule-strong'}`} />
                        <span className="whitespace-nowrap font-mono text-xs">{p.label || "—"}</span>
                        <span className="truncate">{partSummary(p)}</span>
                        <span className="sr-only">{done ? ', answered' : ', not answered'}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </li>
        )
      })}
    </ol>
  )

  const submitLabel = spec.mode === 'test' ? 'Submit set' : 'Finish set'

  if (wide) {
    return (
      <div className="grid h-dvh grid-cols-[15rem_minmax(0,1fr)_15rem] bg-desk text-ink">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-paper focus:px-3 focus:py-2">
          Skip to the question
        </a>
        <nav aria-label="Questions in this set" className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 py-6 text-sm">
          <Link to={leaveHref} className="inline-flex w-fit items-center gap-1.5 text-[13px] text-ink-muted no-underline hover:text-ink">
            <ArrowLeft size={14} aria-hidden /> Leave set
          </Link>
          <div className="px-2">
            <p className="m-0 font-semibold text-ink">{topic.topic.label}</p>
            <p className="m-0 text-xs text-ink-muted">
              {subjectName} · {spec.mode === 'test' ? 'Test' : 'Practice'}
            </p>
          </div>
          {questionList}
        </nav>

        <main id="main" className="min-h-0 overflow-y-auto">
          {document_}
        </main>

        <aside aria-label="Set status" className="flex min-h-0 flex-col gap-5 overflow-y-auto px-5 py-6 text-[13px] text-ink-muted">
          {spec.mode === 'test' && <Timer startedAt={set.startedAt} minutes={Math.round(totalMarks * MINUTES_PER_MARK)} />}
          <div className="flex flex-col gap-1.5">
            <span>
              {attempted} of {q.marks_total} marks attempted
            </span>
            <span aria-hidden className="block h-1 overflow-hidden rounded-full bg-rule">
              <span className="block h-full bg-accent" style={{ width: `${Math.round((attempted / Math.max(1, q.marks_total ?? 1)) * 100)}%` }} />
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-ink">Symbols</span>
            <SymbolBar />
          </div>
          {set.flagged.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink">Flagged to revisit</span>
              {questions.map((x, i) =>
                set.flagged.includes(x.id) ? (
                  <button key={x.id} type="button" onClick={() => go(i + 1)} className="w-fit text-left text-flag hover:underline">
                    Question {i + 1}
                  </button>
                ) : null,
              )}
            </div>
          )}
          {spec.mode === 'practice' && meta && (
            <button type="button" onClick={() => setChecking(true)} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-rule-strong text-sm text-ink hover:bg-surface">
              <BookOpenCheck size={15} aria-hidden /> Check with the mark scheme
            </button>
          )}
          <span className="flex-1" />
          <button type="button" onClick={() => setConfirming(true)} className="h-10 rounded-md bg-ink text-sm font-medium text-desk hover:opacity-90">
            {submitLabel}
          </button>
        </aside>

        {meta && <AnswerPanel question={checking ? (meta as Question) : null} docked={false} onClose={() => setChecking(false)} />}
        <ConfirmSubmit open={confirming} onOpenChange={setConfirming} onSubmit={submit} unanswered={unanswered} flagged={set.flagged.length} mode={spec.mode} />
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-desk text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-paper focus:px-3 focus:py-2">
        Skip to the question
      </a>
      <header className="sticky top-0 z-30 border-b border-rule bg-desk">
        <div className="flex h-14 items-center gap-2 px-2">
          <Link to={leaveHref} aria-label="Leave the set (your answers stay saved)" className="inline-flex h-11 w-11 items-center justify-center text-ink-muted hover:text-ink">
            <ArrowLeft size={18} aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-[15px] font-semibold">{topic.topic.label}</p>
            <p className="m-0 truncate text-xs text-ink-muted">
              {attempted}/{q.marks_total} marks attempted · {spec.mode === 'test' ? 'Test' : 'Practice'}
            </p>
          </div>
          {spec.mode === 'test' && <Timer startedAt={set.startedAt} minutes={Math.round(totalMarks * MINUTES_PER_MARK)} compact />}
          {spec.mode === 'practice' && meta && (
            <button type="button" onClick={() => setChecking(true)} aria-label="Check with the mark scheme" className="inline-flex h-11 w-11 items-center justify-center text-ink-muted hover:text-ink">
              <BookOpenCheck size={18} aria-hidden />
            </button>
          )}
        </div>
      </header>

      <main id="main" className="flex-1">
        {document_}
      </main>

      <footer className="sticky bottom-0 z-20 border-t border-rule bg-desk pb-[env(safe-area-inset-bottom,0px)]">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <nav aria-label="Questions in this set" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {status.map((s, i) => {
              const current = i + 1 === n
              return (
                <button
                  key={questions[i].id}
                  type="button"
                  onClick={() => go(i + 1)}
                  aria-current={current ? 'step' : undefined}
                  aria-label={`Question ${i + 1}, ${s.done === s.total ? 'answered' : s.done ? `${s.done} of ${s.total} parts answered` : 'not started'}${s.flagged ? ', flagged' : ''}`}
                  className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md font-mono text-sm ${
                    current ? 'bg-accent text-desk' : s.done === s.total ? 'bg-ink text-desk' : s.done ? 'border-[1.5px] border-ink' : 'border-[1.5px] border-dashed border-rule-strong'
                  }`}
                >
                  {i + 1}
                  {s.flagged && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-desk bg-flag" aria-hidden />}
                </button>
              )
            })}
          </nav>
          <button type="button" onClick={() => setConfirming(true)} className="h-10 shrink-0 rounded-md bg-ink px-3.5 text-sm font-medium text-desk">
            {submitLabel}
          </button>
        </div>
      </footer>

      {meta && <AnswerPanel question={checking ? (meta as Question) : null} docked={false} onClose={() => setChecking(false)} />}
      <ConfirmSubmit open={confirming} onOpenChange={setConfirming} onSubmit={submit} unanswered={unanswered} flagged={set.flagged.length} mode={spec.mode} />
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
          <Dialog.Title className="m-0 text-xl font-semibold">{mode === 'test' ? 'Submit this set?' : 'Finish this set?'}</Dialog.Title>
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

function Timer({ startedAt, minutes, compact = false }: { startedAt: number; minutes: number; compact?: boolean }) {
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
    <div className="flex items-center gap-2">
      {shown ? (
        <span role="timer" aria-label={left < 0 ? `${text} over time` : `${text} left`} className={`font-mono tabular-nums text-ink ${compact ? 'text-sm' : 'text-xl'} ${left < 0 ? 'text-mark' : ''}`}>
          {text}
        </span>
      ) : (
        !compact && <span className="text-sm">Timer hidden</span>
      )}
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Hide timer' : 'Show timer'}
        className="inline-flex h-8 items-center justify-center gap-1 rounded-md px-1.5 text-xs text-ink-muted hover:bg-surface hover:text-ink"
      >
        {shown ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
        {!compact && (shown ? 'Hide' : 'Show')}
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
          className="h-8 min-w-8 rounded-md bg-surface px-1.5 font-mono text-[13px] text-ink hover:bg-rule"
        >
          {s}
        </button>
      ))}
    </div>
  )
}
