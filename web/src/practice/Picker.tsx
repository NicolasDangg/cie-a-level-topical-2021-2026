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
  { id: 'test', label: 'Test', desc: 'Timed. Flag questions to revisit. Mark scheme at the end.' },
]

// Build a practice set: subject, topic, how many questions, how to be marked.
export default function Picker() {
  const [params, setParams] = useSearchParams()
  const subject = isSubject(params.get('subject') ?? '') ? params.get('subject')! : SUBJECTS[0].code
  const index = useResource(`subject:${subject}`, () => loadSubject(subject))
  const practice = useResource(`practice:${subject}`, () => loadPractice(subject))

  return (
    <AppShell crumbs={[{ label: 'Practice sets' }]} classicHref={classicHref()}>
      <main id="main">
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
    <div className="grid lg:min-h-[calc(100dvh-3.5rem)] lg:grid-cols-[15rem_minmax(0,1fr)_24rem]">
      <nav aria-label="Subject" className="flex gap-1 border-rule px-4 pt-6 max-lg:overflow-x-auto lg:flex-col lg:border-r lg:px-5 lg:py-7">
        <span className="mb-2 hidden text-xs font-medium text-ink-muted lg:block">Subject</span>
        {SUBJECTS.map((s) => {
          const on = s.code === subject
          return (
            <button
              key={s.code}
              type="button"
              aria-pressed={on}
              onClick={() => onSubject(s.code)}
              className={`flex shrink-0 items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm ${on ? 'bg-surface font-medium text-ink' : 'text-ink-muted hover:text-ink'}`}
            >
              <span>{s.name}</span>
              <span className="font-mono text-xs text-ink-faint">{s.code}</span>
            </button>
          )
        })}
      </nav>

      <section aria-labelledby="build-title" className="min-w-0 px-4 py-6 sm:px-8 lg:px-12 lg:py-9">
        <h1 id="build-title" className="m-0 text-3xl font-semibold tracking-tight">
          Build a practice set
        </h1>
        <p className="m-0 mt-2 max-w-[62ch] text-[15px] text-ink-muted">Pick a topic. We draw random past-paper questions from it, and never the same question twice in a set.</p>

        <fieldset className="m-0 mt-6 border-0 border-t border-rule p-0">
          <legend className="sr-only">Topic</legend>
          {topics.map((t) => {
            const on = t.slug === topicSlug
            const disabled = t.pool.length === 0
            return (
              <label
                key={t.slug}
                className={`grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3.5 border-b border-rule px-3 py-3 sm:grid-cols-[1rem_minmax(0,1fr)_8rem_9rem] ${
                  disabled ? 'cursor-not-allowed text-ink-muted' : on ? 'cursor-pointer bg-accent-tint' : 'cursor-pointer hover:bg-surface'
                }`}
              >
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
                  className="h-3.5 w-3.5 accent-[var(--color-accent)]"
                />
                <span className="text-[15px]">{t.label}</span>
                {disabled ? (
                  <span className="text-right text-xs text-ink-muted sm:col-span-2">Not ready yet: still being checked</span>
                ) : (
                  <>
                    <span className="text-right font-mono text-[13px] text-ink-muted">
                      {t.pool.length} question{t.pool.length === 1 ? '' : 's'}
                    </span>
                    <span className="text-right font-mono text-[13px] text-ink-faint max-sm:hidden">~{t.mean.toFixed(1)} marks each</span>
                  </>
                )}
              </label>
            )
          })}
        </fieldset>
      </section>

      <aside aria-label="Your set" className="flex flex-col gap-6 bg-surface px-5 py-7 sm:px-7 lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)] lg:overflow-y-auto">
        {!topic ? (
          <p className="m-0 text-sm text-ink-muted">No topic in this subject is ready for practice yet.</p>
        ) : (
          <>
            <div>
              <p className="m-0 text-xs font-medium text-ink-muted">Your set</p>
              <h2 className="m-0 mt-1 text-xl font-semibold">{topic.label}</h2>
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor={sliderId} className="text-[15px] font-medium">
                  Questions
                </label>
                <span className="font-mono text-2xl" aria-hidden>
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
                className="mt-2 w-full accent-[var(--color-accent)]"
              />
              <div className="flex justify-between font-mono text-xs text-ink-faint" aria-hidden>
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

            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-2 text-[15px] font-medium">Marking</legend>
              <div className="flex flex-col gap-2">
                {MODES.map((m) => (
                  <label
                    key={m.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg bg-paper px-3.5 py-3 ${m.id === mode ? 'shadow-[inset_0_0_0_1.5px_var(--color-accent)]' : 'shadow-[inset_0_0_0_1px_var(--color-rule)]'}`}
                  >
                    <input
                      type="radio"
                      name="mode"
                      checked={m.id === mode}
                      onChange={() => setMode(m.id)}
                      className="mt-1 h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)]"
                    />
                    <span>
                      <span className="block text-[15px] font-medium">{m.label}</span>
                      <span className="block text-[13px] leading-snug text-ink-muted">{m.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={preferUnseen}
                onChange={(e) => setPreferUnseen(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--color-ink)]"
              />
              Prefer questions I haven't answered yet
            </label>

            <span className="flex-1" />
            <button
              type="button"
              onClick={start}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-[15px] font-medium text-desk hover:opacity-90"
            >
              Start {count} question{count === 1 ? '' : 's'} <ArrowRight size={16} aria-hidden />
            </button>
          </>
        )}
      </aside>
    </div>
  )
}
