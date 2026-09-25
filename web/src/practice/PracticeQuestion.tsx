import type { ReactNode } from 'react'
import { RichText, type BlankRenderer } from '../components/question-text/RichText'
import type { ExtractedFigure, ExtractedQuestion } from '../content/types'
import type { PartAnswer, QuestionAnswers, Stroke } from './answers'
import { DrawingFigure } from './DrawingFigure'
import { drawingTarget } from './parts'

type Props = {
  question: ExtractedQuestion
  answers: QuestionAnswers
  onAnswer: (partId: string, change: Partial<PartAnswer>) => void
  active: string
  onActivate: (partId: string) => void
  /** Results: show the student's answers, nothing editable. */
  readOnly?: boolean
}

// The question as text, for answering: click a part to work on it; gaps in
// the text are inputs; the active diagram part's figure takes a drawing.
export function PracticeQuestion({ question: q, answers, onAnswer, active, onActivate, readOnly = false }: Props) {
  const targets = q.parts.map((_, i) => drawingTarget(q, i))
  const activeIndex = q.parts.findIndex((p) => p.partId === active)
  const activeTarget = activeIndex >= 0 ? targets[activeIndex] : null

  // Every part's marks on a figure: the active part's are editable, the rest shown.
  const strokesOn = (figure: ExtractedFigure, except?: string): Stroke[] =>
    q.parts.flatMap((p) => (p.partId === except ? [] : (answers[p.partId]?.drawings?.[figure.id] ?? [])))

  const renderFigure = (figure: ExtractedFigure): ReactNode => {
    const drawable = !readOnly && activeTarget?.id === figure.id
    const underlay = strokesOn(figure, drawable ? active : undefined)
    if (!drawable && underlay.length === 0) return <DrawingFigure figure={figure} />
    if (!drawable) return <DrawingFigure figure={figure} underlay={underlay} />
    const mine = answers[active]?.drawings?.[figure.id] ?? []
    return (
      <DrawingFigure
        figure={figure}
        strokes={mine}
        underlay={underlay}
        onChange={(strokes) => onAnswer(active, { drawings: { ...answers[active]?.drawings, [figure.id]: strokes } })}
      />
    )
  }

  const gapInput =
    (partId: string, label: string): BlankRenderer =>
    (index, { code, line }) => {
      const value = answers[partId]?.blanks?.[index] ?? ''
      if (readOnly) {
        return (
          <span className={`gap-answer ${line ? 'blank-line' : ''} ${value ? '' : 'gap-empty'}`}>
            {value || <span className="sr-only">left blank</span>}
          </span>
        )
      }
      return (
        <input
          value={value}
          aria-label={`${label} gap ${index + 1}`}
          onFocus={() => onActivate(partId)}
          onChange={(e) => {
            const blanks = [...(answers[partId]?.blanks ?? [])]
            blanks[index] = e.target.value
            onAnswer(partId, { blanks })
          }}
          spellCheck={!code}
          autoComplete="off"
          className={`gap-input ${code ? 'font-mono' : ''} ${line ? 'gap-input-line' : ''}`}
          size={line ? 36 : code ? 14 : 12}
        />
      )
    }

  return (
    <div className="flex flex-col gap-3 font-serif text-[17px] leading-relaxed text-ink">
      {q.stem && <RichText text={q.stem} figures={q.figures} figure={renderFigure} />}
      {q.parts.map((part) => {
        const on = part.partId === active
        return (
          <section
            key={part.partId}
            aria-label={part.label ? `Part ${part.label}` : 'Question'}
            data-part={part.partId}
            onClick={() => onActivate(part.partId)}
            className={`-mx-3 flex scroll-mt-24 flex-col gap-3 rounded-md px-3 py-2.5 transition-colors ${on ? 'bg-[color-mix(in_srgb,var(--color-mark)_8%,transparent)]' : ''}`}
          >
            {part.lead && <RichText text={part.lead} figures={q.figures} figure={renderFigure} />}
            <div className={part.label ? 'grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-2' : 'grid'}>
              {part.label && (
                <button
                  type="button"
                  onClick={() => onActivate(part.partId)}
                  aria-current={on ? 'step' : undefined}
                  className="h-fit pt-0.5 text-left font-mono text-sm font-medium text-ink"
                >
                  {part.label}
                </button>
              )}
              <div className="flex min-w-0 flex-col gap-2">
                <RichText text={part.text} figures={q.figures} figure={renderFigure} blank={gapInput(part.partId, part.label || 'Question')} />
                <p className="m-0 text-right font-mono text-sm text-ink-muted">[{part.marks}]</p>
              </div>
            </div>
          </section>
        )
      })}
    </div>
  )
}
