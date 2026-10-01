import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('min-w-0', className)}>
      <Label className="mb-1 block">{label}</Label>
      {children}
    </div>
  )
}

/** Text input that commits on blur or Enter, so each field edit is one undo step. */
export function CommitInput({
  value,
  onCommit,
  onEnter,
  className,
  badge,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string
  onCommit: (v: string) => void
  /** Called after the commit when the user pressed Enter, e.g. to move to the next row. */
  onEnter?: () => void
  badge?: string
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <div className="relative">
      <Input
        {...rest}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onCommit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (draft !== value) onCommit(draft)
            ;(e.currentTarget as HTMLInputElement).blur()
            onEnter?.()
          }
          if (e.key === 'Escape') setDraft(value)
          e.stopPropagation()
        }}
        className={cn(badge && 'pr-12', className)}
      />
      {badge && (
        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 rounded bg-muted px-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          {badge}
        </span>
      )}
    </div>
  )
}

export function CommitTextarea({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder?: string }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <Textarea
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => e.stopPropagation()}
    />
  )
}
