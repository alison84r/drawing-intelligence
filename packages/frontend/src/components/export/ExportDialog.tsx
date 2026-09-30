import { useEffect, useState } from 'react'
import { Download, FileSpreadsheet, FileText, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import { deriveLimits, displayStatus } from '@/lib/tolerance'
import { useCharacteristicStore } from '@/store/characteristicStore'
import { useSessionStore } from '@/store/sessionStore'
import { useSettingsStore } from '@/store/settingsStore'
import { cn } from '@/lib/utils'
import { BRAND } from '@/components/brand/Brand'

interface Props {
  open: boolean
  onClose: () => void
}

function Option({
  checked, onChange, title, text, tag, icon,
}: { checked: boolean; onChange: (v: boolean) => void; title: string; text: string; tag: string; icon: React.ReactNode }) {
  return (
    <label className={cn('grid cursor-pointer grid-cols-[auto_1fr_auto] items-start gap-3 rounded-md border p-3 transition-colors hover:border-primary/60', checked && 'border-primary/50 bg-primary/5')}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 accent-primary" />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-medium">{icon}{title}</div>
        <div className="text-xs text-muted-foreground">{text}</div>
      </div>
      <span className="rounded border px-1.5 font-mono text-[10px] text-muted-foreground">{tag}</span>
    </label>
  )
}

/** Export dialog: AS9102 forms, PPAP results, ballooned PDF, as one zip or a single file. */
export function ExportDialog({ open, onClose }: Props) {
  const inspectionId = useSessionStore((s) => s.inspectionId)
  const partLabel = useSessionStore((s) => s.partLabel)
  const inspectionTitle = useSessionStore((s) => s.inspectionTitle)
  const saveState = useSessionStore((s) => s.saveState)
  const items = useCharacteristicStore((s) => s.items)
  const defaults = useSettingsStore((s) => s.defaults)
  const [as9102, setAs9102] = useState(true)
  const [ppap, setPpap] = useState(true)
  const [pdf, setPdf] = useState(true)
  const [includeReference, setIncludeReference] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const drafts = items.filter((c) => displayStatus(c, deriveLimits(c, defaults)) === 'Draft').length
  const refs = items.filter((c) => c.toleranceType === 'Reference' || c.toleranceType === 'Basic').length
  const nothing = !as9102 && !ppap && !pdf

  const run = async () => {
    if (!inspectionId) return
    setBusy(true)
    setError(null)
    try {
      // Make sure the server has the latest edits before it renders the report.
      if (saveState !== 'saved') await new Promise((r) => setTimeout(r, 1200))
      const { blob, fileName } = await api.exportInspection(inspectionId, { as9102, ppap, pdf, includeReference })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="export-title" className="w-full max-w-lg overflow-hidden rounded-lg border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 id="export-title" className="text-sm font-semibold">Export</h2>
            <p className="text-xs text-muted-foreground">{partLabel} · {inspectionTitle}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close"><X /></Button>
        </div>

        <div className="space-y-2.5 p-4">
          <Option checked={as9102} onChange={setAs9102} icon={<FileSpreadsheet className="size-4 text-status-pass" />} tag=".xlsx"
            title="AS9102 Rev C · Forms 1, 2 and 3" text="One sheet per form. Form 1 from Part Info, Form 2 from Product Accountability, Form 3 one row per balloon with GD&T frames drawn in the cell." />
          <Option checked={ppap} onChange={setPpap} icon={<FileSpreadsheet className="size-4 text-status-pass" />} tag=".xlsx"
            title="PPAP dimensional results" text="AIAG layout: item, specification, limits, result, OK / NOT OK." />
          <Option checked={pdf} onChange={setPdf} icon={<FileText className="size-4 text-primary" />} tag=".pdf"
            title="Ballooned drawing" text="Copy of the PDF with balloons and leaders drawn as vector shapes at their exact positions." />

          <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs">
            <span>Include reference and basic dimensions ({refs})</span>
            <Switch checked={includeReference} onCheckedChange={setIncludeReference} aria-label="Include reference dimensions" />
          </label>

          {drafts > 0 && (
            <p className="text-xs text-status-draft">{drafts} {drafts === 1 ? 'characteristic is' : 'characteristics are'} still Draft and export with an empty result.</p>
          )}
          {error && <p className="text-xs text-status-fail" role="alert">{error}</p>}
        </div>

        <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
          <span>{[as9102, ppap, pdf].filter(Boolean).length > 1 ? 'Files download as one zip.' : 'Downloads a single file.'} Reports carry the {BRAND.company} mark.</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button size="sm" className="gap-1.5" onClick={run} disabled={busy || nothing || items.length === 0}>
              {busy ? <Loader2 className="animate-spin" /> : <Download />} Export
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
