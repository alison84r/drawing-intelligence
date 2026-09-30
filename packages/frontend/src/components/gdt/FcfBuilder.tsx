import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { GDT_SYMBOLS } from '@/lib/tolerance'
import type { Gdt, GdtModifier, GdtZone } from '@/store/characteristicStore'
import { cn } from '@/lib/utils'
import { Fcf } from './Fcf'

interface Props {
  value: Gdt
  onChange: (next: Gdt) => void
}

/** Builds a feature control frame field by field, with the frame drawn live underneath. */
export function FcfBuilder({ value, onChange }: Props) {
  const setDatum = (i: number, v: string) => {
    const datums = [...value.datums]
    datums[i] = v
    onChange({ ...value, datums })
  }
  return (
    <div className="space-y-2 rounded-md border bg-background/60 p-2.5">
      <Label className="block">GD&T frame</Label>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Geometric characteristic">
        {GDT_SYMBOLS.map((s) => (
          <button
            key={s.symbol}
            type="button"
            role="radio"
            aria-checked={value.symbol === s.symbol}
            title={s.name}
            onClick={() => onChange({ ...value, symbol: s.symbol })}
            className={cn(
              'h-7 w-8 rounded border text-base leading-none transition-colors hover:bg-accent',
              value.symbol === s.symbol && 'border-primary bg-primary/10 text-primary',
            )}
          >
            {s.symbol}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="mb-1 block">Zone</Label>
          <NativeSelect value={value.zone} onChange={(e) => onChange({ ...value, zone: e.target.value as GdtZone })}>
            <option value="">none</option>
            <option value="Ø">{'Ø'}</option>
            <option value="SØ">{'SØ'}</option>
          </NativeSelect>
        </div>
        <div>
          <Label className="mb-1 block">Tolerance</Label>
          <Input inputMode="decimal" placeholder="0.2" value={value.tolerance} onChange={(e) => onChange({ ...value, tolerance: e.target.value })} />
        </div>
        <div>
          <Label className="mb-1 block">Modifier</Label>
          <NativeSelect value={value.modifier} onChange={(e) => onChange({ ...value, modifier: e.target.value as GdtModifier })}>
            <option value="">none</option>
            <option value="M">{'Ⓜ'} MMC</option>
            <option value="L">{'Ⓛ'} LMC</option>
            <option value="P">{'Ⓟ'} projected</option>
            <option value="F">{'Ⓕ'} free state</option>
          </NativeSelect>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <Label className="mb-1 block">Datum {i + 1}</Label>
            <Input maxLength={4} placeholder={['A', 'B', 'C'][i]} value={value.datums[i] ?? ''} onChange={(e) => setDatum(i, e.target.value.toUpperCase())} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <span className="text-[11px] text-muted-foreground">Frame</span>
        <Fcf gdt={value} />
      </div>
    </div>
  )
}
