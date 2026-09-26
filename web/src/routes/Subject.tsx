import { Link, useParams } from 'react-router'
import { AppShell, PageError, PageLoading } from '../components/AppShell'
import { SUBJECTS, isSubject, loadSubject, useResource } from '../content/api'
import { FEATURES } from '../lib/features'
import { classicHref } from '../lib/view-choice'
import NotFound from './NotFound'

export default function Subject() {
  const { subject = '' } = useParams()
  if (!isSubject(subject)) return <NotFound />
  return <SubjectPage subject={subject} />
}

function SubjectPage({ subject }: { subject: string }) {
  const name = SUBJECTS.find((s) => s.code === subject)?.name ?? subject
  const index = useResource(`subject:${subject}`, () => loadSubject(subject))

  return (
    <AppShell crumbs={[{ label: `${subject} ${name}` }]} classicHref={classicHref(subject)}>
      {index.status === 'loading' && <PageLoading label={`Loading ${name} topics`} />}
      {index.status === 'error' && (
        <PageError title={`${name} didn't load`} detail="Check your connection and try again." onRetry={index.retry} />
      )}
      {index.status === 'ready' && (
        <main id="main" className="mx-auto max-w-[68rem] px-4 pb-16 pt-10 sm:px-8">
          <h1 className="m-0 text-3xl font-semibold tracking-tight">
            <span className="mr-3 font-mono text-lg font-normal text-ink-muted">{subject}</span>
            {name}
          </h1>
          <p className="mt-2 text-ink-muted">2021–2026 · A2 topical questions, grouped by syllabus topic.</p>

          <ul className="m-0 mt-8 list-none border-b border-rule p-0">
            {index.data.topics.map((t) => (
              <li
                key={t.slug}
                className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t border-rule py-3 sm:grid-cols-[2rem_minmax(0,1fr)_12rem_auto]"
              >
                <span className="font-mono text-xs text-ink-muted">{t.number ?? ''}</span>
                <Link to={`/${subject}/${t.slug}`} className="font-medium text-ink no-underline hover:text-accent">
                  {t.label}
                </Link>
                <span className="font-mono text-[13px] text-ink-muted max-sm:col-start-2 max-sm:row-start-2">
                  {t.question_count} questions
                  {t.distinct_count < t.question_count && <span className="text-ink-faint"> · {t.distinct_count} distinct</span>}
                </span>
                <span className="flex gap-3.5 text-sm max-sm:col-start-3 max-sm:row-start-1">
                  <Link to={`/${subject}/${t.slug}`} className="text-ink-muted underline-offset-2 hover:text-ink">
                    Browse
                  </Link>
                  {FEATURES.practiceSets && (
                    <Link to={`/practice?subject=${subject}&topic=${t.slug}`} className="text-accent underline-offset-2">
                      Practise
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>

          <details className="mt-10 rounded-lg bg-surface">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
              Paper coverage <span className="font-normal text-ink-muted">· {index.data.papers.length} papers</span>
            </summary>
            <ul className="m-0 grid list-none grid-cols-1 gap-x-6 gap-y-1 border-t border-rule px-4 py-3 text-sm sm:grid-cols-2">
              {index.data.papers.map((p) => (
                <li key={`${p.year}-${p.session_code}-${p.variant}`} className="flex justify-between gap-3">
                  <span>
                    {p.session} {p.year} · <span className="font-mono">{p.variant}</span>
                  </span>
                  <a href={p.source_pdf_url} className="text-ink-muted underline decoration-rule-strong underline-offset-2 hover:text-ink">
                    {p.question_count} questions · PDF
                  </a>
                </li>
              ))}
            </ul>
            {index.data.missing_papers.length > 0 && (
              <div className="border-t border-rule px-4 py-3 text-sm">
                <p className="m-0 font-medium">Unavailable papers</p>
                <ul className="m-0 mt-1 list-none p-0 text-ink-muted">
                  {index.data.missing_papers.map((m) => (
                    <li key={`${m.year}-${m.session}-${m.variant}`}>
                      {m.session} {m.year} · <span className="font-mono">{m.variant}</span>: {m.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </details>
        </main>
      )}
    </AppShell>
  )
}
