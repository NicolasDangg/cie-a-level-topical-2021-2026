import * as Tooltip from '@radix-ui/react-tooltip'
import { BookOpenCheck, ExternalLink } from 'lucide-react'
import type { Question } from '../../content/types'
import type { Mode } from '../ModeToggle'
import { CropSheet } from './CropSheet'
import { PracticePartRow } from './PracticePartRow'
import type { PartState, PracticePart } from './types'

type Props = {
  question: Question
  mode: Mode
  /** Practice parts for this question; null when Practice mode doesn't cover it yet. */
  parts?: PracticePart[] | null
  partStates?: Record<string, PartState>
  onAnswerChange?: (partId: string, text: string) => void
  onSubmit?: (partId: string) => void
  answerOpen?: boolean
  /** Practice mode hides the mark scheme until a part has been checked. */
  answerLocked?: boolean
  onToggleAnswer?: () => void
  /** Id of the answer panel the Answer button opens, when one is on the page. */
  answerControls?: string
  /** DOM id for the card; defaults to the question id (the page anchor). */
  anchorId?: string
  /** Fixtures only. */
  forceImageState?: 'loading' | 'error'
}

const EMPTY: PartState = { answer: '', status: { kind: 'idle' } }

export function QuestionCard({
  question: q,
  mode,
  parts,
  partStates = {},
  onAnswerChange,
  onSubmit,
  answerOpen = false,
  answerLocked = false,
  onToggleAnswer,
  answerControls,
  anchorId = q.id,
  forceImageState,
}: Props) {
  const headingId = `${anchorId}-heading`
  const hasAnswer = q.answer.status === 'available'

  return (
    <article id={anchorId} aria-labelledby={headingId} className="question-card rounded-md border border-rule bg-paper p-3 sm:p-5">
      <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule pb-3">
        <h2 id={headingId} className="m-0 font-mono text-[15px] font-medium text-ink">
          {q.id}
        </h2>
        <p className="m-0 text-sm text-ink-muted">
          {q.session} {q.year} · Paper <span className="font-mono">{q.variant}</span> · Question {q.question_number}
        </p>
        <span className="ml-auto flex items-center gap-3">
          {q.marks !== null && (
            <span className="font-mono text-sm text-ink" aria-label={`${q.marks} marks`}>
              [{q.marks}]
            </span>
          )}
          <span data-print="hide">
            <AnswerControl
              available={hasAnswer}
              locked={answerLocked}
              open={answerOpen}
              onToggle={onToggleAnswer}
              controls={answerControls}
              questionId={q.id}
            />
          </span>
        </span>
      </header>

      <div className="space-y-3">
        {q.image_paths.length === 0 ? (
          <p className="m-0 text-sm text-ink-muted">
            No crop was captured for this question. <a className="text-ink underline" href={q.source_pdf_url}>Open the source PDF</a>.
          </p>
        ) : (
          q.image_paths.map((src, i) => (
            <CropSheet
              key={src}
              src={src}
              alt={`${q.id}, page ${i + 1} of ${q.image_paths.length}`}
              sourcePdfUrl={q.source_pdf_url}
              sourcePage={q.source_pages[i]}
              forceState={forceImageState}
            />
          ))
        )}
      </div>

      <footer className="mt-3 flex items-center gap-2 text-xs text-ink-muted" data-print="hide">
        <span>
          Source page{q.source_pages.length === 1 ? '' : 's'} <span className="font-mono">{q.source_pages.join(', ')}</span>
        </span>
        <span aria-hidden>·</span>
        <a href={q.source_pdf_url} className="inline-flex items-center gap-1 underline decoration-rule-strong underline-offset-2 hover:text-ink">
          Source PDF <ExternalLink size={12} aria-hidden />
        </a>
      </footer>

      {mode === 'practice' && (
        <div role="group" aria-label={`Practice: ${q.id}`} className="mt-5 border-t border-rule pt-4" data-print="hide">
          {parts ? (
            <div className="space-y-6">
              {parts.map((part) => (
                <PracticePartRow
                  key={part.partId}
                  questionId={q.id}
                  part={part}
                  state={partStates[part.partId] ?? EMPTY}
                  onAnswerChange={(text) => onAnswerChange?.(part.partId, text)}
                  onSubmit={() => onSubmit?.(part.partId)}
                />
              ))}
            </div>
          ) : (
            <p className="m-0 text-sm text-ink-muted">Not available in Practice mode yet.</p>
          )}
        </div>
      )}
    </article>
  )
}

function AnswerControl({
  available,
  locked,
  open,
  onToggle,
  controls,
  questionId,
}: {
  available: boolean
  locked: boolean
  open: boolean
  onToggle?: () => void
  controls?: string
  questionId: string
}) {
  const base = 'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm'
  if (!available) {
    return <span className={`${base} border-transparent text-ink-muted`}>No mark scheme</span>
  }
  if (locked) {
    // aria-disabled rather than disabled, so it stays focusable and the tip is reachable.
    return (
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button type="button" aria-disabled="true" className={`${base} cursor-not-allowed border-rule text-ink-muted`}>
            <BookOpenCheck size={15} aria-hidden /> Answer
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content sideOffset={6} className="z-50 max-w-60 rounded-md bg-ink px-2.5 py-1.5 text-xs text-desk">
            Check an answer to one part first, then the mark scheme opens.
            <Tooltip.Arrow className="fill-ink" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    )
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={open ? controls : undefined}
      data-question={questionId}
      className={`${base} ${open ? 'border-ink bg-ink text-desk' : 'border-rule-strong text-ink hover:bg-desk'}`}
    >
      <BookOpenCheck size={15} aria-hidden /> {open ? 'Hide answer' : 'Answer'}
    </button>
  )
}
