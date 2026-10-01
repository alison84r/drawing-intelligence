import { useCallback, useRef } from 'react'
import { clipToBox, pageToScreen, screenToPage, type Point, type ScreenMap } from '@/lib/geometry'
import { deriveLimits, displayStatus } from '@/lib/tolerance'
import { balloonLabel, useCharacteristicStore, type Characteristic } from '@/store/characteristicStore'
import { useSettingsStore, type BalloonStyle } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import { BalloonGlyph } from '@/components/balloons/BalloonGlyph'
import { cn } from '@/lib/utils'

interface Props {
  map: ScreenMap
  page: number
  /** Pointer position inside the surface, for the ghost balloon. */
  hover: Point | null
  leaderDefault: boolean
}

const STATUS_COLOR: Record<string, string | null> = { Pass: '#15803d', Fail: '#b91c1c', Draft: null, Accepted: null }

/** Balloon radius on screen: half the configured size at 100 percent, never below 7 px or above 1.4x. */
function radiusFor(style: BalloonStyle, scale: number): number {
  return Math.min(style.size * 1.4, Math.max(14, style.size * scale)) / 2
}

/** SVG layer over the PDF canvas. Balloons keep a constant on-screen size; positions live in page points. */
export function BalloonLayer({ map, page, hover, leaderDefault }: Props) {
  const items = useCharacteristicStore((s) => s.items)
  const selectedId = useCharacteristicStore((s) => s.selectedId)
  const select = useCharacteristicStore((s) => s.select)
  const moveBalloon = useCharacteristicStore((s) => s.moveBalloon)
  const addSubBalloon = useCharacteristicStore((s) => s.addSubBalloon)
  const leaderOffset = useCharacteristicStore((s) => s.leaderOffset)
  const globalStyle = useSettingsStore((s) => s.balloonStyle)
  const defaults = useSettingsStore((s) => s.defaults)
  const tool = useUiStore((s) => s.tool)
  const setTool = useUiStore((s) => s.setTool)
  const setHovered = useUiStore((s) => s.setHovered)

  const drag = useRef<{ id: string; start: Point; pos0: Point; anchor0: Point; leader: boolean; moved: boolean } | null>(null)
  const live = useRef<Point | null>(null)

  const onPointerDown = useCallback(
    (e: React.PointerEvent, c: Characteristic) => {
      e.stopPropagation()
      if (e.button !== 0) return
      select(c.id)
      if (tool === 'sub') {
        addSubBalloon(c.id)
        return
      }
      if (tool !== 'select') return
      const el = e.currentTarget as SVGElement
      el.setPointerCapture(e.pointerId)
      const rect = (el.ownerSVGElement ?? el).getBoundingClientRect()
      const start = screenToPage({ x: e.clientX - rect.left, y: e.clientY - rect.top }, map)
      drag.current = { id: c.id, start, pos0: c.balloonPos, anchor0: c.anchor, leader: c.leader, moved: false }
    },
    [tool, select, addSubBalloon, map],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const dr = drag.current
      if (!dr) return
      const el = e.currentTarget as SVGElement
      const rect = (el.ownerSVGElement ?? el).getBoundingClientRect()
      const p = screenToPage({ x: e.clientX - rect.left, y: e.clientY - rect.top }, map)
      const delta = { x: p.x - dr.start.x, y: p.y - dr.start.y }
      dr.moved = dr.moved || Math.abs(delta.x) + Math.abs(delta.y) > 0.5
      live.current = delta
      useCharacteristicStore.setState((s) => ({
        items: s.items.map((c) =>
          c.id === dr.id
            ? {
                ...c,
                balloonPos: { x: dr.pos0.x + delta.x, y: dr.pos0.y + delta.y },
                anchor: dr.leader ? c.anchor : { x: dr.anchor0.x + delta.x, y: dr.anchor0.y + delta.y },
              }
            : c,
        ),
      }))
    },
    [map],
  )

  const onPointerUp = useCallback(() => {
    const dr = drag.current
    if (!dr) return
    drag.current = null
    const delta = live.current
    live.current = null
    useCharacteristicStore.setState((s) => ({
      items: s.items.map((c) => (c.id === dr.id ? { ...c, balloonPos: dr.pos0, anchor: dr.anchor0 } : c)),
    }))
    if (dr.moved && delta) {
      moveBalloon(
        dr.id,
        { x: dr.pos0.x + delta.x, y: dr.pos0.y + delta.y },
        dr.leader ? undefined : { x: dr.anchor0.x + delta.x, y: dr.anchor0.y + delta.y },
      )
    }
  }, [moveBalloon])

  const placing = tool === 'single' || tool === 'multiple'
  const ghostAt = placing && hover ? screenToPage(hover, map) : null
  const nextNumber = (() => {
    const used = new Set(items.filter((c) => c.subNumber === null).map((c) => c.balloonNumber))
    let n = 1
    while (used.has(n)) n++
    return n
  })()
  const gr = radiusFor(globalStyle, map.scale)

  return (
    <svg
      className="absolute inset-0 h-full w-full overflow-visible"
      style={{ pointerEvents: 'none' }}
      data-testid="balloon-layer"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {items
        .filter((c) => c.page === page)
        .map((c) => {
          const style: BalloonStyle = { ...globalStyle, ...(c.style ?? {}) }
          const r = radiusFor(style, map.scale) * (c.subNumber !== null ? 0.9 : 1)
          const b = pageToScreen(c.balloonPos, map)
          const a = pageToScreen(c.leader ? clipToBox(c.balloonPos, c.anchor, c.bbox) : c.anchor, map)
          const status = displayStatus(c, deriveLimits(c, defaults))
          const color = STATUS_COLOR[status] ?? style.color
          const selected = c.id === selectedId
          const label = `${style.prefix}${balloonLabel(c)}`
          return (
            <g
              key={c.id}
              className="group"
              style={{ pointerEvents: 'auto', cursor: tool === 'select' ? 'grab' : tool === 'sub' ? 'copy' : 'default' }}
              onPointerDown={(e) => onPointerDown(e, c)}
              onPointerEnter={() => setHovered(c.id)}
              onPointerLeave={() => setHovered(null)}
              onDoubleClick={() => setTool('select')}
              data-balloon={balloonLabel(c)}
              data-status={status}
            >
              {c.leader && (
                <>
                  <line x1={b.x} y1={b.y} x2={a.x} y2={a.y} stroke={color} strokeWidth={1.25} />
                  <circle cx={a.x} cy={a.y} r={2.5} fill={color} />
                </>
              )}
              <circle
                cx={b.x}
                cy={b.y}
                r={r + 5}
                fill={color}
                className={cn('transition-opacity', selected ? 'opacity-25' : 'opacity-0 group-hover:opacity-15')}
              />
              <BalloonGlyph
                shape={style.shape}
                fill={style.fill}
                color={color}
                cx={b.x}
                cy={b.y}
                r={r}
                strokeWidth={selected ? 3 : 2}
                label={label}
                weight={style.weight}
              />
            </g>
          )
        })}

      {ghostAt && hover && (() => {
        const ballS = leaderDefault ? pageToScreen({ x: ghostAt.x, y: ghostAt.y - leaderOffset }, map) : hover
        return (
          <g className="opacity-50" aria-hidden>
            {leaderDefault && (
              <>
                <line x1={ballS.x} y1={ballS.y} x2={hover.x} y2={hover.y} stroke={globalStyle.color} strokeWidth={1.25} />
                <circle cx={hover.x} cy={hover.y} r={2.5} fill={globalStyle.color} />
              </>
            )}
            <BalloonGlyph
              shape={globalStyle.shape}
              fill={globalStyle.fill}
              color={globalStyle.color}
              cx={ballS.x}
              cy={ballS.y}
              r={gr}
              strokeWidth={2}
              label={`${globalStyle.prefix}${nextNumber}`}
              weight={globalStyle.weight}
              dashed
            />
          </g>
        )
      })()}
    </svg>
  )
}
