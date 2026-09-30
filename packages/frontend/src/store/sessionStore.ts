import { create } from 'zustand'

export type Screen = 'library' | 'inspect'
export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'offline'

interface SessionState {
  screen: Screen
  inspectionId: string | null
  revisionId: string | null
  partLabel: string
  inspectionTitle: string
  saveState: SaveState
  lastSavedAt: number | null
  saveError: string | null
  setScreen: (s: Screen) => void
  openInspection: (args: { inspectionId: string; revisionId: string; partLabel: string; inspectionTitle: string }) => void
  closeInspection: () => void
  setSaveState: (s: SaveState, error?: string | null) => void
}

export const useSessionStore = create<SessionState>()((set) => ({
  screen: 'library',
  inspectionId: null,
  revisionId: null,
  partLabel: '',
  inspectionTitle: '',
  saveState: 'idle',
  lastSavedAt: null,
  saveError: null,
  setScreen: (screen) => set({ screen }),
  openInspection: ({ inspectionId, revisionId, partLabel, inspectionTitle }) =>
    set({ screen: 'inspect', inspectionId, revisionId, partLabel, inspectionTitle, saveState: 'saved', lastSavedAt: Date.now(), saveError: null }),
  closeInspection: () => set({ screen: 'library', inspectionId: null, revisionId: null, partLabel: '', inspectionTitle: '', saveState: 'idle' }),
  setSaveState: (saveState, error = null) =>
    set((s) => ({ saveState, saveError: error, lastSavedAt: saveState === 'saved' ? Date.now() : s.lastSavedAt })),
}))
