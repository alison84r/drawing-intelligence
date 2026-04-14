const BASE = '/api'

export interface ConvertResponse {
  jobId: string
  status: 'queued' | 'running' | 'done' | 'failed'
  progress: number
  svgUrl: string | null
  error: string | null
}

export async function uploadPdf(
  file: File,
  onProgress: (pct: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const formData = new FormData()
    formData.append('file', file)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}/convert`)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 80))
    }

    xhr.onload = () => {
      if (xhr.status === 202) {
        const body = JSON.parse(xhr.responseText) as { jobId: string }
        resolve(body.jobId)
      } else {
        try {
          const err = JSON.parse(xhr.responseText) as { error: string }
          reject(new Error(err.error))
        } catch {
          reject(new Error(`Upload failed: HTTP ${xhr.status}`))
        }
      }
    }

    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.send(formData)
  })
}

export async function pollConversion(jobId: string): Promise<ConvertResponse> {
  const res = await fetch(`${BASE}/convert/${jobId}`)
  if (!res.ok) throw new Error(`Poll failed: HTTP ${res.status}`)
  return res.json() as Promise<ConvertResponse>
}

export async function fetchSvg(jobId: string): Promise<string> {
  const res = await fetch(`${BASE}/svg/${jobId}`)
  if (!res.ok) throw new Error(`SVG fetch failed: HTTP ${res.status}`)
  return res.text()
}
