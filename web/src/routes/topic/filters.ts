import type { Question } from '../../content/types'

// Filter state lives in the URL (?year=2023,2024&session=on&paper=42&repeats=show)
// so a filtered topic can be bookmarked or shared.

export type Filters = {
  years: Set<string>
  sessions: Set<string>
  papers: Set<string>
  showRepeats: boolean
}

const SESSION_LABELS: Record<string, string> = { m: 'March', mj: 'May/June', on: 'Oct/Nov' }
const SESSION_ORDER = ['m', 'mj', 'on']

function list(params: URLSearchParams, key: string) {
  return new Set((params.get(key) ?? '').split(',').filter(Boolean))
}

export function readFilters(params: URLSearchParams): Filters {
  return {
    years: list(params, 'year'),
    sessions: list(params, 'session'),
    papers: list(params, 'paper'),
    showRepeats: params.get('repeats') === 'show',
  }
}

export function writeFilters(params: URLSearchParams, filters: Filters): URLSearchParams {
  const next = new URLSearchParams(params)
  const set = (key: string, values: Set<string>) =>
    values.size ? next.set(key, [...values].sort().join(',')) : next.delete(key)
  set('year', filters.years)
  set('session', filters.sessions)
  set('paper', filters.papers)
  if (filters.showRepeats) next.set('repeats', 'show')
  else next.delete('repeats')
  return next
}

export function isFiltered(filters: Filters) {
  return filters.years.size + filters.sessions.size + filters.papers.size > 0
}

export type Option = { value: string; label: string; count: number }

export function filterOptions(questions: Question[]) {
  const count = (key: (q: Question) => string) => {
    const counts = new Map<string, number>()
    for (const q of questions) counts.set(key(q), (counts.get(key(q)) ?? 0) + 1)
    return counts
  }
  const years = count((q) => String(q.year))
  const sessions = count((q) => q.session_code)
  const papers = count((q) => q.variant)
  return {
    years: [...years].sort(([a], [b]) => a.localeCompare(b)).map(([value, n]) => ({ value, label: value, count: n })),
    sessions: SESSION_ORDER.filter((s) => sessions.has(s)).map((s) => ({ value: s, label: SESSION_LABELS[s], count: sessions.get(s)! })),
    papers: [...papers].sort(([a], [b]) => a.localeCompare(b)).map(([value, n]) => ({ value, label: value, count: n })),
  }
}

/** Questions to show, in order. `keep` is always included (an answer panel's question). */
export function applyFilters(questions: Question[], filters: Filters, keep?: string | null) {
  const shown = questions.filter(
    (q) =>
      q.id === keep ||
      ((filters.showRepeats || q.duplicate_of === null) &&
        (!filters.years.size || filters.years.has(String(q.year))) &&
        (!filters.sessions.size || filters.sessions.has(q.session_code)) &&
        (!filters.papers.size || filters.papers.has(q.variant))),
  )
  const hiddenRepeats = filters.showRepeats ? 0 : questions.filter((q) => q.duplicate_of !== null && q.id !== keep).length
  return { shown, hiddenRepeats }
}
