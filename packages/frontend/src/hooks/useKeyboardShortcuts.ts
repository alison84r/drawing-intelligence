import { useEffect } from 'react'
import { useUiStore } from '@/store/uiStore'
import { useViewportStore } from '@/store/viewportStore'
import { useDocumentStore } from '@/store/documentStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useCharacteristicStore } from '@/store/characteristicStore'
import { downloadProjectFile } from '@/lib/project'
import { toggleZoomTo } from '@/lib/focus'
import { acceptSelectedAndNext, selectRelative } from '@/lib/workflow'

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true
  // Inside the grid, keys navigate and edit cells; leave them to the grid.
  return el.closest('.ag-root-wrapper') !== null
}

/**
 * Global shortcuts.
 * Tools: B single, M multiple, N sub-balloon, S select, H pan, W window re-extract, F zoom to the selected balloon and back, Esc select, L leader line.
 * Work: J next balloon, K previous, A accept the selected one and go to the next that needs work.
 * Edit: Delete/Backspace remove selected, Ctrl+Z undo, Ctrl+Y or Ctrl+Shift+Z redo.
 * View: + / - zoom, 0 fit, PageUp / PageDown change sheet.
 */
export function useKeyboardShortcuts() {
  const setTool = useUiStore((s) => s.setTool)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const chars = useCharacteristicStore.getState()
      const inField =
        e.target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable)

      if (e.ctrlKey || e.metaKey) {
        if (inField) return
        const k = e.key.toLowerCase()
        if (k === 'z' && !e.shiftKey) chars.undo()
        else if (k === 'y' || (k === 'z' && e.shiftKey)) chars.redo()
        else if (k === 's') {
          if (useDocumentStore.getState().status === 'ready') downloadProjectFile()
        } else return
        e.preventDefault()
        return
      }
      if (e.altKey || isTypingTarget(e.target)) return

      const vp = useViewportStore.getState()
      const doc = useDocumentStore.getState()
      const ui = useUiStore.getState()
      const settings = useSettingsStore.getState()

      switch (e.key) {
        case 'b':
        case 'B':
          setTool('single')
          break
        case 'm':
        case 'M':
          setTool('multiple')
          break
        case 'n':
        case 'N':
          setTool('sub')
          break
        case 's':
        case 'S':
          setTool('select')
          break
        case 'h':
        case 'H':
          setTool('pan')
          break
        case 'f':
        case 'F':
          toggleZoomTo()
          break
        case 'j':
        case 'J':
          selectRelative(1)
          break
        case 'k':
        case 'K':
          selectRelative(-1)
          break
        case 'a':
        case 'A':
          acceptSelectedAndNext()
          break
        case 'w':
        case 'W':
          setTool('window')
          break
        case '/':
        case 'g':
        case 'G': {
          // Seek in the table: "/" finds text, "G" goes to a balloon number.
          const box = document.getElementById(e.key === '/' ? 'grid-find' : 'grid-goto') as HTMLInputElement | null
          if (box) {
            e.preventDefault()
            box.focus()
            box.select()
          }
          break
        }
        case 'l':
        case 'L': {
          const sel = chars.items.find((c) => c.id === chars.selectedId)
          if (sel && ui.tool === 'select') chars.setLeader(sel.id, !sel.leader)
          else settings.setLeaderDefault(!settings.leaderDefault)
          break
        }
        case 'Escape':
          setTool('select')
          chars.select(null)
          ui.setSolo(null)
          break
        case 'Delete':
        case 'Backspace':
          if (chars.selectedId) chars.remove(chars.selectedId)
          else return
          break
        case '+':
        case '=':
          vp.zoomBy(1.25)
          break
        case '-':
        case '_':
          vp.zoomBy(1 / 1.25)
          break
        case '0':
          vp.fit()
          break
        case 'PageDown':
          doc.nextPage()
          break
        case 'PageUp':
          doc.prevPage()
          break
        default:
          return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setTool])
}
