import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useProductAccountabilityStore, type ProductRow, type ProductRowType } from '@/store/productAccountabilityStore'

type TextKey = Exclude<keyof ProductRow, 'id' | 'type' | 'customerApproval'>

const COLUMNS: { key: TextKey; label: string; width: string; placeholder?: string }[] = [
  { key: 'name', label: '5. Material / process / test', width: 'minmax(160px,1.4fr)', placeholder: 'Aluminium 6061-T6' },
  { key: 'specNumber', label: '6. Specification', width: 'minmax(120px,1fr)', placeholder: 'AMS-QQ-A-250/11' },
  { key: 'code', label: '7. Code', width: '64px' },
  { key: 'supplierCode', label: '8. Supplier code', width: '110px' },
  { key: 'cocNumber', label: '10. CoC number', width: '120px' },
  { key: 'testProcedure', label: '11. Test procedure', width: '120px' },
  { key: 'acceptanceReport', label: '12. Acceptance report', width: '130px' },
  { key: 'comments', label: '13. Comments', width: 'minmax(120px,1fr)' },
  { key: 'preparedBy', label: '14. Prepared by', width: '110px' },
  { key: 'date', label: '15. Date', width: '104px' },
]

/** AS9102 Form 2 rows: one per material, special process or functional test. Autosaves with the inspection. */
export function ProductAccountabilityForm() {
  const rows = useProductAccountabilityStore((s) => s.rows)
  const add = useProductAccountabilityStore((s) => s.add)
  const update = useProductAccountabilityStore((s) => s.update)
  const remove = useProductAccountabilityStore((s) => s.remove)

  const grid = `110px ${COLUMNS.slice(0, 4).map((c) => c.width).join(' ')} 90px ${COLUMNS.slice(4).map((c) => c.width).join(' ')} 36px`

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5 text-xs text-muted-foreground">
        <span>Form 2 · Product Accountability: raw materials, special processes and functional tests called out on the drawing.</span>
        <div className="ml-auto flex gap-1">
          {(['Material', 'Special process', 'Test'] as ProductRowType[]).map((t) => (
            <Button key={t} variant="outline" size="sm" className="h-7 gap-1" onClick={() => add(t)}>
              <Plus /> {t}
            </Button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-[1400px]">
          <div className="sticky top-0 z-10 grid gap-1 border-b bg-muted/60 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground" style={{ gridTemplateColumns: grid }}>
            <span>Type</span>
            {COLUMNS.slice(0, 4).map((c) => <span key={c.key} className="truncate">{c.label}</span>)}
            <span>9. Cust. appr.</span>
            {COLUMNS.slice(4).map((c) => <span key={c.key} className="truncate">{c.label}</span>)}
            <span />
          </div>
          {rows.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">No rows yet. Add a material, a special process or a test above.</p>
          )}
          {rows.map((r) => (
            <div key={r.id} className="grid items-center gap-1 border-b px-3 py-1" style={{ gridTemplateColumns: grid }}>
              <NativeSelect value={r.type} onChange={(e) => update(r.id, { type: e.target.value as ProductRowType })}>
                <option>Material</option>
                <option>Special process</option>
                <option>Test</option>
              </NativeSelect>
              {COLUMNS.slice(0, 4).map((c) => (
                <Input key={c.key} value={r[c.key]} placeholder={c.placeholder} onChange={(e) => update(r.id, { [c.key]: e.target.value })} className="h-7" aria-label={c.label} />
              ))}
              <NativeSelect value={r.customerApproval} onChange={(e) => update(r.id, { customerApproval: e.target.value as ProductRow['customerApproval'] })}>
                <option value=""></option>
                <option>Yes</option>
                <option>No</option>
                <option>N/A</option>
              </NativeSelect>
              {COLUMNS.slice(4).map((c) => (
                <Input key={c.key} value={r[c.key]} placeholder={c.placeholder} onChange={(e) => update(r.id, { [c.key]: e.target.value })} className="h-7" aria-label={c.label} />
              ))}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(r.id)} aria-label="Remove row">
                    <Trash2 />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove row</TooltipContent>
              </Tooltip>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
