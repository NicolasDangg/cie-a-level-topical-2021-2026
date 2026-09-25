import { createContext, use } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'

export type ThemeState = {
  preference: ThemePreference
  resolved: 'light' | 'dark'
  darkPaper: boolean
  setPreference: (value: ThemePreference) => void
  setDarkPaper: (value: boolean) => void
}

export const ThemeContext = createContext<ThemeState | null>(null)

export function useTheme(): ThemeState {
  const value = use(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>')
  return value
}
