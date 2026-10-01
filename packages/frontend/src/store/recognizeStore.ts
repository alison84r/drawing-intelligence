import { create } from 'zustand'
import { api, type IntakeReport, type RecognizePage, type RecognizeToken } from '@/lib/api'
import { useCharacteristicStore, type Characteristic } from './characteristicStore'
import { useSessionStore } from './sessionStore'
import { useSettingsStore } from './settingsStore'
import { useUiStore } from './uiStore'
import { useViewportStore } from './viewportStore'

export type TokenView = 'off' | 'review' | 'all'
export type RecognizeStatus = 'idle' | 'running' | 'done' | 'error'

export interface Region {
  x: number
  y: number
  w: number
  h: number
}

/** One amber group: the best guess the pass could make, and the tokens it is made of. */
export interface OpenGroup {
  guess: Characteristic
  tokens: RecognizeToken[]
}

interface RecognizeState {
  status: RecognizeStatus
  error: string | null
  pages: Record<number, RecognizePage>
  tokenView: TokenView
  lastRun: number | null
  lastAdded: number
  /** Why a window read placed fewer balloons than the text under it, in plain words. */
  notice: string | null
  /** Live rubber band for the window tool, in page points. */
  band: Region | null
  /** Readability verdict for the open drawing, fetched when it opens. */
  intake: IntakeReport | null
  intakeFor: string | null

  loadIntake: (revisionId: string) => Promise<void>
  /** What an earlier Recognize run read on this revision; restores the overlays and the audit on reopen. */
  loadScene: (revisionId: string) => Promise<void>
  /** True when the stored scene came from an older recognizer version. */
  stale: boolean
  run: (opts?: { region?: Region; pages?: number[] }) => Promise<void>
  adopt: (guessId: string) => void
  setTokenView: (v: TokenView) => void
  setBand: (r: Region | null) => void
  reset: () => void
  clearTokens: () => void
}

function intersects(a: Region, b: Region): boolean {
  return !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h)
}

export function openGroups(page: RecognizePage | undefined): OpenGroup[] {
  if (!page) return []
  const by = new Map<string, OpenGroup>()
  for (const t of page.tokens) {
    if (t.cls !== 'open' || !t.guess) continue
    const g = by.get(t.guess.id) ?? { guess: t.guess, tokens: [] }
    g.tokens.push(t)
    by.set(t.guess.id, g)
  }
  return [...by.values()].sort((a, b) => a.guess.anchor.y - b.guess.anchor.y || a.guess.anchor.x - b.guess.anchor.x)
}

/** Centre the view on a page point, zoomed in enough to read the dimension text. */
export function focusAt(x: number, y: number, textSize = 12): void {
  const vp = useViewportStore.getState()
  const scale = Math.max(vp.scale, Math.min(3, 16 / textSize))
  if (scale !== vp.scale) vp.setScale(scale)
  const v = useViewportStore.getState()
  useViewportStore.setState({ offsetX: v.containerW / 2 - x * v.scale, offsetY: v.containerH / 2 - y * v.scale })
}

export const useRecognizeStore = create<RecognizeState>()((set, get) => ({
  status: 'idle',
  error: null,
  pages: {},
  tokenView: 'review',
  lastRun: null,
  lastAdded: 0,
  notice: null,
  band: null,
  intake: null,
  intakeFor: null,
  stale: false,

  loadScene: async (revisionId) => {
    try {
      const stored = await api.scene(revisionId)
      if (!stored.pages.length || useSessionStore.getState().revisionId !== revisionId) return
      const items = useCharacteristicStore.getState().items
      const pages: Record<number, RecognizePage> = {}
      for (const p of stored.pages) {
        // A guess that was already added as a balloon is no longer open.
        const tokens = p.tokens.map((t) =>
          t.guess && items.some((c) => c.page === p.page && c.bbox && intersects(c.bbox, t.bbox)) ? { ...t, cls: 'char' as const, guess: null, reason: 'already ballooned' } : t,
        )
        pages[p.page] = { ...p, tokens }
      }
      set({ pages, status: 'done', lastAdded: 0, stale: stored.recognizerVersion !== stored.current })
    } catch {
      /* no stored scene: Recognize has not run on this revision */
    }
  },

  loadIntake: async (revisionId) => {
    if (get().intakeFor === revisionId) return
    set({ intakeFor: revisionId, intake: null })
    try {
      const report = await api.intake(revisionId)
      if (get().intakeFor === revisionId) set({ intake: report })
    } catch {
      /* the card simply stays empty; Recognize reports its own errors */
    }
  },

  run: async (opts = {}) => {
    const revisionId = useSessionStore.getState().revisionId
    if (!revisionId) {
      set({ status: 'error', error: 'Open an inspection from the library first.' })
      return
    }
    set({ status: 'running', error: null, notice: null })
    try {
      const chars = useCharacteristicStore.getState()
      const existing = chars.items.filter((c) => c.bbox).map((c) => ({ page: c.page, bbox: c.bbox }))
      const units = useSettingsStore.getState().units
      const res = await api.recognize(revisionId, {
        pages: opts.pages ?? null,
        region: opts.region ?? null,
        relaxed: Boolean(opts.region),
        units,
        existing,
      })
      const pages = { ...get().pages }
      let added = 0
      for (const p of res.pages) {
        if (opts.region && pages[p.page]) {
          // Window re-extract: replace only the tokens inside the window, keep the rest.
          const keep = pages[p.page].tokens.filter((t) => !intersects(t.bbox, opts.region as Region))
          // The sheet's audit, views and tolerance come from the whole-sheet read; a window must not overwrite them.
          pages[p.page] = { ...pages[p.page], tokens: [...keep, ...p.tokens] }
        } else {
          pages[p.page] = p
        }
        if (p.characteristics.length) {
          useCharacteristicStore.getState().addMany(p.characteristics)
          added += p.characteristics.length
        }
      }
      // Balloons placed before views were known get their view from where they sit. Not an edit: no undo step.
      if (!opts.region) {
        const store = useCharacteristicStore
        store.setState({
          items: store.getState().items.map((c) => {
            const views = pages[c.page]?.views
            if (c.view || !views?.length) return c
            const reach = 0.2 * Math.max(pages[c.page].width, pages[c.page].height)
            const gap = (b: { x: number; y: number; w: number; h: number }) =>
              Math.hypot(Math.max(b.x - c.anchor.x, 0, c.anchor.x - b.x - b.w), Math.max(b.y - c.anchor.y, 0, c.anchor.y - b.y - b.h))
            const near = [...views].sort((a, b) => gap(a.bbox) - gap(b.bbox))[0]
            return gap(near.bbox) <= reach ? { ...c, view: near.name } : c
          }),
        })
      }
      // The drawing's own tolerance statement becomes the default for rows with no printed tolerance.
      const found = res.pages.map((p) => p.tolerance?.scheme).find(Boolean)
      const settings = useSettingsStore.getState()
      if (!opts.region && found && settings.defaults.scheme?.source !== 'profile') {
        if (found.kind === 'size_range') settings.setScheme(found)
        else {
          settings.setScheme(null)
          for (const [places, tol] of Object.entries(found.places)) {
            const key = (['places0', 'places1', 'places2', 'places3'] as const)[Math.min(Number(places), 3)]
            settings.setDefault(key, tol)
          }
          if (found.angular !== null) settings.setDefault('angular', found.angular)
        }
      }
      const held = res.pages.reduce((n, p) => ({ block: n.block + (p.withheld?.title_block ?? 0) + (p.withheld?.picture ?? 0), table: n.table + (p.withheld?.table ?? 0) }), { block: 0, table: 0 })
      const notice = !opts.region ? null
        : held.block > 0 && added === 0 && held.table === 0 ? 'That window is over the title block. Nothing there is a characteristic, so no balloons were placed. To read it, use Read a region.'
        : held.table > 0 ? `${held.table} ${held.table === 1 ? 'value is' : 'values are'} inside a table. They are marked in amber: click the ones that are inspected.`
        : held.block > 0 ? 'Text in the title block was left out.'
        : null
      set({ notice, stale: false, status: 'done', pages, lastRun: Date.now(), lastAdded: added, tokenView: get().tokenView === 'off' ? 'review' : get().tokenView })
      if (added > 0) useUiStore.getState().setTool('select')
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : 'Recognize failed' })
    }
  },

  adopt: (guessId) => {
    const pages = { ...get().pages }
    let guess: Characteristic | null = null
    for (const p of Object.values(pages)) {
      const t = p.tokens.find((x) => x.guess?.id === guessId)
      if (t?.guess) guess = t.guess
    }
    if (!guess) return
    const [added] = useCharacteristicStore.getState().addMany([guess])
    for (const key of Object.keys(pages)) {
      const p = pages[Number(key)]
      pages[Number(key)] = {
        ...p,
        tokens: p.tokens.map((t) => (t.guess?.id === guessId ? { ...t, cls: 'char', charId: added.id, guess: null, reason: 'added by you' } : t)),
      }
    }
    set({ pages })
    useCharacteristicStore.getState().select(added.id)
    useUiStore.getState().setTool('select')
  },

  setTokenView: (tokenView) => set({ tokenView }),
  setBand: (band) => set({ band }),
  reset: () => {
    useCharacteristicStore.getState().removeAuto()
    set({ pages: {}, status: 'idle', error: null, lastAdded: 0 })
  },
  clearTokens: () => set({ pages: {}, status: 'idle', error: null, lastAdded: 0, band: null, intake: null, intakeFor: null }),
}))
