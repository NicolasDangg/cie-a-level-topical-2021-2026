import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ExtractedPart } from '../content/types'
import { AnswerFields } from './AnswerCards'
import type { PartAnswer } from './answers'
import { answerPreview } from './parts'

type Props = {
  part: ExtractedPart
  answer: PartAnswer
  onAnswer: (change: Partial<PartAnswer>) => void
  /** The one part whose answer box is open. */
  editing: boolean
  onEdit: () => void
  onDone: () => void
  onNext: () => void
  nextLabel: string
  figureCaption: string | null
  /** Put the caret in the box when it opens (not when a question first loads). */
  focus?: boolean
  /** Extra controls in the open box, e.g. the symbol bar on small screens. */
  tools?: ReactNode
}

// The answer, written in the document right under its part: an open box while
// the student works on it, a one-line preview once answered, else a quiet
// "Answer (b)" button. Clicks stay inside, so they don't re-select the part.
export function InlineAnswer({ part, answer, onAnswer, editing, onEdit, onDone, onNext, nextLabel, figureCaption, focus = false, tools }: Props) {
  const title = part.label || 'this question'
  const preview = answerPreview(part, answer)

  if (editing) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col gap-3 rounded-lg border-[1.5px] border-accent bg-field p-3.5 shadow-[0_0_0_4px_var(--color-accent-ring)]"
      >
        <AnswerFields part={part} answer={answer} onAnswer={onAnswer} figureCaption={figureCaption} autoFocus={focus} />
        {tools}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <span className="mr-auto text-xs text-ink-muted">{preview ? 'Saved on this device' : ''}</span>
          <button type="button" onClick={onDone} className="h-8 rounded-md bg-ink px-3 text-[13px] font-medium text-desk hover:opacity-90">
            Done
          </button>
          <button type="button" onClick={onNext} className="h-8 rounded-md bg-accent px-3 text-[13px] font-medium text-desk hover:opacity-90">
            {nextLabel}
          </button>
        </div>
      </div>
    )
  }

  if (preview) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onEdit()
        }}
        aria-label={`Edit your answer to ${title}: ${preview}`}
        className="flex w-full items-start gap-3 rounded-lg bg-surface px-3.5 py-2.5 text-left text-[15px] hover:bg-rule/50"
      >
        <span className="min-w-0 flex-1 break-words">{preview}</span>
        <span className="shrink-0 pt-0.5 text-xs text-ink-muted">Edit</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onEdit()
      }}
      className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md px-2.5 text-sm text-ink-muted hover:bg-surface hover:text-ink"
    >
      <Plus size={14} aria-hidden /> Answer {title}
    </button>
  )
}
