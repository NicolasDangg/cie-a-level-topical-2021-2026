import { Loader2 } from 'lucide-react'
import { useId, useState } from 'react'
import { GradingErrorNote } from './GradingErrorNote'
import { MarginScore } from './MarginScore'
import { MarkPoints } from './MarkPoints'
import type { PartState, PracticePart } from './types'

type Props = {
  questionId: string
  part: PracticePart
  state: PartState
  onAnswerChange: (text: string) => void
  onSubmit: () => void
}

export function PracticePartRow({ questionId, part, state, onAnswerChange, onSubmit }: Props) {
  const id = useId()
  const { status } = state
  const grading = status.kind === 'grading'
  const result = status.kind === 'graded' ? status.result : undefined
  const empty = state.answer.trim() === ''
  const [errorCount, setErrorCount] = useState(0)
  const [lastError, setLastError] = useState(status.kind === 'error' ? status.error : null)
  if (status.kind === 'error' && status.error !== lastError) {
    setLastError(status.error)
    setErrorCount((n) => n + 1)
  }
  const rows = Math.min(10, Math.max(3, part.marks * 2))

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_3.75rem] gap-x-3 sm:grid-cols-[minmax(0,1fr)_4.5rem] sm:gap-x-4">
      <div className="min-w-0">
        <label htmlFor={`${id}-answer`} className="mb-1.5 flex items-baseline gap-2 text-sm text-ink">
          <span className="font-mono font-medium">{part.label}</span>
          <span className="text-ink-muted">Your answer</span>
        </label>
        <textarea
          id={`${id}-answer`}
          value={state.answer}
          onChange={(e) => onAnswerChange(e.target.value)}
          readOnly={grading}
          aria-busy={grading}
          rows={rows}
          spellCheck
          className="answer-lines block w-full resize-y rounded-[3px] border border-rule-strong text-[15px] text-ink placeholder:text-ink-muted"
          placeholder="Write your answer…"
          data-question={questionId}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onSubmit}
            disabled={empty || grading}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-ink px-4 text-sm font-medium text-desk hover:opacity-90 disabled:cursor-not-allowed disabled:bg-transparent disabled:text-ink-muted disabled:ring-1 disabled:ring-rule-strong"
          >
            {grading && <Loader2 size={15} className="animate-[spin_0.9s_linear_infinite]" aria-hidden />}
            {grading ? 'Checking…' : result ? 'Check again' : 'Check answer'}
          </button>
          {empty && !result && <span className="text-sm text-ink-muted">Write something to check it.</span>}
        </div>
        <div aria-live="polite">
          {status.kind === 'error' && <GradingErrorNote key={errorCount} error={status.error} onRetry={onSubmit} />}
          {result && <MarkPoints result={result} />}
        </div>
      </div>
      <div className="flex justify-end border-l border-rule pt-7 sm:pt-8">
        <MarginScore marks={part.marks} score={result?.score} provisional={result?.provisional} />
      </div>
    </div>
  )
}
