import { ContentError } from '../content/api'
import type { ExtractedQuestion } from '../content/types'

// Practice sets: which questions a set may use, the extracted questions
// themselves, and the set's shape in the URL (so refresh or a shared link
// reopens the same set).

export const PRACTICE_SCHEMA = 'topicalpaper-practice/v1'
const QUESTION_SCHEMA = 'topicalpaper-question/v1'

export type PracticeIndex = { schema: string; subject: string; topics: Record<string, { id: string; marks: number }[]> }
export type Mode = 'practice' | 'test'

/** About 1.2 minutes per mark: the pace of a timed A-Level paper. */
export const MINUTES_PER_MARK = 1.2
export const MAX_SET = 20

const cache = new Map<string, Promise<unknown>>()

function fetchChecked<T>(url: string, schema: string): Promise<T> {
  let pending = cache.get(url) as Promise<T> | undefined
  if (!pending) {
    pending = fetch(url)
      .catch(() => {
        throw new ContentError('network', `Couldn't reach ${url}`)
      })
      .then(async (res) => {
        if (res.status === 404) throw new ContentError('not_found', `${url} not found`)
        if (!res.ok) throw new ContentError('network', `${url} returned ${res.status}`)
        const data = await res.json().catch(() => null)
        if (!data || data.schema !== schema) throw new ContentError('bad_data', `${url} is not ${schema}`)
        return data as T
      })
    pending.catch(() => cache.delete(url))
    cache.set(url, pending)
  }
  return pending
}

export const loadPractice = (subject: string) => fetchChecked<PracticeIndex>(`/content/${subject}/practice.json`, PRACTICE_SCHEMA)

export const loadQuestion = (subject: string, id: string) =>
  fetchChecked<ExtractedQuestion>(`/content/${subject}/questions/${encodeURIComponent(id)}.json`, QUESTION_SCHEMA)

export type SetSpec = { subject: string; topic: string; ids: string[]; mode: Mode }

const ID = /^\d{4}-20\d\d-(?:m|mj|on)-\d\d-q\d\d$/

export function setHref(spec: SetSpec, page: 'set' | 'results' = 'set'): string {
  const params = new URLSearchParams({ s: spec.subject, t: spec.topic, q: spec.ids.join(','), mode: spec.mode })
  return `/practice/${page}?${params}`
}

/** The set a URL describes, or null when it isn't a valid set. */
export function readSetSpec(params: URLSearchParams): SetSpec | null {
  const subject = params.get('s') ?? ''
  const topic = params.get('t') ?? ''
  const ids = (params.get('q') ?? '').split(',').filter((id) => ID.test(id) && id.startsWith(subject))
  const mode = params.get('mode') === 'practice' ? 'practice' : 'test'
  if (!/^\d{4}$/.test(subject) || !topic || ids.length === 0) return null
  return { subject, topic, ids: [...new Set(ids)].slice(0, MAX_SET), mode }
}

/** Draw `count` questions at random, without repeats; unseen ones first when asked. */
export function drawSet(pool: { id: string }[], count: number, seen: Set<string>, preferUnseen: boolean): string[] {
  const shuffled = pool.map((q) => q.id)
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const ordered = preferUnseen ? [...shuffled.filter((id) => !seen.has(id)), ...shuffled.filter((id) => seen.has(id))] : shuffled
  return ordered.slice(0, count)
}
