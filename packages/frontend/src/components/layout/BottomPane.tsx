import { useState, type ReactNode } from 'react'
import { Columns3, CornerDownLeft, Filter, Hash, Maximize2, Minimize2, Search, X } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useUiStore, type BottomTab } from '@/store/uiStore'
import { useCharacteristicStore } from '@/store/characteristicStore'
import { useDocumentStore } from '@/store/documentStore'
import { useSettingsStore } from '@/store/settingsStore'
import { progressOf } from '@/lib/progress'
import { cn } from '@/lib/utils'
import { CharacteristicsGrid } from '@/components/grid/CharacteristicsGrid'
import { PartInfoForm } from './PartInfoForm'
import { ProductAccountabilityForm } from './ProductAccountabilityForm'

function EmptyState({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center text-xs text-muted-foreground">{text}</div>
}

function Hint({ text, children }: { text: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top">{text}</TooltipContent>
    </Tooltip>
  )
}

function Key({ children }: { children: ReactNode }) {
  return <kbd className="rounded border bg-muted px-1 font-sans text-[10px] font-semibold text-foreground/70">{children}</kbd>
}

/** "Go to #": type a balloon number (24 or 24.2) and press Enter. */
function GoTo() {
  const [text, setText] = useState('')
  const [missing, setMissing] = useState(false)
  const go = () => {
    const [main, sub] = text.trim().split('.')
    const items = useCharacteristicStore.getState().items
    const hit = items.find((c) => String(c.balloonNumber) === main && (sub ? String(c.subNumber) === sub : c.subNumber === null))
    setMissing(!hit)
    if (!hit) return
    useCharacteristicStore.getState().select(hit.id)
    useDocumentStore.getState().setPageIndex(hit.page)
    setText('')
  }
  return (
    <Hint text={missing ? 'No balloon with that number' : 'Go to a balloon: type its number and press Enter (G)'}>
      <div className="relative w-[92px]">
        <Hash className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="grid-goto"
          value={text}
          inputMode="decimal"
          onChange={(e) => { setText(e.target.value.replace(/[^\d.]/g, '')); setMissing(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter') go(); if (e.key === 'Escape') e.currentTarget.blur() }}
          placeholder="Go to"
          aria-label="Go to balloon number"
          aria-invalid={missing}
          className={cn('h-7 pl-7 pr-6 tabular-nums', missing && 'border-status-fail focus-visible:ring-status-fail')}
        />
        <CornerDownLeft className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/60" />
      </div>
    </Hint>
  )
}

export function BottomPane() {
  const tab = useUiStore((s) => s.bottomTab)
  const setTab = useUiStore((s) => s.setBottomTab)
  const items = useCharacteristicStore((s) => s.items)
  const defaults = useSettingsStore((s) => s.defaults)
  const [filter, setFilter] = useState('')
  const [shown, setShown] = useState<number | null>(null)
  const allColumns = useUiStore((s) => s.allColumns)
  const toggleAllColumns = useUiStore((s) => s.toggleAllColumns)
  const gridFilters = useUiStore((s) => s.gridFilters)
  const toggleGridFilters = useUiStore((s) => s.toggleGridFilters)
  const gridTall = useUiStore((s) => s.gridTall)
  const toggleGridTall = useUiStore((s) => s.toggleGridTall)

  const progress = progressOf(items, defaults)
  const narrowed = shown !== null && shown !== items.length

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as BottomTab)} className="flex h-full flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b px-3 py-1.5">
        <TabsList>
          <TabsTrigger value="boc">Characteristics</TabsTrigger>
          <TabsTrigger value="part">Part info</TabsTrigger>
          <TabsTrigger value="accountability">Materials and processes</TabsTrigger>
        </TabsList>
        {tab === 'boc' && (
          <>
            <Hint text="Find text in any column (/)">
              <div className="relative w-44">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="grid-find"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') { setFilter(''); e.currentTarget.blur() } }}
                  placeholder="Find in table"
                  aria-label="Find in table"
                  className="h-7 pl-7 pr-7"
                />
                {filter && (
                  <Button variant="ghost" size="icon" className="absolute right-0.5 top-1/2 h-6 w-6 -translate-y-1/2" onClick={() => setFilter('')} aria-label="Clear">
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
            </Hint>
            <GoTo />
            <Hint text={gridFilters ? 'Hide the filter row and clear its filters' : 'Show one filter row under the headers'}>
              <Button variant={gridFilters ? 'secondary' : 'outline'} size="sm" className="h-7 gap-1.5 px-2.5" onClick={toggleGridFilters} aria-pressed={gridFilters} data-testid="filters-toggle">
                <Filter className="size-3.5" /> Filter
              </Button>
            </Hint>
            <Hint text={allColumns ? 'Back to the working columns' : 'Show every column'}>
              <Button variant={allColumns ? 'secondary' : 'outline'} size="sm" className="h-7 gap-1.5 px-2.5" onClick={toggleAllColumns} aria-pressed={allColumns} data-testid="columns-toggle">
                <Columns3 className="size-3.5" /> {allColumns ? 'Fewer columns' : 'All columns'}
              </Button>
            </Hint>
          </>
        )}
        <Hint text={gridTall ? 'Give the space back to the drawing' : 'Lift the table over the drawing, for entering results'}>
          <Button variant={gridTall ? 'secondary' : 'ghost'} size="sm" className="ml-auto h-7 gap-1.5 px-2" onClick={toggleGridTall} aria-pressed={gridTall} aria-label={gridTall ? 'Normal height' : 'Full height'} data-testid="tall-toggle">
            {gridTall ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </Button>
        </Hint>
      </div>

      <TabsContent value="boc" className="flex min-h-0 flex-1 flex-col">
        {items.length === 0 ? (
          <EmptyState text="No characteristics yet. Press B and click the drawing to place the first balloon." />
        ) : (
          <>
            <div className="min-h-0 flex-1">
              <CharacteristicsGrid quickFilter={filter} onShown={setShown} />
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-0.5 border-t bg-muted/40 px-3 py-1 text-[11px] tabular-nums text-muted-foreground" data-testid="grid-footer">
              <span>
                <b className="font-semibold text-foreground">{narrowed ? `${shown} of ${items.length}` : items.length}</b> {items.length === 1 ? 'row' : 'rows'}
                {narrowed && ' shown'}
              </span>
              <span><b className="font-semibold text-foreground">{progress.accepted}</b> confirmed</span>
              {progress.flagged > 0 && <span className="text-status-fail"><b className="font-semibold">{progress.flagged}</b> flagged</span>}
              <span><b className="font-semibold text-foreground">{progress.measured}</b> of {progress.measurable} measured</span>
              {progress.fails > 0 && <span className="text-status-fail"><b className="font-semibold">{progress.fails}</b> failed</span>}
              <span className="ml-auto hidden items-center gap-1.5 md:flex">
                <Key>J</Key><Key>K</Key> next / previous <Key>A</Key> accept <Key>/</Key> find <Key>G</Key> go to #
              </span>
            </div>
          </>
        )}
      </TabsContent>
      <TabsContent value="part" className="min-h-0 flex-1">
        <PartInfoForm />
      </TabsContent>
      <TabsContent value="accountability" className="min-h-0 flex-1">
        <ProductAccountabilityForm />
      </TabsContent>
    </Tabs>
  )
}
