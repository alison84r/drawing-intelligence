import type { PageSize, Rotation } from './pdf'

export interface Point {
  x: number
  y: number
}

/**
 * Balloon coordinates are stored in "page points": the unrotated page at scale 1 with the origin
 * at the top-left corner, in PDF points. This matches pdf.js at rotation 0 and pdfplumber, so
 * auto-extracted boxes drop in without conversion.
 */

/** Page point → rotated page point (still scale 1, origin top-left of the rotated sheet). */
export function rotatePoint(p: Point, size: PageSize, rotation: Rotation): Point {
  switch (rotation) {
    case 90:
      return { x: size.height - p.y, y: p.x }
    case 180:
      return { x: size.width - p.x, y: size.height - p.y }
    case 270:
      return { x: p.y, y: size.width - p.x }
    default:
      return p
  }
}

/** Rotated page point → page point. Inverse of rotatePoint. */
export function unrotatePoint(r: Point, size: PageSize, rotation: Rotation): Point {
  switch (rotation) {
    case 90:
      return { x: r.y, y: size.height - r.x }
    case 180:
      return { x: size.width - r.x, y: size.height - r.y }
    case 270:
      return { x: size.width - r.y, y: r.x }
    default:
      return r
  }
}

export interface ScreenMap {
  scale: number
  offsetX: number
  offsetY: number
  rotation: Rotation
  size: PageSize
}

/** Page point → CSS px inside the drawing surface. */
export function pageToScreen(p: Point, m: ScreenMap): Point {
  const r = rotatePoint(p, m.size, m.rotation)
  return { x: m.offsetX + r.x * m.scale, y: m.offsetY + r.y * m.scale }
}

/** CSS px inside the drawing surface → page point. */
export function screenToPage(s: Point, m: ScreenMap): Point {
  const r = { x: (s.x - m.offsetX) / m.scale, y: (s.y - m.offsetY) / m.scale }
  return unrotatePoint(r, m.size, m.rotation)
}

/** Balloon diameter on screen: 22 px at 100 percent, never below 14 or above 30. */
export function balloonDiameter(scale: number): number {
  return Math.min(30, Math.max(14, 22 * scale))
}

/**
 * Where a leader from `from` towards `to` meets the box around `to` (page points, padded).
 * Keeps leaders from running through the digits. Returns `to` when there is no box or `from` is inside it.
 */
export function clipToBox(from: Point, to: Point, box: { x: number; y: number; w: number; h: number } | null, pad = 2): Point {
  if (!box) return to
  const x0 = box.x - pad
  const y0 = box.y - pad
  const x1 = box.x + box.w + pad
  const y1 = box.y + box.h + pad
  if (from.x >= x0 && from.x <= x1 && from.y >= y0 && from.y <= y1) return to
  const dx = to.x - from.x
  const dy = to.y - from.y
  let best = 1
  for (const edge of [x0, x1]) {
    if (dx === 0) continue
    const t = (edge - from.x) / dx
    const y = from.y + t * dy
    if (t >= 0 && t <= best && y >= y0 && y <= y1) best = t
  }
  for (const edge of [y0, y1]) {
    if (dy === 0) continue
    const t = (edge - from.y) / dy
    const x = from.x + t * dx
    if (t >= 0 && t <= best && x >= x0 && x <= x1) best = t
  }
  return { x: from.x + best * dx, y: from.y + best * dy }
}
