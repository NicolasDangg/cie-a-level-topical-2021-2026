import { useState, type ReactNode } from 'react'
import { ModeToggle, type Mode } from '../../components/ModeToggle'
import { ThemeMenu } from '../../components/ThemeMenu'
import { QuestionCard } from '../../components/question-card/QuestionCard'
import { QuestionCardSkeleton } from '../../components/question-card/QuestionCardSkeleton'
import type { PartState } from '../../components/question-card/types'
import {
  consumer,
  fakeGrade,
  gravitation,
  noMarkScheme,
  packetGrading,
  packetParts,
  packetSwitching,
  rpn,
  rpnAllStates,
  rpnErrors,
  rpnParts,
} from './fixtures'

// Dev-only: every state of the question card, side by side, from fixtures.
export default function DevCard() {
  return (
    <div className="min-h-dvh bg-desk">
      <header
        className="flex flex-wrap items-center gap-3 border-b border-rule px-4 py-3 sm:px-6"
        data-print="hide"
      >
        <h1 className="m-0 font-serif text-xl font-semibold text-ink">Question card</h1>
        <span className="font-mono text-xs text-ink-muted">/dev/card</span>
        <span className="ml-auto">
          <ThemeMenu />
        </span>
      </header>

      <main className="mx-auto grid max-w-[120rem] grid-cols-[repeat(auto-fill,minmax(min(100%,46rem),1fr))] items-start gap-x-6 gap-y-10 px-4 py-6 sm:px-6">
        <Playground />

        <Specimen title="Browse">
          <QuestionCard question={gravitation} mode="browse" anchorId="s-browse" />
        </Specimen>
        <Specimen title="Browse · answer panel open">
          <QuestionCard question={packetSwitching} mode="browse" answerOpen anchorId="s-open" />
        </Specimen>
        <Specimen title="Browse · no mark scheme">
          <QuestionCard question={noMarkScheme} mode="browse" anchorId="s-noms" />
        </Specimen>
        <Specimen title="Loading · question data">
          <QuestionCardSkeleton />
        </Specimen>
        <Specimen title="Loading · crop image">
          <QuestionCard question={packetSwitching} mode="browse" forceImageState="loading" anchorId="s-imgload" />
        </Specimen>
        <Specimen title="Error · crop failed to load">
          <QuestionCard question={packetSwitching} mode="browse" forceImageState="error" anchorId="s-imgerr" />
        </Specimen>

        <Specimen title="Practice · not available yet">
          <QuestionCard question={consumer} mode="practice" parts={null} anchorId="s-na" />
        </Specimen>
        <Specimen title="Practice · empty, answer locked">
          <QuestionCard question={packetSwitching} mode="practice" parts={packetParts} answerLocked anchorId="s-empty" />
        </Specimen>
        <Specimen title="Practice · checking">
          <QuestionCard
            question={packetSwitching}
            mode="practice"
            parts={packetParts}
            partStates={packetGrading}
            answerLocked
            anchorId="s-grading"
          />
        </Specimen>
        <Specimen title="Practice · every grading state (counted, capped, blocked, missed, borderline + provisional)">
          <QuestionCard question={rpn} mode="practice" parts={rpnParts} partStates={rpnAllStates} anchorId="s-graded" />
        </Specimen>
        <Specimen title="Practice · every error (rate limited, verification, not found, unavailable, network)">
          <QuestionCard question={rpn} mode="practice" parts={rpnParts} partStates={rpnErrors} answerLocked anchorId="s-errors" />
        </Specimen>
      </main>
    </div>
  )
}

function Specimen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0" aria-label={title} data-print-page>
      <h2 className="m-0 mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted" data-print="hide">
        {title}
      </h2>
      {children}
    </section>
  )
}

// Interactive card: type, check, see the result and the count-up.
function Playground() {
  const [mode, setMode] = useState<Mode>('practice')
  const [state, setState] = useState<Record<string, PartState>>({})
  const [answerOpen, setAnswerOpen] = useState(false)
  const checked = Object.values(state).some((s) => s.status.kind === 'graded')

  return (
    <Specimen title="Interactive">
      <div className="mb-3" data-print="hide">
        <ModeToggle value={mode} onChange={setMode} />
      </div>
      <QuestionCard
        question={packetSwitching}
        mode={mode}
        parts={packetParts}
        partStates={state}
        anchorId="s-live"
        answerOpen={answerOpen}
        answerLocked={mode === 'practice' && !checked}
        onToggleAnswer={() => setAnswerOpen((open) => !open)}
        onAnswerChange={(partId, answer) =>
          setState((prev) => ({ ...prev, [partId]: { answer, status: prev[partId]?.status ?? { kind: 'idle' } } }))
        }
        onSubmit={(partId) => {
          const answer = state[partId]?.answer ?? ''
          setState((prev) => ({ ...prev, [partId]: { answer, status: { kind: 'grading' } } }))
          window.setTimeout(() => {
            setState((prev) => ({ ...prev, [partId]: { answer, status: { kind: 'graded', result: fakeGrade(answer) } } }))
          }, 600)
        }}
      />
    </Specimen>
  )
}
