import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { AppShell } from '../components/AppShell'
import { SUBJECTS, loadSubject, useResource } from '../content/api'
import { classicHref } from '../lib/view-choice'

export default function Home() {
  return (
    <AppShell classicHref={classicHref()}>
      <main id="main" className="mx-auto max-w-[var(--measure)] px-4 pb-16 pt-10 sm:pt-14">
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-4 border-b border-rule pb-6">
          <div>
            <h1 className="m-0 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">CIE A-Level topical past papers</h1>
            <p className="mt-3 max-w-xl text-ink-muted">
              Past-paper questions from 2021 to 2026, grouped by A2 topic, with the official mark scheme beside each one.
            </p>
          </div>
          <p className="m-0 text-sm leading-snug text-ink-muted sm:text-right">
            <span className="block font-medium text-ink">Phuc Nguyen (Nicolas) Dangg</span>
            <span className="block">A-Level student</span>
            <span className="block">
              All credits to{' '}
              <a href="https://pastpapers.co" className="text-ink underline decoration-rule-strong underline-offset-2">
                pastpapers.co
              </a>
            </span>
          </p>
        </div>

        <ul className="m-0 mt-8 grid list-none gap-4 p-0">
          {SUBJECTS.map((s) => (
            <li key={s.code}>
              <SubjectCard code={s.code} name={s.name} />
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-ink-muted">
          2026 sessions are listed as unavailable where they were unpublished at collection time.
        </p>
      </main>
    </AppShell>
  )
}

function SubjectCard({ code, name }: { code: string; name: string }) {
  const index = useResource(`subject:${code}`, () => loadSubject(code))
  const summary =
    index.status === 'ready'
      ? `${index.data.topics.length} topics · ${index.data.topics.reduce((n, t) => n + t.question_count, 0)} questions · ${index.data.papers.length} papers`
      : index.status === 'error'
        ? 'Topic list unavailable right now'
        : ' '

  return (
    <Link
      to={`/${code}`}
      className="group flex items-center gap-5 rounded-md border border-rule bg-paper p-5 text-ink no-underline shadow-sheet hover:border-rule-strong"
    >
      <span className="font-mono text-sm text-ink-muted">{code}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-serif text-2xl font-semibold">{name}</span>
        <span className="mt-1 block text-sm text-ink-muted" aria-live="polite">
          {summary}
        </span>
      </span>
      <ArrowRight size={18} className="shrink-0 text-ink-muted group-hover:text-ink" aria-hidden />
    </Link>
  )
}
