import { type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import type { MarkSchemeTape } from '../../content/types'
import type { TextPart } from './tape-state'

// Peel-off tape over mark-scheme answers, one strip per part, so a student can
// check one part without seeing the rest. Tape positions come from
// export_data.py (mark_scheme_tape); the printed part labels stay visible.

/** After peeling, keep the keyboard moving: focus the next strip still in place. */
function focusNextTape(from: HTMLElement) {
  const strips = [...document.querySelectorAll<HTMLElement>('[data-tape]:not([data-state="peeled"])')]
  const next = strips.find((el) => from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
  ;(next ?? document.querySelector<HTMLElement>('[data-tape-controls] button'))?.focus()
}

function Strip({
  peeled,
  label,
  style,
  onPeel,
  children,
}: {
  peeled: boolean
  label: string
  style?: CSSProperties
  onPeel: () => void
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      data-tape
      data-state={peeled ? 'peeled' : 'on'}
      aria-label={label}
      aria-hidden={peeled || undefined}
      tabIndex={peeled ? -1 : 0}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        onPeel()
        focusNextTape(e.currentTarget)
      }}
      className={style ? 'tape' : 'tape tape-inline'}
      style={style}
    >
      <span className="tape-label">{children ?? 'Tap to reveal'}</span>
    </button>
  )
}

/** Tape over one mark-scheme page image. Ids are `${page}:${band}`. */
export function TapeLayer({
  tape,
  page,
  pages,
  peeled,
  onPeel,
}: {
  tape: MarkSchemeTape
  page: number
  pages: number
  peeled: Set<string>
  onPeel: (id: string) => void
}) {
  const [tableLeft, answerLeft, right] = tape.x
  return (
    <>
      {tape.bands.map((band, i) => {
        const id = `${page}:${i}`
        const left = band.wide ? tableLeft : answerLeft
        const [top, bottom] = band.y
        return (
          <Strip
            key={id}
            peeled={peeled.has(id)}
            label={`Reveal answer ${i + 1} of ${tape.bands.length}${pages > 1 ? ` on page ${page + 1}` : ''}`}
            onPeel={() => onPeel(id)}
            style={{
              left: `calc(${left * 100}% + 3px)`,
              width: `calc(${(right - left) * 100}% - 6px)`,
              top: `calc(${top * 100}% + 3px)`,
              height: `calc(${(bottom - top) * 100}% - 6px)`,
            }}
          />
        )
      })}
    </>
  )
}

/** The text version, one peelable block per part. Hidden text isn't in the page until peeled. */
export function TapedText({ parts, peeled, onPeel }: { parts: TextPart[]; peeled: Set<string>; onPeel: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-2 px-3 py-3">
      {parts.map((part, i) => {
        const id = `text:${i}`
        const open = peeled.has(id)
        return (
          <div key={id} className="relative">
            {open ? (
              <pre className="m-0 whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-ink">{part.text}</pre>
            ) : (
              <Strip peeled={false} label={`Reveal ${part.label ?? 'this part'}`} onPeel={() => onPeel(id)}>
                <span className="font-mono">{part.label ?? '…'}</span> · tap to reveal
              </Strip>
            )}
          </div>
        )
      })}
    </div>
  )
}
