import { useCallback, useEffect, useState } from 'react'
import type { Mode } from '../screens/MainMenu'

const PATH_TO_MODE: Record<string, Mode> = {
  '/': 'menu',
  '/companion': 'companion',
  '/digital': 'digital',
  '/cards': 'cards',
}

const MODE_TO_PATH: Record<Mode, string> = {
  menu: '/',
  companion: '/companion',
  digital: '/digital',
  cards: '/cards',
}

const modeFromLocation = () => PATH_TO_MODE[window.location.pathname] ?? 'menu'

/**
 * Jede Seite ist ein echter Verlaufseintrag — der Zurück-Button (Browser oder
 * Geste) geht damit eine Seite zurück, statt die App zu verlassen.
 */
export function useRoute(): [Mode, (m: Mode) => void] {
  const [mode, setMode] = useState<Mode>(modeFromLocation)

  useEffect(() => {
    const onPopState = () => setMode(modeFromLocation())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((next: Mode) => {
    if (MODE_TO_PATH[next] !== window.location.pathname) {
      window.history.pushState(null, '', MODE_TO_PATH[next])
    }
    setMode(next)
  }, [])

  return [mode, navigate]
}
