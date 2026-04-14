import type { PathFeatures } from '../../store/types'
import clsx from 'clsx'

interface Props {
  features: PathFeatures
}

const ROLE_COLORS: Record<string, string> = {
  'Primary Line': 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  'Construction Line': 'text-slate-400 bg-slate-400/10 border-slate-400/30',
  'Hidden/Center Line': 'text-amber-400 bg-amber-400/10 border-amber-400/30',
  'Arrowhead/Fill': 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  'Unknown': 'text-text-muted bg-surface-3 border-border',
}

const CMD_COLORS: Record<string, string> = {
  M: 'bg-violet-500/20 text-violet-300',
  L: 'bg-blue-500/20 text-blue-300',
  H: 'bg-sky-500/20 text-sky-300',
  V: 'bg-cyan-500/20 text-cyan-300',
  C: 'bg-orange-500/20 text-orange-300',
  Q: 'bg-amber-500/20 text-amber-300',
  A: 'bg-rose-500/20 text-rose-300',
  Z: 'bg-slate-500/20 text-slate-300',
}

function Row({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-[11px] text-text-muted w-28 shrink-0 mt-0.5">{label}</span>
      <span className={clsx('text-[12px] text-text-primary flex-1 break-all', mono && 'font-mono')}>
        {value}
      </span>
    </div>
  )
}

export default function FeatureTable({ features }: Props) {
  const roleClass = ROLE_COLORS[features.entityRole] ?? ROLE_COLORS['Unknown']

  return (
    <div className="flex flex-col gap-4 text-sm">
      {/* Role badge */}
      <div className="flex items-center justify-between">
        <span className={clsx('text-[11px] font-medium px-2 py-0.5 rounded border', roleClass)}>
          {features.entityRole}
        </span>
        <span className="text-[10px] text-text-muted font-mono">{features.entityId}</span>
      </div>

      {/* Core geometry */}
      <section>
        <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2">
          Geometry
        </h3>
        <div className="bg-surface-3 rounded-lg px-3 py-1">
          {features.elementTag === 'path' && (
            <Row label="Total Length" value={`${features.totalLength.toFixed(2)} px`} mono />
          )}
          <Row
            label="Bounding Box"
            value={
              <span className="font-mono">
                x={features.bbox.x.toFixed(2)}, y={features.bbox.y.toFixed(2)}<br />
                {features.bbox.width.toFixed(2)} × {features.bbox.height.toFixed(2)} px
              </span>
            }
          />
          <Row label="Element Type" value={`<${features.elementTag}>`} mono />
          {features.textContent && (
            <Row label="Text Content" value={`"${features.textContent}"`} mono />
          )}
        </div>
      </section>

      {/* Style */}
      <section>
        <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2">
          Style
        </h3>
        <div className="bg-surface-3 rounded-lg px-3 py-1">
          <Row
            label="Stroke Width"
            value={<span className="font-mono">{features.strokeWidth} px</span>}
          />
          <Row
            label="Stroke Color"
            value={
              <span className="flex items-center gap-2 font-mono">
                <span
                  className="w-3 h-3 rounded-sm border border-border inline-block"
                  style={{ background: features.strokeColor }}
                />
                {features.strokeColor}
              </span>
            }
          />
          <Row
            label="Fill"
            value={
              <span className="flex items-center gap-2 font-mono">
                {features.fill !== 'none' && features.fill !== '' && (
                  <span
                    className="w-3 h-3 rounded-sm border border-border inline-block"
                    style={{ background: features.fill }}
                  />
                )}
                {features.fill || 'none'}
              </span>
            }
          />
          {features.dashArray && (
            <Row label="Dash Pattern" value={features.dashArray} mono />
          )}
          {features.strokeMiterlimit && (
            <Row label="Miterlimit" value={features.strokeMiterlimit} mono />
          )}
        </div>
      </section>

      {/* Segment breakdown */}
      {features.segments.length > 0 && (
        <section>
          <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2">
            Path Segments ({features.totalSegmentCount} total)
          </h3>
          <div className="bg-surface-3 rounded-lg overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-1.5 text-text-muted font-medium">Cmd</th>
                  <th className="text-left px-3 py-1.5 text-text-muted font-medium">Type</th>
                  <th className="text-right px-3 py-1.5 text-text-muted font-medium">Count</th>
                  <th className="text-right px-3 py-1.5 text-text-muted font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {features.segments.map((seg) => (
                  <tr key={seg.command} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-1.5">
                      <span
                        className={clsx(
                          'font-mono font-bold text-[11px] px-1.5 py-0.5 rounded',
                          CMD_COLORS[seg.command] ?? 'bg-surface text-text-secondary'
                        )}
                      >
                        {seg.command}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-text-secondary">{seg.label}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-text-primary">
                      {seg.count}
                    </td>
                    <td className="px-3 py-1.5 text-right text-text-muted">
                      {features.totalSegmentCount > 0
                        ? Math.round((seg.count / features.totalSegmentCount) * 100)
                        : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Path data preview */}
      {features.pathDataPreview && (
        <section>
          <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2">
            Path Data
          </h3>
          <div className="bg-surface-3 rounded-lg p-3">
            <code className="text-[10px] font-mono text-text-muted leading-relaxed break-all whitespace-pre-wrap">
              {features.pathDataPreview}
            </code>
          </div>
        </section>
      )}
    </div>
  )
}
