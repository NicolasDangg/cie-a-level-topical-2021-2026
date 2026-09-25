import { Link } from 'react-router'
import { AppShell } from '../components/AppShell'
import { classicHref } from '../lib/view-choice'

export default function NotFound() {
  return (
    <AppShell classicHref={classicHref()}>
      <main id="main" className="mx-auto max-w-[var(--measure)] px-4 py-16">
        <h1 className="m-0 font-serif text-3xl font-semibold text-ink">Page not found</h1>
        <p className="mt-2 text-ink-muted">That subject or topic doesn't exist here.</p>
        <p className="mt-6">
          <Link to="/" className="text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink">
            Back to all subjects
          </Link>
        </p>
      </main>
    </AppShell>
  )
}
