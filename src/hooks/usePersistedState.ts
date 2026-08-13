import { useEffect, useState } from 'react'

/** useState, gespiegelt in localStorage. Kein Store-Framework nötig. */
export function usePersistedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Privater Modus / Quota voll — Spiel läuft dann nur im Speicher weiter.
    }
  }, [key, value])

  return [value, setValue] as const
}
