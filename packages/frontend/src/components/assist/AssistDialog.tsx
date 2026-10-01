import { useEffect, useState } from 'react'
import { Check, CloudUpload, Image as ImageIcon, Loader2, ShieldAlert, Sparkles, Table2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { api, type AssistCandidate, type AssistResult, type AssistStatus, type AssistTask } from '@/lib/api'
import { useDocumentStore } from '@/store/documentStore'
import { usePartInfoStore } from '@/store/partInfoStore'
import { useSessionStore } from '@/store/sessionStore'
import { useSettingsStore } from '@/store/settingsStore'
import { cn } from '@/lib/utils'

const TITLE_FIELDS: { key: string; label: string }[] = [
  { key: 'partNumber', label: 'Part number' },
  { key: 'partName', label: 'Part name' },
  { key: 'drawingNumber', label: 'Drawing number' },
  { key: 'revision', label: 'Revision' },
  { key: 'material', label: 'Material' },
  { key: 'scale', label: 'Scale' },
  { key: 'units', label: 'Units' },
  { key: 'generalTolerance', label: 'General tolerance' },
]

/**
 * Ask a vision model to read one region: pick it, look at exactly what would be sent, confirm, then
 * review the answer. Nothing is applied until the person presses Apply.
 */
export function AssistDialog({ open, status, onClose }: { open: boolean; status: AssistStatus | null; onClose: () => void }) {
  const revisionId = useSessionStore((s) => s.revisionId)
  const pageIndex = useDocumentStore((s) => s.pageIndex)
  const setScheme = useSettingsStore((s) => s.setScheme)
  const setDefault = useSettingsStore((s) => s.setDefault)
  const setPartInfo = usePartInfoStore((s) => s.set)
  const [candidates, setCandidates] = useState<AssistCandidate[] | null>(null)
  const [picked, setPicked] = useState<AssistCandidate | null>(null)
  const [task, setTask] = useState<AssistTask>('tolerance_table')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AssistResult | null>(null)
  const [applied, setApplied] = useState(false)

  useEffect(() => {
    if (!open || !revisionId) return
    setCandidates(null)
    setPicked(null)
    setConsent(false)
    setResult(null)
    setError(null)
    setApplied(false)
    api.assistCandidates(revisionId, pageIndex).then(setCandidates).catch(() => setCandidates([]))
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, revisionId, pageIndex, onClose])

  if (!open || !revisionId) return null
  const ready = Boolean(status?.enabled)

  const pick = (c: AssistCandidate) => {
    setPicked(c)
    setConsent(false)
    setResult(null)
    setError(null)
    setApplied(false)
  }

  const send = async () => {
    if (!picked) return
    setBusy(true)
    setError(null)
    try {
      setResult(await api.assistRead(revisionId, { page: pageIndex, region: picked.bbox, task, consent }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The read failed')
    } finally {
      setBusy(false)
    }
  }

  const apply = () => {
    if (!result) return
    const f = result.fields
    if (result.task === 'tolerance_table') {
      if (f.linear && f.linear.length > 0) {
        const label = [f.standard, f.class].filter(Boolean).join('-') || 'Table read from the drawing'
        setScheme({ kind: 'size_range', label, standard: f.standard || undefined, cls: f.class || undefined, linear: f.linear, source: 'assist', verifiedAgainstSheet: null, evidence: [`Read by ${result.model}, confirmed by you`] })
      } else if (f.decimals) {
        setScheme(null)
        for (const [places, tol] of Object.entries(f.decimals)) setDefault((['places0', 'places1', 'places2', 'places3'] as const)[Number(places)], tol)
      }
      if (typeof f.angular === 'number') setDefault('angular', f.angular)
    } else {
      if (f.partNumber) setPartInfo('partNumber', f.partNumber)
      if (f.partName) setPartInfo('partName', f.partName)
      if (f.drawingNumber) setPartInfo('drawingNumber', f.drawingNumber)
      if (f.revision) setPartInfo('drawingRevision', f.revision)
    }
    setApplied(true)
  }

  const f = result?.fields
  const nothingToApply = !f?.found || (result?.task === 'tolerance_table' && !(f.linear?.length || Object.keys(f.decimals ?? {}).length || typeof f.angular === 'number'))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="assist-title" className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-lg border bg-background shadow-2xl" data-testid="assist-dialog">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 id="assist-title" className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="size-4 text-primary" /> Read a region with AI</h2>
            <p className="text-xs text-muted-foreground">
              {ready ? `${status?.model} through ${status?.provider}. The answer is a suggestion; you decide what is applied.` : `Off. ${status?.reason ?? ''}`}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close"><X /></Button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 md:grid-cols-[220px_1fr]">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Region on sheet {pageIndex + 1}</p>
            {candidates === null && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Looking for tables and pictures</p>}
            {candidates?.length === 0 && <p className="text-xs text-muted-foreground">No table or embedded picture found on this sheet. The recognizer already reads all text and lines.</p>}
            {candidates?.map((c) => (
              <button key={c.id} type="button" onClick={() => pick(c)}
                className={cn('flex w-full items-center gap-2 rounded-md border p-1.5 text-left text-xs transition-colors hover:border-primary/60', picked?.id === c.id && 'border-primary bg-primary/5')}>
                <img src={api.assistCropUrl(revisionId, pageIndex, c.bbox)} alt="" className="h-12 w-16 shrink-0 rounded border bg-white object-contain" />
                <span className="flex items-center gap-1.5">{c.kind === 'picture' ? <ImageIcon className="size-3.5" /> : <Table2 className="size-3.5" />}{c.kind === 'picture' ? 'Picture' : 'Table'}</span>
              </button>
            ))}
          </div>

          <div className="min-w-0 space-y-3">
            {!picked ? (
              <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">Choose a region on the left. You will see exactly what would be sent before anything leaves this machine.</p>
            ) : (
              <>
                <ToggleGroup type="single" value={task} onValueChange={(v) => { if (v) { setTask(v as AssistTask); setResult(null); setApplied(false) } }} className="w-full">
                  <ToggleGroupItem value="tolerance_table" className="flex-1">General tolerance</ToggleGroupItem>
                  <ToggleGroupItem value="title_block" className="flex-1">Title block</ToggleGroupItem>
                </ToggleGroup>
                <figure className="overflow-hidden rounded-md border bg-white">
                  <img src={api.assistCropUrl(revisionId, pageIndex, picked.bbox)} alt="The crop that would be sent" className="max-h-56 w-full object-contain" data-testid="assist-crop" />
                </figure>
                {!result && (
                  <label className="flex cursor-pointer items-start gap-2 rounded-md border border-status-draft/50 bg-status-draft/10 p-2.5 text-xs">
                    <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-primary" data-testid="assist-consent" />
                    <span>
                      <span className="flex items-center gap-1 font-medium"><ShieldAlert className="size-3.5 text-status-draft" /> This picture leaves this machine</span>
                      Only the crop above is sent to {status?.enabled ? status.provider : 'the model service'}; the rest of the drawing is not. Do not send export-controlled or customer-restricted drawings. The send is recorded.
                    </span>
                  </label>
                )}
                {error && <p className="text-xs text-status-fail" role="alert">{error}</p>}
                {result && f && (
                  <div className="rounded-md border text-xs" data-testid="assist-result">
                    <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
                      <span className="font-semibold">{f.found ? 'Suggestion' : 'Nothing usable was read'}</span>
                      <span className="ml-auto text-muted-foreground">{result.model} · {Math.round(result.sentBytes / 1024)} KB sent</span>
                    </div>
                    {result.task === 'title_block' ? (
                      <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 px-3 py-2">
                        {TITLE_FIELDS.filter((t) => (f as Record<string, unknown>)[t.key]).map((t) => (
                          <div key={t.key} className="contents"><dt className="text-muted-foreground">{t.label}</dt><dd className="font-medium">{String((f as Record<string, unknown>)[t.key])}</dd></div>
                        ))}
                      </dl>
                    ) : (
                      <div className="px-3 py-2">
                        {(f.standard || f.class) && <p className="mb-1 font-medium">{[f.standard, f.class && `class ${f.class}`].filter(Boolean).join(', ')}</p>}
                        <table className="w-full tabular-nums">
                          <tbody>
                            {f.linear?.map(([lo, hi, tol]) => (<tr key={lo} className="border-b last:border-b-0"><td className="py-0.5 text-muted-foreground">{lo} to {hi}</td><td className="py-0.5 text-right font-medium">±{tol}</td></tr>))}
                            {Object.entries(f.decimals ?? {}).map(([places, tol]) => (<tr key={places} className="border-b last:border-b-0"><td className="py-0.5 text-muted-foreground">{['X', 'X.X', 'X.XX', 'X.XXX'][Number(places)]}</td><td className="py-0.5 text-right font-medium">±{tol}</td></tr>))}
                            {typeof f.angular === 'number' && <tr><td className="py-0.5 text-muted-foreground">Angle</td><td className="py-0.5 text-right font-medium">±{f.angular}°</td></tr>}
                          </tbody>
                        </table>
                        {f.notes && <p className="mt-1 text-muted-foreground">{f.notes}</p>}
                      </div>
                    )}
                    <p className="border-t px-3 py-2 text-muted-foreground">Check it against the picture above before applying. A model can misread a digit.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>{applied ? 'Done' : 'Cancel'}</Button>
          {result ? (
            <Button size="sm" className="gap-1.5" onClick={apply} disabled={nothingToApply || applied} data-testid="assist-apply">
              <Check /> {applied ? 'Applied' : result.task === 'tolerance_table' ? 'Apply as general tolerance' : 'Apply to part info'}
            </Button>
          ) : (
            <Button size="sm" className="gap-1.5" onClick={send} disabled={!ready || !picked || !consent || busy} data-testid="assist-send">
              {busy ? <Loader2 className="animate-spin" /> : <CloudUpload />} Send this crop
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
