import { useCharacteristicStore } from '@/store/characteristicStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import { nextId, visibleItems } from './progress'

/** Moves through the balloons the current filter shows, in balloon order, wrapping round. Buttons and J / K share it. */
export function selectRelative(direction: 1 | -1): void {
  const chars = useCharacteristicStore.getState()
  const list = visibleItems(chars.items, useSettingsStore.getState().defaults, useUiStore.getState().show)
  if (list.length === 0) return
  const at = list.findIndex((c) => c.id === chars.selectedId)
  const next = at === -1 ? (direction === 1 ? 0 : list.length - 1) : (at + direction + list.length) % list.length
  chars.select(list[next].id)
}

/** Confirms the selected balloon if it is still to check, then moves to the next one that needs work. Button and A share it. */
export function acceptSelectedAndNext(): void {
  const chars = useCharacteristicStore.getState()
  const current = chars.items.find((c) => c.id === chars.selectedId)
  if (!current) {
    selectRelative(1)
    return
  }
  if (current.status === 'Draft') chars.acceptIds([current.id])
  // The store update is synchronous: pick the next from the fresh list.
  const fresh = useCharacteristicStore.getState()
  fresh.select(nextId(fresh.items, useSettingsStore.getState().defaults, current.id) ?? current.id)
}
