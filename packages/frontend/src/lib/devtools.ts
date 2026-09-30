import { useDocumentStore } from '@/store/documentStore'
import { useViewportStore } from '@/store/viewportStore'
import { useUiStore } from '@/store/uiStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useCharacteristicStore } from '@/store/characteristicStore'
import { usePartInfoStore } from '@/store/partInfoStore'
import { useSessionStore } from '@/store/sessionStore'
import { useProductAccountabilityStore } from '@/store/productAccountabilityStore'
import { useRecognizeStore } from '@/store/recognizeStore'
import { buildProjectFile, importProjectFile, openInspectionFromServer, closeInspection } from '@/lib/project'

/** Exposes stores on window.__di in dev builds so the browser console and automated checks can inspect state. */
export function installDevtools() {
  if (!import.meta.env.DEV) return
  ;(window as unknown as { __di: unknown }).__di = {
    document: useDocumentStore,
    viewport: useViewportStore,
    ui: useUiStore,
    settings: useSettingsStore,
    characteristics: useCharacteristicStore,
    partInfo: usePartInfoStore,
    session: useSessionStore,
    productAccountability: useProductAccountabilityStore,
    recognize: useRecognizeStore,
    project: { buildProjectFile, importProjectFile, openInspectionFromServer, closeInspection },
  }
}
