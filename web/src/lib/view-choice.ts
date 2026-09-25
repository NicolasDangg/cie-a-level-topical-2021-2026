import { writeStorage } from './storage'

// Shared with the classic pages' inline scripts (build_classic_html.py and the
// root index.html): 'app' makes the classic home page forward to /app/.
export const VIEW_KEY = 'tp:view'

export function rememberAppView() {
  writeStorage(VIEW_KEY, 'app')
}

/** The classic page equivalent to an app location; `?view=classic` makes it remember the choice. */
export function classicHref(subject?: string, topicSlug?: string, answerId?: string | null): string {
  if (subject && topicSlug) {
    const page = answerId ? 'answers.html' : 'questions.html'
    return `/${subject}/${topicSlug}/${page}?view=classic${answerId ? `#${encodeURIComponent(answerId)}` : ''}`
  }
  if (subject) return `/${subject}/index.html?view=classic`
  return '/?view=classic'
}
