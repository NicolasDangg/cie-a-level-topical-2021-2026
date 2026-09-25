import { useCallback, useState } from 'react'
import type { MarkSchemeTape } from '../../content/types'
import { readStorage, writeStorage } from '../../lib/storage'

const TAPE_KEY = 'tp:tape'

/** Whether tape is on (default) — remembered per device. */
export function useTapePreference(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => readStorage(TAPE_KEY) !== 'off')
  const set = useCallback((next: boolean) => {
    setOn(next)
    writeStorage(TAPE_KEY, next ? null : 'off')
  }, [])
  return [on, set]
}

/** Every tape id on a question's mark-scheme pages. */
export function tapeIds(tapes: (MarkSchemeTape | null)[] = []): string[] {
  return tapes.flatMap((t, page) => (t ? t.bands.map((_, i) => `${page}:${i}`) : []))
}

// Text version: split by printed part labels.

const PART_LINE = /^\s*(\d{1,2}(?:\([a-z]{1,2}\))+(?:\([ivx]{1,5}\))*|\d{1,2}(?=\s))/

export type TextPart = { label: string | null; text: string }

/** Split mark-scheme text into parts at lines that start with a label like "1(c)(ii)". */
export function splitMarkSchemeText(text: string): TextPart[] {
  const parts: TextPart[] = []
  for (const line of text.split('\n')) {
    const match = PART_LINE.exec(line)
    // A bare number ("6 One mark for…") only labels a question with no parts, on its first line.
    const label = match && (match[1].includes('(') || !parts.length) ? match[1] : null
    if (label && (!parts.length || parts[parts.length - 1].label !== label)) {
      parts.push({ label, text: line })
    } else if (parts.length) {
      parts[parts.length - 1].text += `\n${line}`
    } else {
      parts.push({ label: null, text: line })
    }
  }
  return parts
}

