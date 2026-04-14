import type { SegmentCommand, SegmentStats } from '../store/types'

const COMMAND_LABELS: Record<SegmentCommand, [string, string]> = {
  M: ['Move To', 'Pen lift — start new subpath'],
  L: ['Line To', 'Straight line segment'],
  H: ['Horizontal Line', 'Horizontal straight line'],
  V: ['Vertical Line', 'Vertical straight line'],
  C: ['Cubic Bezier', 'Smooth curve with 2 control points'],
  S: ['Smooth Cubic', 'Smooth cubic bezier (reflected)'],
  Q: ['Quadratic Bezier', 'Smooth curve with 1 control point'],
  T: ['Smooth Quadratic', 'Smooth quadratic bezier (reflected)'],
  A: ['Arc', 'Elliptical arc segment'],
  Z: ['Close Path', 'Line back to subpath start'],
}

/**
 * Tokenises the SVG path `d` attribute and returns a histogram of segment commands.
 * Handles both absolute (uppercase) and relative (lowercase) variants — they
 * are normalised to uppercase for counting purposes.
 */
export function parsePathCommands(d: string): SegmentStats[] {
  const counts = new Map<SegmentCommand, number>()

  // Match every command letter in the path data
  const commandRe = /[MLHVCSQTAZmlhvcsqtaz]/g
  let match: RegExpExecArray | null

  while ((match = commandRe.exec(d)) !== null) {
    const cmd = match[0].toUpperCase() as SegmentCommand
    counts.set(cmd, (counts.get(cmd) ?? 0) + 1)
  }

  const order: SegmentCommand[] = ['M', 'L', 'H', 'V', 'C', 'S', 'Q', 'T', 'A', 'Z']
  const result: SegmentStats[] = []

  for (const cmd of order) {
    const count = counts.get(cmd)
    if (count) {
      const [label, description] = COMMAND_LABELS[cmd]
      result.push({ command: cmd, count, label, description })
    }
  }

  return result
}
