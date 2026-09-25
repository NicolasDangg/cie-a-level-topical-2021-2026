import { useMemo } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { AppShell, PageError, PageLoading } from '../components/AppShell'
import { CropSheet } from '../components/question-card/CropSheet'
import { RichText } from '../components/question-text/RichText'
import { SUBJECTS } from '../content/api'
import type { ExtractedPart, ExtractedQuestion, TopicFile } from '../content/types'
import { classicHref } from '../lib/view-choice'
import { partIsAnswered, readAnswers, useSetState, type PartAnswer, type SetState } from './answers'
import { MINUTES_PER_MARK, readSetSpec, setHref, type SetSpec } from './data'
import { DrawingFigure } from './DrawingFigure'
import { drawingTarget } from './parts'
import { BadSet, setStoreKey, useSetData } from './SetPage'

// After a set: each part's answer beside the official mark scheme, marked by
// the student. Phase 5 replaces self-marking with automatic marking.
export default function Results() {
  const [params] = useSearchParams()
  const spec = useMemo(() => readSetSpec(params), [params])
  const data = useSetData(spec)
  return (
    <AppShell crumbs={[{ label: 'Practice sets', to: '/practice' }, { label: 'Results' }]} classicHref={classicHref()}>
      {!spec ? (
        <BadSet />
      ) : data.status === 'loading' ? (
        <PageLoading label="Loading your results" />
      ) : data.status === 'error' ? (
        <main id="main">
          <PageError title="Your results didn't load" detail="Check your connection and try again." onRetry={data.retry} />
        </main>
      ) : (
        <ResultsView spec={spec} topic={data.data.topic} questions={data.data.questions} />
      )}
    </AppShell>
  )
}

const KIND_GROUPS: { label: string; kinds: ExtractedPart['kind'][] }[] = [
  { label: 'Calculations', kinds: ['numeric'] },
  { label: 'Explanations and definitions', kinds: ['written'] },
  { label: 'Code', kinds: ['code'] },
  { label: 'Diagrams, graphs and tables', kinds: ['diagram'] },
]

function ResultsView({ spec, topic, questions }: { spec: SetSpec; topic: TopicFile; questions: ExtractedQuestion[] }) {
  const navigate = useNavigate()
  const [set, updateSet] = useSetState(setStoreKey(spec))
  if (!set.submittedAt) return <Navigate to={setHref(spec)} replace />

  const total = questions.reduce((sum, q) => sum + (q.marks_total ?? 0), 0)
  const partsTotal = questions.reduce((sum, q) => sum + q.parts.length, 0)
  const marked = questions.reduce((sum, q) => sum + q.parts.filter((p) => set.marks[q.id]?.[p.partId] !== undefined).length, 0)
  const awarded = questions.reduce((sum, q) => sum + Object.values(set.marks[q.id] ?? {}).reduce((a, b) => a + b, 0), 0)
  const minutes = Math.max(1, Math.round((set.submittedAt - set.startedAt) / 60000))
  const expected = Math.round(total * MINUTES_PER_MARK)
  const subjectName = SUBJECTS.find((s) => s.code === spec.subject)?.name ?? spec.subject

  const groups = KIND_GROUPS.map((g) => {
    const parts = questions.flatMap((q) => q.parts.filter((p) => g.kinds.includes(p.kind) && set.marks[q.id]?.[p.partId] !== undefined).map((p) => ({ q, p })))
    return { label: g.label, got: parts.reduce((s, { q, p }) => s + (set.marks[q.id]?.[p.partId] ?? 0), 0), of: parts.reduce((s, { p }) => s + p.marks, 0) }
  }).filter((g) => g.of > 0)
  const weakest = groups.length > 1 ? [...groups].sort((a, b) => a.got / a.of - b.got / b.of)[0] : null

  const byQuestion = questions.map((q) => ({
    id: q.id,
    fraction: Object.values(set.marks[q.id] ?? {}).reduce((a, b) => a + b, 0) / Math.max(1, q.marks_total ?? 1),
  }))
  const lowest = [...byQuestion].sort((a, b) => a.fraction - b.fraction).slice(0, 2).map((x) => x.id)

  const setMark = (qid: string, partId: string, value: number) =>
    updateSet((s: SetState) => ({ ...s, marks: { ...s.marks, [qid]: { ...s.marks[qid], [partId]: value } } }))

  return (
    <main id="main" className="mx-auto max-w-[80rem] px-4 pb-16 pt-8 sm:px-6">
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="m-0 text-sm text-ink-muted">
                {topic.topic.label} · {subjectName} {spec.subject} · {spec.mode === 'test' ? 'Test' : 'Practice'} · {questions.length} question
                {questions.length === 1 ? '' : 's'}
              </p>
              <h1 className="m-0 mt-1 font-serif text-3xl font-semibold tracking-tight">Set complete</h1>
            </div>
            <div className="text-right">
              <p className="m-0 font-mono text-mark" aria-label={`${awarded} out of ${total} marks so far`}>
                <span className="text-5xl">{awarded}</span>
                <span className="text-2xl">/{total}</span>
              </p>
              <p className="m-0 text-sm text-ink-muted">
                {marked < partsTotal ? `${marked} of ${partsTotal} parts marked` : `${Math.round((awarded / Math.max(1, total)) * 100)}%`} · {minutes} min of about {expected}
              </p>
            </div>
          </div>
          <p className="mt-6 rounded-md border border-rule bg-paper px-4 py-3 text-sm">
            Mark yourself: compare each answer with the official mark scheme beside it and choose the marks you earned. Automatic marking comes later.
          </p>

          <div className="mt-6 flex flex-col gap-6">
            {questions.map((q, i) => (
              <QuestionResult
                key={q.id}
                number={i + 1}
                question={q}
                meta={topic.questions.find((x) => x.id === q.id)}
                marks={set.marks[q.id] ?? {}}
                onMark={(partId, value) => setMark(q.id, partId, value)}
              />
            ))}
          </div>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
          {groups.length > 0 && (
            <section aria-labelledby="where" className="rounded-lg border border-rule bg-paper p-5 shadow-sheet">
              <h2 id="where" className="m-0 text-base font-semibold">
                Where the marks went
              </h2>
              <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
                {groups.map((g) => (
                  <li key={g.label}>
                    <div className="flex justify-between text-sm">
                      <span>{g.label}</span>
                      <span className="font-mono">
                        {g.got}/{g.of}
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-rule" aria-hidden>
                      <div className="h-2 rounded-full bg-ink" style={{ width: `${(g.got / g.of) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
              {weakest && weakest.got < weakest.of && (
                <p className="m-0 mt-3 text-xs text-ink-muted">You lose the most marks on {weakest.label.toLowerCase()} so far.</p>
              )}
            </section>
          )}
          <section aria-labelledby="next" className="flex flex-col gap-2 rounded-lg border border-rule bg-paper p-5 shadow-sheet">
            <h2 id="next" className="m-0 mb-1 text-base font-semibold">
              Next
            </h2>
            {questions.length > 2 && marked > 0 && (
              <button
                type="button"
                onClick={() => navigate(setHref({ ...spec, ids: lowest }))}
                className="h-11 rounded-lg bg-ink text-sm font-medium text-desk"
              >
                Retry the 2 lowest questions
              </button>
            )}
            <Link
              to={`/practice?subject=${spec.subject}&topic=${spec.topic}`}
              className="flex h-11 items-center justify-center rounded-lg border border-ink text-sm font-medium text-ink no-underline"
            >
              New set from this topic
            </Link>
            <Link to="/practice" className="mt-1 text-center text-sm text-ink-muted underline decoration-rule-strong underline-offset-2">
              Pick another topic
            </Link>
          </section>
        </aside>
      </div>
    </main>
  )
}

function QuestionResult({
  number,
  question: q,
  meta,
  marks,
  onMark,
}: {
  number: number
  question: ExtractedQuestion
  meta: TopicFile['questions'][number] | undefined
  marks: Record<string, number>
  onMark: (partId: string, value: number) => void
}) {
  const answers = readAnswers(q.id)
  const got = Object.values(marks).reduce((a, b) => a + b, 0)
  const ms = meta?.answer
  return (
    <section aria-labelledby={`result-${q.id}`} className="rounded-lg border border-rule bg-paper shadow-sheet">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule px-5 py-3">
        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-ink px-1.5 font-mono text-sm text-desk">{number}</span>
        <h2 id={`result-${q.id}`} className="m-0 font-mono text-sm font-medium">
          {q.id}
        </h2>
        {meta && (
          <span className="text-sm text-ink-muted">
            {meta.session} {meta.year} · Paper {meta.variant} · Q{meta.question_number}
          </span>
        )}
        <span className="ml-auto font-mono text-sm text-mark">
          {got}/{q.marks_total}
        </span>
      </header>
      {/* Stacked, not side by side: the mark scheme needs the full width to be readable. */}
      <div className="flex flex-col gap-5 p-5">
        <ol className="m-0 flex list-none flex-col gap-4 p-0">
          {q.parts.map((part, index) => (
            <li key={part.partId} className="flex flex-col gap-2 border-b border-rule pb-4 last:border-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-sm font-medium">{part.label || 'Answer'}</span>
                <MarkPicker label={part.label || q.id} max={part.marks} value={marks[part.partId]} onChange={(v) => onMark(part.partId, v)} />
              </div>
              <PartAnswerView question={q} index={index} answer={answers[part.partId]} />
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-2">
          <p className="m-0 text-xs font-medium uppercase tracking-wide text-ink-muted">Official mark scheme</p>
          {ms?.status === 'available' ? (
            ms.image_paths.map((src, i) => (
              <CropSheet key={src} src={src} alt={`Official mark scheme for ${q.id}, page ${ms.source_pages[i] ?? i + 1}`} sourcePdfUrl={ms.mark_scheme_url ?? meta?.source_pdf_url ?? ''} sourcePage={ms.source_pages[i]} />
            ))
          ) : (
            <p className="m-0 text-sm text-ink-muted">The official mark scheme for this question isn't available{ms?.reason ? `: ${ms.reason}` : '.'}</p>
          )}
        </div>
      </div>
    </section>
  )
}

/** Marks for one part: one button per possible mark. */
function MarkPicker({ label, max, value, onChange }: { label: string; max: number; value: number | undefined; onChange: (v: number) => void }) {
  return (
    <div role="radiogroup" aria-label={`Marks for ${label}, out of ${max}`} className="flex flex-wrap justify-end gap-1">
      {Array.from({ length: max + 1 }, (_, v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`h-8 min-w-8 rounded-md border px-1.5 font-mono text-sm ${value === v ? 'border-mark bg-mark text-paper' : 'border-rule-strong text-ink hover:bg-desk'}`}
        >
          {v}
        </button>
      ))}
    </div>
  )
}

function PartAnswerView({ question: q, index, answer }: { question: ExtractedQuestion; index: number; answer: PartAnswer | undefined }) {
  const part = q.parts[index]
  if (!partIsAnswered(answer)) return <p className="m-0 text-sm italic text-ink-muted">No answer.</p>
  const target = drawingTarget(q, index)
  const strokes = target ? (answer?.drawings?.[target.id] ?? []) : []
  const pen = 'text-[15px] text-[var(--color-answer)]'
  return (
    <div className="flex flex-col gap-2">
      {part.text.includes('[[blank]]') && (answer?.blanks ?? []).some((b) => b?.trim()) && (
        <div className="font-serif text-[15px]">
          <RichText
            text={part.text}
            figures={[]}
            blank={(i, { line }) => {
              const v = answer?.blanks?.[i]
              return <span className={`gap-answer ${line ? 'blank-line' : ''} ${v ? '' : 'gap-empty'}`}>{v || <span className="sr-only">left blank</span>}</span>
            }}
          />
        </div>
      )}
      {part.slots?.map((slot, i) => (
        <p key={slot} className="m-0 text-sm">
          <span className="text-ink-muted">{slot}: </span>
          <span className={`whitespace-pre-wrap ${pen}`}>{answer?.slots?.[i] || '—'}</span>
        </p>
      ))}
      {answer?.text?.trim() && <p className={`m-0 whitespace-pre-wrap ${part.kind === 'code' ? 'font-mono text-sm' : ''} ${pen}`}>{answer.text}</p>}
      {answer?.final?.trim() && (
        <p className="m-0 text-[15px]">
          {part.answer?.symbol && <i className="font-serif">{part.answer.symbol} = </i>}
          <span className={`font-mono ${pen}`}>{answer.final}</span> {part.answer?.unit}
        </p>
      )}
      {target && strokes.length > 0 && (
        <div className="max-w-md">
          <DrawingFigure figure={target} strokes={strokes} />
        </div>
      )}
    </div>
  )
}
