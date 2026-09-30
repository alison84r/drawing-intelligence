import type { BalloonFill, BalloonShape } from '@/store/settingsStore'

interface Props {
  shape: BalloonShape
  fill: BalloonFill
  color: string
  cx: number
  cy: number
  /** Half of the balloon size in px. */
  r: number
  strokeWidth: number
  label?: string
  weight?: 400 | 600
  dashed?: boolean
}

function shapeElement(shape: BalloonShape, cx: number, cy: number, r: number, props: React.SVGProps<SVGElement>) {
  switch (shape) {
    case 'square':
      return <rect x={cx - r} y={cy - r} width={2 * r} height={2 * r} rx={r * 0.18} {...(props as React.SVGProps<SVGRectElement>)} />
    case 'hex': {
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i - Math.PI / 6
        return `${(cx + r * 1.1 * Math.cos(a)).toFixed(2)},${(cy + r * 1.1 * Math.sin(a)).toFixed(2)}`
      }).join(' ')
      return <polygon points={pts} {...(props as React.SVGProps<SVGPolygonElement>)} />
    }
    case 'triangle':
      return (
        <polygon
          points={`${cx},${cy - r * 1.3} ${cx + r * 1.25},${cy + r * 0.9} ${cx - r * 1.25},${cy + r * 0.9}`}
          {...(props as React.SVGProps<SVGPolygonElement>)}
        />
      )
    default:
      return <circle cx={cx} cy={cy} r={r} {...(props as React.SVGProps<SVGCircleElement>)} />
  }
}

/** The balloon outline or filled shape plus its number. Rendered inside an existing <svg>. */
export function BalloonGlyph({ shape, fill, color, cx, cy, r, strokeWidth, label, weight = 600, dashed }: Props) {
  const filled = fill === 'filled'
  return (
    <>
      {shapeElement(shape, cx, cy, r, {
        fill: filled ? color : '#ffffff',
        stroke: color,
        strokeWidth,
        strokeDasharray: dashed ? '3 2' : undefined,
      })}
      {label !== undefined && (
        <text
          x={cx}
          y={cy + (shape === 'triangle' ? r * 0.25 : 0)}
          textAnchor="middle"
          dominantBaseline="central"
          className="select-none"
          style={{ fontSize: Math.max(8, r * (label.length > 2 ? 0.72 : 0.95)), fontWeight: weight, fill: filled ? '#ffffff' : color }}
        >
          {label}
        </text>
      )}
    </>
  )
}
