import { Check, CircleDashed, FileWarning, Pencil, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { ThemeMenu } from '../../components/ThemeMenu'
import { CropSheet } from '../../components/question-card/CropSheet'
import { QuestionText } from '../../components/question-text/QuestionText'
import { SUBJECTS, isSubject, loadSubject, loadTopic, useResource } from '../../content/api'
import type { ExtractedQuestion, Question } from '../../content/types'
import { FigureBoxes, type Box } from './FigureBoxes'

// Dev-only review of extracted questions: the scan beside its extraction.
// Saving goes through the dev server's /__dev/questions endpoint.

type Loaded = ExtractedQuestion | null | undefined // undefined: loading, null: not extracted

async function fetchExtracted(subject: string, id: string): Promise<ExtractedQuestion | null> {
  const res = await fetch(`/content/${subject}/questions/${id}.json`, { cache: 'no-store' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function save(subject: string, doc: ExtractedQuestion): Promise<{ ok: boolean; doc?: ExtractedQuestion; error?: string }> {
  const body = { ...doc }
  delete body.problems
  delete body.warnings
  const res = await fetch(`/__dev/questions/${subject}/${doc.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
  // Saved, but maybe not as asked: approval is refused while problems remain.
  if (res.ok) return { ok: data.status === doc.status, doc: data }
  return { ok: false, error: data.error ?? `HTTP ${res.status}` }
}

export default function Review() {
  const { subject = '', topicSlug } = useParams()
  if (!isSubject(subject) || !topicSlug) return <ReviewIndex />
  return <ReviewTopic key={`${subject}/${topicSlug}`} subject={subject} slug={topicSlug} />
}

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-desk text-ink">
      <header className="flex h-14 items-center gap-3 border-b border-rule px-5">
        <Link to="/dev/review" className="text-lg font-semibold text-ink no-underline">
          Review extractions
        </Link>
        <span className="truncate text-sm text-ink-muted">{title}</span>
        <span className="ml-auto">
          <ThemeMenu />
        </span>
      </header>
      {children}
    </div>
  )
}

type TopicState = { subject: string; slug: string; label: string; draft: number; problems: number; reviewed: number; rejected: number; none: number }

function useReviewSummary() {
  const [topics, setTopics] = useState<TopicState[] | null>(null)
  useEffect(() => {
    let live = true
    fetch('/__dev/review-summary', { cache: 'no-store' })
      .then((res) => res.json() as Promise<{ topics: TopicState[] }>)
      .then((data) => live && setTopics(data.topics))
      .catch(() => live && setTopics([]))
    return () => {
      live = false
    }
  }, [])
  return topics
}

function ReviewIndex() {
  const summary = useReviewSummary()
  const toReview = summary?.filter((t) => t.draft > 0) ?? []
  const bySlug = new Map(summary?.map((t) => [t.slug, t]))
  return (
    <Frame title="Pick a topic">
      <main id="main" className="mx-auto max-w-5xl px-5 py-8">
        <section aria-labelledby="to-review" className="mb-8 rounded-md border border-rule-strong bg-paper px-5 py-4">
          <h2 id="to-review" className="m-0 mb-2 text-lg font-semibold">
            To review
          </h2>
          {summary === null ? (
            <p className="m-0 text-sm text-ink-muted">Loading…</p>
          ) : toReview.length === 0 ? (
            <p className="m-0 text-sm text-ink-muted">Nothing waiting. Extract more questions to review them here.</p>
          ) : (
            <ul className="m-0 list-none space-y-1.5 p-0 text-sm">
              {toReview.map((t) => (
                <li key={t.slug} className="flex flex-wrap items-baseline gap-x-2">
                  <Link to={`/dev/review/${t.subject}/${t.slug}`} className="font-medium text-ink underline decoration-rule-strong underline-offset-2">
                    <span className="font-mono text-ink-muted">{t.subject}</span> {t.label}
                  </Link>
                  <span className="text-ink-muted">
                    {t.draft} draft{t.draft === 1 ? '' : 's'}
                    {t.problems > 0 && ` (${t.problems} with problems)`}
                    {t.reviewed > 0 && ` · ${t.reviewed} reviewed`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="grid gap-8 sm:grid-cols-3">
          {SUBJECTS.map((s) => (
            <SubjectTopics key={s.code} code={s.code} name={s.name} states={bySlug} />
          ))}
        </div>
      </main>
    </Frame>
  )
}

function SubjectTopics({ code, name, states }: { code: string; name: string; states: Map<string, TopicState> }) {
  const index = useResource(`subject:${code}`, () => loadSubject(code))
  return (
    <section>
      <h2 className="m-0 mb-2 text-sm font-semibold">
        <span className="font-mono text-ink-muted">{code}</span> {name}
      </h2>
      {index.status === 'ready' && (
        <ul className="m-0 list-none space-y-1 p-0 text-sm">
          {index.data.topics.map((t) => (
            <li key={t.slug}>
              <Link to={`/dev/review/${code}/${t.slug}`} className="text-ink underline decoration-rule-strong underline-offset-2">
                {t.label}
              </Link>{' '}
              <span className="text-ink-muted">({t.distinct_count})</span> <TopicProgress state={states.get(t.slug)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** "3 to review · 5 ✓" after a topic in the subject lists. */
function TopicProgress({ state }: { state?: TopicState }) {
  const parts = [state?.draft && `${state.draft} to review`, state?.reviewed && `${state.reviewed} reviewed`].filter(Boolean)
  if (!state || parts.length === 0) return null
  return <span className={`text-xs ${state.draft > 0 ? 'font-medium text-mark' : 'text-ink-muted'}`}>· {parts.join(' · ')}</span>
}

function ReviewTopic({ subject, slug }: { subject: string; slug: string }) {
  const topic = useResource(`topic:${subject}/${slug}`, () => loadTopic(subject, slug))
  const [params, setParams] = useSearchParams()
  const questions = useMemo(
    () => (topic.status === 'ready' ? topic.data.questions.filter((q) => q.duplicate_of === null) : []),
    [topic],
  )
  const [docs, setDocs] = useState<Record<string, Loaded>>({})

  useEffect(() => {
    let live = true
    // Ask which files exist first, so questions not yet extracted cost no request.
    fetch(`/__dev/questions/${subject}`)
      .then((res) => res.json() as Promise<{ ids: string[] }>)
      .then(({ ids }) => {
        const extracted = new Set(ids)
        for (const q of questions) {
          if (!extracted.has(q.id)) {
            if (live) setDocs((d) => ({ ...d, [q.id]: null }))
            continue
          }
          fetchExtracted(subject, q.id).then(
            (doc) => live && setDocs((d) => ({ ...d, [q.id]: doc })),
            () => live && setDocs((d) => ({ ...d, [q.id]: null })),
          )
        }
      })
    return () => {
      live = false
    }
  }, [questions, subject])

  const currentId = params.get('q') ?? questions[0]?.id
  const index = Math.max(0, questions.findIndex((q) => q.id === currentId))
  const current = questions[index]
  const go = useCallback(
    (delta: number) => {
      const next = questions[Math.min(questions.length - 1, Math.max(0, index + delta))]
      if (next) setParams({ q: next.id }, { replace: true })
    },
    [questions, index, setParams],
  )

  const counts = questions.reduce<Record<string, number>>((acc, q) => {
    const d = docs[q.id]
    const key = d === undefined ? 'loading' : d === null ? 'not extracted' : d.status
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  return (
    <Frame title={topic.status === 'ready' ? `${subject} · ${topic.data.topic.label}` : subject}>
      {topic.status === 'ready' && current && (
        <div className="grid min-h-[calc(100dvh-3.5rem)] grid-cols-[16rem_minmax(0,1fr)]">
          <nav aria-label="Questions" className="border-r border-rule px-3 py-4">
            <p className="m-0 mb-3 px-2 text-xs text-ink-muted">
              {Object.entries(counts)
                .map(([k, n]) => `${n} ${k}`)
                .join(' · ')}
            </p>
            <ul className="m-0 list-none space-y-0.5 p-0">
              {questions.map((q, i) => (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => setParams({ q: q.id }, { replace: true })}
                    aria-current={i === index ? 'true' : undefined}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left font-mono text-[13px] ${
                      i === index ? 'bg-paper shadow-sheet' : 'hover:bg-paper'
                    }`}
                  >
                    {q.id}
                    <StatusChip doc={docs[q.id]} />
                  </button>
                </li>
              ))}
            </ul>
            <p className="m-0 mt-4 px-2 text-xs leading-relaxed text-ink-muted">
              Keys: <kbd>J</kbd>/<kbd>K</kbd> next/previous, <kbd>A</kbd> approve, <kbd>R</kbd> reject, <kbd>D</kbd> back to draft,{' '}
              <kbd>E</kbd> edit.
            </p>
          </nav>
          <QuestionReview
            key={current.id}
            subject={subject}
            question={current}
            doc={docs[current.id]}
            onSaved={(doc) => setDocs((d) => ({ ...d, [doc.id]: doc }))}
            onNext={() => go(1)}
            onPrev={() => go(-1)}
          />
        </div>
      )}
    </Frame>
  )
}

function StatusChip({ doc }: { doc: Loaded }) {
  const base = 'shrink-0 rounded-sm px-1.5 py-0.5 font-sans text-[11px]'
  if (doc === undefined) return <span className={`${base} text-ink-muted`}>…</span>
  if (doc === null) return <span className={`${base} border border-dashed border-rule-strong text-ink-muted`}>none</span>
  if (doc.status === 'reviewed') return <span className={`${base} bg-ink text-desk`}>reviewed</span>
  if (doc.status === 'rejected') return <span className={`${base} border border-rule-strong line-through`}>rejected</span>
  const n = doc.problems?.length ?? 0
  return <span className={`${base} border border-rule-strong`}>{n ? `draft · ${n}!` : 'draft'}</span>
}

function QuestionReview({
  subject,
  question: q,
  doc,
  onSaved,
  onNext,
  onPrev,
}: {
  subject: string
  question: Question
  doc: Loaded
  onSaved: (doc: ExtractedQuestion) => void
  onNext: () => void
  onPrev: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Figure boxes moved on the scan but not saved yet, by figure id.
  const [moved, setMoved] = useState<Record<string, Box>>({})
  const boxesDirty = Object.keys(moved).length > 0
  const shown = useMemo(
    () => (doc && boxesDirty ? { ...doc, figures: doc.figures.map((f) => (moved[f.id] ? { ...f, box: moved[f.id] } : f)) } : doc),
    [doc, moved, boxesDirty],
  )

  const submit = useCallback(
    async (next: ExtractedQuestion) => {
      setBusy(true)
      setMessage(null)
      const result = await save(subject, next)
      setBusy(false)
      if (result.doc) {
        onSaved(result.doc)
        if (!result.ok) setMessage('Kept as a draft: fix the problems below before approving.')
        return result.ok
      }
      setMessage(`Not saved: ${result.error}`)
      return null // null: nothing was written
    },
    [subject, onSaved],
  )

  const saveBoxes = useCallback(async () => {
    if (!shown) return
    if ((await submit(shown)) !== null) setMoved({})
  }, [shown, submit])

  const setStatus = useCallback(
    async (status: ExtractedQuestion['status']) => {
      if (!shown) return
      // Approving or rejecting also keeps any box changes.
      const ok = await submit({ ...shown, status })
      if (ok !== null) setMoved({})
      if (ok && status !== 'draft') onNext()
    },
    [shown, submit, onNext],
  )

  const startEdit = useCallback(() => {
    if (!shown) return
    const copy = { ...shown }
    delete copy.problems
    delete copy.warnings
    setDraft(JSON.stringify(copy, null, 2))
    setMoved({}) // the JSON carries any moved boxes now
    setEditing(true)
  }, [shown])

  const saveEdit = useCallback(async () => {
    let parsed: ExtractedQuestion
    try {
      parsed = JSON.parse(draft)
    } catch (err) {
      setMessage(`That isn't valid JSON: ${String(err)}`)
      return
    }
    if (await submit(parsed)) setEditing(false)
    else setEditing(true)
  }, [draft, submit])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (e.defaultPrevented || target.closest('[data-figure-box]')) return
      if (target.closest('textarea, input, [contenteditable]')) {
        if (editing && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          void saveEdit()
        }
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || busy) return
      const key = e.key.toLowerCase()
      if (key === 'j' || e.key === 'ArrowDown') onNext()
      else if (key === 'k' || e.key === 'ArrowUp') onPrev()
      else if (key === 'a') void setStatus('reviewed')
      else if (key === 'r') void setStatus('rejected')
      else if (key === 'd') void setStatus('draft')
      else if (key === 'e') startEdit()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, busy, onNext, onPrev, setStatus, startEdit, saveEdit])

  const problems = doc?.problems ?? []

  return (
    <main id="main" className="min-w-0 px-6 py-5">
      <header className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="m-0 font-mono text-lg font-medium">{q.id}</h1>
        <span className="text-sm text-ink-muted">
          {q.session} {q.year} · Paper <span className="font-mono">{q.variant}</span> · Question {q.question_number} ·{' '}
          <span className="font-mono">[{q.marks ?? '?'}]</span>
        </span>
        {doc && (
          <span className="text-xs text-ink-muted">
            {doc.extracted_with.model} · {doc.extracted_with.prompt} · {doc.extracted_with.date}
          </span>
        )}
        {doc && (
          <span className="ml-auto flex flex-wrap gap-2">
            <ActionButton onClick={() => void setStatus('reviewed')} disabled={busy || problems.length > 0} primary icon={<Check size={15} aria-hidden />}>
              Approve <kbd>A</kbd>
            </ActionButton>
            <ActionButton onClick={() => void setStatus('rejected')} disabled={busy} icon={<X size={15} aria-hidden />}>
              Reject <kbd>R</kbd>
            </ActionButton>
            {doc.status !== 'draft' && (
              <ActionButton onClick={() => void setStatus('draft')} disabled={busy} icon={<RotateCcw size={15} aria-hidden />}>
                Back to draft <kbd>D</kbd>
              </ActionButton>
            )}
            <ActionButton onClick={startEdit} disabled={busy} icon={<Pencil size={15} aria-hidden />}>
              Edit <kbd>E</kbd>
            </ActionButton>
          </span>
        )}
      </header>

      <div aria-live="polite">
        {message && <p className="m-0 mb-3 rounded-md border border-rule-strong bg-paper px-3 py-2 text-sm">{message}</p>}
        {problems.length > 0 && (
          <div role="alert" className="mb-4 rounded-md border border-rule-strong bg-paper px-4 py-3 text-sm">
            <p className="m-0 mb-1 flex items-center gap-2 font-medium">
              <FileWarning size={16} aria-hidden /> {problems.length} problem{problems.length === 1 ? '' : 's'} to fix before approving
            </p>
            <ul className="m-0 pl-5 text-ink-muted">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        {doc && (doc.warnings?.length ?? 0) > 0 && (
          <div className="mb-4 rounded-md border border-mark px-4 py-3 text-sm">
            <p className="m-0 mb-1 font-medium">Check before approving</p>
            <ul className="m-0 pl-5 text-ink-muted">
              {doc.warnings!.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        {doc && doc.notes.length > 0 && (
          <div className="mb-4 rounded-md border border-dashed border-rule-strong px-4 py-3 text-sm">
            <p className="m-0 mb-1 font-medium">Model notes</p>
            <ul className="m-0 pl-5 text-ink-muted">
              {doc.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 items-start gap-6">
        <section aria-label="Original scan" className="flex flex-col gap-3">
          <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="m-0 text-xs font-medium uppercase tracking-wide text-ink-muted">Original scan</h2>
            {shown && shown.figures.length > 0 && (
              <span className="text-xs text-ink-muted">Drag a figure box or its edges to fix the crop.</span>
            )}
            {boxesDirty && (
              <span className="ml-auto flex gap-2">
                <ActionButton onClick={() => void saveBoxes()} disabled={busy} primary icon={<Check size={15} aria-hidden />}>
                  Save boxes
                </ActionButton>
                <ActionButton onClick={() => setMoved({})} disabled={busy} icon={<RotateCcw size={15} aria-hidden />}>
                  Undo
                </ActionButton>
              </span>
            )}
          </div>
          {q.image_paths.map((src, i) => {
            const figures = shown && !editing ? shown.figures.filter((f) => f.source_image === src) : []
            return (
              <CropSheet
                key={src}
                src={src}
                alt={`${q.id} scan, page ${i + 1}`}
                sourcePdfUrl={q.source_pdf_url}
                sourcePage={q.source_pages[i]}
                overlay={
                  figures.length > 0 ? (
                    <FigureBoxes figures={figures} onChange={(id, box) => setMoved((m) => ({ ...m, [id]: box }))} />
                  ) : undefined
                }
              />
            )
          })}
        </section>
        <section aria-label="Extraction" className="flex flex-col gap-3">
          <h2 className="m-0 text-xs font-medium uppercase tracking-wide text-ink-muted">
            Extraction {doc && <span className="normal-case">· {doc.status}</span>}
          </h2>
          {doc === undefined && <p className="m-0 text-sm text-ink-muted">Loading…</p>}
          {doc === null && (
            <div className="rounded-md border border-dashed border-rule-strong p-5 text-sm">
              <p className="m-0 flex items-center gap-2 font-medium">
                <CircleDashed size={16} aria-hidden /> Not extracted yet
              </p>
              <pre className="m-0 mt-3 whitespace-pre-wrap font-mono text-xs text-ink-muted">
                python3 "python files/extract_questions.py" --ids {q.id}
              </pre>
            </div>
          )}
          {doc && editing && (
            <div className="flex flex-col gap-2">
              <label htmlFor="edit-json" className="text-sm">
                Edit the question JSON. <kbd>Ctrl</kbd>+<kbd>Enter</kbd> saves.
              </label>
              <textarea
                id="edit-json"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={30}
                spellCheck={false}
                className="w-full rounded-md border border-rule-strong bg-field p-3 font-mono text-xs text-ink"
              />
              <div className="flex gap-2">
                <ActionButton onClick={() => void saveEdit()} disabled={busy} primary icon={<Check size={15} aria-hidden />}>
                  Save
                </ActionButton>
                <ActionButton onClick={() => setEditing(false)} disabled={busy} icon={<X size={15} aria-hidden />}>
                  Cancel
                </ActionButton>
              </div>
            </div>
          )}
          {doc && !editing && (
            <article className="rounded-[2px] border border-rule bg-paper px-6 py-5 shadow-sheet">
              <QuestionText question={shown ?? doc} />
            </article>
          )}
        </section>
      </div>
    </main>
  )
}

function ActionButton({
  children,
  onClick,
  disabled,
  primary = false,
  icon,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  icon: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
        primary ? 'bg-ink text-desk' : 'border border-rule-strong bg-paper text-ink hover:bg-desk'
      }`}
    >
      {icon}
      {children}
    </button>
  )
}
