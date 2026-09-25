import { PenLine } from 'lucide-react'
import type { ExtractedPart, ExtractedQuestion } from '../content/types'
import { partIsAnswered, type PartAnswer, type QuestionAnswers } from './answers'
import { countBlanks, drawingTarget, partSummary } from './parts'

type Props = {
  question: ExtractedQuestion
  answers: QuestionAnswers
  onAnswer: (partId: string, change: Partial<PartAnswer>) => void
  active: string
  onActivate: (partId: string) => void
}

// One answer card per part, shaped by what the part asks for.
export function AnswerCards({ question: q, answers, onAnswer, active, onActivate }: Props) {
  return (
    <div className="flex flex-col gap-3">
      {q.parts.map((part, index) => (
        <AnswerCard
          key={part.partId}
          part={part}
          answer={answers[part.partId] ?? {}}
          onAnswer={(change) => onAnswer(part.partId, change)}
          on={part.partId === active}
          onActivate={() => onActivate(part.partId)}
          figureCaption={drawingTarget(q, index)?.caption ?? null}
        />
      ))}
    </div>
  )
}

const lined = 'answer-lines block w-full resize-y rounded-md border border-rule-strong text-[15px] text-ink'

function AnswerCard({
  part,
  answer,
  onAnswer,
  on,
  onActivate,
  figureCaption,
}: {
  part: ExtractedPart
  answer: PartAnswer
  onAnswer: (change: Partial<PartAnswer>) => void
  on: boolean
  onActivate: () => void
  figureCaption: string | null
}) {
  const id = `answer-${part.partId}`
  const title = part.label || 'Your answer'
  const rows = Math.min(10, Math.max(3, Math.ceil(part.marks * 1.5)))
  const gaps = countBlanks(part.text)
  const gapsFilled = (answer.blanks ?? []).filter((b) => b?.trim()).length

  return (
    <section
      aria-labelledby={`${id}-title`}
      onFocusCapture={onActivate}
      className={`flex flex-col gap-2.5 rounded-lg bg-paper p-4 ${on ? 'border-[1.5px] border-ink shadow-sheet' : 'border border-rule'}`}
    >
      <header className="flex items-baseline gap-2">
        <h3 id={`${id}-title`} className="m-0 font-mono text-sm font-medium">
          <button type="button" onClick={onActivate} className="text-left">
            {title}
          </button>
        </h3>
        <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">{partSummary(part)}</span>
        <span className="font-mono text-xs text-ink-muted">[{part.marks}]</span>
        {partIsAnswered(answer) && <span className="sr-only">answered</span>}
      </header>

      {gaps > 0 && (
        <p className="m-0 rounded-md bg-desk px-3 py-2 text-sm text-ink-muted">
          Fill in the {gaps === 1 ? 'gap' : `${gaps} gaps`} in the question.{' '}
          <span className="font-mono text-ink">
            {gapsFilled}/{gaps}
          </span>{' '}
          filled.
        </p>
      )}

      {part.kind === 'diagram' && (
        <p className="m-0 flex items-start gap-2 rounded-md bg-desk px-3 py-2 text-sm text-ink-muted">
          <PenLine size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {figureCaption ? `Draw on ${figureCaption} in the question` : 'Draw on the figure in the question'} while this part is selected. You
            can also type notes below.
          </span>
        </p>
      )}

      {part.kind === 'numeric' ? (
        <>
          <label htmlFor={`${id}-working`} className="text-xs text-ink-muted">
            Working
          </label>
          <textarea
            id={`${id}-working`}
            value={answer.text ?? ''}
            onChange={(e) => onAnswer({ text: e.target.value })}
            rows={rows}
            className={lined}
          />
          <div className="flex flex-wrap items-center gap-2 text-[15px]">
            {part.answer?.symbol && (
              <label htmlFor={`${id}-final`} className="font-serif italic">
                {part.answer.symbol} =
              </label>
            )}
            <input
              id={`${id}-final`}
              value={answer.final ?? ''}
              onChange={(e) => onAnswer({ final: e.target.value })}
              aria-label={part.answer?.symbol ? undefined : `${title} final answer`}
              inputMode="decimal"
              autoComplete="off"
              className="h-10 w-40 rounded-md border border-rule-strong bg-field px-3 font-mono text-ink"
            />
            {part.answer?.unit && <span>{part.answer.unit}</span>}
          </div>
        </>
      ) : part.slots?.length ? (
        part.slots.map((slot, i) => (
          <div key={slot} className="flex flex-col gap-1">
            <label htmlFor={`${id}-slot-${i}`} className="text-xs text-ink-muted">
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
              className={lined}
            />
          </div>
        ))
      ) : gaps > 0 ? null : (
        <textarea
          aria-label={`${title} ${part.kind === 'diagram' ? 'notes' : 'answer'}`}
          value={answer.text ?? ''}
          onChange={(e) => onAnswer({ text: e.target.value })}
          rows={part.kind === 'diagram' ? 2 : rows}
          spellCheck={part.kind !== 'code'}
          className={`${lined} ${part.kind === 'code' ? 'font-mono text-[14px]' : ''}`}
        />
      )}
    </section>
  )
}
