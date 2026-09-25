import { ImageOff, RotateCw } from 'lucide-react'
import { useState } from 'react'

type LoadState = 'loading' | 'loaded' | 'error'

type Props = {
  src: string
  alt: string
  sourcePdfUrl: string
  sourcePage?: number
  /** Fixtures only: pin the sheet in a state without a real network failure. */
  forceState?: 'loading' | 'error'
}

// One crop, shown as a sheet of paper on the desk. The PNGs are ~852px wide;
// they scale down to the column and never overflow.
export function CropSheet({ src, alt, sourcePdfUrl, sourcePage, forceState }: Props) {
  const [state, setState] = useState<LoadState>('loading')
  const [attempt, setAttempt] = useState(0)
  const shown = forceState ?? state

  return (
    <figure className="crop-sheet relative m-0 overflow-hidden rounded-[2px] border border-rule bg-sheet shadow-sheet">
      {shown === 'error' ? (
        <div role="alert" className="flex min-h-48 flex-col items-center justify-center gap-3 bg-paper px-6 py-10 text-center">
          <ImageOff size={22} className="text-ink-muted" aria-hidden />
          <p className="m-0 text-sm text-ink">This part of the question didn't load.</p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm" data-print="hide">
            <button
              type="button"
              onClick={() => {
                setState('loading')
                setAttempt((n) => n + 1)
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-rule-strong px-3 py-1.5 text-ink hover:bg-desk"
            >
              <RotateCw size={14} aria-hidden /> Try again
            </button>
            <a href={sourcePdfUrl} className="text-ink underline decoration-rule-strong underline-offset-2">
              Open the source PDF{sourcePage ? ` (page ${sourcePage})` : ''}
            </a>
          </div>
        </div>
      ) : (
        <>
          {shown === 'loading' && (
            <div className="skeleton absolute inset-0" aria-hidden />
          )}
          {forceState !== 'loading' && (
            <img
              key={attempt}
              src={attempt ? `${src}?retry=${attempt}` : src}
              alt={alt}
              loading="lazy"
              decoding="async"
              onLoad={() => setState('loaded')}
              onError={() => setState('error')}
              className={`crop-img relative block h-auto w-full ${shown === 'loading' ? 'min-h-72 opacity-0' : ''}`}
            />
          )}
          {forceState === 'loading' && <div className="min-h-72" />}
          {shown === 'loading' && <span className="sr-only">Loading question image</span>}
        </>
      )}
    </figure>
  )
}
