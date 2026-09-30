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
