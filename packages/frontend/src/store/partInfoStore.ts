import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** AS9102 Rev C Form 1 header fields plus the customer fields PPAP needs. */
export interface PartInfo {
  partNumber: string
  partName: string
  serialNumbers: string
  fairNumber: string
  partRevision: string
  drawingNumber: string
  drawingRevision: string
  additionalChanges: string
  processRef: string
  organization: string
  supplierCode: string
  poNumber: string
  detailOrAssembly: 'Detail' | 'Assembly'
  fullOrPartial: 'Full' | 'Partial'
  customer: string
  baselinePartNumber: string
}

export const EMPTY_PART_INFO: PartInfo = {
  partNumber: '',
  partName: '',
  serialNumbers: '',
  fairNumber: '',
  partRevision: '',
  drawingNumber: '',
  drawingRevision: '',
  additionalChanges: '',
  processRef: '',
  organization: '',
  supplierCode: '',
  poNumber: '',
  detailOrAssembly: 'Detail',
  fullOrPartial: 'Full',
  customer: '',
  baselinePartNumber: '',
}

interface PartInfoState {
  info: PartInfo
  set: <K extends keyof PartInfo>(key: K, value: PartInfo[K]) => void
  load: (info: PartInfo) => void
  reset: () => void
}

export const usePartInfoStore = create<PartInfoState>()(
  persist(
    (set) => ({
      info: EMPTY_PART_INFO,
      set: (key, value) => set((s) => ({ info: { ...s.info, [key]: value } })),
      load: (info) => set({ info: { ...EMPTY_PART_INFO, ...info } }),
      reset: () => set({ info: EMPTY_PART_INFO }),
    }),
    { name: 'di.partinfo' },
  ),
)
