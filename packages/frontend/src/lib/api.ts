import type { Characteristic } from '@/store/characteristicStore'
import type { PartInfo } from '@/store/partInfoStore'
import type { BalloonStyle, DefaultTolerances } from '@/store/settingsStore'
import type { ProductRow } from '@/store/productAccountabilityStore'

export interface InspectionSummary {
  id: string
  revisionId: string
  title: string
  fairNumber: string
  status: 'in_progress' | 'complete'
  characteristics: number
  measured: number
  createdAt: string
  updatedAt: string
}

export interface RevisionSummary {
  id: string
  partId: string
  revision: string
  fileName: string
  sha256: string
  pageSizes: { width: number; height: number }[]
  sheets: number
  importedAt: string
  inspections: InspectionSummary[]
}

export interface PartSummary {
  id: string
  partNumber: string
  partName: string
  createdAt: string
  revisions: RevisionSummary[]
}

export interface InspectionSettings {
  units?: string
  standard?: string
  defaults?: Partial<DefaultTolerances>
  leaderDefault?: boolean
  balloonStyle?: Partial<BalloonStyle>
}

export interface InspectionDetail extends Omit<InspectionSummary, 'characteristics'> {
  partInfo: Partial<PartInfo>
  settings: InspectionSettings
  productAccountability: ProductRow[]
  characteristics: Characteristic[]
  revision: RevisionSummary
  part: { id: string; partNumber: string; partName: string }
}

export interface RecognizeToken {
  id: string
  page: number
  text: string
  bbox: { x: number; y: number; w: number; h: number }
  size: number
  font: string
  rot: number
  kind: string
  cls: 'char' | 'ruled' | 'open'
  reason: string
  charId: string | null
  guess: Characteristic | null
  obox?: { cx: number; cy: number; w: number; h: number; angle: number } | null
}

export interface RecognizePage {
  page: number
  width: number
  height: number
  dimensionFontSize: number
  zones: { cols: [number, string][]; rows: [number, string][]; synthetic: boolean }
  tables: number[][]
  arrowheads: number
  tokens: RecognizeToken[]
  characteristics: Characteristic[]
  stats: { tokens: number; char: number; open: number; ruled: number; characteristics: number; needsYou: number }
}

export interface IntakeRow {
  key: string
  label: string
  level: 'ok' | 'warn' | 'bad'
  value: string
}

export interface IntakeReport {
  level: 'ok' | 'warn' | 'bad'
  verdict: string
  recognizerVersion: string
  pages: { page: number; level: 'ok' | 'warn' | 'bad'; rows: IntakeRow[] }[]
}

export interface RecognizeRequest {
  pages: number[] | null
  region: { x: number; y: number; w: number; h: number } | null
  relaxed: boolean
  units: string
  existing: { page: number; bbox: Characteristic['bbox'] }[]
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = (await res.json()) as { detail?: string }
      if (body.detail) detail = body.detail
    } catch {
      /* no JSON body */
    }
    throw new ApiError(res.status, detail)
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

const json = (body: unknown, method = 'POST'): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  health: () => request<{ status: string; database: { ok: boolean; error: string | null } }>('/health'),
  listParts: () => request<PartSummary[]>('/api/parts'),
  createPart: (partNumber: string, partName: string) => request<PartSummary>('/api/parts', json({ partNumber, partName })),
  deletePart: (id: string) => request<void>(`/api/parts/${id}`, { method: 'DELETE' }),

  importRevision: (file: File, opts: { partId?: string; partNumber?: string; partName?: string; revision?: string }) => {
    const fd = new FormData()
    fd.append('file', file)
    if (opts.partId) fd.append('partId', opts.partId)
    if (opts.partNumber) fd.append('partNumber', opts.partNumber)
    if (opts.partName) fd.append('partName', opts.partName)
    if (opts.revision) fd.append('revision', opts.revision)
    return request<RevisionSummary & { partNumber: string; partName: string }>('/api/revisions', { method: 'POST', body: fd })
  },
  revisionPdfUrl: (id: string) => `/api/revisions/${id}/pdf`,
  deleteRevision: (id: string) => request<void>(`/api/revisions/${id}`, { method: 'DELETE' }),

  createInspection: (revisionId: string, title: string, fairNumber = '') =>
    request<InspectionSummary>(`/api/revisions/${revisionId}/inspections`, json({ title, fairNumber })),
  getInspection: (id: string) => request<InspectionDetail>(`/api/inspections/${id}`),
  saveInspection: (
    id: string,
    body: {
      title?: string
      fairNumber?: string
      status?: string
      partInfo?: PartInfo
      settings?: InspectionSettings
      productAccountability?: ProductRow[]
      characteristics?: Characteristic[]
    },
  ) => request<InspectionSummary>(`/api/inspections/${id}`, json(body, 'PUT')),
  deleteInspection: (id: string) => request<void>(`/api/inspections/${id}`, { method: 'DELETE' }),

  intake: (revisionId: string) => request<IntakeReport>(`/api/revisions/${revisionId}/intake`),
  recognize: (revisionId: string, body: RecognizeRequest) => request<{ pages: RecognizePage[] }>(`/api/revisions/${revisionId}/recognize`, json(body)),

  exportInspection: async (
    id: string,
    opts: { as9102: boolean; ppap: boolean; pdf: boolean; includeReference: boolean; includeDraft?: boolean },
  ): Promise<{ blob: Blob; fileName: string }> => {
    const res = await fetch(`/api/inspections/${id}/export`, json(opts))
    if (!res.ok) {
      let detail = res.statusText
      try {
        detail = ((await res.json()) as { detail?: string }).detail ?? detail
      } catch {
        /* no JSON body */
      }
      throw new ApiError(res.status, detail)
    }
    const cd = res.headers.get('Content-Disposition') ?? ''
    const m = /filename="?([^";]+)"?/.exec(cd)
    return { blob: await res.blob(), fileName: m?.[1] ?? 'export.zip' }
  },
}
