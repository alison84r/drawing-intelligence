import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, Eye, RotateCcw, Trash2, ZoomIn } from 'lucide-react'
import { toggleZoomTo } from '@/lib/focus'
import { balloonLabel, useCharacteristicStore } from '@/store/characteristicStore'
import { useUiStore } from '@/store/uiStore'
import { cn } from '@/lib/utils'

function Item({ icon, label, hint, danger, onClick }: { icon: React.ReactNode; label: string; hint?: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs outline-none transition-colors hover:bg-accent focus-visible:bg-accent [&_svg]:size-3.5',
        danger && 'text-status-fail',
      )}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
    </button>
  )
}

/** Right-click menu for a balloon or a grid row: the same actions as the shortcuts, for people who look for a menu. */
export function BalloonContextMenu() {
  const menu = useUiStore((s) => s.contextMenu)
  const close = useUiStore((s) => s.closeContextMenu)
  const soloId = useUiStore((s) => s.soloId)
  const setSolo = useUiStore((s) => s.setSolo)
  const item = useCharacteristicStore((s) => (menu ? s.items.find((c) => c.id === menu.id) ?? null : null))
  const update = useCharacteristicStore((s) => s.update)
  const remove = useCharacteristicStore((s) => s.remove)
  const select = useCharacteristicStore((s) => s.select)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    if (!menu || !ref.current) return
    const { width, height } = ref.current.getBoundingClientRect()
    setPos({ left: Math.min(menu.x, window.innerWidth - width - 8), top: Math.min(menu.y, window.innerHeight - height - 8) })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', close, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', close)
    }
  }, [menu, close])

  if (!menu || !item) return null
  const run = (fn: () => void) => () => {
    fn()
    close()
  }
  const label = balloonLabel(item)

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Balloon ${label}`}
      className="fixed z-50 w-52 rounded-md border bg-background p-1 shadow-xl"
      style={{ left: pos?.left ?? menu.x, top: pos?.top ?? menu.y, visibility: pos ? 'visible' : 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="balloon-menu"
    >
      <div className="truncate px-2 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Balloon {label} · {item.specification || item.descriptionType}
      </div>
      <Item icon={<ZoomIn />} label="Zoom to it" hint="F" onClick={run(() => toggleZoomTo(item.id))} />
      {soloId === item.id ? (
        <Item icon={<Eye />} label="Show all balloons" hint="Esc" onClick={run(() => setSolo(null))} />
      ) : (
        <Item
          icon={<Eye />}
          label="Show only this"
          onClick={run(() => {
            select(item.id)
            setSolo(item.id)
          })}
        />
      )}
      {item.status === 'Draft' ? (
        <Item icon={<Check />} label="Accept" onClick={run(() => update(item.id, { status: 'Accepted' }))} />
      ) : (
        <Item icon={<RotateCcw />} label="Back to Draft" onClick={run(() => update(item.id, { status: 'Draft' }))} />
      )}
      <div className="my-1 border-t" />
      <Item icon={<Trash2 />} label="Delete" hint="Del" danger onClick={run(() => remove(item.id))} />
    </div>
  )
}
