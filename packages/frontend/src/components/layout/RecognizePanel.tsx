import { useEffect } from 'react'
import { AlertTriangle, CheckCheck, CircleAlert, CircleCheck, CircleX, Loader2, RotateCcw, ScanSearch, Sparkles, SquareDashedMousePointer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { openGroups, useRecognizeStore, type TokenView } from '@/store/recognizeStore'
import { useCharacteristicStore } from '@/store/characteristicStore'
import { useDocumentStore } from '@/store/documentStore'
import { useSessionStore } from '@/store/sessionStore'
import { useUiStore } from '@/store/uiStore'
import { cn } from '@/lib/utils'

function Chip({ color, count, label }: { color: string; count: number; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="size-2 rounded-sm" style={{ background: color }} />
      <span className="tabular-nums font-medium text-foreground">{count}</span> {label}
    </span>
  )
}

/** Recognize: run the deterministic pass, review what it could not place, accept the rest. */
export function RecognizePanel() {
  const status = useRecognizeStore((s) => s.status)
  const error = useRecognizeStore((s) => s.error)
  const run = useRecognizeStore((s) => s.run)
  const reset = useRecognizeStore((s) => s.reset)
  const adopt = useRecognizeStore((s) => s.adopt)
  const tokenView = useRecognizeStore((s) => s.tokenView)
  const setTokenView = useRecognizeStore((s) => s.setTokenView)
  const lastAdded = useRecognizeStore((s) => s.lastAdded)
  const pageIndex = useDocumentStore((s) => s.pageIndex)
  const page = useRecognizeStore((s) => s.pages[pageIndex])
  const ready = useDocumentStore((s) => s.status === 'ready')
  const revisionId = useSessionStore((s) => s.revisionId)
  const tool = useUiStore((s) => s.tool)
  const setTool = useUiStore((s) => s.setTool)
  const autoDrafts = useCharacteristicStore((s) => s.items.filter((c) => c.source === 'auto' && c.status === 'Draft').length)
  const autoCount = useCharacteristicStore((s) => s.items.filter((c) => c.source === 'auto').length)
  const acceptAll = useCharacteristicStore((s) => s.acceptAll)
  const select = useCharacteristicStore((s) => s.select)

  const intake = useRecognizeStore((s) => s.intake)
  const loadIntake = useRecognizeStore((s) => s.loadIntake)
  useEffect(() => {
    if (revisionId && ready) void loadIntake(revisionId)
  }, [revisionId, ready, loadIntake])
  const intakePage = intake?.pages.find((p) => p.page === pageIndex) ?? intake?.pages[0]
  const unreadable = intake?.level === 'bad'

  const running = status === 'running'
  const needs = openGroups(page)
  const unread = page ? page.tokens.filter((t) => t.cls === 'open' && !t.guess).length : 0
  const canRun = ready && Boolean(revisionId) && !running && !unreadable

  return (
    <section className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <Sparkles className="size-3.5 text-primary" /> Recognize
      </Label>
      <div className="flex gap-1.5">
        <Button size="sm" className="h-8 flex-1 gap-1.5" onClick={() => void run()} disabled={!canRun} data-testid="recognize-run">
          {running ? <Loader2 className="animate-spin" /> : <ScanSearch />} {running ? 'Reading…' : 'Recognize'}
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant={tool === 'window' ? 'default' : 'outline'}
              className="h-8 gap-1.5 px-2.5"
              onClick={() => setTool(tool === 'window' ? 'select' : 'window')}
              disabled={!canRun}
              aria-label="Window re-extract (W)"
            >
              <SquareDashedMousePointer />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Drag a window on the drawing to re-run the pass inside it (W)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 px-2.5" onClick={reset} disabled={autoCount === 0 && !page} aria-label="Remove recognized balloons">
              <RotateCcw />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove every recognized balloon and the token colours</TooltipContent>
        </Tooltip>
      </div>
      {!revisionId && ready && <p className="text-[11px] text-status-draft">Open the drawing from the library to recognize it.</p>}
      {intake && intakePage && (
        <div
          className={cn(
            'rounded-md border bg-background',
            intake.level === 'bad' && 'border-status-fail/50',
            intake.level === 'warn' && 'border-status-draft/50',
          )}
          data-testid="intake-card"
        >
          <div className="flex items-center gap-1.5 border-b px-2.5 py-1.5 text-[11px] font-medium">
            {intake.level === 'ok' ? <CircleCheck className="size-3.5 text-status-pass" /> : intake.level === 'warn' ? <CircleAlert className="size-3.5 text-status-draft" /> : <CircleX className="size-3.5 text-status-fail" />}
            {intake.verdict}
          </div>
          <ul className="space-y-1 px-2.5 py-2">
            {intakePage.rows.map((r) => (
              <li key={r.key} className="grid grid-cols-[auto_1fr] gap-x-2 text-[11px] leading-snug">
                <span className={cn('mt-[5px] size-1.5 rounded-full', r.level === 'ok' ? 'bg-status-pass' : r.level === 'warn' ? 'bg-status-draft' : 'bg-status-fail')} />
                <span>
                  <span className="font-medium">{r.label}</span> <span className="text-muted-foreground">{r.value}</span>
                </span>
              </li>
            ))}
          </ul>
          {unreadable && <p className="border-t px-2.5 py-1.5 text-[11px] text-muted-foreground">Balloon this sheet by hand, or ask for a vector PDF export from CAD.</p>}
        </div>
      )}
      {error && <p className="text-[11px] text-status-fail" role="alert">{error}</p>}

      {page && (
        <>
          <div className="flex flex-wrap gap-x-3 gap-y-1 rounded-md border bg-background px-2.5 py-2">
            <Chip color="#16a34a" count={autoCount} label="placed" />
            <Chip color="#d97706" count={needs.length + unread} label="needs you" />
            <Chip color="#94a3b8" count={page.stats.ruled} label="ruled out" />
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {lastAdded > 0 ? `${lastAdded} balloons added as Draft. ` : 'Nothing new to add. '}
            {page.zones.synthetic ? 'No zone labels on the border, nominal grid used.' : 'Zones read from the border.'}
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">Highlights</span>
            <ToggleGroup type="single" value={tokenView} onValueChange={(v) => v && setTokenView(v as TokenView)} aria-label="Token overlay">
              <ToggleGroupItem value="off" className="h-7 px-2 text-[11px]">Off</ToggleGroupItem>
              <ToggleGroupItem value="review" className="h-7 px-2 text-[11px]">Quiet</ToggleGroupItem>
              <ToggleGroupItem value="all" className="h-7 px-2 text-[11px]">Audit</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="rounded-md border bg-background">
            <div className="flex items-center gap-1.5 border-b px-2.5 py-1.5 text-[11px] font-medium">
              <AlertTriangle className="size-3.5 text-status-draft" /> Needs you
              <span className="ml-auto tabular-nums text-muted-foreground">{needs.length}</span>
            </div>
            {needs.length === 0 ? (
              <p className="px-2.5 py-2 text-[11px] text-muted-foreground">
                {unread > 0 ? `${unread} stray tokens could not be read as a value. Use the window tool on them if they matter.` : 'Everything the pass read is placed.'}
              </p>
            ) : (
              <ul className="max-h-44 overflow-y-auto" data-testid="needs-you">
                {needs.map((g) => (
                  <li key={g.guess.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent"
                      onClick={() => adopt(g.guess.id)}
                      title="Add as a Draft balloon with this guess"
                    >
                      <span className="size-2 shrink-0 rounded-sm bg-[#d97706]" />
                      <span className="truncate font-medium">{g.guess.specification || g.tokens.map((t) => t.text).join(' ')}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{g.guess.zone} · {g.tokens[0]?.reason}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Button
            size="sm"
            variant="outline"
            className={cn('h-8 w-full gap-1.5', autoDrafts > 0 && 'border-status-pass/50 text-status-pass hover:text-status-pass')}
            onClick={() => {
              acceptAll()
              select(null)
            }}
            disabled={autoDrafts === 0}
            data-testid="accept-all"
          >
            <CheckCheck /> Accept {autoDrafts > 0 ? `${autoDrafts} reviewed drafts` : 'all'}
          </Button>
        </>
      )}
    </section>
  )
}
