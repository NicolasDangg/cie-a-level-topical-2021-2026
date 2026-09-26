import * as Dialog from '@radix-ui/react-dialog'
import { ExternalLink, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CropSheet } from '../../components/question-card/CropSheet'
import { TapeLayer, TapedText } from '../../components/tape/Tape'
import { splitMarkSchemeText, tapeIds, useTapePreference } from '../../components/tape/tape-state'
import type { Question } from '../../content/types'

export const ANSWER_PANEL_ID = 'answer-panel'

type Props = {
  question: Question | null
  /** Wide screens: a panel beside the questions. Otherwise a full-screen dialog. */
  docked: boolean
  onClose: () => void
}

// The official mark scheme for one question. A component, not an iframe.
export function AnswerPanel({ question, docked, onClose }: Props) {
  if (!docked) {
    return (
      <Dialog.Root open={question !== null} onOpenChange={(open) => !open && onClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30" />
          <Dialog.Content
            aria-describedby={undefined}
            className="panel-slide fixed inset-0 z-50 flex flex-col bg-paper text-ink sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[min(40rem,92vw)] sm:border-l sm:border-rule"
          >
            {question && (
              <PanelBody
                key={question.id}
                question={question}
                onClose={onClose}
                title={<Dialog.Title className={TITLE}>Mark scheme</Dialog.Title>}
              />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    )
  }
  return question ? <DockedPanel question={question} onClose={onClose} /> : null
}

const TITLE = 'm-0 text-xl font-semibold'

function DockedPanel({ question, onClose }: { question: Question; onClose: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  // Move focus into the panel when it opens or switches question.
  useEffect(() => headingRef.current?.focus(), [question.id])

  return (
    <aside
      id={ANSWER_PANEL_ID}
      aria-labelledby="answer-panel-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
      className="panel-slide fixed bottom-0 right-0 top-14 z-20 flex w-[var(--panel-width)] flex-col border-l border-rule bg-paper shadow-sheet"
      data-print="hide"
    >
      <PanelBody
        key={question.id}
        question={question}
        onClose={onClose}
        title={
          <h2 id="answer-panel-title" ref={headingRef} tabIndex={-1} className={`${TITLE} outline-none`}>
            Mark scheme
          </h2>
        }
      />
    </aside>
  )
}

function PanelBody({ question: q, onClose, title }: { question: Question; onClose: () => void; title: ReactNode }) {
  const a = q.answer
  // Tape: one strip per part; peeled strips are remembered while this question is open.
  const [tapeOn, setTapeOn] = useTapePreference()
  const [peeled, setPeeled] = useState<Set<string>>(() => new Set())
  const textParts = useMemo(() => splitMarkSchemeText(a.mark_scheme_text ?? ''), [a.mark_scheme_text])
  const allIds = useMemo(() => [...tapeIds(a.tape), ...textParts.map((_, i) => `text:${i}`)], [a.tape, textParts])
  const imageStrips = tapeIds(a.tape).length
  const peel = (id: string) => setPeeled((prev) => new Set(prev).add(id))
  const peeledImages = [...peeled].filter((id) => !id.startsWith('text:')).length
  return (
    <>
      <div className="flex items-start gap-3 border-b border-rule px-5 py-4">
        <div className="min-w-0 flex-1">
          {title}
          <p className="m-0 mt-1 text-sm text-ink-muted">
            <span className="font-mono text-ink">{q.id}</span> · {q.session} {q.year} · Paper{' '}
            <span className="font-mono">{q.variant}</span> · Question {q.question_number}
            {q.marks !== null && <span className="font-mono"> · [{q.marks}]</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close mark scheme"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-rule text-ink hover:border-rule-strong"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
        {a.status === 'available' ? (
          <div className="space-y-4">
            {imageStrips > 0 && (
              <div data-tape-controls className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={tapeOn}
                    onChange={(e) => setTapeOn(e.target.checked)}
                    className="h-4 w-4 accent-[var(--color-ink)]"
                  />
                  Tape over answers
                </label>
                {tapeOn && (
                  <>
                    <span className="text-ink-muted" aria-live="polite">
                      {peeledImages} of {imageStrips} revealed
                    </span>
                    <span className="ml-auto flex gap-3">
                      <button
                        type="button"
                        onClick={() => setPeeled(new Set(allIds))}
                        disabled={peeled.size >= allIds.length}
                        className="text-ink underline decoration-rule-strong underline-offset-2 disabled:text-ink-muted disabled:no-underline"
                      >
                        Reveal all
                      </button>
                      <button
                        type="button"
                        onClick={() => setPeeled(new Set())}
                        disabled={peeled.size === 0}
                        className="text-ink underline decoration-rule-strong underline-offset-2 disabled:text-ink-muted disabled:no-underline"
                      >
                        Cover all
                      </button>
                    </span>
                  </>
                )}
              </div>
            )}
            {a.image_paths.map((src, i) => {
              const tape = a.tape?.[i]
              return (
                <CropSheet
                  key={src}
                  src={src}
                  alt={`Official mark scheme for ${q.id}, page ${a.source_pages[i] ?? i + 1}`}
                  sourcePdfUrl={a.mark_scheme_url ?? q.source_pdf_url}
                  sourcePage={a.source_pages[i]}
                  overlay={
                    tapeOn && tape ? (
                      <TapeLayer tape={tape} page={i} pages={a.image_paths.length} peeled={peeled} onPeel={peel} />
                    ) : undefined
                  }
                />
              )
            })}
            <p className="m-0 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
              Mark scheme page{a.source_pages.length === 1 ? '' : 's'} <span className="font-mono">{a.source_pages.join(', ')}</span>
              {a.mark_scheme_url && (
                <>
                  <span aria-hidden>·</span>
                  <a href={a.mark_scheme_url} className="inline-flex items-center gap-1 underline decoration-rule-strong underline-offset-2 hover:text-ink">
                    Mark scheme PDF <ExternalLink size={12} aria-hidden />
                  </a>
                </>
              )}
            </p>
            {a.mark_scheme_text && (
              <details className="rounded-md border border-rule">
                <summary className="cursor-pointer px-3 py-2 text-sm">Text version</summary>
                <div className="border-t border-rule">
                  {tapeOn ? (
                    <TapedText parts={textParts} peeled={peeled} onPeel={peel} />
                  ) : (
                    <pre className="m-0 whitespace-pre-wrap break-words px-3 py-3 font-mono text-[13px] leading-relaxed text-ink">
                      {a.mark_scheme_text}
                    </pre>
                  )}
                </div>
              </details>
            )}
          </div>
        ) : (
          <p className="m-0 text-sm text-ink-muted">
            The official mark scheme for this question isn't available{a.reason ? `: ${a.reason}` : '.'}
          </p>
        )}
      </div>
    </>
  )
}
