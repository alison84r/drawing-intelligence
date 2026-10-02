import { api, type InspectionDetail, type InspectionSettings } from '@/lib/api'
import { useCharacteristicStore, type Characteristic } from '@/store/characteristicStore'
import { useDocumentStore } from '@/store/documentStore'
import { EMPTY_PART_INFO, usePartInfoStore, type PartInfo } from '@/store/partInfoStore'
import { useProductAccountabilityStore, type ProductRow } from '@/store/productAccountabilityStore'
import { useSessionStore } from '@/store/sessionStore'
import { useRecognizeStore } from '@/store/recognizeStore'
import { DEFAULT_BALLOON_STYLE, useSettingsStore, type DefaultToleranceKey,
  type DefaultTolerances, type Standard, type Units } from '@/store/settingsStore'

export const PROJECT_SCHEMA_VERSION = 1

/** Settings that travel with an inspection (units, standard, defaults, balloon style). */
export function collectSettings(): InspectionSettings {
  const s = useSettingsStore.getState()
  return { units: s.units, standard: s.standard, defaults: s.defaults, leaderDefault: s.leaderDefault, balloonStyle: s.balloonStyle, styleRev: 2 }
}

function applySettings(settings: InspectionSettings | undefined) {
  if (!settings || Object.keys(settings).length === 0) return
  const s = useSettingsStore.getState()
  if (settings.units) s.setUnits(settings.units as Units)
  if (settings.standard) s.setStandard(settings.standard as Standard)
  if (settings.defaults) {
    for (const [k, v] of Object.entries(settings.defaults)) if (typeof v === 'number') s.setDefault(k as DefaultToleranceKey, v)
    s.setScheme((settings.defaults as DefaultTolerances).scheme ?? null)
  }
  if (typeof settings.leaderDefault === 'boolean') s.setLeaderDefault(settings.leaderDefault)
  if (settings.balloonStyle) {
    const style = { ...DEFAULT_BALLOON_STYLE, ...settings.balloonStyle }
    if ((settings.styleRev ?? 1) < 2 && style.color === '#e11d48') style.color = DEFAULT_BALLOON_STYLE.color
    s.setBalloonStyle(style)
  }
}

/** Load an inspection from the server into every store and open the inspect screen. */
export async function openInspectionFromServer(inspectionId: string): Promise<InspectionDetail> {
  const detail = await api.getInspection(inspectionId)
  const pdfRes = await fetch(api.revisionPdfUrl(detail.revision.id))
  if (!pdfRes.ok) throw new Error('Could not load the drawing PDF')
  const blob = await pdfRes.blob()
  const file = new File([blob], detail.revision.fileName, { type: 'application/pdf' })

  await useDocumentStore.getState().openFile(file)
  useCharacteristicStore.getState().load(detail.characteristics ?? [])
  usePartInfoStore.getState().load({ ...EMPTY_PART_INFO, ...(detail.partInfo ?? {}) })
  useProductAccountabilityStore.getState().load(detail.productAccountability ?? [])
  applySettings(detail.settings)
  // New jobs are ballooning only. One saved before the choice existed keeps measuring if it holds results.
  const held = (detail.characteristics ?? []).some((c) => c.result !== null && c.result !== '')
  useSettingsStore.getState().setMeasuring(detail.settings?.defaults?.measuring ?? held)

  useRecognizeStore.getState().clearTokens()
  useSessionStore.getState().openInspection({
    inspectionId: detail.id,
    revisionId: detail.revision.id,
    partLabel: `${detail.part.partNumber} · Rev ${detail.revision.revision}`,
    inspectionTitle: detail.title,
  })
  void useRecognizeStore.getState().loadScene(detail.revision.id)
  return detail
}

export function closeInspection() {
  useRecognizeStore.getState().clearTokens()
  useSessionStore.getState().closeInspection()
  useCharacteristicStore.getState().clear()
  useDocumentStore.getState().close()
  usePartInfoStore.getState().reset()
  useProductAccountabilityStore.getState().reset()
}

/** Everything needed to send an inspection to someone without the server. */
export interface ProjectFile {
  schemaVersion: number
  exportedAt: string
  drawing: { fileName: string; sha256: string; pageCount: number; pages: { width: number; height: number }[] }
  partInfo: PartInfo
  settings: InspectionSettings
  productAccountability: ProductRow[]
  characteristics: Characteristic[]
}

export function buildProjectFile(): ProjectFile {
  const doc = useDocumentStore.getState()
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    drawing: { fileName: doc.fileName, sha256: doc.sha256, pageCount: doc.pageCount, pages: doc.pages },
    partInfo: usePartInfoStore.getState().info,
    settings: collectSettings(),
    productAccountability: useProductAccountabilityStore.getState().rows,
    characteristics: useCharacteristicStore.getState().items,
  }
}

export function downloadProjectFile() {
  const project = buildProjectFile()
  const base = (project.partInfo.partNumber || project.drawing.fileName.replace(/\.pdf$/i, '') || 'inspection').replace(/[^\w.-]+/g, '_')
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${base}.di.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** Replace the current inspection's content with a project file. The drawing must already be open. */
export async function importProjectFile(file: File): Promise<{ warning: string | null }> {
  const text = await file.text()
  const project = JSON.parse(text) as ProjectFile
  if (project.schemaVersion !== PROJECT_SCHEMA_VERSION || !Array.isArray(project.characteristics)) {
    throw new Error('Not a Drawing Intelligence project file')
  }
  const doc = useDocumentStore.getState()
  const warning =
    doc.sha256 && project.drawing?.sha256 && doc.sha256 !== project.drawing.sha256
      ? 'This file was made from a different PDF. Balloon positions may not match.'
      : null
  useCharacteristicStore.getState().load(project.characteristics)
  usePartInfoStore.getState().load({ ...EMPTY_PART_INFO, ...(project.partInfo ?? {}) })
  useProductAccountabilityStore.getState().load(project.productAccountability ?? [])
  applySettings(project.settings)
  return { warning }
}
