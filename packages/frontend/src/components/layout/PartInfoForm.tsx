import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { usePartInfoStore, type PartInfo } from '@/store/partInfoStore'

type TextKey = Exclude<keyof PartInfo, 'detailOrAssembly' | 'fullOrPartial'>

const FIELDS: { key: TextKey; label: string; placeholder?: string }[] = [
  { key: 'partNumber', label: '1. Part number' },
  { key: 'partName', label: '2. Part name' },
  { key: 'serialNumbers', label: '3. Serial number(s)', placeholder: 'per unit, on Form 3' },
  { key: 'fairNumber', label: '4. FAIR number', placeholder: 'FAIR-2026-0042' },
  { key: 'partRevision', label: '5. Part revision level' },
  { key: 'drawingNumber', label: '6. Drawing number' },
  { key: 'drawingRevision', label: '7. Drawing revision level' },
  { key: 'additionalChanges', label: '8. Additional changes', placeholder: 'ECO / deviation' },
  { key: 'processRef', label: '9. Manufacturing process ref.', placeholder: 'router / traveller' },
  { key: 'organization', label: '10. Organization name' },
  { key: 'supplierCode', label: '11. Supplier code' },
  { key: 'poNumber', label: '12. PO number' },
  { key: 'customer', label: 'Customer' },
  { key: 'baselinePartNumber', label: 'Baseline part number', placeholder: 'for partial FAI' },
]

/** AS9102 Rev C Form 1 header fields. Persisted with the project. */
export function PartInfoForm() {
  const info = usePartInfoStore((s) => s.info)
  const set = usePartInfoStore((s) => s.set)
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.slice(0, 12).map((f) => (
          <div key={f.key}>
            <Label className="mb-1 block">{f.label}</Label>
            <Input id={`pi-${f.key}`} value={info[f.key]} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
          </div>
        ))}
        <div>
          <Label className="mb-1 block">13. Detail / Assembly</Label>
          <NativeSelect id="pi-detailOrAssembly" value={info.detailOrAssembly} onChange={(e) => set('detailOrAssembly', e.target.value as PartInfo['detailOrAssembly'])}>
            <option>Detail</option>
            <option>Assembly</option>
          </NativeSelect>
        </div>
        <div>
          <Label className="mb-1 block">14. Full / Partial FAI</Label>
          <NativeSelect id="pi-fullOrPartial" value={info.fullOrPartial} onChange={(e) => set('fullOrPartial', e.target.value as PartInfo['fullOrPartial'])}>
            <option>Full</option>
            <option>Partial</option>
          </NativeSelect>
        </div>
        {FIELDS.slice(12).map((f) => (
          <div key={f.key}>
            <Label className="mb-1 block">{f.label}</Label>
            <Input id={`pi-${f.key}`} value={info[f.key]} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
          </div>
        ))}
      </div>
    </div>
  )
}
