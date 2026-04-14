import type { ExtractionResult } from '../store/extractionStore'

export async function extractPdf(file: File): Promise<ExtractionResult> {
  const form = new FormData()
  form.append('file', file)

  const res = await fetch('/extract', {
    method: 'POST',
    body: form,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error((err as { detail?: string }).detail ?? `Extraction failed: HTTP ${res.status}`)
  }

  return res.json() as Promise<ExtractionResult>
}
