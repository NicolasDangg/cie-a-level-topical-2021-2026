import { Check, Info, Minus } from 'lucide-react'
import type { MarkPoint, PartResult } from './types'

// The examiner's red pen. Every state has its own glyph and wording, so none
// relies on colour; missed points are neutral grey, never red.

function StruckTick() {
  return (
    <span className="relative inline-flex" aria-hidden>
      <Check size={16} strokeWidth={2.5} />
      <svg viewBox="0 0 16 16" className="absolute inset-0" width={16} height={16}>
        <line x1="2" y1="14" x2="14" y2="2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    </span>
  )
}

const STATE_LABEL: Record<MarkPoint['state'], string> = {
  counted: 'Counted',
  capped: 'Correct, not counted',
  blocked: 'Correct, not counted',
  uncertain: 'Borderline',
  missed: 'Not awarded',
}

function Point({ point }: { point: MarkPoint }) {
  const { state } = point
  const glyph =
    state === 'missed' ? (
      <Minus size={16} strokeWidth={2} aria-hidden />
    ) : state === 'capped' ? (
      <StruckTick />
    ) : state === 'uncertain' ? (
      <span className="font-mono text-[13px] leading-4" aria-hidden>?</span>
    ) : (
      <Check size={16} strokeWidth={2.5} aria-hidden />
    )

  const note =
    state === 'capped'
      ? 'correct, but the marks for this were already used up'
      : state === 'blocked'
        ? `needs ${point.blockedBy ?? 'an earlier point'} first`
        : state === 'uncertain'
          ? 'borderline'
          : null

  return (
    <li
      className={
        'grid grid-cols-[1.25rem_1fr] gap-x-2 py-1 ' +
        (state === 'uncertain' ? '-mx-2 rounded-[3px] border border-dashed border-rule-strong px-2 py-1.5 ' : '')
      }
      data-state={state}
    >
      <span className={`mt-0.5 flex justify-center ${state === 'missed' || state === 'uncertain' ? 'text-ink-muted' : 'text-mark'}`}>
        {glyph}
      </span>
      <span className={state === 'missed' ? 'text-ink-muted' : 'text-ink'}>
        <span className="sr-only">{STATE_LABEL[state]}: </span>
        <span className={state === 'capped' ? 'line-through decoration-ink-muted' : ''}>{point.text}</span>
        {note && (
          <span className={`block text-sm text-ink-muted ${state === 'uncertain' ? 'font-medium' : 'italic'}`}>{note}</span>
        )}
      </span>
    </li>
  )
}

export function MarkPoints({ result }: { result: PartResult }) {
  return (
    <div className="mt-3">
      <ul className="m-0 list-none space-y-0.5 p-0 text-[15px]" aria-label="Marking">
        {result.points.map((point) => (
          <Point key={point.id} point={point} />
        ))}
      </ul>
      {result.provisional && (
        <p className="m-0 mt-2 flex items-start gap-1.5 text-sm text-ink-muted">
          <Info size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            <span aria-hidden className="font-mono text-mark">* </span>Provisional score: borderline points weren't counted.
          </span>
        </p>
      )}
    </div>
  )
}
