import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Units = 'mm' | 'in'
export type Standard = 'ASME' | 'ISO'

/** Default symmetric tolerances keyed by the number of decimal places printed. */
/** A general tolerance declared by the drawing: plus/minus by size range (ISO 2768 style). Rows are [over, up to, tolerance]. */
export interface ToleranceScheme {
  kind: 'size_range'
  label: string
  standard?: string
  cls?: string
  linear: number[][]
  radius?: number[][]
  /** assist = read from a picture by a model and confirmed by a person. */
  source: 'drawing' | 'library' | 'profile' | 'assist'
  verifiedAgainstSheet?: boolean | null
  evidence: string[]
}

export interface DefaultTolerances {
  places0: number
  places1: number
  places2: number
  places3: number
  angular: number
  /** When set, linear defaults come from this table by size, not from decimal places. */
  scheme?: ToleranceScheme | null
}

export type DefaultToleranceKey = 'places0' | 'places1' | 'places2' | 'places3' | 'angular'

export const MIN_UNDO_DEPTH = 4
export const MAX_UNDO_DEPTH = 500

export type BalloonShape = 'circle' | 'square' | 'hex' | 'triangle'
export type BalloonFill = 'outline' | 'filled'

/** How balloons are drawn. Global default here; a characteristic may carry a partial override. */
export interface BalloonStyle {
  shape: BalloonShape
  fill: BalloonFill
  color: string
  /** Diameter in CSS px at 100 percent zoom. */
  size: number
  prefix: string
  weight: 400 | 600
}

export const BALLOON_COLORS: { value: string; name: string }[] = [
  { value: '#e11d48', name: 'Red' },
  { value: '#1d4ed8', name: 'Blue' },
  { value: '#15803d', name: 'Green' },
  { value: '#d97706', name: 'Amber' },
  { value: '#7c3aed', name: 'Violet' },
  { value: '#111827', name: 'Black' },
]

export const DEFAULT_BALLOON_STYLE: BalloonStyle = {
  shape: 'circle',
  fill: 'outline',
  color: '#1d4ed8',
  size: 22,
  prefix: '',
  weight: 600,
}

interface SettingsState {
  balloonStyle: BalloonStyle
  setBalloonStyle: (patch: Partial<BalloonStyle>) => void
  units: Units
  standard: Standard
  defaults: DefaultTolerances
  /** New balloons get a leader line. The switch in the toolbar changes this too. */
  leaderDefault: boolean
  /** Undo history length, at least MIN_UNDO_DEPTH. */
  undoDepth: number
  setUnits: (u: Units) => void
  setStandard: (s: Standard) => void
  setDefault: (key: DefaultToleranceKey, value: number) => void
  setScheme: (scheme: ToleranceScheme | null) => void
  setLeaderDefault: (v: boolean) => void
  setUndoDepth: (n: number) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      units: 'mm',
      standard: 'ISO',
      defaults: { places0: 0.5, places1: 0.2, places2: 0.1, places3: 0.05, angular: 0.5 },
      leaderDefault: true,
      undoDepth: 50,
      balloonStyle: DEFAULT_BALLOON_STYLE,
      setBalloonStyle: (patch) => set((s) => ({ balloonStyle: { ...s.balloonStyle, ...patch } })),
      setUnits: (units) => set({ units }),
      setStandard: (standard) => set({ standard }),
      setDefault: (key, value) => set((s) => ({ defaults: { ...s.defaults, [key]: value } })),
      setScheme: (scheme) => set((s) => ({ defaults: { ...s.defaults, scheme } })),
      setLeaderDefault: (leaderDefault) => set({ leaderDefault }),
      setUndoDepth: (n) =>
        set({ undoDepth: Math.min(MAX_UNDO_DEPTH, Math.max(MIN_UNDO_DEPTH, Math.round(Number.isFinite(n) ? n : MIN_UNDO_DEPTH))) }),
    }),
    {
      name: 'di.settings',
      version: 4,
      // v4: the default balloon colour moved from red to blue so that red means fail only.
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<SettingsState>
        if (version < 4 && p.balloonStyle?.color === '#e11d48') p.balloonStyle = { ...p.balloonStyle, color: '#1d4ed8' }
        return p as SettingsState
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>
        return { ...current, ...p, balloonStyle: { ...DEFAULT_BALLOON_STYLE, ...(p.balloonStyle ?? {}) } }
      },
    },
  ),
)
