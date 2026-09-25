import { useEffect, useState } from 'react'
import { usePrefersReducedMotion } from '../../lib/motion'

// The score written in the right-hand margin, as an examiner would. Before
// grading it shows the part's printed mark allocation.
export function MarginScore({ marks, score, provisional }: { marks: number; score?: number; provisional?: boolean }) {
  const shown = useCountUp(score)
  if (score === undefined) {
    return (
      <span className="font-mono text-sm text-ink-muted" aria-label={`${marks} ${marks === 1 ? 'mark' : 'marks'}`}>
        [{marks}]
      </span>
    )
  }
  return (
    <span className="inline-flex flex-col items-end leading-none text-mark">
      <span className="sr-only">
        Scored {score} out of {marks}
        {provisional ? ', provisional' : ''}
      </span>
      <span aria-hidden className="font-mono">
        <span className="text-2xl font-medium tabular-nums">{shown}</span>
        {/* Asterisk ties to the "* Provisional score" note under the points. */}
        {provisional && <span className="text-base">*</span>}
        <span className="text-sm">/{marks}</span>
      </span>
    </span>
  )
}

// Counts up from 0 once when a score first arrives; instant under reduced motion.
function useCountUp(target: number | undefined) {
  const reduced = usePrefersReducedMotion()
  const animate = target !== undefined && target > 0 && !reduced
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!animate) return
    const duration = 500
    const start = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / duration)
      setValue(Math.round(target * (1 - (1 - t) ** 3)))
      if (t < 1) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [target, animate])
  return animate ? value : (target ?? 0)
}
