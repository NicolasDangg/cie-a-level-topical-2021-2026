import { useCallback, useEffect, useState } from 'react'
import { readStorage, writeStorage } from '../lib/storage'

// Everything a student writes stays on their device (localStorage), saved as
// they type: per question, per part. Nothing is sent anywhere.

export type Point = [number, number]
/** A drawn mark, in the figure's own pixel coordinates. */
export type Stroke = { tool: 'line' | 'curve' | 'pen'; points: Point[] }

export type PartAnswer = {
  text?: string
  /** Numeric parts: the value on the answer line. */
  final?: string
  /** One entry per [[blank]], in order through the part's text. */
  blanks?: string[]
  /** One entry per slot label. */
  slots?: string[]
  /** Drawings, by figure id. */
  drawings?: Record<string, Stroke[]>
}

export type QuestionAnswers = Record<string, PartAnswer>

const answersKey = (id: string) => `tp:answers:${id}`

function readJson<T>(key: string, fallback: T): T {
  const raw = readStorage(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export const readAnswers = (id: string) => readJson<QuestionAnswers>(answersKey(id), {})

/** A question's answers, saved on every change. */
export function useQuestionAnswers(id: string): [QuestionAnswers, (partId: string, update: Partial<PartAnswer>) => void] {
  const [answers, setAnswers] = useState<QuestionAnswers>(() => readAnswers(id))
  const [loadedFor, setLoadedFor] = useState(id)
  if (loadedFor !== id) {
    setLoadedFor(id)
    setAnswers(readAnswers(id))
  }
  const update = useCallback(
    (partId: string, change: Partial<PartAnswer>) =>
      setAnswers((prev) => {
        const next = { ...prev, [partId]: { ...prev[partId], ...change } }
        writeStorage(answersKey(id), JSON.stringify(next))
        return next
      }),
    [id],
  )
  return [answers, update]
}

export function partIsAnswered(a: PartAnswer | undefined): boolean {
  if (!a) return false
  const filled = (s?: string) => !!s && s.trim().length > 0
  return (
    filled(a.text) ||
    filled(a.final) ||
    (a.blanks ?? []).some(filled) ||
    (a.slots ?? []).some(filled) ||
    Object.values(a.drawings ?? {}).some((strokes) => strokes.length > 0)
  )
}

// A set's own state: flags, timing, self-marks. Keyed by the set's URL, so the
// same set reopened (refresh, back button) picks up where it was.

export type SetState = {
  startedAt: number
  submittedAt?: number
  flagged: string[]
  /** Self-marking after submit: question id -> part id -> marks awarded. */
  marks: Record<string, Record<string, number>>
}

const setKey = (key: string) => `tp:set:${key}`

export function useSetState(key: string): [SetState, (change: (s: SetState) => SetState) => void] {
  const [state, setState] = useState<SetState>(() => readJson(setKey(key), { startedAt: Date.now(), flagged: [], marks: {} }))
  useEffect(() => {
    writeStorage(setKey(key), JSON.stringify(state))
  }, [key, state])
  const update = useCallback((change: (s: SetState) => SetState) => setState(change), [])
  return [state, update]
}

// Questions a student has submitted, per subject, for "prefer questions I haven't answered".
const doneKey = (subject: string) => `tp:done:${subject}`
export const readDone = (subject: string) => new Set(readJson<string[]>(doneKey(subject), []))
export function markDone(subject: string, ids: string[]) {
  writeStorage(doneKey(subject), JSON.stringify([...new Set([...readDone(subject), ...ids])]))
}
