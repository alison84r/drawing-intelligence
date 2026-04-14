import type { PathFeatures, EntityRole } from '../store/types'
import { parsePathCommands } from './pathParser'

/**
 * Walks up the DOM from `el` to find the nearest element that has `attr` set,
 * stopping at the SVG root. Returns null if not found.
 */
function resolveAttr(el: Element, attr: string): string | null {
  let node: Element | null = el
  while (node && node.tagName.toLowerCase() !== 'html') {
    const val = node.getAttribute(attr)
    if (val !== null && val !== '') return val
    node = node.parentElement
  }
  return null
}

function classifyRole(
  strokeWidth: string,
  fill: string,
  dashArray: string | null
): EntityRole {
  if (dashArray) return 'Hidden/Center Line'
  if (fill && fill !== 'none' && fill !== '') return 'Arrowhead/Fill'
  const sw = parseFloat(strokeWidth)
  if (!isNaN(sw) && sw >= 1.0) return 'Primary Line'
  if (!isNaN(sw) && sw < 1.0) return 'Construction Line'
  return 'Unknown'
}

/**
 * Extracts geometric and style features from a clicked SVG element.
 * Uses native browser APIs (getBBox, getTotalLength) for precision.
 */
export function extractPathFeatures(
  el: SVGElement,
  entityId: string
): PathFeatures {
  const tag = el.tagName.toLowerCase()
  const isPath = tag === 'path'
  const isText = tag === 'text'

  // --- Style resolution ---
  const strokeWidth = resolveAttr(el, 'stroke-width') ?? '1'
  const strokeColor = resolveAttr(el, 'stroke') ?? '#000'
  const fill = resolveAttr(el, 'fill') ?? 'none'
  const dashArray = resolveAttr(el, 'stroke-dasharray')
  const strokeMiterlimit = resolveAttr(el, 'stroke-miterlimit')

  // --- Geometry via browser APIs ---
  let bbox = { x: 0, y: 0, width: 0, height: 0 }
  let totalLength = 0

  try {
    const domBBox = (el as SVGGraphicsElement).getBBox()
    bbox = {
      x: Math.round(domBBox.x * 100) / 100,
      y: Math.round(domBBox.y * 100) / 100,
      width: Math.round(domBBox.width * 100) / 100,
      height: Math.round(domBBox.height * 100) / 100,
    }
  } catch {
    // Element not in rendered tree — bbox stays at 0
  }

  if (isPath) {
    try {
      totalLength =
        Math.round((el as SVGPathElement).getTotalLength() * 100) / 100
    } catch {
      totalLength = 0
    }
  }

  // --- Path data ---
  const pathDataFull = isPath ? (el.getAttribute('d') ?? '') : ''
  const pathDataPreview =
    pathDataFull.length > 140
      ? pathDataFull.slice(0, 140) + '…'
      : pathDataFull

  // --- Segment breakdown ---
  const segments = isPath ? parsePathCommands(pathDataFull) : []
  const totalSegmentCount = segments.reduce((acc, s) => acc + s.count, 0)

  // --- Text content ---
  const textContent = isText ? el.textContent?.trim() : undefined

  return {
    entityId,
    entityRole: classifyRole(strokeWidth, fill, dashArray),
    segments,
    totalSegmentCount,
    totalLength,
    bbox,
    strokeWidth,
    strokeColor,
    fill,
    dashArray,
    strokeMiterlimit,
    pathDataPreview,
    pathDataFull,
    elementTag: tag,
    textContent,
  }
}
