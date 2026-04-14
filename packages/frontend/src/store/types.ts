export type SegmentCommand = 'M' | 'L' | 'H' | 'V' | 'C' | 'Q' | 'A' | 'Z' | 'S' | 'T'

export interface SegmentStats {
  command: SegmentCommand
  count: number
  label: string
  description: string
}

export interface BBox {
  x: number
  y: number
  width: number
  height: number
}

export type EntityRole = 'Primary Line' | 'Construction Line' | 'Hidden/Center Line' | 'Arrowhead/Fill' | 'Unknown'

export interface PathFeatures {
  entityId: string
  entityRole: EntityRole
  segments: SegmentStats[]
  totalSegmentCount: number
  totalLength: number
  bbox: BBox
  strokeWidth: string
  strokeColor: string
  fill: string
  dashArray: string | null
  strokeMiterlimit: string | null
  pathDataPreview: string
  pathDataFull: string
  elementTag: string
  textContent?: string
}

export type LoadingState = 'idle' | 'loading' | 'ready' | 'error'
export type UploadState = 'idle' | 'uploading' | 'converting' | 'done' | 'error'
