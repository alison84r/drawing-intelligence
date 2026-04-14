import clsx from 'clsx'
import { Layers, Database, Loader, AlertCircle, Cpu, ChevronRight, Sparkles } from 'lucide-react'
import {
  useExtractionStore,
  CATEGORY_META,
  type EntityCategory,
  type ExtractionSource,
  type ExtractionResult,
} from '../../store/extractionStore'

// ── Subcategory groups ────────────────────────────────────────────────────────

type SubGroup = {
  label: string
  categories: EntityCategory[]
}

const SUBGROUPS: SubGroup[] = [
  {
    label: 'Measurements',
    categories: ['dimension', 'tolerance', 'gdt'],
  },
  {
    label: 'Data',
    categories: ['table', 'table_cell', 'note'],
  },
  {
    label: 'Reference',
    categories: ['titleblock', 'grid_ref'],
  },
  {
    label: 'Eng. Tables',   // TATR-classified engineering tables
    categories: ['bom', 'revision', 'tolerance_table'],
  },
]

const SOURCE_LABELS: Record<ExtractionSource, { label: string; icon: 'db' | 'ai' }> = {
  pdfplumber:        { label: 'pdfplumber',    icon: 'db' },
  pymupdf:           { label: 'PyMuPDF',       icon: 'db' },
  table_transformer: { label: 'Table Detect',  icon: 'ai' },
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExtractionFilterBar() {
  const extractionState = useExtractionStore((s) => s.extractionState)
  const result = useExtractionStore((s) => s.result)
  const overlayVisible = useExtractionStore((s) => s.overlayVisible)
  const sourcesVisible = useExtractionStore((s) => s.sourcesVisible)
  const categoriesVisible = useExtractionStore((s) => s.categoriesVisible)
  const toggleOverlay = useExtractionStore((s) => s.toggleOverlay)
  const toggleSource = useExtractionStore((s) => s.toggleSource)
  const toggleCategory = useExtractionStore((s) => s.toggleCategory)

  if (extractionState === 'idle') return null

  if (extractionState === 'loading') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-950/40 border-b border-indigo-500/20 text-xs text-text-muted">
        <SourceBadge />
        <Loader size={12} className="animate-spin text-indigo-400" />
        <span className="text-indigo-300">Extracting PDF content…</span>
      </div>
    )
  }

  if (extractionState === 'error') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border-b border-red-500/30 text-xs text-red-400">
        <SourceBadge />
        <AlertCircle size={12} />
        <span>Extraction failed — is the Python service running on port 8000?</span>
      </div>
    )
  }

  if (!result) return null

  return (
    <div className="flex items-center gap-0 bg-indigo-950/30 border-b border-indigo-500/20 overflow-x-auto shrink-0 text-[11px]">

      {/* Source badge + master overlay toggle */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-r border-indigo-500/20 shrink-0">
        <SourceBadge />
        <button
          onClick={toggleOverlay}
          title="Toggle all PDF extraction overlays"
          className={clsx(
            'flex items-center gap-1.5 px-2.5 py-1 rounded font-semibold border transition-colors',
            overlayVisible
              ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
              : 'bg-surface-3 text-text-muted border-border'
          )}
        >
          <Layers size={11} />
          Overlay
        </button>
      </div>

      {/* Sources */}
      <Section label="Source" dim={!overlayVisible}>
        {(['pdfplumber', 'pymupdf', 'table_transformer'] as ExtractionSource[]).map((src) => {
          const count = [...result.entities, ...result.tables].filter((e) => e.source === src).length
          if (count === 0 && src === 'table_transformer') return null
          const meta = SOURCE_LABELS[src]
          return (
            <FilterBtn
              key={src}
              active={sourcesVisible[src] && overlayVisible}
              disabled={!overlayVisible}
              onClick={() => toggleSource(src)}
              color={src === 'table_transformer' ? '#a855f7' : '#6366f1'}
            >
              {meta.icon === 'ai' ? <Sparkles size={9} /> : <Database size={9} />}
              {meta.label}
              <Count n={count} />
            </FilterBtn>
          )
        })}
      </Section>

      {/* Subcategory groups */}
      {SUBGROUPS.map((group) => {
        const visible = group.categories.filter((cat) => countFor(cat, result) > 0)
        if (visible.length === 0) return null
        return (
          <Section key={group.label} label={group.label} dim={!overlayVisible}>
            {visible.map((cat) => {
              const cm = CATEGORY_META[cat]
              const n = countFor(cat, result)
              return (
                <FilterBtn
                  key={cat}
                  active={categoriesVisible[cat] && overlayVisible}
                  disabled={!overlayVisible}
                  onClick={() => toggleCategory(cat)}
                  color={cm.color}
                >
                  <span className="w-1.5 h-1.5 rounded-sm shrink-0" style={{ backgroundColor: cm.color }} />
                  {cm.label}
                  <Count n={n} />
                </FilterBtn>
              )
            })}
          </Section>
        )
      })}

      {/* Stats */}
      <div className="ml-auto px-3 shrink-0 text-[10px] text-indigo-400/60 font-mono">
        {result.stats.total} entities · {result.stats.tables} tables
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({
  label, children, dim,
}: {
  label: string; children: React.ReactNode; dim: boolean
}) {
  return (
    <div className={clsx(
      'flex items-center gap-1.5 px-3 py-1.5 border-r border-indigo-500/20 shrink-0 transition-opacity',
      dim && 'opacity-40'
    )}>
      <span className="flex items-center gap-0.5 text-[9px] text-indigo-400/70 uppercase tracking-widest select-none mr-0.5">
        <ChevronRight size={8} />
        {label}
      </span>
      {children}
    </div>
  )
}

function FilterBtn({
  active, disabled, onClick, color, children,
}: {
  active: boolean; disabled: boolean; onClick: () => void; color: string; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'flex items-center gap-1 px-2 py-0.5 rounded font-medium border transition-colors shrink-0',
        disabled && 'cursor-not-allowed'
      )}
      style={active
        ? { backgroundColor: `${color}20`, color, borderColor: `${color}55` }
        : { backgroundColor: 'transparent', color: 'var(--color-text-muted)', borderColor: 'transparent' }
      }
    >
      {children}
    </button>
  )
}

function Count({ n }: { n: number }) {
  return <span className="opacity-50 text-[9px]">({n})</span>
}

function SourceBadge() {
  return (
    <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 text-[10px] font-semibold uppercase tracking-widest shrink-0 select-none">
      <Cpu size={9} />
      PDF Extract
    </div>
  )
}

function countFor(cat: EntityCategory, result: ExtractionResult): number {
  return [...result.entities, ...result.tables].filter((e) => e.category === cat).length
}
