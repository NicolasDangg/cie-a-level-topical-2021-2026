import { ArrowRight, FolderGit2, Terminal } from 'lucide-react'
import { Link } from 'react-router'
import { AppShell } from '../components/AppShell'
import { SUBJECTS, loadSubject, useResource } from '../content/api'
import { FEATURES } from '../lib/features'
import { classicHref } from '../lib/view-choice'

const REPO_URL = 'https://github.com/NicolasDangg/cie-a-level-topical-2021-2026'
const CLI_URL = 'https://github.com/NicolasDangg/pastpaper-retrieve-aslevel'

export default function Home() {
  return (
    <AppShell classicHref={classicHref()}>
      <div className="mx-auto grid max-w-[74rem] gap-12 px-4 pb-16 pt-10 sm:px-8 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
        <main id="main" className="flex min-w-0 flex-col gap-7">
          <div className="flex max-w-[60ch] flex-col gap-2.5">
            <h1 className="m-0 text-3xl font-semibold tracking-tight sm:text-[34px]">CIE A-Level past papers, by topic</h1>
            <p className="m-0 text-base leading-relaxed text-ink-muted">
              Every A2 question from 2021 to 2026, sorted into topics. Read them with the official mark scheme beside each one, or build a practice set and
              answer them here.
            </p>
          </div>

          <ul className="m-0 list-none border-b border-rule p-0">
            {SUBJECTS.map((s) => (
              <li key={s.code}>
                <SubjectRow code={s.code} name={s.name} />
              </li>
            ))}
          </ul>
          <p className="m-0 text-[13px] text-ink-muted">A2 topics only. 2026 sessions show as unavailable where they were unpublished at collection time.</p>
        </main>

        <aside className="flex flex-col gap-7">
          {FEATURES.practiceSets && (
            <section aria-labelledby="home-practice" className="flex flex-col gap-3 rounded-[10px] bg-surface p-5">
              <h2 id="home-practice" className="m-0 text-[15px] font-semibold">
                Practice sets
              </h2>
              <p className="m-0 text-sm leading-relaxed text-ink-muted">
                Random questions from a topic, typed out to answer on screen, then checked against the official mark scheme.
              </p>
              <Link
                to="/practice"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-desk no-underline hover:opacity-90"
              >
                Build a set <ArrowRight size={15} aria-hidden />
              </Link>
            </section>
          )}
          <section className="flex flex-col gap-1.5 text-sm leading-relaxed text-ink-muted">
            <span className="font-semibold text-ink">Phuc Nguyen (Nicolas) Dangg</span>
            <span>A-Level student</span>
            <span>
              Past papers retrieved from{' '}
              <a href="https://pastpapers.co" className="text-ink underline decoration-rule-strong underline-offset-2">
                pastpapers.co
              </a>
            </span>
            <span className="mt-2 flex flex-wrap gap-2">
              <a
                href={REPO_URL}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rule-strong px-3 text-[13px] text-ink no-underline hover:bg-surface"
              >
                <FolderGit2 size={14} aria-hidden />
                Source on GitHub
              </a>
              <a
                href={CLI_URL}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rule-strong px-3 text-[13px] text-ink no-underline hover:bg-surface"
              >
                <Terminal size={14} aria-hidden />
                Past paper retrieval CLI
              </a>
            </span>
          </section>
        </aside>
      </div>
    </AppShell>
  )
}

function SubjectRow({ code, name }: { code: string; name: string }) {
  const index = useResource(`subject:${code}`, () => loadSubject(code))
  const summary =
    index.status === 'ready'
      ? `${index.data.topics.length} topics · ${index.data.topics.reduce((n, t) => n + t.question_count, 0)} questions`
      : index.status === 'error'
        ? 'Topic list unavailable right now'
        : ' '

  return (
    <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 border-t border-rule py-5 sm:grid-cols-[4.5rem_minmax(0,1fr)_12rem_auto]">
      <span className="font-mono text-[15px] text-ink-muted">{code}</span>
      <Link to={`/${code}`} className="text-xl font-semibold text-ink no-underline hover:text-accent">
        {name}
      </Link>
      <span className="text-sm text-ink-muted max-sm:col-start-2" aria-live="polite">
        {summary}
      </span>
      <span className="flex gap-2 max-sm:col-start-2">
        <Link to={`/${code}`} className="inline-flex h-9 items-center rounded-lg border border-rule-strong px-3.5 text-sm text-ink no-underline hover:bg-surface">
          Browse
        </Link>
        {FEATURES.practiceSets && (
          <Link to={`/practice?subject=${code}`} className="inline-flex h-9 items-center rounded-lg bg-ink px-3.5 text-sm text-desk no-underline hover:opacity-90">
            Practise
          </Link>
        )}
      </span>
    </div>
  )
}
