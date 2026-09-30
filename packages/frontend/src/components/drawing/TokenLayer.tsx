import { pageToScreen, type Point, type ScreenMap } from '@/lib/geometry'
import type { RecognizeToken } from '@/lib/api'
import { useCharacteristicStore } from '@/store/characteristicStore'
import { useRecognizeStore } from '@/store/recognizeStore'
import { useUiStore } from '@/store/uiStore'

interface Props {
  map: ScreenMap
  page: number
}

const COLOR: Record<RecognizeToken['cls'], string> = { char: '#16a34a', open: '#d97706', ruled: '#94a3b8' }

/** Every text token the pass read, painted over the PDF: green placed, amber needs you, grey ruled out. */
export function TokenLayer({ map, page }: Props) {
  const rec = useRecognizeStore((s) => s.pages[page])
  const tokenView = useRecognizeStore((s) => s.tokenView)
  const band = useRecognizeStore((s) => s.band)
  const adopt = useRecognizeStore((s) => s.adopt)
  const select = useCharacteristicStore((s) => s.select)
  const selectedId = useCharacteristicStore((s) => s.selectedId)
  const setTool = useUiStore((s) => s.setTool)

  const bandRect = band ? toRect(band, map) : null
  if ((!rec || tokenView === 'off') && !bandRect) return null

  const tokens = rec && tokenView !== 'off' ? rec.tokens.filter((t) => tokenView === 'all' || t.cls !== 'ruled') : []

  return (
    <svg className="absolute inset-0 h-full w-full overflow-visible" style={{ pointerEvents: 'none' }} data-testid="token-layer">
      {tokens.map((t) => {
        const r = toRect(t.bbox, map)
        const color = COLOR[t.cls]
        const active = t.cls === 'char' && t.charId === selectedId
        const clickable = t.cls !== 'ruled'
        return (
          <g key={t.id} data-token={t.text} data-cls={t.cls}>
            <rect
              x={r.x - 1.5}
              y={r.y - 1.5}
              width={r.w + 3}
              height={r.h + 3}
              rx={2}
              fill={color}
              fillOpacity={active ? 0.35 : t.cls === 'ruled' ? 0.1 : 0.18}
              stroke={color}
              strokeOpacity={t.cls === 'ruled' ? 0.35 : 0.9}
              strokeWidth={active ? 2 : 1}
              className={clickable ? 'transition-[fill-opacity] hover:[fill-opacity:0.4]' : undefined}
              style={{ pointerEvents: clickable ? 'auto' : 'none', cursor: clickable ? 'pointer' : 'default' }}
              onPointerDown={(e) => {
                e.stopPropagation()
                if (t.cls === 'char' && t.charId) {
                  select(t.charId)
                  setTool('select')
                } else if (t.cls === 'open' && t.guess) {
                  adopt(t.guess.id)
                }
              }}
            >
              <title>{`${t.text} · ${t.reason || t.cls}`}</title>
            </rect>
          </g>
        )
      })}
      {bandRect && (
        <rect
          x={bandRect.x}
          y={bandRect.y}
          width={bandRect.w}
          height={bandRect.h}
          fill="hsl(var(--primary))"
          fillOpacity={0.08}
          stroke="hsl(var(--primary))"
          strokeWidth={1.5}
          strokeDasharray="6 4"
        />
      )}
    </svg>
  )
}

function toRect(b: { x: number; y: number; w: number; h: number }, map: ScreenMap): { x: number; y: number; w: number; h: number } {
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
