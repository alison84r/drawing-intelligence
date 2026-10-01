import { pageToScreen, type Point, type ScreenMap } from '@/lib/geometry'
import { deriveLimits, displayStatus } from '@/lib/tolerance'
import { useCharacteristicStore } from '@/store/characteristicStore'
import { openGroups, useRecognizeStore } from '@/store/recognizeStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'

interface Props {
  map: ScreenMap
  page: number
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
  /** Rotation of the box around its centre, CSS degrees. */
  rotate?: number
}

const INK = { select: '#2563eb', pass: '#15803d', fail: '#dc2626' }
const BAND = { open: '#fcd34d', char: '#86efac', ruled: '#cbd5e1' }
/** Highlights appear once the dimension text is at least this tall on screen, in CSS px. */
const MIN_TEXT_PX = 6
const PAD_PT = 1.5

/**
 * Highlights over the drawing. Quiet by default: the balloon marks a placed callout, so the text
 * is only coloured when hovered or selected (blue), when a result passes (green) or fails (red).
 * Callouts the pass could not place keep an amber marker band. Everything fades out when the sheet
 * is zoomed too far out to read.
 *
 * This layer must not create a stacking context (no opacity, transform or z-index on the wrapper):
 * the blend modes below have to reach the PDF canvas underneath.
 */
export function TokenLayer({ map, page }: Props) {
  const rec = useRecognizeStore((s) => s.pages[page])
  const tokenView = useRecognizeStore((s) => s.tokenView)
  const band = useRecognizeStore((s) => s.band)
  const adopt = useRecognizeStore((s) => s.adopt)
  const items = useCharacteristicStore((s) => s.items)
  const selectedId = useCharacteristicStore((s) => s.selectedId)
  const select = useCharacteristicStore((s) => s.select)
  const defaults = useSettingsStore((s) => s.defaults)
  const tool = useUiStore((s) => s.tool)
  const hoveredId = useUiStore((s) => s.hoveredId)
  const setHovered = useUiStore((s) => s.setHovered)

  const textPx = (rec?.dimensionFontSize ?? 12) * map.scale
  const readable = textPx >= MIN_TEXT_PX
  const interactive = tool === 'select'
  const pad = PAD_PT * map.scale
  const onPage = items.filter((c) => c.page === page && c.bbox)

  const bandRect = band ? toRect(band, map) : null

  return (
    <div className="pointer-events-none absolute inset-0" data-testid="token-layer">
      {/* Audit view: every token the pass read, as marker bands. */}
      {readable && tokenView === 'all' && rec?.tokens.map((t) => (
        <Band key={t.id} r={rectOf(t.bbox, t.obox, map)} pad={pad} color={BAND[t.cls]} title={`${t.text} · ${t.reason || t.cls}`} />
      ))}

      {/* Needs you: amber marker band, click to add with the best guess. */}
      {readable && tokenView !== 'off' && openGroups(rec).map((g) => (
        <Band
          key={g.guess.id}
          r={rectOf(g.guess.bbox ?? g.tokens[0].bbox, g.guess.obox, map)}
          pad={pad}
          color={BAND.open}
          title={`${g.guess.specification} · ${g.tokens[0]?.reason ?? 'needs you'} · click to add`}
          onClick={interactive ? () => adopt(g.guess.id) : undefined}
          testId="needs-band"
        />
      ))}
      {readable && tokenView === 'review' && rec?.tokens.filter((t) => t.cls === 'open' && !t.guess).map((t) => (
        <Band key={t.id} r={rectOf(t.bbox, t.obox, map)} pad={pad} color={BAND.open} title={`${t.text} · ${t.reason}`} />
      ))}

      {/* Placed callouts: ink colour by state, plus an invisible hit area. */}
      {onPage.map((c) => {
        const r = rectOf(c.bbox as Rect, c.obox, map)
        const status = displayStatus(c, deriveLimits(c, defaults))
        const active = c.id === selectedId || c.id === hoveredId
        const color = status === 'Fail' ? INK.fail : status === 'Pass' ? INK.pass : active ? INK.select : null
        return (
          <div key={c.id} data-callout={c.id} data-ink={color ?? ''}>
            {readable && color && <Ink r={r} pad={pad} color={color} strong={active} />}
            {interactive && (
              <div
                className="absolute cursor-pointer"
                style={{ left: r.x - pad, top: r.y - pad, width: r.w + 2 * pad, height: r.h + 2 * pad, pointerEvents: 'auto', ...turn(r) }}
                onPointerEnter={() => setHovered(c.id)}
                onPointerLeave={() => setHovered(null)}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  select(c.id)
                }}
                title={c.specification || undefined}
              />
            )}
          </div>
        )
      })}

      {/* Whole callout: the dimension line or leader of the active callout lights up with its text. */}
      <svg className="absolute inset-0 h-full w-full overflow-visible" style={{ pointerEvents: 'none' }}>
        {onPage
          .filter((c) => (c.id === selectedId || c.id === hoveredId) && c.geometry && c.geometry.segments.length > 0)
          .map((c) => (
            <g key={c.id} data-geometry={c.geometry?.kind}>
              {c.geometry?.segments.map((s, i) => {
                const a = pageToScreen({ x: s[0], y: s[1] }, map)
                const b = pageToScreen({ x: s[2], y: s[3] }, map)
                return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={c.geometry?.ratioOk === false ? INK.fail : INK.select} strokeWidth={2.25} strokeLinecap="round" strokeOpacity={0.85} />
              })}
              {c.geometry?.tips.map((t, i) => {
                const p = pageToScreen({ x: t[0], y: t[1] }, map)
                return <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={c.geometry?.ratioOk === false ? INK.fail : INK.select} />
              })}
            </g>
          ))}
        {tokenView !== 'off' &&
          rec?.audit?.unexplained.map((u, k) => (
            <g key={k} data-unexplained>
              {u.segments?.map((s, i) => {
                const a = pageToScreen({ x: s[0], y: s[1] }, map)
                const b = pageToScreen({ x: s[2], y: s[3] }, map)
                return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#d97706" strokeWidth={2.5} strokeDasharray="6 4" strokeLinecap="round" />
              })}
            </g>
          ))}
      </svg>

      {/* Audit view: the views found on the sheet, each with its name and scale. */}
      {tokenView === 'all' && rec?.views?.map((v) => {
        const r = toRect(v.bbox, map)
        return (
          <div key={v.id} className="absolute rounded-sm border border-dashed border-primary/70" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} data-testid="sheet-view">
            <span className="absolute -top-[18px] left-0 whitespace-nowrap rounded bg-primary px-1.5 text-[10px] font-medium leading-4 text-primary-foreground">
              {v.name}{v.scaleText ? ` · ${v.scaleText}` : ''}
            </span>
          </div>
        )
      })}

      {bandRect && (
        <div
          className="absolute border-[1.5px] border-dashed border-primary bg-primary/10"
          style={{ left: bandRect.x, top: bandRect.y, width: bandRect.w, height: bandRect.h }}
        />
      )}
    </div>
  )
}

/** Ink recolour: the digits take the colour, the paper stays white. Two stacked layers, no pixel reads. */
function Ink({ r, pad, color, strong }: { r: Rect; pad: number; color: string; strong: boolean }) {
  const box = { left: r.x - pad, top: r.y - pad, width: r.w + 2 * pad, height: r.h + 2 * pad, ...turn(r) }
  return (
    <>
      {/* 1. Push the anti-aliased grey strokes to solid black so thin CAD fonts take colour fully. */}
      <div className="absolute" style={{ ...box, backdropFilter: 'grayscale(1) brightness(0.8) contrast(4)', WebkitBackdropFilter: 'grayscale(1) brightness(0.8) contrast(4)' }} />
      {/* 2. Screen blend: black becomes the colour, white stays white. */}
      <div className="absolute" style={{ ...box, background: color, mixBlendMode: 'screen' }} />
      {strong && <div className="absolute rounded-[3px]" style={{ ...box, boxShadow: `0 0 0 1px ${color}33` }} />}
    </>
  )
}

/** Marker band: like a highlighter pen, the ink stays black. */
function Band({ r, pad, color, title, onClick, testId }: { r: Rect; pad: number; color: string; title?: string; onClick?: () => void; testId?: string }) {
  return (
    <div
      className={onClick ? 'absolute cursor-pointer rounded-[3px] transition-[filter] hover:brightness-90' : 'absolute rounded-[3px]'}
      style={{
        left: r.x - pad * 1.6,
        top: r.y - pad,
        width: r.w + pad * 3.2,
        height: r.h + 2 * pad,
        background: color,
        mixBlendMode: 'multiply',
        pointerEvents: onClick ? 'auto' : 'none',
        ...turn(r),
      }}
      title={title}
      data-testid={testId}
      onPointerDown={
        onClick
          ? (e) => {
              e.stopPropagation()
              onClick()
            }
          : undefined
      }
    />
  )
}

/** Screen rectangle for a callout: the oriented box when the text is diagonal, else the upright box. */
function rectOf(bbox: Rect, obox: { cx: number; cy: number; w: number; h: number; angle: number } | null | undefined, map: ScreenMap): Rect {
  if (!obox) return toRect(bbox, map)
  const c = pageToScreen({ x: obox.cx, y: obox.cy }, map)
  const w = obox.w * map.scale
  const h = obox.h * map.scale
  return { x: c.x - w / 2, y: c.y - h / 2, w, h, rotate: -obox.angle - map.rotation }
}

const turn = (r: Rect) => (r.rotate ? { transform: `rotate(${r.rotate}deg)` } : {})

function toRect(b: Rect, map: ScreenMap): Rect {
  const corners: Point[] = [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x, y: b.y + b.h },
    { x: b.x + b.w, y: b.y + b.h },
  ].map((p) => pageToScreen(p, map))
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}
