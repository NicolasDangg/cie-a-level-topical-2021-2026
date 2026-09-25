export default function NotFound() {
  return (
    <main className="mx-auto max-w-[var(--measure)] px-4 py-16">
      <h1 className="m-0 font-serif text-3xl font-semibold text-ink">Page not found</h1>
      <p className="mt-6">
        <a href="/app/" className="text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink">
          Back to the start
        </a>
      </p>
    </main>
  )
}
