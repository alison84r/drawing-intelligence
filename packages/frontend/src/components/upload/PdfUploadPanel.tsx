import { useRef, useState, useCallback } from 'react'
import { X, Upload, FileText, AlertCircle, CheckCircle, Loader } from 'lucide-react'
import { useViewerStore } from '../../store/viewerStore'
import { usePdfUpload } from '../../hooks/usePdfUpload'
import clsx from 'clsx'

export default function PdfUploadPanel() {
  const uploadPanelOpen = useViewerStore((s) => s.uploadPanelOpen)
  const uploadState = useViewerStore((s) => s.uploadState)
  const uploadProgress = useViewerStore((s) => s.uploadProgress)
  const uploadError = useViewerStore((s) => s.uploadError)
  const closeUploadPanel = useViewerStore((s) => s.closeUploadPanel)
  const setUploadState = useViewerStore((s) => s.setUploadState)

  const { upload } = usePdfUpload()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setUploadState('error', 0, 'Only PDF files are supported')
        return
      }
      upload(file)
    },
    [upload, setUploadState]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const isConverting = uploadState === 'uploading' || uploadState === 'converting'

  if (!uploadPanelOpen) return null

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-1 border border-border rounded-xl shadow-2xl w-[480px] max-w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Upload Engineering Drawing</h2>
            <p className="text-xs text-text-muted mt-0.5">PDF will be converted to SVG automatically</p>
          </div>
          <button
            onClick={closeUploadPanel}
            className="p-1.5 rounded hover:bg-surface-3 text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => !isConverting && inputRef.current?.click()}
            className={clsx(
              'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
              isConverting
                ? 'border-border cursor-default'
                : dragOver
                  ? 'border-brand bg-brand/10 cursor-copy'
                  : 'border-border hover:border-brand/60 hover:bg-surface-3 cursor-pointer'
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
              }}
            />

            {isConverting ? (
              <div className="flex flex-col items-center gap-3">
                <Loader size={32} className="text-brand animate-spin" />
                <div className="w-full max-w-xs">
                  <div className="flex justify-between text-xs text-text-muted mb-1.5">
                    <span>
                      {uploadState === 'uploading' ? 'Uploading PDF…' : 'Converting to SVG…'}
                    </span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand transition-all duration-300 rounded-full"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : uploadState === 'done' ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle size={32} className="text-emerald-400" />
                <p className="text-sm text-emerald-300 font-medium">Conversion complete!</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-surface-3 flex items-center justify-center">
                  {dragOver ? <Upload size={24} className="text-brand" /> : <FileText size={24} className="text-text-muted" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    Drop PDF here or click to browse
                  </p>
                  <p className="text-xs text-text-muted mt-1">Max 50 MB · Single page or multi-page</p>
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {uploadState === 'error' && uploadError && (
            <div className="mt-3 flex items-start gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-300">{uploadError}</p>
            </div>
          )}

          {/* Note about backend */}
          {uploadState === 'idle' && (
            <p className="mt-4 text-[11px] text-text-muted text-center">
              Requires the backend server to be running on port 3001.
              <br />
              Start it with: <code className="font-mono bg-surface-3 px-1 rounded">pnpm --filter backend dev</code>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
