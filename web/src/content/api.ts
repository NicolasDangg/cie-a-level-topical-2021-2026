import { useCallback, useEffect, useRef, useState } from 'react'
import type { SubjectIndex, TopicFile } from './types'

export const SCHEMA = 'topicalpaper-content/v2'

// The subjects the site publishes, in display order.
export const SUBJECTS = [
  { code: '9702', name: 'Physics' },
  { code: '9618', name: 'Computer Science' },
  { code: '9990', name: 'Psychology' },
] as const

export function isSubject(code: string | undefined): code is (typeof SUBJECTS)[number]['code'] {
  return SUBJECTS.some((s) => s.code === code)
}

export class ContentError extends Error {
  readonly kind: 'not_found' | 'network' | 'bad_data'
  constructor(kind: ContentError['kind'], message: string) {
    super(message)
    this.kind = kind
  }
}

// One request per file per page load; failures are dropped so a retry refetches.
const cache = new Map<string, Promise<unknown>>()

function fetchJson<T>(url: string): Promise<T> {
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
        if (!data || data.schema !== SCHEMA) throw new ContentError('bad_data', `${url} is not ${SCHEMA}`)
        return data as T
      })
    pending.catch(() => cache.delete(url))
    cache.set(url, pending)
  }
  return pending
}

export const loadSubject = (subject: string) => fetchJson<SubjectIndex>(`/content/${subject}/index.json`)
export const loadTopic = (subject: string, slug: string) =>
  fetchJson<TopicFile>(`/content/${subject}/topics/${encodeURIComponent(slug)}.json`)

export type Resource<T> =
  | { status: 'loading' }
  | { status: 'error'; error: ContentError; retry: () => void }
  | { status: 'ready'; data: T }

/** Loads `key` with `load`; re-runs when `key` changes or on retry. */
export function useResource<T>(key: string, load: () => Promise<T>): Resource<T> {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{ key: string; attempt: number; result: Resource<T> }>({
    key,
    attempt,
    result: { status: 'loading' },
  })
  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  // Always call the latest loader; `key` decides when to load again.
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    let live = true
    loadRef.current().then(
      (data) => live && setState({ key, attempt, result: { status: 'ready', data } }),
      (err: unknown) => {
        const error = err instanceof ContentError ? err : new ContentError('network', String(err))
        if (live) setState({ key, attempt, result: { status: 'error', error, retry } })
      },
    )
    return () => {
      live = false
    }
  }, [key, attempt, retry])

  // Until the effect for the current key/attempt resolves, report loading.
  return state.key === key && state.attempt === attempt ? state.result : { status: 'loading' }
}
