// What the card needs to render Practice mode. These are view types: the
// Phase 3 grader adapter maps its API responses into them, so the card never
// depends on the grading API's wire format.

export type PracticePart = {
  partId: string
  label: string // as printed, e.g. "(a)(i)"
  marks: number
}

export type PointState = 'counted' | 'capped' | 'blocked' | 'uncertain' | 'missed'

export type MarkPoint = {
  id: string
  text: string
  state: PointState
  blockedBy?: string // label of the point this one depends on
}

export type PartResult = {
  score: number
  max: number
  provisional: boolean // borderline points exist and were not counted
  points: MarkPoint[]
}

export type GradingErrorKind = 'rate_limited' | 'verification' | 'not_found' | 'unavailable' | 'network'

export type GradingError = { kind: GradingErrorKind; retryAfterSec?: number }

export type PartStatus =
  | { kind: 'idle' }
  | { kind: 'grading' }
  | { kind: 'graded'; result: PartResult }
  | { kind: 'error'; error: GradingError }

export type PartState = { answer: string; status: PartStatus }
