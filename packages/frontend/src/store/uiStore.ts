import { create } from 'zustand'

export type ToolMode = 'select' | 'pan' | 'single' | 'multiple' | 'sub' | 'window'
export type BottomTab = 'boc' | 'part' | 'accountability'

interface UiState {
  tool: ToolMode
  leftCollapsed: boolean
  rightCollapsed: boolean
  bottomTab: BottomTab
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
  setTool: (tool) => set({ tool }),
  toggleLeft: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),
  toggleRight: () => set((s) => ({ rightCollapsed: !s.rightCollapsed })),
  setLeftCollapsed: (leftCollapsed) => set({ leftCollapsed }),
  setRightCollapsed: (rightCollapsed) => set({ rightCollapsed }),
  setBottomTab: (bottomTab) => set({ bottomTab }),
}))
