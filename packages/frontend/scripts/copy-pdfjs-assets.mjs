// Copies the pdf.js runtime assets (image decoders, character maps, standard fonts, colour profiles)
// into public/pdfjs so the viewer works offline. Without them scanned pages render blank and
// PDFs that rely on non-embedded fonts show wrong glyphs.
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules', 'pdfjs-dist')
const dst = join(root, 'public', 'pdfjs')
mkdirSync(dst, { recursive: true })
for (const dir of ['wasm', 'cmaps', 'standard_fonts', 'iccs']) {
  if (existsSync(join(src, dir))) cpSync(join(src, dir), join(dst, dir), { recursive: true })
}
console.log('pdf.js assets copied to public/pdfjs')
