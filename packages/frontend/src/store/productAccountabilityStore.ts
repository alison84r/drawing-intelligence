import { create } from 'zustand'

export type ProductRowType = 'Material' | 'Special process' | 'Test'

/** One AS9102 Form 2 row. */
export interface ProductRow {
  id: string
  type: ProductRowType
  name: string
  specNumber: string
  code: string
  supplierCode: string
  customerApproval: '' | 'Yes' | 'No' | 'N/A'
  cocNumber: string
  testProcedure: string
  acceptanceReport: string
  comments: string
  preparedBy: string
  date: string
}

export const CODE_FOR_TYPE: Record<ProductRowType, string> = { Material: 'M', 'Special process': 'SP', Test: 'T' }

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

export function newProductRow(type: ProductRowType = 'Material'): ProductRow {
  return {
    id: uid(),
    type,
    name: '',
    specNumber: '',
    code: CODE_FOR_TYPE[type],
    supplierCode: '',
    customerApproval: '',
    cocNumber: '',
    testProcedure: '',
    acceptanceReport: '',
    comments: '',
    preparedBy: '',
    date: new Date().toISOString().slice(0, 10),
  }
}

interface ProductAccountabilityState {
  rows: ProductRow[]
  add: (type?: ProductRowType) => ProductRow
  update: (id: string, patch: Partial<ProductRow>) => void
  remove: (id: string) => void
  load: (rows: ProductRow[]) => void
  reset: () => void
}

export const useProductAccountabilityStore = create<ProductAccountabilityState>()((set) => ({
  rows: [],
  add: (type = 'Material') => {
    const row = newProductRow(type)
    set((s) => ({ rows: [...s.rows, row] }))
    return row
  },
  update: (id, patch) =>
    set((s) => ({
      rows: s.rows.map((r) => {
        if (r.id !== id) return r
        const next = { ...r, ...patch }
        if (patch.type && (!r.code || r.code === CODE_FOR_TYPE[r.type])) next.code = CODE_FOR_TYPE[patch.type]
        return next
      }),
    })),
  remove: (id) => set((s) => ({ rows: s.rows.filter((r) => r.id !== id) })),
  load: (rows) => set({ rows: Array.isArray(rows) ? rows : [] }),
  reset: () => set({ rows: [] }),
}))
