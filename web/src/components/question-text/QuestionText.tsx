import type { ExtractedQuestion } from '../../content/types'
import { RichText } from './RichText'

// The whole question as text: stem, then each part with its label, any shared
// lead-in, its text and printed marks. Used by the review tool now and the
// practice-set answering screen later.
export function QuestionText({ question }: { question: ExtractedQuestion }) {
  const { figures } = question
  return (
    <div className="flex flex-col gap-5 font-serif text-[17px] leading-relaxed text-ink">
      {question.stem && <RichText text={question.stem} figures={figures} />}
      {question.parts.map((part) => (
        <section key={part.partId} aria-label={`Part ${part.label}`} className="flex flex-col gap-3">
          {part.lead && <RichText text={part.lead} figures={figures} />}
          <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2">
            <span className="pt-0.5 font-mono text-sm font-medium">{part.label}</span>
            <div className="flex min-w-0 flex-col gap-2">
              <RichText text={part.text} figures={figures} />
              <p className="m-0 flex flex-wrap items-baseline justify-end gap-x-3 font-sans text-sm text-ink-muted">
                {part.answer && (
                  <span>
                    <i className="font-serif">{part.answer.symbol}</i> = <span aria-hidden>…………</span>
                    <span className="sr-only">answer</span> {part.answer.unit ?? ''}
                  </span>
                )}
                <span className="font-mono">[{part.marks}]</span>
              </p>
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}
