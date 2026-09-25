import * as Dialog from '@radix-ui/react-dialog'
import { SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useRef, type ComponentProps } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { AppShell, PageError, PageLoading } from '../../components/AppShell'
import { QuestionCard } from '../../components/question-card/QuestionCard'
import { QuestionCardSkeleton } from '../../components/question-card/QuestionCardSkeleton'
import { SUBJECTS, isSubject, loadTopic, useResource } from '../../content/api'
import type { TopicFile } from '../../content/types'
import { useMediaQuery } from '../../lib/media'
import { classicHref } from '../../lib/view-choice'
import NotFound from '../NotFound'
import { ANSWER_PANEL_ID, AnswerPanel } from './AnswerPanel'
import { FilterControls } from './FilterControls'
import { applyFilters, filterOptions, isFiltered, readFilters, writeFilters, type Filters } from './filters'

export default function Topic() {
  const { subject = '', topicSlug = '' } = useParams()
  if (!isSubject(subject)) return <NotFound />
  return <TopicPage key={`${subject}/${topicSlug}`} subject={subject} slug={topicSlug} />
}

function TopicPage({ subject, slug }: { subject: string; slug: string }) {
  const [params, setParams] = useSearchParams()
  const answerId = params.get('answers')
  const subjectName = SUBJECTS.find((s) => s.code === subject)?.name ?? subject
  const topic = useResource(`topic:${subject}/${slug}`, () => loadTopic(subject, slug))
  const crumbs = [
    { label: `${subject} ${subjectName}`, to: `/${subject}` },
    { label: topic.status === 'ready' ? topic.data.topic.label : 'Topic' },
  ]

  if (topic.status === 'error' && topic.error.kind === 'not_found') return <NotFound />

  return (
    <AppShell crumbs={crumbs} classicHref={classicHref(subject, slug, answerId)}>
      {topic.status === 'loading' && (
        <div className="mx-auto max-w-[var(--measure)] space-y-6 px-4 py-10">
          <PageLoading label="Loading questions" />
          <QuestionCardSkeleton />
        </div>
      )}
      {topic.status === 'error' && (
        <PageError title="These questions didn't load" detail="Check your connection and try again." onRetry={topic.retry} />
      )}
      {topic.status === 'ready' && (
        <TopicBody subject={subject} subjectName={subjectName} data={topic.data} params={params} setParams={setParams} />
      )}
    </AppShell>
  )
}

function TopicBody({
  subject,
  subjectName,
  data,
  params,
  setParams,
}: {
  subject: string
  subjectName: string
  data: TopicFile
  params: URLSearchParams
  setParams: ReturnType<typeof useSearchParams>[1]
}) {
  const docked = useMediaQuery('(min-width: 80rem)')
  const answerId = params.get('answers')
  const filters = readFilters(params)
  // Option counts describe what the list can show: repeats count only when shown.
  const options = useMemo(
    () => filterOptions(filters.showRepeats ? data.questions : data.questions.filter((q) => q.duplicate_of === null)),
    [data.questions, filters.showRepeats],
  )
  const { shown, hiddenRepeats } = applyFilters(data.questions, filters, answerId)
  const repeatCount = data.questions.filter((q) => q.duplicate_of !== null).length
  const answerQuestion = data.questions.find((q) => q.id === answerId) ?? null
  const opener = useRef<string | null>(null)

  const setFilters = (next: Filters) => setParams(writeFilters(params, next), { replace: true })
  const clearFilters = () => setFilters({ years: new Set(), sessions: new Set(), papers: new Set(), showRepeats: filters.showRepeats })

  const openAnswer = (id: string | null) => {
    const next = new URLSearchParams(params)
    if (id) next.set('answers', id)
    else next.delete('answers')
    setParams(next, { replace: true })
  }
  const closeAnswer = () => {
    const id = answerId
    openAnswer(null)
    // Return focus to the control that opened the panel.
    requestAnimationFrame(() => {
      const trigger = document.querySelector<HTMLElement>(`button[data-question="${CSS.escape(opener.current ?? id ?? '')}"]`)
      trigger?.focus()
    })
  }

  // Arriving with ?answers=<id>: bring that question into view once.
  useEffect(() => {
    if (answerId) document.getElementById(answerId)?.scrollIntoView({ block: 'start' })
    // Only on first render of this topic.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const count = `${shown.length} question${shown.length === 1 ? '' : 's'}`

  return (
    <div
      className="mx-auto max-w-[100rem] px-4 sm:px-6 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10"
      style={docked && answerQuestion ? { paddingRight: 'calc(var(--panel-width) + 1.5rem)' } : undefined}
    >
      <aside aria-label="Filters" className="hidden lg:block" data-print="hide">
        <div className="sticky top-20 pb-10 pt-10">
          <FilterControls options={options} filters={filters} repeatCount={repeatCount} onChange={setFilters} />
        </div>
      </aside>

      <main id="main" className="min-w-0 pb-16 pt-8 lg:pt-10">
        <div className="mx-auto max-w-[var(--measure)]">
          <header className="mb-6 border-b border-rule pb-4 print:border-[#17202a]">
            <h1 className="m-0 font-serif text-3xl font-semibold tracking-tight">{data.topic.label}</h1>
            <p className="m-0 mt-1.5 text-sm text-ink-muted">
              <span className="font-mono">{subject}</span> {subjectName} · A2 topical questions · {count}
              {hiddenRepeats > 0 && <span data-print="hide"> · {hiddenRepeats} repeats hidden</span>}
            </p>
          </header>

          <div className="mb-5 flex items-center gap-3 lg:hidden" data-print="hide">
            <FiltersSheet options={options} filters={filters} repeatCount={repeatCount} onChange={setFilters} active={isFiltered(filters)} />
          </div>

          {shown.length === 0 ? (
            <div className="rounded-md border border-rule bg-paper p-6 text-sm">
              <p className="m-0">No questions match these filters.</p>
              <button type="button" onClick={clearFilters} className="mt-3 text-ink underline decoration-rule-strong underline-offset-2">
                Clear filters
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {shown.map((q) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  mode="browse"
                  answerOpen={q.id === answerId}
                  answerControls={docked ? ANSWER_PANEL_ID : undefined}
                  onToggleAnswer={() => {
                    opener.current = q.id
                    openAnswer(q.id === answerId ? null : q.id)
                  }}
                />
              ))}
            </div>
          )}
          {isFiltered(filters) && shown.length > 0 && (
            <p className="mt-6 text-sm text-ink-muted" data-print="hide">
              Filters are on.{' '}
              <button type="button" onClick={clearFilters} className="text-ink underline decoration-rule-strong underline-offset-2">
                Show all questions
              </button>
            </p>
          )}
        </div>
      </main>

      <AnswerPanel question={answerQuestion} docked={docked} onClose={closeAnswer} />
    </div>
  )
}

function FiltersSheet(props: ComponentProps<typeof FilterControls> & { active: boolean }) {
  const { active, ...controls } = props
  return (
    <Dialog.Root>
      <Dialog.Trigger className="inline-flex h-9 items-center gap-2 rounded-md border border-rule-strong bg-paper px-3 text-sm text-ink">
        <SlidersHorizontal size={15} aria-hidden /> Filters
        {active && <span className="rounded-sm bg-ink px-1.5 text-xs text-desk">on</span>}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30" />
        <Dialog.Content
          aria-describedby={undefined}
          className="sheet-slide fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-xl border-t border-rule bg-paper px-5 pb-8 pt-4 text-ink"
        >
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title className="m-0 font-serif text-xl font-semibold">Filters</Dialog.Title>
            <Dialog.Close
              aria-label="Close filters"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-rule text-ink"
            >
              <X size={16} aria-hidden />
            </Dialog.Close>
          </div>
          <FilterControls {...controls} />
          <Dialog.Close className="mt-8 h-11 w-full rounded-md bg-ink text-sm font-medium text-desk">Show questions</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
