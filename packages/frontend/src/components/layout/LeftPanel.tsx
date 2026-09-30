import { FileText, History, Spline } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  MAX_UNDO_DEPTH,
  MIN_UNDO_DEPTH,
  useSettingsStore,
  type DefaultTolerances,
  type Standard,
  type Units,
} from '@/store/settingsStore'
import { useDocumentStore } from '@/store/documentStore'
import { BalloonStyleEditor } from '@/components/balloons/BalloonStyleEditor'

const TOLERANCE_ROWS: { key: keyof DefaultTolerances; label: string; hint: string }[] = [
  { key: 'places0', label: 'X', hint: 'no decimals' },
  { key: 'places1', label: 'X.X', hint: '1 decimal' },
  { key: 'places2', label: 'X.XX', hint: '2 decimals' },
  { key: 'places3', label: 'X.XXX', hint: '3 decimals' },
  { key: 'angular', label: 'Angle', hint: 'degrees' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <Label>{title}</Label>
      {children}
    </section>
  )
}

export function LeftPanel() {
  const units = useSettingsStore((s) => s.units)
  const standard = useSettingsStore((s) => s.standard)
  const defaults = useSettingsStore((s) => s.defaults)
  const setUnits = useSettingsStore((s) => s.setUnits)
  const setStandard = useSettingsStore((s) => s.setStandard)
  const setDefault = useSettingsStore((s) => s.setDefault)
  const leaderDefault = useSettingsStore((s) => s.leaderDefault)
  const setLeaderDefault = useSettingsStore((s) => s.setLeaderDefault)
  const undoDepth = useSettingsStore((s) => s.undoDepth)
  const setUndoDepth = useSettingsStore((s) => s.setUndoDepth)
  const balloonStyle = useSettingsStore((s) => s.balloonStyle)
  const setBalloonStyle = useSettingsStore((s) => s.setBalloonStyle)
  const fileName = useDocumentStore((s) => s.fileName)
  const pageCount = useDocumentStore((s) => s.pageCount)
  const pages = useDocumentStore((s) => s.pages)

  return (
    <aside className="flex h-full flex-col gap-5 overflow-y-auto bg-muted/30 p-4">
      <Section title="Document">
        <div className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2 text-xs text-muted-foreground">
          <FileText className="size-3.5 shrink-0" />
          <span className="truncate" title={fileName || undefined}>{fileName || 'No drawing open'}</span>
        </div>
        {pageCount > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {pageCount} {pageCount === 1 ? 'sheet' : 'sheets'} · {Math.round(pages[0]?.width ?? 0)} × {Math.round(pages[0]?.height ?? 0)} pt
          </p>
        )}
      </Section>

      <Section title="Units">
        <ToggleGroup type="single" value={units} onValueChange={(v) => v && setUnits(v as Units)} className="w-full">
          <ToggleGroupItem value="mm" className="flex-1">mm</ToggleGroupItem>
          <ToggleGroupItem value="in" className="flex-1">in</ToggleGroupItem>
        </ToggleGroup>
      </Section>

      <Section title="Standard">
        <ToggleGroup type="single" value={standard} onValueChange={(v) => v && setStandard(v as Standard)} className="w-full">
          <ToggleGroupItem value="ASME" className="flex-1">ASME Y14.5</ToggleGroupItem>
          <ToggleGroupItem value="ISO" className="flex-1">ISO GPS</ToggleGroupItem>
        </ToggleGroup>
      </Section>

      <Section title="Default tolerances (±)">
        <div className="space-y-1.5">
          {TOLERANCE_ROWS.map((row) => (
            <div key={row.key} className="grid grid-cols-[56px_1fr] items-center gap-2">
              <span className="text-xs font-medium tabular-nums" title={row.hint}>
                {row.label}
              </span>
              <div className="relative">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={defaults[row.key]}
                  onChange={(e) => setDefault(row.key, Number(e.target.value))}
                  className="pr-8"
                />
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">
                  {row.key === 'angular' ? '°' : units}
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Applied when a dimension has no printed tolerance.
        </p>
      </Section>

      <Section title="Balloons">
        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
            <Spline className="size-3.5 shrink-0 text-muted-foreground" /> Leader on new balloons
          </span>
          <Switch checked={leaderDefault} onCheckedChange={setLeaderDefault} aria-label="Leader line on new balloons" />
        </label>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
            <History className="size-3.5 shrink-0 text-muted-foreground" /> Undo steps
          </span>
          <Input
            type="number"
            min={MIN_UNDO_DEPTH}
            max={MAX_UNDO_DEPTH}
            step={1}
            value={undoDepth}
            onChange={(e) => setUndoDepth(Number(e.target.value))}
            onBlur={(e) => setUndoDepth(Number(e.target.value))}
            className="w-16 shrink-0 text-right"
            aria-label="Undo history depth"
          />
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">Minimum {MIN_UNDO_DEPTH}. Ctrl+Z undoes, Ctrl+Y redoes.</p>
      </Section>

      <Section title="Balloon style">
        <BalloonStyleEditor value={balloonStyle} onChange={setBalloonStyle} />
        <p className="text-[11px] leading-snug text-muted-foreground">Applies to every balloon unless one has its own style.</p>
      </Section>
    </aside>
  )
}
