import { useCallback } from 'react'
import { useExtractionStore } from '../store/extractionStore'
import { extractPdf } from '../api/extractionClient'

export function useExtraction() {
  const { setResult, setExtractionState } = useExtractionStore()

  const extract = useCallback(
    async (file: File) => {
      setExtractionState('loading')
      try {
        const result = await extractPdf(file)
        setResult(result)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Extraction failed'
        setExtractionState('error', msg)
      }
    },
    [setResult, setExtractionState]
  )

  return { extract }
}
