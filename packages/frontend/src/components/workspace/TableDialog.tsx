import { useEffect } from 'react'
import { Table2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SheetGrid } from '@/lib/api'
import type { ToleranceScheme } from '@/store/settingsStore'
import { cn } from '@/lib/utils'

const KIND: Record<SheetGrid['kind'], string> = { tolerance: 'General tolerance table', title_block: 'Title block', table: 'Table', hole_table: 'Hole table' }

/** Columns a merged cell covers: the empty positions after it in the row. */
function spans(row: (string | null)[]): { text: string; span: number }[] {
  const out: { text: string; span: number }[] = []
  for (const cell of row) {
    if (cell === null && out.length > 0) out[out.length - 1].span += 1
    else out.push({ text: cell ?? '', span: 1 })
  }
  return out
}

/** A table from the sheet, shown as the cells that were read, so the reading can be checked against the drawing. */
export function TableDialog({ grid, scheme, onClose }: { grid: SheetGrid | null; scheme?: ToleranceScheme | null; onClose: () => void }) {
  useEffect(() => {
    if (!grid) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [grid, onClose])

  if (!grid) return null
  const cls = grid.kind === 'tolerance' ? scheme?.cls : undefined

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="table-title" className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg border bg-background shadow-2xl" data-testid="table-dialog">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 id="table-title" className="flex items-center gap-1.5 text-sm font-semibold"><Table2 className="size-4 text-primary" /> {KIND[grid.kind]}</h2>
            <p className="text-xs text-muted-foreground">
              Read cell by cell from the sheet: {grid.rows.length} rows, {grid.cols} columns.
              {cls ? ` The row in use is class ${cls}.` : ''}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close"><X /></Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <table className="w-full border-collapse text-xs tabular-nums">
            <tbody>
              {grid.rows.map((row, r) => {
                const inUse = Boolean(cls) && (row[0] ?? '').trim().toLowerCase() === cls
                return (
                  <tr key={r} className={cn(inUse && 'bg-primary/10 font-medium')} data-in-use={inUse || undefined}>
                    {spans(row).map((c, i) => (
                      <td key={i} colSpan={c.span} className="border px-2 py-1 align-top">{c.text}</td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
          <span>Nothing in a table is ballooned on its own.</span>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}
