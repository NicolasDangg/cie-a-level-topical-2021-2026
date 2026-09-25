import { AlertCircle, RotateCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { GradingError } from './types'

function message(error: GradingError, secondsLeft: number): string {
  switch (error.kind) {
    case 'rate_limited':
      return secondsLeft > 0
        ? `You've checked a lot of answers in a short time. You can try again in ${secondsLeft} s.`
        : "You've checked a lot of answers in a short time. You can try again now."
    case 'verification':
      return "We couldn't confirm this request came from this page. Reload the page, then try again."
    case 'not_found':
      return "Marking for this part isn't available right now."
    case 'unavailable':
      return 'The marker is temporarily unavailable. Try again in a few minutes.'
    case 'network':
      return "Couldn't reach the marker. Check your connection and try again."
  }
}

// Inline, next to the answer it belongs to. The answer text is untouched.
// Render with a key per error so the countdown restarts for each new one.
export function GradingErrorNote({ error, onRetry }: { error: GradingError; onRetry: () => void }) {
  const secondsLeft = useCountdown(error.kind === 'rate_limited' ? (error.retryAfterSec ?? 0) : 0)
  const canRetry = error.kind !== 'not_found' && error.kind !== 'verification' && secondsLeft === 0

  return (
    <div role="alert" className="mt-3 flex items-start gap-2 rounded-md border border-rule-strong bg-paper px-3 py-2 text-sm text-ink">
      <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
      <p className="m-0 flex-1">
        {message(error, secondsLeft)} <span className="text-ink-muted">Your answer is kept.</span>
      </p>
      {(canRetry || error.kind === 'rate_limited') && (
        <button
          type="button"
          onClick={onRetry}
          disabled={!canRetry}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 font-medium text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink disabled:cursor-not-allowed disabled:text-ink-muted disabled:no-underline"
        >
          <RotateCw size={13} aria-hidden /> Retry
        </button>
      )}
    </div>
  )
}

function useCountdown(seconds: number) {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    if (seconds <= 0) return
    const until = Date.now() + seconds * 1000
    const id = window.setInterval(() => {
      const next = Math.max(0, Math.ceil((until - Date.now()) / 1000))
      setLeft(next)
      if (next === 0) window.clearInterval(id)
    }, 1000)
    return () => window.clearInterval(id)
  }, [seconds])
  return left
}
