import { SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { AppShell, PageError, PageLoading } from '../../components/AppShell'
import { QuestionCard } from '../../components/question-card/QuestionCard'
import { QuestionCardSkeleton } from '../../components/question-card/QuestionCardSkeleton'
import { SUBJECTS, isSubject, loadTopic, useResource } from '../../content/api'
import type { TopicFile } from '../../content/types'
import { useMediaQuery } from '../../lib/media'
import { readStorage, writeStorage } from '../../lib/storage'
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
  const wide = useMediaQuery('(min-width: 64rem)')
  // The filter menu is collapsed by default; each student's choice is remembered.
  const [filtersOpen, setFiltersOpen] = useState(() => readStorage(FILTERS_OPEN_KEY) === '1')
  const toggleFilters = () => {
    setFiltersOpen((open) => {
      writeStorage(FILTERS_OPEN_KEY, open ? null : '1')
      return !open
    })
  }
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
  const activeFilters = filters.years.size + filters.sessions.size + filters.papers.size
  const controls = <FilterControls options={options} filters={filters} repeatCount={repeatCount} onChange={setFilters} />

  return (
    <div
      className="mx-auto max-w-[100rem] px-4 sm:px-6 lg:grid lg:transition-[grid-template-columns,column-gap] lg:duration-200 lg:ease-out"
      style={{
        gridTemplateColumns: `${filtersOpen ? '13rem' : '0rem'} minmax(0, 1fr)`,
        columnGap: filtersOpen ? '2.5rem' : '0rem',
        ...(docked && answerQuestion ? { paddingRight: 'calc(var(--panel-width) + 1.5rem)' } : {}),
      }}
    >
      {/* Wide screens: a left menu that fades in and out, no panel around it. */}
      <aside
        id="topic-filters"
        aria-label="Filters"
        inert={!filtersOpen}
        className={`hidden overflow-hidden transition-opacity duration-200 lg:block ${filtersOpen ? 'opacity-100' : 'opacity-0'}`}
        data-print="hide"
      >
        <div className="sticky top-20 w-[13rem] pb-10 pt-10">{controls}</div>
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

          <div className="mb-5 flex items-center gap-3" data-print="hide">
            <button
              type="button"
              onClick={toggleFilters}
              aria-expanded={filtersOpen}
              aria-controls={wide ? 'topic-filters' : 'topic-filters-inline'}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-rule-strong bg-paper px-3 text-sm text-ink hover:bg-desk"
            >
              <SlidersHorizontal size={15} aria-hidden /> Filters
              {activeFilters > 0 && (
                <span className="rounded-sm bg-ink px-1.5 font-mono text-xs text-desk">
                  {activeFilters}
                  <span className="sr-only"> active</span>
                </span>
              )}
            </button>
            {activeFilters > 0 && (
              <button type="button" onClick={clearFilters} className="text-sm text-ink-muted underline decoration-rule-strong underline-offset-2 hover:text-ink">
                Clear
              </button>
            )}
          </div>

          {/* Narrow screens: the same menu fades in above the questions. */}
          <div
            id="topic-filters-inline"
            role="group"
            aria-label="Filters"
            inert={!filtersOpen}
            className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out lg:hidden ${filtersOpen ? 'opacity-100' : 'opacity-0'}`}
            style={{ gridTemplateRows: filtersOpen ? '1fr' : '0fr' }}
            data-print="hide"
          >
            <div className="min-h-0 overflow-hidden">
              <div className="pb-7">{controls}</div>
            </div>
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

const FILTERS_OPEN_KEY = 'tp:filters-open'
