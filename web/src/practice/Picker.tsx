import { ArrowRight } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { AppShell, PageError, PageLoading } from '../components/AppShell'
import { SUBJECTS, isSubject, loadSubject, useResource } from '../content/api'
import { classicHref } from '../lib/view-choice'
import { readDone } from './answers'
import { MAX_SET, MINUTES_PER_MARK, drawSet, loadPractice, setHref, type Mode } from './data'

const MODES: { id: Mode; label: string; desc: string }[] = [
  { id: 'practice', label: 'Practice', desc: 'Check each question as you go. The mark scheme opens when you check.' },
  { id: 'test', label: 'Test', desc: 'Timed, flag questions to revisit, mark scheme at the end.' },
]

// Build a practice set: subject, topic, how many questions, how to be marked.
export default function Picker() {
  const [params, setParams] = useSearchParams()
  const subject = isSubject(params.get('subject') ?? '') ? params.get('subject')! : SUBJECTS[0].code
  const index = useResource(`subject:${subject}`, () => loadSubject(subject))
  const practice = useResource(`practice:${subject}`, () => loadPractice(subject))

  return (
    <AppShell crumbs={[{ label: 'Practice sets' }]} classicHref={classicHref()}>
      <main id="main" className="mx-auto max-w-[80rem] px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
        {index.status === 'error' || practice.status === 'error' ? (
          <PageError
            title="Practice sets aren't available right now"
            detail="The list of questions didn't load. Check your connection and try again."
            onRetry={index.status === 'error' ? index.retry : practice.status === 'error' ? practice.retry : undefined}
          />
        ) : index.status !== 'ready' || practice.status !== 'ready' ? (
          <PageLoading label="Loading topics" />
        ) : (
          <SetBuilder
            key={subject}
            subject={subject}
            topics={index.data.topics.map((t) => {
              const pool = practice.data.topics[t.slug] ?? []
              const marks = pool.reduce((n, q) => n + q.marks, 0)
              return { slug: t.slug, label: t.label, pool, mean: pool.length ? marks / pool.length : 0 }
            })}
            initialTopic={params.get('topic')}
            onSubject={(code) => setParams({ subject: code }, { replace: true })}
            onTopic={(slug) => setParams({ subject, topic: slug }, { replace: true })}
          />
        )}
      </main>
    </AppShell>
  )
}

type TopicChoice = { slug: string; label: string; pool: { id: string; marks: number }[]; mean: number }

function SetBuilder({
  subject,
  topics,
  initialTopic,
  onSubject,
  onTopic,
}: {
  subject: string
  topics: TopicChoice[]
  initialTopic: string | null
  onSubject: (code: string) => void
  onTopic: (slug: string) => void
}) {
  const navigate = useNavigate()
  const ready = topics.filter((t) => t.pool.length > 0)
  const [topicSlug, setTopicSlug] = useState(
    () => ready.find((t) => t.slug === initialTopic)?.slug ?? ready[0]?.slug ?? null,
  )
  const topic = topics.find((t) => t.slug === topicSlug) ?? null
  const max = Math.min(MAX_SET, topic?.pool.length ?? 0)
  const [wanted, setWanted] = useState(5)
  const count = Math.max(1, Math.min(wanted, max))
  const [mode, setMode] = useState<Mode>('test')
  const [preferUnseen, setPreferUnseen] = useState(true)
  const done = useMemo(() => readDone(subject), [subject])
  const unseen = topic ? topic.pool.filter((q) => !done.has(q.id)).length : 0
  const marks = topic ? Math.round(count * topic.mean) : 0
  const sliderId = useId()

  const start = () => {
    if (!topic) return
    const ids = drawSet(topic.pool, count, done, preferUnseen)
    navigate(setHref({ subject, topic: topic.slug, ids, mode }))
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_26rem]">
      <section aria-labelledby="build-title">
        <h1 id="build-title" className="m-0 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
          Build a practice set
        </h1>
        <p className="mt-2 text-ink-muted">Pick a topic. We draw random past-paper questions from it, never the same question twice.</p>

        <div role="group" aria-label="Subject" className="mt-6 inline-flex rounded-lg bg-rule/60 p-1">
          {SUBJECTS.map((s) => (
            <button
              key={s.code}
              type="button"
              aria-pressed={s.code === subject}
              onClick={() => onSubject(s.code)}
              className={`h-9 rounded-md px-4 text-sm font-medium ${s.code === subject ? 'bg-paper text-ink shadow-sheet' : 'text-ink-muted hover:text-ink'}`}
            >
              {s.name}
            </button>
          ))}
        </div>

        <fieldset className="m-0 mt-6 border-0 p-0">
          <legend className="sr-only">Topic</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {topics.map((t) => {
              const on = t.slug === topicSlug
              const disabled = t.pool.length === 0
              return (
                <label
                  key={t.slug}
                  className={`flex min-h-16 items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
                    disabled
                      ? 'cursor-not-allowed border-dashed border-rule text-ink-muted'
                      : on
                        ? 'cursor-pointer border-ink bg-paper shadow-sheet'
                        : 'cursor-pointer border-rule bg-paper hover:border-rule-strong'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{t.label}</span>
                    <span className="block text-xs text-ink-muted">
                      {disabled ? 'Not ready yet: questions are still being checked' : `${t.pool.length} question${t.pool.length === 1 ? '' : 's'} · ~${t.mean.toFixed(1)} marks each`}
                    </span>
                  </span>
                  <input
                    type="radio"
                    name="topic"
                    value={t.slug}
                    checked={on}
                    disabled={disabled}
                    onChange={() => {
                      setTopicSlug(t.slug)
                      onTopic(t.slug)
                    }}
                    className="h-4 w-4 shrink-0 accent-[var(--color-ink)]"
                  />
                </label>
              )
            })}
          </div>
        </fieldset>
      </section>

      <aside aria-label="Your set" className="rounded-lg border border-rule bg-paper p-6 shadow-sheet lg:sticky lg:top-20">
        {!topic ? (
          <p className="m-0 text-sm text-ink-muted">No topic in this subject is ready for practice yet.</p>
        ) : (
          <>
            <p className="m-0 text-xs font-medium uppercase tracking-wide text-ink-muted">Your set</p>
            <h2 className="m-0 mt-1 font-serif text-xl font-semibold">{topic.label}</h2>

            <div className="mt-6">
              <div className="flex items-baseline justify-between">
                <label htmlFor={sliderId} className="text-sm">
                  Questions
                </label>
                <span className="font-mono text-3xl" aria-hidden>
                  {count}
                </span>
              </div>
              <input
                id={sliderId}
                type="range"
                min={1}
                max={Math.max(1, max)}
                value={count}
                disabled={max <= 1}
                onChange={(e) => setWanted(Number(e.target.value))}
                className="mt-2 w-full accent-[var(--color-ink)]"
              />
              <div className="flex justify-between font-mono text-xs text-ink-muted" aria-hidden>
                <span>1</span>
                <span>{max}</span>
              </div>
              <p className="m-0 mt-3 text-sm">
                <span className="font-mono">≈ {marks} marks</span>
                <span className="text-ink-muted"> · about {Math.round(marks * MINUTES_PER_MARK)} min at exam pace</span>
              </p>
              <p className="m-0 mt-1 text-xs text-ink-muted">
                {topic.pool.length} checked question{topic.pool.length === 1 ? '' : 's'} in this topic
                {unseen < topic.pool.length && `, ${unseen} you haven't done`}.
              </p>
            </div>

            <fieldset className="m-0 mt-6 border-0 p-0">
              <legend className="mb-2 text-sm">How do you want to be marked?</legend>
              <div className="flex flex-col gap-2">
                {MODES.map((m) => (
                  <label
                    key={m.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 ${m.id === mode ? 'border-ink' : 'border-rule hover:border-rule-strong'}`}
                  >
                    <input
                      type="radio"
                      name="mode"
                      checked={m.id === mode}
                      onChange={() => setMode(m.id)}
                      className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-ink)]"
                    />
                    <span>
                      <span className="block text-sm font-medium">{m.label}</span>
                      <span className="block text-xs text-ink-muted">{m.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="mt-5 flex cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={preferUnseen}
                onChange={(e) => setPreferUnseen(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-ink)]"
              />
              Prefer questions I haven't answered yet
            </label>

            <button
              type="button"
              onClick={start}
              className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-ink text-base font-medium text-desk hover:opacity-90"
            >
              Start {count} question{count === 1 ? '' : 's'} <ArrowRight size={18} aria-hidden />
            </button>
          </>
        )}
      </aside>
    </div>
  )
}
