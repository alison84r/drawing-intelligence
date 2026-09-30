import { AlertTriangle, Check, CloudOff, Loader2 } from 'lucide-react'
import { useSessionStore } from '@/store/sessionStore'
import { cn } from '@/lib/utils'

/** "Saved 12:03", "Saving…", or "Not saved" with the reason, driven by autosave. */
export function SaveStatus() {
  const state = useSessionStore((s) => s.saveState)
  const at = useSessionStore((s) => s.lastSavedAt)
  const error = useSessionStore((s) => s.saveError)
  const time = at ? new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''

  const view = (() => {
    switch (state) {
      case 'saving':
        return { icon: <Loader2 className="size-3.5 animate-spin" />, text: 'Saving…', cls: 'text-muted-foreground' }
      case 'dirty':
        return { icon: <Loader2 className="size-3.5" />, text: 'Unsaved changes', cls: 'text-muted-foreground' }
      case 'error':
      case 'offline':
        return { icon: <CloudOff className="size-3.5" />, text: 'Not saved', cls: 'text-status-fail' }
      case 'saved':
        return { icon: <Check className="size-3.5" />, text: `Saved ${time}`, cls: 'text-status-pass' }
      default:
        return null
    }
  })()
  if (!view) return null
  return (
    <span className={cn('flex items-center gap-1 whitespace-nowrap text-[11px] tabular-nums', view.cls)} title={error ?? undefined} data-testid="save-status">
      {state === 'error' ? <AlertTriangle className="size-3.5" /> : view.icon}
      {view.text}
    </span>
  )
}
