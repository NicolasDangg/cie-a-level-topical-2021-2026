import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import type { ExtractedFigure } from '../../content/types'

// Figure boxes drawn over a scan in the review tool. Drag a box to move it, an
// edge or corner to resize. Keyboard: arrows move, Shift+arrows move the
// bottom-right corner, Alt+arrows the top-left. Boxes are fractions of the image.

export type Box = ExtractedFigure['box']
type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

// The smallest box question_schema.py accepts.
const MIN_W = 0.03
const MIN_H = 0.02
const STEP = 0.004

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const round = (n: number) => Math.round(n * 10000) / 10000

export function adjust(box: Box, handle: Handle, dx: number, dy: number): Box {
  let [x0, y0, x1, y1] = box
  if (handle === 'move') {
    dx = clamp(dx, -x0, 1 - x1)
    dy = clamp(dy, -y0, 1 - y1)
    return [x0 + dx, y0 + dy, x1 + dx, y1 + dy].map(round) as Box
  }
  if (handle.includes('w')) x0 = clamp(x0 + dx, 0, x1 - MIN_W)
  if (handle.includes('e')) x1 = clamp(x1 + dx, x0 + MIN_W, 1)
  if (handle.includes('n')) y0 = clamp(y0 + dy, 0, y1 - MIN_H)
  if (handle.includes('s')) y1 = clamp(y1 + dy, y0 + MIN_H, 1)
  return [x0, y0, x1, y1].map(round) as Box
}

const HANDLES: { handle: Handle; className: string }[] = [
  { handle: 'n', className: 'left-2 right-2 -top-1.5 h-3 cursor-ns-resize' },
  { handle: 's', className: 'left-2 right-2 -bottom-1.5 h-3 cursor-ns-resize' },
  { handle: 'w', className: 'top-2 bottom-2 -left-1.5 w-3 cursor-ew-resize' },
  { handle: 'e', className: 'top-2 bottom-2 -right-1.5 w-3 cursor-ew-resize' },
  { handle: 'nw', className: '-left-1.5 -top-1.5 h-3 w-3 cursor-nwse-resize bg-mark' },
  { handle: 'ne', className: '-right-1.5 -top-1.5 h-3 w-3 cursor-nesw-resize bg-mark' },
  { handle: 'sw', className: '-bottom-1.5 -left-1.5 h-3 w-3 cursor-nesw-resize bg-mark' },
  { handle: 'se', className: '-bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize bg-mark' },
]

export function FigureBoxes({ figures, onChange }: { figures: ExtractedFigure[]; onChange: (id: string, box: Box) => void }) {
  const layer = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; handle: Handle; x: number; y: number; box: Box } | null>(null)

  const start = (e: PointerEvent, figure: ExtractedFigure, handle: Handle) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    layer.current?.setPointerCapture(e.pointerId)
    drag.current = { id: figure.id, handle, x: e.clientX, y: e.clientY, box: figure.box }
  }
  const move = (e: PointerEvent) => {
    const d = drag.current
    const rect = layer.current?.getBoundingClientRect()
    if (!d || !rect) return
    onChange(d.id, adjust(d.box, d.handle, (e.clientX - d.x) / rect.width, (e.clientY - d.y) / rect.height))
  }
  const end = () => {
    drag.current = null
  }

  const onKey = (e: KeyboardEvent, figure: ExtractedFigure) => {
    const delta: Record<string, [number, number]> = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] }
    const d = delta[e.key]
    if (!d) return
    e.preventDefault()
    e.stopPropagation()
    onChange(figure.id, adjust(figure.box, e.shiftKey ? 'se' : e.altKey ? 'nw' : 'move', d[0], d[1]))
  }

  return (
    <div ref={layer} className="absolute inset-0" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      {figures.map((figure) => {
        const [x0, y0, x1, y1] = figure.box
        return (
          <div
            key={figure.id}
            data-figure-box={figure.id}
            role="group"
            tabIndex={0}
            aria-label={`Figure ${figure.id} box. Arrows move it; Shift+arrows resize from the bottom right, Alt+arrows from the top left.`}
            onKeyDown={(e) => onKey(e, figure)}
            onPointerDown={(e) => start(e, figure, 'move')}
            className="absolute cursor-move touch-none outline-2 outline-mark [outline-style:solid] focus-visible:outline-offset-2"
            style={{ left: `${x0 * 100}%`, top: `${y0 * 100}%`, width: `${(x1 - x0) * 100}%`, height: `${(y1 - y0) * 100}%` }}
          >
            <span className="pointer-events-none absolute -top-5 left-0 rounded-sm bg-mark px-1 font-mono text-[11px] leading-4 text-paper">
              {figure.id}
            </span>
            {HANDLES.map(({ handle, className }) => (
              <span key={handle} aria-hidden onPointerDown={(e) => start(e, figure, handle)} className={`absolute touch-none ${className}`} />
            ))}
          </div>
        )
      })}
    </div>
  )
}
