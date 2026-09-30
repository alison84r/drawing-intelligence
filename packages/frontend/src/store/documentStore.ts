import { create } from 'zustand'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { loadPdf, readPageSizes, sha256Hex, type PageSize } from '@/lib/pdf'

export type DocStatus = 'idle' | 'loading' | 'ready' | 'error'

interface DocumentState {
  status: DocStatus
  error: string | null
  doc: PDFDocumentProxy | null
  fileName: string
  sha256: string
  pageCount: number
  pages: PageSize[]
  pageIndex: number
  openFile: (file: File) => Promise<void>
  setPageIndex: (i: number) => void
  nextPage: () => void
  prevPage: () => void
  close: () => void
}

export const useDocumentStore = create<DocumentState>()((set, get) => ({
  status: 'idle',
  error: null,
  doc: null,
  fileName: '',
  sha256: '',
  pageCount: 0,
  pages: [],
  pageIndex: 0,

  openFile: async (file) => {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      set({ status: 'error', error: 'Only PDF files are supported.' })
      return
    }
    get().doc?.loadingTask.destroy().catch(() => {})
    set({ status: 'loading', error: null, fileName: file.name, doc: null, pages: [], pageCount: 0, pageIndex: 0 })
    try {
      const buffer = await file.arrayBuffer()
      const [hash, doc] = await Promise.all([sha256Hex(buffer), loadPdf(buffer)])
      const pages = await readPageSizes(doc)
      set({ status: 'ready', doc, sha256: hash, pageCount: doc.numPages, pages, pageIndex: 0 })
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : 'Could not open the PDF.' })
    }
  },

  setPageIndex: (i) => {
    const { pageCount } = get()
    if (i < 0 || i >= pageCount) return
    set({ pageIndex: i })
  },
  nextPage: () => get().setPageIndex(get().pageIndex + 1),
  prevPage: () => get().setPageIndex(get().pageIndex - 1),

  close: () => {
    get().doc?.loadingTask.destroy().catch(() => {})
    set({ status: 'idle', error: null, doc: null, fileName: '', sha256: '', pageCount: 0, pages: [], pageIndex: 0 })
  },
}))
