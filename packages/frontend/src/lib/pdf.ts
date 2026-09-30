import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type Rotation = 0 | 90 | 180 | 270

export interface PageSize {
  /** Unrotated page width in PDF points (1/72 in). */
  width: number
  /** Unrotated page height in PDF points. */
  height: number
}

/** Largest canvas edge we will ask the browser for, in device pixels. */
export const MAX_CANVAS_EDGE = 8192

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function loadPdf(buffer: ArrayBuffer): Promise<PDFDocumentProxy> {
  // pdf.js transfers the buffer to the worker, so hand it a copy.
  return pdfjs.getDocument({ data: buffer.slice(0) }).promise
}

export async function readPageSizes(doc: PDFDocumentProxy): Promise<PageSize[]> {
  const sizes: PageSize[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    sizes.push({ width: vp.width, height: vp.height })
  }
  return sizes
}

/** Page size after rotation, in PDF points. */
export function rotatedSize(size: PageSize, rotation: Rotation): PageSize {
  return rotation === 90 || rotation === 270 ? { width: size.height, height: size.width } : size
}

/** A rectangle of the page in CSS px at a given cssScale, origin at the page's top-left. */
export interface PageRegion {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Render one region of a page into a canvas at `cssScale` CSS px per PDF point, honouring
 * device pixel ratio. Rendering only the region that is on screen keeps every zoom level
 * crisp and fast, whatever the sheet size. Returns the render task so callers can cancel it.
 */
export function renderPageRegion(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  cssScale: number,
  rotation: Rotation,
  region: PageRegion,
): RenderTask {
  const dpr = window.devicePixelRatio || 1
  const deviceScale = cssScale * dpr
  const viewport = page.getViewport({
    scale: deviceScale,
    rotation,
    offsetX: -region.x * dpr,
    offsetY: -region.y * dpr,
  })
  canvas.width = Math.max(1, Math.ceil(region.width * dpr))
  canvas.height = Math.max(1, Math.ceil(region.height * dpr))
  canvas.style.width = `${region.width}px`
  canvas.style.height = `${region.height}px`
  return page.render({ canvas, viewport })
}
