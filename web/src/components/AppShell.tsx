import { ChevronRight } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router'
import { FEATURES } from '../lib/features'
import { rememberAppView } from '../lib/view-choice'
import { ThemeMenu } from './ThemeMenu'

export type Crumb = { label: string; to?: string }

type Props = {
  crumbs?: Crumb[]
  classicHref: string
  children: ReactNode
}

// Page frame: skip link, top bar with breadcrumb, then the page.
export function AppShell({ crumbs = [], classicHref, children }: Props) {
  // Being in the app is the student's choice of view; the classic home page reads it.
  useEffect(rememberAppView, [])

  return (
    <div className="min-h-dvh bg-desk text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-paper focus:px-3 focus:py-2 focus:shadow-sheet"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-rule bg-desk" data-print="hide">
        <div className="mx-auto flex h-14 max-w-[100rem] items-center gap-3 px-4 sm:px-6">
          <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center">
            <ol className="m-0 flex min-w-0 list-none items-center gap-1.5 p-0 text-sm">
              <li className="shrink-0">
                <Link to="/" className="font-serif text-lg font-semibold text-ink no-underline">
                  topicalpaper.me
                </Link>
              </li>
              {crumbs.map((crumb, i) => {
                const last = i === crumbs.length - 1
                return (
                  <li key={crumb.label} className={`flex min-w-0 items-center gap-1.5 ${last ? '' : 'max-sm:hidden'}`}>
                    <ChevronRight size={14} className="shrink-0 text-ink-muted" aria-hidden />
                    {crumb.to && !last ? (
                      <Link to={crumb.to} className="truncate text-ink-muted no-underline hover:text-ink">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span aria-current={last ? 'page' : undefined} className="truncate text-ink">
                        {crumb.label}
                      </span>
                    )}
                  </li>
                )
              })}
            </ol>
          </nav>
          {FEATURES.practiceSets && (
            <Link to="/practice" className="text-sm text-ink no-underline hover:underline max-sm:hidden">
              Practice sets
            </Link>
          )}
          <ThemeMenu />
          <a href={classicHref} className="whitespace-nowrap text-sm text-ink-muted underline decoration-rule-strong underline-offset-2 hover:text-ink">
            Classic view
          </a>
        </div>
      </header>
      {children}
    </div>
  )
}

export function PageLoading({ label }: { label: string }) {
  return (
    <div role="status" className="mx-auto max-w-[var(--measure)] px-4 py-16 text-ink-muted">
      <span className="sr-only">{label}</span>
      <div className="skeleton mb-3 h-8 w-2/3 rounded-sm" aria-hidden />
      <div className="skeleton h-4 w-1/3 rounded-sm" aria-hidden />
    </div>
  )
}

export function PageError({ title, detail, onRetry }: { title: string; detail: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-[var(--measure)] px-4 py-16">
      <h1 className="m-0 font-serif text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-ink-muted">{detail}</p>
      <div className="mt-6 flex flex-wrap gap-4">
        {onRetry && (
          <button type="button" onClick={onRetry} className="h-10 rounded-md bg-ink px-4 text-sm font-medium text-desk hover:opacity-90">
            Try again
          </button>
        )}
        <Link to="/" className="inline-flex h-10 items-center text-sm text-ink underline decoration-rule-strong underline-offset-2">
          Back to all subjects
        </Link>
      </div>
    </div>
  )
}
