import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { readStorage, writeStorage } from '../lib/storage'
import { ThemeContext, type ThemePreference, type ThemeState } from './context'

// Keys are shared with the pre-paint script in index.html.
const THEME_KEY = 'tp:theme'
const PAPER_KEY = 'tp:dark-paper'

function readPreference(): ThemePreference {
  const value = readStorage(THEME_KEY)
  return value === 'light' || value === 'dark' ? value : 'system'
}

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState(readPreference)
  const [darkPaper, setDarkPaperState] = useState(() => readStorage(PAPER_KEY) === '1')
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const resolved = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = resolved
    // Dark paper only applies on a dark desk; the choice is kept either way.
    root.dataset.paper = resolved === 'dark' && darkPaper ? 'dark' : 'light'
  }, [resolved, darkPaper])

  const value = useMemo<ThemeState>(
    () => ({
      preference,
      resolved,
      darkPaper,
      setPreference(next) {
        setPreferenceState(next)
        writeStorage(THEME_KEY, next === 'system' ? null : next)
      },
      setDarkPaper(next) {
        setDarkPaperState(next)
        writeStorage(PAPER_KEY, next ? '1' : null)
      },
    }),
    [preference, resolved, darkPaper],
  )

  return <ThemeContext value={value}>{children}</ThemeContext>
}
