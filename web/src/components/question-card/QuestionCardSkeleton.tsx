// Shown while a topic's question data is still loading.
export function QuestionCardSkeleton() {
  return (
    <div className="question-card rounded-md border border-rule bg-paper p-3 sm:p-5" role="status" aria-live="polite">
      <span className="sr-only">Loading question…</span>
      <div className="mb-4 flex items-center gap-3 border-b border-rule pb-3" aria-hidden>
        <div className="skeleton h-4 w-44 rounded-sm" />
        <div className="skeleton h-3.5 w-52 rounded-sm" />
        <div className="skeleton ml-auto h-8 w-20 rounded-md" />
      </div>
      <div className="skeleton h-80 rounded-[2px]" aria-hidden />
    </div>
  )
}
