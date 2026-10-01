import { useState } from 'react'
import { Columns3, Search, X } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useUiStore, type BottomTab } from '@/store/uiStore'
import { useCharacteristicStore } from '@/store/characteristicStore'
import { useSettingsStore } from '@/store/settingsStore'
import { deriveLimits, displayStatus } from '@/lib/tolerance'
import { CharacteristicsGrid } from '@/components/grid/CharacteristicsGrid'
import { PartInfoForm } from './PartInfoForm'
import { ProductAccountabilityForm } from './ProductAccountabilityForm'

function EmptyState({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center text-xs text-muted-foreground">{text}</div>
}

export function BottomPane() {
  const tab = useUiStore((s) => s.bottomTab)
  const setTab = useUiStore((s) => s.setBottomTab)
  const items = useCharacteristicStore((s) => s.items)
  const defaults = useSettingsStore((s) => s.defaults)
  const [filter, setFilter] = useState('')
  const allColumns = useUiStore((s) => s.allColumns)
  const toggleAllColumns = useUiStore((s) => s.toggleAllColumns)

  const fails = items.filter((c) => displayStatus(c, deriveLimits(c, defaults)) === 'Fail').length

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as BottomTab)} className="flex h-full flex-col bg-background">
      <div className="flex shrink-0 items-center gap-3 border-b px-3 py-1.5">
        <TabsList>
          <TabsTrigger value="boc">Characteristics</TabsTrigger>
          <TabsTrigger value="part">Part info</TabsTrigger>
          <TabsTrigger value="accountability">Materials and processes</TabsTrigger>
        </TabsList>
        {tab === 'boc' && (
          <div className="relative w-52">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter rows"
              aria-label="Filter characteristics"
              className="h-7 pl-7 pr-7"
            />
            {filter && (
              <Button variant="ghost" size="icon" className="absolute right-0.5 top-1/2 h-6 w-6 -translate-y-1/2" onClick={() => setFilter('')} aria-label="Clear filter">
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        )}
        {tab === 'boc' && (
          <Button variant={allColumns ? 'secondary' : 'outline'} size="sm" className="h-7 gap-1.5 px-2.5" onClick={toggleAllColumns} aria-pressed={allColumns} data-testid="columns-toggle">
            <Columns3 className="size-3.5" /> {allColumns ? 'Fewer columns' : 'All columns'}
          </Button>
        )}
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
          {items.length} {items.length === 1 ? 'characteristic' : 'characteristics'}
          {fails > 0 && <span className="text-status-fail"> · {fails} fail</span>}
        </span>
      </div>

      <TabsContent value="boc" className="min-h-0 flex-1">
        {items.length === 0 ? (
          <EmptyState text="No characteristics yet. Press B and click the drawing to place the first balloon." />
        ) : (
          <CharacteristicsGrid quickFilter={filter} />
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
