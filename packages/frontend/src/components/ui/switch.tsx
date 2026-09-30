import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
}

/** Accessible toggle switch (role="switch"), keyboard: Space or Enter. */
const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, onCheckedChange, disabled, ...props }, ref) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={checked ? 'checked' : 'unchecked'}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault()
        onCheckedChange?.(!checked)
      }}
      className={cn(
        'peer inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-muted-foreground/40',
        className,
      )}
      ref={ref}
      {...props}
    >
      <span
        className={cn(
          'pointer-events-none block h-3 w-3 rounded-full bg-background shadow-lg transition-transform',
          checked ? 'translate-x-3' : 'translate-x-0',
        )}
      />
    </button>
  ),
)
Switch.displayName = 'Switch'

export { Switch }
