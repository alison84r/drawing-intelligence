import { useCallback, useMemo } from 'react'
import type { Layout } from 'react-resizable-panels'

/**
 * Remembers a resizable Group's layout in localStorage so pane sizes survive reloads.
 * Returns props to spread onto <Group>.
 */
export function usePersistedLayout(key: string) {
  const storageKey = `di.layout.${key}`

  const defaultLayout = useMemo<Layout | undefined>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? (JSON.parse(raw) as Layout) : undefined
    } catch {
      return undefined
    }
  }, [storageKey])

  const onLayoutChanged = useCallback(
    (layout: Layout) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(layout))
      } catch {
        /* storage unavailable */
      }
    },
    [storageKey],
  )

  return { defaultLayout, onLayoutChanged }
}
