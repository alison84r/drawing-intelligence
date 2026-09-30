import { useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { collectSettings } from '@/lib/project'
import { useCharacteristicStore } from '@/store/characteristicStore'
import { usePartInfoStore } from '@/store/partInfoStore'
import { useProductAccountabilityStore } from '@/store/productAccountabilityStore'
import { useSessionStore } from '@/store/sessionStore'
import { useSettingsStore } from '@/store/settingsStore'

const DEBOUNCE_MS = 800
const RETRY_MS = 5000

/**
 * Writes the open inspection to the server shortly after every change.
 * A failed save keeps the local state, shows "Not saved", and retries.
 */
export function useAutosave() {
  const inspectionId = useSessionStore((s) => s.inspectionId)
  const timer = useRef<number | null>(null)
  const inFlight = useRef(false)
  const pending = useRef(false)

  useEffect(() => {
    if (!inspectionId) return
    const session = useSessionStore.getState()

    const save = async () => {
      if (inFlight.current) {
        pending.current = true
        return
      }
      inFlight.current = true
      session.setSaveState('saving')
      try {
        await api.saveInspection(inspectionId, {
          partInfo: usePartInfoStore.getState().info,
          settings: collectSettings(),
          productAccountability: useProductAccountabilityStore.getState().rows,
          characteristics: useCharacteristicStore.getState().items,
        })
        useSessionStore.getState().setSaveState('saved')
      } catch (e) {
        useSessionStore.getState().setSaveState('error', e instanceof Error ? e.message : 'Save failed')
        timer.current = window.setTimeout(save, RETRY_MS)
      } finally {
        inFlight.current = false
        if (pending.current) {
          pending.current = false
          schedule()
        }
      }
    }

    const schedule = () => {
      useSessionStore.getState().setSaveState('dirty')
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(save, DEBOUNCE_MS)
    }

    // Only content changes trigger a save, not selection or history bookkeeping.
    const unsubChars = useCharacteristicStore.subscribe((s, prev) => {
      if (s.items !== prev.items) schedule()
    })
    const unsubPart = usePartInfoStore.subscribe((s, prev) => {
      if (s.info !== prev.info) schedule()
    })
    const unsubProduct = useProductAccountabilityStore.subscribe((s, prev) => {
      if (s.rows !== prev.rows) schedule()
    })
    const unsubSettings = useSettingsStore.subscribe((s, prev) => {
      if (s.units !== prev.units || s.standard !== prev.standard || s.defaults !== prev.defaults || s.balloonStyle !== prev.balloonStyle || s.leaderDefault !== prev.leaderDefault) schedule()
    })

    return () => {
      unsubChars()
      unsubPart()
      unsubProduct()
      unsubSettings()
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [inspectionId])
}
