import { Eraser, Minus, PenLine, Redo2, Spline, Trash2, Undo2 } from 'lucide-react'
import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import type { ExtractedFigure } from '../content/types'
import type { Point, Stroke } from './answers'

// A figure the student can draw on: "On Fig. 1.2, draw an arrow…", "sketch the
// graph…". Strokes are vectors in the figure's own pixel coordinates, so they
// line up at any screen size and in the results. Tools: pen (freehand),
// straight line, smooth curve through clicked points, eraser, undo/redo.

type Tool = 'pen' | 'line' | 'curve' | 'eraser'

const TOOLS: { id: Tool; label: string; icon: ReactNode }[] = [
  { id: 'pen', label: 'Pen', icon: <PenLine size={16} aria-hidden /> },
  { id: 'line', label: 'Straight line', icon: <Minus size={16} aria-hidden /> },
  { id: 'curve', label: 'Smooth curve: click points, double-click or Enter to finish', icon: <Spline size={16} aria-hidden /> },
  { id: 'eraser', label: 'Eraser: click a mark to remove it', icon: <Eraser size={16} aria-hidden /> },
]

/** A smooth path through points (Catmull-Rom as cubic Béziers). */
function smoothPath(points: Point[]): string {
  if (points.length < 3) return linePath(points)
  let d = `M${points[0][0]},${points[0][1]}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`
  }
  return d
}

const linePath = (points: Point[]) => points.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')

export const strokePath = (s: Stroke) => (s.tool === 'curve' ? smoothPath(s.points) : linePath(s.points))

const round = (n: number) => Math.round(n * 10) / 10

type Props = {
  figure: ExtractedFigure
  strokes?: Stroke[]
  /** Omit for a read-only figure (results). */
  onChange?: (strokes: Stroke[]) => void
  /** Other parts' marks on the same figure: shown, not editable. */
  underlay?: Stroke[]
}

export function DrawingFigure({ figure, strokes = [], onChange, underlay = [] }: Props) {
  const [x0, y0, x1, y1] = figure.box
  const [imgW, imgH] = figure.source_size
  const w = (x1 - x0) * imgW
  const h = (y1 - y0) * imgH
  const svg = useRef<SVGSVGElement>(null)
  const [tool, setTool] = useState<Tool>('pen')
  const [draft, setDraft] = useState<Stroke | null>(null)
  const [redo, setRedo] = useState<Stroke[]>([])
  const editable = !!onChange

  const toFigure = (e: PointerEvent): Point => {
    const r = svg.current!.getBoundingClientRect()
    return [round(((e.clientX - r.left) / r.width) * w), round(((e.clientY - r.top) / r.height) * h)]
  }
  const commit = (stroke: Stroke) => {
    if (stroke.points.length < 2) return
    onChange?.([...strokes, stroke])
    setRedo([])
  }
  const finishCurve = () => {
    if (draft?.tool === 'curve') commit({ tool: 'curve', points: draft.points.slice(0, -1) })
    setDraft(null)
  }

  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (!editable || e.button !== 0 || tool === 'eraser') return
    e.preventDefault()
    const p = toFigure(e)
    if (tool === 'curve') {
      // Each click fixes a point; the last point follows the pointer.
      setDraft((d) => ({ tool: 'curve', points: d?.tool === 'curve' ? [...d.points.slice(0, -1), p, p] : [p, p] }))
      return
    }
    svg.current?.setPointerCapture(e.pointerId)
    setDraft({ tool, points: [p, p] })
  }
  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (!draft) return
    const p = toFigure(e)
    setDraft((d) => {
      if (!d) return d
      if (d.tool === 'pen') return { ...d, points: [...d.points, p] }
      return { ...d, points: [...d.points.slice(0, -1), p] }
    })
  }
  const up = () => {
    if (!draft || draft.tool === 'curve') return
    commit(draft)
    setDraft(null)
  }

  const undo = () => {
    if (draft) return setDraft(null)
    const last = strokes[strokes.length - 1]
    if (!last) return
    onChange?.(strokes.slice(0, -1))
    setRedo((r) => [...r, last])
  }
  const redoLast = () => {
    const next = redo[redo.length - 1]
    if (!next) return
    onChange?.([...strokes, next])
    setRedo((r) => r.slice(0, -1))
  }

  const visible = draft ? [...strokes, draft] : strokes
  return (
    <figure className="m-0 flex flex-col items-center gap-1.5 py-1">
      {editable && (
        <div role="toolbar" aria-label={`Drawing tools for ${figure.caption ?? 'the figure'}`} className="flex flex-wrap items-center gap-1 rounded-md border border-rule bg-paper p-1 font-sans">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tool === t.id}
              title={t.label}
              aria-label={t.label}
              onClick={() => {
                finishCurve()
                setTool(t.id)
              }}
              className={`inline-flex h-8 w-8 items-center justify-center rounded ${tool === t.id ? 'bg-ink text-desk' : 'text-ink hover:bg-desk'}`}
            >
              {t.icon}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-rule" aria-hidden />
          <button type="button" title="Undo" aria-label="Undo" onClick={undo} disabled={!strokes.length && !draft} className="inline-flex h-8 w-8 items-center justify-center rounded text-ink hover:bg-desk disabled:opacity-40">
            <Undo2 size={16} aria-hidden />
          </button>
          <button type="button" title="Redo" aria-label="Redo" onClick={redoLast} disabled={!redo.length} className="inline-flex h-8 w-8 items-center justify-center rounded text-ink hover:bg-desk disabled:opacity-40">
            <Redo2 size={16} aria-hidden />
          </button>
          <button
            type="button"
            title="Clear drawing"
            aria-label="Clear drawing"
            onClick={() => {
              setDraft(null)
              if (strokes.length) setRedo([])
              onChange?.([])
            }}
            disabled={!strokes.length}
            className="inline-flex h-8 w-8 items-center justify-center rounded text-ink hover:bg-desk disabled:opacity-40"
          >
            <Trash2 size={16} aria-hidden />
          </button>
          {draft?.tool === 'curve' && (
            <button type="button" onClick={finishCurve} className="ml-1 h-8 rounded bg-ink px-2 text-xs font-medium text-desk">
              Finish curve
            </button>
          )}
        </div>
      )}
      <div
        className="relative w-full overflow-hidden bg-sheet"
        style={{ maxWidth: `${Math.round(w)}px`, aspectRatio: `${w} / ${h}` }}
      >
        <img
          src={figure.source_image}
          alt={figure.alt}
          loading="lazy"
          decoding="async"
          className="crop-img absolute max-w-none select-none"
          draggable={false}
          style={{ width: `${100 / (x1 - x0)}%`, height: `${100 / (y1 - y0)}%`, left: `${(-x0 / (x1 - x0)) * 100}%`, top: `${(-y0 / (y1 - y0)) * 100}%` }}
        />
        <svg
          ref={svg}
          viewBox={`0 0 ${w} ${h}`}
          role={editable ? 'application' : 'img'}
          aria-label={
            editable
              ? `Drawing area over ${figure.caption ?? 'the figure'}. ${strokes.length} mark${strokes.length === 1 ? '' : 's'} drawn.`
              : `Your drawing on ${figure.caption ?? 'the figure'}: ${strokes.length} mark${strokes.length === 1 ? '' : 's'}`
          }
          tabIndex={editable ? 0 : undefined}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => setDraft(null)}
          onDoubleClick={finishCurve}
          onKeyDown={(e) => {
            if (e.key === 'Enter') finishCurve()
            else if (e.key === 'Escape') setDraft(null)
            else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
              e.preventDefault()
              if (e.shiftKey) redoLast()
              else undo()
            }
          }}
          className={`absolute inset-0 h-full w-full ${editable ? (tool === 'eraser' ? 'cursor-pointer' : 'cursor-crosshair') + ' touch-none' : ''}`}
        >
          {underlay.map((s, i) => (
            <path key={`u${i}`} d={strokePath(s)} fill="none" stroke="var(--color-pen)" strokeOpacity={0.45} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
          ))}
          {visible.map((s, i) => (
            <g key={i}>
              <path d={strokePath(s)} fill="none" stroke="var(--color-pen)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
              {editable && tool === 'eraser' && s !== draft && (
                // A wide invisible twin makes thin marks easy to hit.
                <path
                  d={strokePath(s)}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  pointerEvents="stroke"
                  className="cursor-pointer"
                  onClick={() => onChange?.(strokes.filter((_, j) => j !== i))}
                />
              )}
            </g>
          ))}
        </svg>
      </div>
      {figure.caption && <figcaption className="font-sans text-sm font-semibold">{figure.caption}</figcaption>}
    </figure>
  )
}
