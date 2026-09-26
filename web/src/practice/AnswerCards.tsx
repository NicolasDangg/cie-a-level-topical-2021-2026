import { PenLine } from 'lucide-react'
import type { ExtractedPart } from '../content/types'
import type { PartAnswer } from './answers'
import { countBlanks } from './parts'

type FieldsProps = {
  part: ExtractedPart
  answer: PartAnswer
  onAnswer: (change: Partial<PartAnswer>) => void
  /** The figure a diagram part is drawn on, for the drawing hint. */
  figureCaption: string | null
  /** Moves the caret into the first field when the box opens. */
  autoFocus?: boolean
}

const quiet = 'block w-full resize-y border-0 bg-transparent p-0 text-[15px] leading-7 text-ink outline-none placeholder:text-ink-faint'

// The fields a part asks for, shaped by its kind: working plus a final answer
// line for calculations, one box per labelled slot, a box for everything else.
// Gaps are answered in the question text itself, so they only get a count here.
export function AnswerFields({ part, answer, onAnswer, figureCaption, autoFocus = false }: FieldsProps) {
  const id = `answer-${part.partId}`
  const title = part.label || 'Your answer'
  const rows = Math.min(8, Math.max(2, Math.ceil(part.marks * 1.2)))
  const gaps = countBlanks(part.text)
  const gapsFilled = (answer.blanks ?? []).filter((b) => b?.trim()).length

  return (
    <div className="flex flex-col gap-3">
      {gaps > 0 && (
        <p className="m-0 text-sm text-ink-muted">
          Fill in the {gaps === 1 ? 'gap' : `${gaps} gaps`} in the question above.{' '}
          <span className="font-mono text-ink">
            {gapsFilled}/{gaps}
          </span>{' '}
          filled.
        </p>
      )}

      {part.kind === 'diagram' && (
        <p className="m-0 flex items-start gap-2 text-sm text-ink-muted">
          <PenLine size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {figureCaption ? `Draw on ${figureCaption} above` : 'Draw on the figure above'} while this part is open. You can also type notes here.
          </span>
        </p>
      )}

      {part.kind === 'numeric' ? (
        <>
          <label htmlFor={`${id}-working`} className="sr-only">
            {title} working
          </label>
          <textarea
            id={`${id}-working`}
            value={answer.text ?? ''}
            onChange={(e) => onAnswer({ text: e.target.value })}
            rows={rows}
            autoFocus={autoFocus}
            placeholder="Working (method marks)"
            className={`${quiet} font-mono text-[14px]`}
          />
          <div className="flex flex-wrap items-baseline gap-2 border-t border-rule pt-3 text-[15px]">
            {part.answer?.symbol && (
              <label htmlFor={`${id}-final`} className="italic">
                {part.answer.symbol} =
              </label>
            )}
            <input
              id={`${id}-final`}
              value={answer.final ?? ''}
              onChange={(e) => onAnswer({ final: e.target.value })}
              aria-label={part.answer?.symbol ? undefined : `${title} final answer`}
              placeholder="answer"
              inputMode="decimal"
              autoComplete="off"
              className="w-44 border-0 border-b border-ink bg-transparent px-0 py-0.5 font-mono text-ink outline-none placeholder:text-ink-faint focus-visible:border-accent"
            />
            {part.answer?.unit && <span>{part.answer.unit}</span>}
          </div>
        </>
      ) : part.slots?.length ? (
        part.slots.map((slot, i) => (
          <div key={slot} className="flex flex-col gap-1 border-t border-rule pt-2 first:border-t-0 first:pt-0">
            <label htmlFor={`${id}-slot-${i}`} className="text-xs font-medium text-ink-muted">
              {slot}
            </label>
            <textarea
              id={`${id}-slot-${i}`}
              value={answer.slots?.[i] ?? ''}
              onChange={(e) => {
                const slots = [...(answer.slots ?? [])]
                slots[i] = e.target.value
                onAnswer({ slots })
              }}
              rows={2}
              autoFocus={autoFocus && i === 0}
              className={quiet}
            />
          </div>
        ))
      ) : gaps > 0 ? null : (
        <textarea
          aria-label={`${title} ${part.kind === 'diagram' ? 'notes' : 'answer'}`}
          value={answer.text ?? ''}
          onChange={(e) => onAnswer({ text: e.target.value })}
          rows={part.kind === 'diagram' ? 2 : rows}
          autoFocus={autoFocus}
          placeholder={part.kind === 'diagram' ? 'Notes' : 'Your answer'}
          spellCheck={part.kind !== 'code'}
          className={`${quiet} ${part.kind === 'code' ? 'font-mono text-[14px]' : ''}`}
        />
      )}
    </div>
  )
}
