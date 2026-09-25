// localStorage can be missing or throw (private mode, blocked storage).
// Every read falls back; every write is best-effort.
export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // Not persisted; the in-memory state still applies for this visit.
  }
}
