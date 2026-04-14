import { useCallback, useRef } from 'react'
import { useViewerStore } from '../store/viewerStore'
import { useExtractionStore } from '../store/extractionStore'
import { uploadPdf, pollConversion, fetchSvg } from '../api/client'
import { extractPdf } from '../api/extractionClient'

export function usePdfUpload() {
  const { setUploadState, setSvgContent, closeUploadPanel } = useViewerStore()
  const setExtractionState = useExtractionStore((s) => s.setExtractionState)
  const setResult = useExtractionStore((s) => s.setResult)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  const upload = useCallback(
    async (file: File) => {
      setUploadState('uploading', 0)

      try {
        const jobId = await uploadPdf(file, (pct) =>
          setUploadState('uploading', pct)
        )

        setUploadState('converting', 85)

        // Poll every 1.5s until done or failed
        await new Promise<void>((resolve, reject) => {
          pollRef.current = setInterval(async () => {
            try {
              const status = await pollConversion(jobId)
              if (status.status === 'done') {
                stopPolling()
                setUploadState('converting', 95)
                const svg = await fetchSvg(jobId)
                setSvgContent(svg, file.name.replace(/\.pdf$/i, '.svg'))
                setUploadState('done', 100)
                closeUploadPanel()
                resolve()
              } else if (status.status === 'failed') {
                stopPolling()
                reject(new Error(status.error ?? 'Conversion failed'))
              }
            } catch (err) {
              stopPolling()
              reject(err)
            }
          }, 1500)
        })

        // Auto-trigger extraction after SVG is loaded
        setExtractionState('loading')
        try {
          const result = await extractPdf(file)
          setResult(result)
        } catch {
          setExtractionState('error', 'Extraction failed — is the Python service running on port 8000?')
        }
      } catch (err) {
        stopPolling()
        const msg = err instanceof Error ? err.message : 'Unknown error'
        setUploadState('error', 0, msg)
      }
    },
    [setUploadState, setSvgContent, closeUploadPanel, setExtractionState, setResult]
  )

  return { upload }
}
