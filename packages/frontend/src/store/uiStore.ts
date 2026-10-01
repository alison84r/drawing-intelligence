import { create } from 'zustand'

export type ToolMode = 'select' | 'pan' | 'single' | 'multiple' | 'sub' | 'window'
export type BottomTab = 'boc' | 'part' | 'accountability'
/** Which step of the inspection the workspace is arranged for. A place, not a gate: any step can be opened at any time. */
export type WorkStep = 'review' | 'measure'
export type MeasureFilter = 'todo' | 'failed' | 'all'

interface UiState {
  tool: ToolMode
  leftCollapsed: boolean
  rightCollapsed: boolean
  bottomTab: BottomTab
  step: WorkStep
  setStep: (s: WorkStep) => void
  measureFilter: MeasureFilter
  setMeasureFilter: (f: MeasureFilter) => void
  settingsOpen: boolean
  setSettingsOpen: (v: boolean) => void
  /** Both side panels and the grid folded away, leaving the drawing. */
  focus: boolean
  toggleFocus: () => void
  /** Every grid column shown, not just the set for the current step. */
  allColumns: boolean
  toggleAllColumns: () => void
  /** Characteristic under the pointer: its balloon or its callout text. */
  hoveredId: string | null
  setHovered: (id: string | null) => void
  /** Right-click menu for a balloon or row, in window coordinates. */
  contextMenu: { x: number; y: number; id: string } | null
  openContextMenu: (x: number, y: number, id: string) => void
  closeContextMenu: () => void
  /** "Show only this": every other balloon is hidden until the user clicks empty paper or presses Esc. */
  soloId: string | null
  setSolo: (id: string | null) => void
  setTool: (tool: ToolMode) => void
  toggleLeft: () => void
  toggleRight: () => void
  setLeftCollapsed: (v: boolean) => void
  setRightCollapsed: (v: boolean) => void
  setBottomTab: (tab: BottomTab) => void
}

export const useUiStore = create<UiState>()((set) => ({
  tool: 'select',
  leftCollapsed: false,
  rightCollapsed: false,
  bottomTab: 'boc',
  step: 'review',
  setStep: (step) => set({ step }),
  measureFilter: 'todo',
  setMeasureFilter: (measureFilter) => set({ measureFilter }),
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  focus: false,
  toggleFocus: () => set((s) => ({ focus: !s.focus })),
  allColumns: false,
  toggleAllColumns: () => set((s) => ({ allColumns: !s.allColumns })),
  hoveredId: null,
  setHovered: (hoveredId) => set({ hoveredId }),
  contextMenu: null,
  openContextMenu: (x, y, id) => set({ contextMenu: { x, y, id } }),
  closeContextMenu: () => set({ contextMenu: null }),
  soloId: null,
  setSolo: (soloId) => set({ soloId }),
  setTool: (tool) => set({ tool }),
  toggleLeft: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),
  toggleRight: () => set((s) => ({ rightCollapsed: !s.rightCollapsed })),
  setLeftCollapsed: (leftCollapsed) => set({ leftCollapsed }),
  setRightCollapsed: (rightCollapsed) => set({ rightCollapsed }),
  setBottomTab: (bottomTab) => set({ bottomTab }),
}))
