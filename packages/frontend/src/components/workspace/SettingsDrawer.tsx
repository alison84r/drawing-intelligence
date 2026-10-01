import { useEffect, useState } from 'react'
import { History, Ruler, Spline, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BalloonStyleEditor } from '@/components/balloons/BalloonStyleEditor'
import { api, type ToleranceStandards } from '@/lib/api'
import { useDocumentStore } from '@/store/documentStore'
import { useRecognizeStore } from '@/store/recognizeStore'
import { MAX_UNDO_DEPTH, MIN_UNDO_DEPTH, useSettingsStore, type DefaultToleranceKey, type Standard, type ToleranceScheme, type Units } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'

const DECIMAL_ROWS: { key: DefaultToleranceKey; label: string }[] = [
  { key: 'places0', label: 'X' },
  { key: 'places1', label: 'X.X' },
  { key: 'places2', label: 'X.XX' },
  { key: 'places3', label: 'X.XXX' },
  { key: 'angular', label: 'Angle' },
]

function Block({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 border-b px-5 py-4">
      <h3 className="text-xs font-semibold">{title}</h3>
      {hint && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
      {children}
    </section>
  )
}

/** Set once per inspection, then out of the way: tolerance source, units, standard, balloons. */
export function SettingsDrawer() {
  const open = useUiStore((s) => s.settingsOpen)
  const setOpen = useUiStore((s) => s.setSettingsOpen)
  const s = useSettingsStore()
  const pageIndex = useDocumentStore((d) => d.pageIndex)
  const found = useRecognizeStore((r) => r.pages[pageIndex]?.tolerance)
  const [standards, setStandards] = useState<ToleranceStandards | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    if (!standards) api.toleranceStandards().then(setStandards).catch(() => undefined)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen, standards])

  if (!open) return null
  const scheme = s.defaults.scheme ?? null
  const mode = scheme ? 'table' : 'decimals'
  const fromDrawing = found?.scheme && found.scheme.kind === 'size_range' ? (found.scheme as ToleranceScheme) : null

  const useClass = (cls: string) => {
    if (!standards) return
    s.setScheme({ kind: 'size_range', label: `ISO 2768-${cls}`, standard: 'ISO 2768-1', cls, linear: standards.linear[cls], radius: standards.radius[cls], source: 'library', evidence: ['Chosen in settings'] })
  }

  return (
    <div className="absolute inset-0 z-30" data-testid="settings-drawer">
      <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
      <aside role="dialog" aria-modal="true" aria-label="Inspection settings" className="absolute inset-y-0 right-0 flex w-[392px] max-w-full flex-col border-l bg-background shadow-2xl">
        <header className="flex items-center justify-between border-b px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold">Inspection settings</h2>
            <p className="text-[11px] text-muted-foreground">Saved with this inspection</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)} aria-label="Close settings"><X /></Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Block title="General tolerance" hint="Applied to a dimension that has no tolerance printed next to it.">
            <ToggleGroup type="single" value={mode} className="w-full" onValueChange={(v) => {
              if (v === 'decimals') s.setScheme(null)
              if (v === 'table') (fromDrawing ? s.setScheme(fromDrawing) : useClass('m'))
            }}>
              <ToggleGroupItem value="table" className="flex-1">By size, from a table</ToggleGroupItem>
              <ToggleGroupItem value="decimals" className="flex-1">By decimal places</ToggleGroupItem>
            </ToggleGroup>

            {scheme ? (
              <div className="rounded-lg border" data-testid="tolerance-source">
                <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
                  <Ruler className="size-3.5 text-primary" />
                  <span className="font-medium">{scheme.label}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {scheme.source === 'drawing' ? 'read from the drawing' : scheme.source === 'profile' ? 'customer profile' : scheme.source === 'assist' ? 'read by AI, confirmed by you' : 'standard table'}
                  </span>
                </div>
                <table className="w-full text-xs tabular-nums">
                  <tbody>
                    {scheme.linear.map(([lo, hi, tol]) => (
                      <tr key={lo} className="border-b last:border-b-0">
                        <td className="px-3 py-1 text-muted-foreground">{lo} to {hi}</td>
                        <td className="px-3 py-1 text-right font-medium">±{tol}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {scheme.angular && scheme.angular.length > 0 && (
                  <div className="border-t px-3 py-2 text-[11px] leading-snug text-muted-foreground" data-testid="angular-rows">
                    <span className="font-medium text-foreground">Angles, by length of the shorter leg: </span>
                    {scheme.angular.map(([lo, hi, deg]) => `${hi > 1e8 ? `over ${lo}` : `${lo} to ${hi}`} ±${deg >= 1 || Number.isInteger(deg * 2) ? `${Math.round(deg * 100) / 100}°` : `${Math.round(deg * 60)}'`}`).join(' · ')}
                    . Shown from the table; the angle value below is what is applied.
                  </div>
                )}
                {scheme.evidence.length > 0 && (
                  <p className="border-t px-3 py-2 text-[11px] leading-snug text-muted-foreground">
                    {scheme.verifiedAgainstSheet ? 'The table printed on the sheet agrees with the standard. ' : ''}Based on: {scheme.evidence.map((e) => `"${e}"`).join(' · ')}
                  </p>
                )}
                <div className="flex items-center gap-2 border-t px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Class</span>
                  <NativeSelect className="w-40" value={scheme.cls ?? 'm'} onChange={(e) => useClass(e.target.value)} disabled={!standards}>
                    <option value="f">f, fine</option>
                    <option value="m">m, medium</option>
                    <option value="c">c, coarse</option>
                    <option value="v">v, very coarse</option>
                  </NativeSelect>
                  {fromDrawing && scheme.source !== 'drawing' && (
                    <Button variant="outline" size="sm" className="ml-auto h-7" onClick={() => s.setScheme(fromDrawing)}>Use the drawing's</Button>
                  )}
                </div>
              </div>
            ) : (
              found?.findings.filter((f) => f.level === 'warn' && !f.text.startsWith('Angular')).map((f) => (
                <p key={f.text} className="rounded-lg border border-status-draft/40 bg-status-draft/10 px-3 py-2 text-[11px] leading-snug">{f.text}</p>
              ))
            )}

            <div className="space-y-1.5 pt-1">
              <p className="text-[11px] text-muted-foreground">{scheme ? 'Angles, and values outside the table, use these:' : 'Tolerance by the number of decimal places printed:'}</p>
              {DECIMAL_ROWS.filter((r) => !scheme || r.key === 'angular').map((row) => (
                <div key={row.key} className="grid grid-cols-[64px_1fr] items-center gap-2">
                  <span className="text-xs font-medium tabular-nums">{row.label}</span>
                  <div className="relative">
                    <Input type="number" step="0.01" min="0" value={s.defaults[row.key]} onChange={(e) => s.setDefault(row.key, Number(e.target.value))} className="pr-9" aria-label={`Default tolerance for ${row.label}`} />
                    <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">{row.key === 'angular' ? '°' : s.units}</span>
                  </div>
                </div>
              ))}
            </div>
          </Block>

          <Block title="Units and standard">
            <div className="grid grid-cols-2 gap-2">
              <ToggleGroup type="single" value={s.units} onValueChange={(v) => v && s.setUnits(v as Units)} className="w-full">
                <ToggleGroupItem value="mm" className="flex-1">mm</ToggleGroupItem>
                <ToggleGroupItem value="in" className="flex-1">in</ToggleGroupItem>
              </ToggleGroup>
              <ToggleGroup type="single" value={s.standard} onValueChange={(v) => v && s.setStandard(v as Standard)} className="w-full">
                <ToggleGroupItem value="ASME" className="flex-1">ASME</ToggleGroupItem>
                <ToggleGroupItem value="ISO" className="flex-1">ISO</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </Block>

          <Block title="Balloons">
            <label className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5"><Spline className="size-3.5 text-muted-foreground" /> Leader on new balloons</span>
              <Switch checked={s.leaderDefault} onCheckedChange={s.setLeaderDefault} aria-label="Leader line on new balloons" />
            </label>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5"><History className="size-3.5 text-muted-foreground" /> Undo steps</span>
              <Input type="number" min={MIN_UNDO_DEPTH} max={MAX_UNDO_DEPTH} step={1} value={s.undoDepth} onChange={(e) => s.setUndoDepth(Number(e.target.value))} className="w-20 text-right" aria-label="Undo history depth" />
            </div>
            <BalloonStyleEditor value={s.balloonStyle} onChange={s.setBalloonStyle} />
            <p className="text-[11px] text-muted-foreground">Applies to every balloon unless one has its own style.</p>
          </Block>
        </div>

        <footer className="border-t px-5 py-3">
          <Button className="w-full" size="sm" onClick={() => setOpen(false)}>Done</Button>
        </footer>
      </aside>
    </div>
  )
}
