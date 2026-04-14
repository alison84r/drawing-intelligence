import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export type ExtractionSource = 'pdfplumber' | 'pymupdf' | 'table_transformer'

export type EntityCategory =
  | 'dimension'
  | 'tolerance'
  | 'gdt'
  | 'table_cell'
  | 'table'
  | 'note'
  | 'titleblock'
  | 'grid_ref'
  | 'unknown'
  // Table Transformer — classified engineering tables
  | 'bom'
  | 'revision'
  | 'tolerance_table'

export interface ExtractedEntity {
  id: string
  source: ExtractionSource
  category: EntityCategory
  text: string
  bbox: { x: number; y: number; width: number; height: number }
  confidence: number
  meta?: {
    fontSize?: number
    fontName?: string
    bold?: boolean
    italic?: boolean
    tableIndex?: number
    rowIndex?: number
    colIndex?: number
    tableData?: (string | null)[][]
    rowCount?: number
    colCount?: number
  }
}

export interface ExtractionResult {
  pageWidth: number
  pageHeight: number
  entities: ExtractedEntity[]
  tables: ExtractedEntity[]
  stats: { pdfplumber: number; pymupdf: number; table_transformer: number; tables: number; total: number }
}

export const CATEGORY_META: Record<
  EntityCategory,
  { label: string; color: string; opacity: number; border: string }
> = {
  //                                   fill colour    fill α  stroke
  dimension:      { label: 'Dimensions',      color: '#3b82f6', opacity: 0.28, border: '#60a5fa' }, // blue
  tolerance:      { label: 'Tolerances',      color: '#f97316', opacity: 0.28, border: '#fb923c' }, // orange
  gdt:            { label: 'GD&T / FCF',      color: '#a855f7', opacity: 0.28, border: '#c084fc' }, // violet
  table:          { label: 'Tables',          color: '#14b8a6', opacity: 0.18, border: '#2dd4bf' }, // teal
  table_cell:     { label: 'Table Cells',     color: '#22c55e', opacity: 0.18, border: '#4ade80' }, // green
  note:           { label: 'Notes',           color: '#eab308', opacity: 0.28, border: '#facc15' }, // yellow
  titleblock:     { label: 'Title Block',     color: '#06b6d4', opacity: 0.28, border: '#22d3ee' }, // cyan
  grid_ref:       { label: 'Grid Refs',       color: '#f43f5e', opacity: 0.22, border: '#fb7185' }, // rose
  unknown:        { label: 'Unknown',         color: '#94a3b8', opacity: 0.12, border: '#cbd5e1' }, // slate
  // TATR-classified engineering tables
  bom:            { label: 'BOM',             color: '#84cc16', opacity: 0.28, border: '#a3e635' }, // lime
  revision:       { label: 'Revision Table',  color: '#ec4899', opacity: 0.28, border: '#f472b6' }, // pink
  tolerance_table:{ label: 'Tolerance Table', color: '#6366f1', opacity: 0.28, border: '#818cf8' }, // indigo
}

interface ExtractionState {
  result: ExtractionResult | null
  extractionState: 'idle' | 'loading' | 'done' | 'error'
  extractionError: string | null
  overlayVisible: boolean

  // Per-source toggles
  sourcesVisible: Record<ExtractionSource, boolean>
  // Per-category toggles
  categoriesVisible: Record<EntityCategory, boolean>

  // Selected extracted entity (for inspector)
  selectedExtractedId: string | null
  selectedExtracted: ExtractedEntity | null

  // Actions
  setResult: (result: ExtractionResult) => void
  setExtractionState: (s: ExtractionState['extractionState'], err?: string) => void
  toggleOverlay: () => void
  toggleSource: (source: ExtractionSource) => void
  toggleCategory: (cat: EntityCategory) => void
  selectExtracted: (entity: ExtractedEntity | null) => void
  clearExtraction: () => void
}

const ALL_CATEGORIES = Object.keys(CATEGORY_META) as EntityCategory[]

export const useExtractionStore = create<ExtractionState>()(
  immer((set) => ({
    result: null,
    extractionState: 'idle',
    extractionError: null,
    overlayVisible: false,
    sourcesVisible: { pdfplumber: true, pymupdf: true, table_transformer: true },
    categoriesVisible: Object.fromEntries(
      ALL_CATEGORIES.map((c) => [c, c !== 'unknown' && c !== 'grid_ref' && c !== 'table_cell'])
    ) as Record<EntityCategory, boolean>,
    selectedExtractedId: null,
    selectedExtracted: null,

    setResult: (result) =>
      set((s) => {
        s.result = result
        s.extractionState = 'done'
        s.overlayVisible = true
      }),

    setExtractionState: (state, err) =>
      set((s) => {
        s.extractionState = state
        s.extractionError = err ?? null
      }),

    toggleOverlay: () => set((s) => { s.overlayVisible = !s.overlayVisible }),
    toggleSource: (source) =>
      set((s) => { s.sourcesVisible[source] = !s.sourcesVisible[source] }),
    toggleCategory: (cat) =>
      set((s) => { s.categoriesVisible[cat] = !s.categoriesVisible[cat] }),

    selectExtracted: (entity) =>
      set((s) => {
        s.selectedExtractedId = entity?.id ?? null
        s.selectedExtracted = entity ?? null
      }),

    clearExtraction: () =>
      set((s) => {
        s.result = null
        s.extractionState = 'idle'
        s.overlayVisible = false
        s.selectedExtractedId = null
        s.selectedExtracted = null
      }),
  }))
)

// Derived: visible entities given current toggles
export function getVisibleEntities(state: ExtractionState): ExtractedEntity[] {
  if (!state.result || !state.overlayVisible) return []
  const all = [...state.result.entities, ...state.result.tables]
  return all.filter(
    (e) => state.sourcesVisible[e.source] && state.categoriesVisible[e.category]
  )
}
