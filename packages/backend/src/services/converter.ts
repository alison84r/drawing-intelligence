import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

// pdftosvg.exe is at the project root (two levels up from packages/backend)
const PDFTOSVG_EXE =
  process.env['PDFTOSVG_PATH'] ??
  path.resolve(__dirname, '../../../../pdftosvg.exe')

const CONVERSION_TIMEOUT_MS = 60_000

/**
 * Runs pdftosvg.exe to convert a PDF to SVG.
 *
 * NOTE: pdftosvg.exe appends the page number before the extension.
 * Input:  output.svg
 * Actual: output1.svg
 *
 * Returns the actual output path.
 */
export async function convertPdfToSvg(
  inputPath: string,
  outputBasePath: string,
  options: { pages?: string } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args: string[] = [inputPath, outputBasePath, '--non-interactive']
    if (options.pages) args.push('--pages', options.pages)

    if (!fs.existsSync(PDFTOSVG_EXE)) {
      return reject(
        new Error(
          `pdftosvg.exe not found at: ${PDFTOSVG_EXE}. ` +
            'Set PDFTOSVG_PATH env variable to the correct location.'
        )
      )
    }

    const proc = spawn(PDFTOSVG_EXE, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stderr = ''
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })

    const timeout = setTimeout(() => {
      proc.kill()
      reject(new Error('Conversion timed out after 60 seconds'))
    }, CONVERSION_TIMEOUT_MS)

    proc.on('close', (code) => {
      clearTimeout(timeout)

      if (code !== 0) {
        return reject(new Error(`pdftosvg exited with code ${code}: ${stderr.trim()}`))
      }

      // PdfToSvg.NET naming: {base}-{pageNumber}.svg  (e.g. output-1.svg)
      // Fallback candidates in priority order:
      const ext = path.extname(outputBasePath)
      const base = outputBasePath.slice(0, -ext.length)
      const candidates = [
        `${base}-1${ext}`,   // PdfToSvg.NET actual output: output-1.svg
        `${base}1${ext}`,    // Some versions: output1.svg
        outputBasePath,      // Direct output (single-page mode)
      ]

      const found = candidates.find((p) => fs.existsSync(p))
      if (found) {
        resolve(found)
      } else {
        // List what IS in the job dir to aid debugging
        const dir = path.dirname(outputBasePath)
        const files = fs.existsSync(dir) ? fs.readdirSync(dir).join(', ') : '(dir missing)'
        reject(new Error(`Output SVG not found. Checked: ${candidates.map(path.basename).join(', ')}. Dir contains: ${files}`))
      }
    })

    proc.on('error', (err) => {
      clearTimeout(timeout)
      reject(new Error(`Failed to spawn pdftosvg.exe: ${err.message}`))
    })
  })
}
