import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BALLOON_COLORS, type BalloonFill, type BalloonShape, type BalloonStyle } from '@/store/settingsStore'
import { cn } from '@/lib/utils'
import { BalloonGlyph } from './BalloonGlyph'

interface Props {
  value: BalloonStyle
  onChange: (patch: Partial<BalloonStyle>) => void
  compact?: boolean
}

/** Shape, fill, colour, size, prefix and weight, with a live preview. */
export function BalloonStyleEditor({ value, onChange, compact }: Props) {
  return (
    <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-[1fr_84px]')}>
      <div className="space-y-2.5">
        <div>
          <Label className="mb-1 block">Shape</Label>
          <ToggleGroup type="single" value={value.shape} onValueChange={(v) => v && onChange({ shape: v as BalloonShape })} className="w-full">
            {(['circle', 'square', 'hex', 'triangle'] as BalloonShape[]).map((s) => (
              <ToggleGroupItem key={s} value={s} className="flex-1 px-1" aria-label={s}>
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                  <BalloonGlyph shape={s} fill="outline" color="currentColor" cx={8} cy={8} r={6} strokeWidth={1.5} />
                </svg>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div>
          <Label className="mb-1 block">Fill</Label>
          <ToggleGroup type="single" value={value.fill} onValueChange={(v) => v && onChange({ fill: v as BalloonFill })} className="w-full">
            <ToggleGroupItem value="outline" className="flex-1">Outline</ToggleGroupItem>
            <ToggleGroupItem value="filled" className="flex-1">Filled</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div>
          <Label className="mb-1 block">Colour</Label>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Balloon colour">
            {BALLOON_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={value.color === c.value}
                title={c.name}
                onClick={() => onChange({ color: c.value })}
                style={{ backgroundColor: c.value }}
                className={cn(
                  'size-5 rounded-full border-2 border-transparent transition-transform hover:scale-110',
                  value.color === c.value && 'border-foreground ring-2 ring-background',
                )}
              />
            ))}
          </div>
        </div>
        <div>
          <Label className="mb-1 flex justify-between">
            <span>Size at 100%</span>
            <span className="tabular-nums normal-case tracking-normal">{value.size} px</span>
          </Label>
          <input
            type="range"
            min={14}
            max={40}
            step={1}
            value={value.size}
            onChange={(e) => onChange({ size: Number(e.target.value) })}
            className="w-full accent-primary"
            aria-label="Balloon size at 100 percent zoom"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="mb-1 block">Prefix</Label>
            <Input maxLength={3} placeholder="none" value={value.prefix} onChange={(e) => onChange({ prefix: e.target.value.toUpperCase() })} />
          </div>
          <div>
            <Label className="mb-1 block">Number</Label>
            <NativeSelect value={value.weight} onChange={(e) => onChange({ weight: Number(e.target.value) as 400 | 600 })}>
              <option value={600}>Bold</option>
              <option value={400}>Regular</option>
            </NativeSelect>
          </div>
        </div>
      </div>
      {!compact && (
        <div className="flex items-start justify-center rounded-md border border-dashed bg-white py-3">
          <svg width="72" height="88" viewBox="0 0 72 88" aria-label="Balloon preview">
            <line x1="36" y1={20 + value.size * 0.9} x2="36" y2="82" stroke={value.color} strokeWidth="1.25" />
            <circle cx="36" cy="82" r="2.5" fill={value.color} />
            <BalloonGlyph
              shape={value.shape}
              fill={value.fill}
              color={value.color}
              cx={36}
              cy={20 + value.size * 0.45}
              r={value.size * 0.9}
              strokeWidth={2}
              label={`${value.prefix}7`}
              weight={value.weight}
            />
          </svg>
        </div>
      )}
    </div>
  )
}
