import { useEffect, useRef, useState } from 'react'
import { ExportDialog } from '@/components/export/ExportDialog'
import {
  ArrowLeft,
  Circle,
  CircleDot,
  Download,
  FolderOpen,
  GitBranch,
  Hand,
  ListOrdered,
  MousePointer2,
  PanelLeft,
  PanelRight,
  Redo2,
  Save,
  Sparkles,
  Spline,
  Trash2,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { BRAND, BrandLogo } from '@/components/brand/Brand'
import { useUiStore, type ToolMode } from '@/store/uiStore'
import { useDocumentStore } from '@/store/documentStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useCharacteristicStore } from '@/store/characteristicStore'
import { useSessionStore } from '@/store/sessionStore'
import { closeInspection, downloadProjectFile, importProjectFile } from '@/lib/project'
import { cn } from '@/lib/utils'
import { ViewControls } from './ViewControls'
import { SaveStatus } from './SaveStatus'

const TOOLS: { value: ToolMode; label: string; hint: string; icon: React.ReactNode }[] = [
  { value: 'single', label: 'Single', hint: 'Place one balloon (B)', icon: <Circle /> },
  { value: 'multiple', label: 'Multiple', hint: 'Keep placing balloons (M)', icon: <CircleDot /> },
  { value: 'sub', label: 'Sub-Balloon', hint: 'Click a balloon to add 5.1, 5.2 (N)', icon: <GitBranch /> },
  { value: 'select', label: 'Select', hint: 'Select and drag (S)', icon: <MousePointer2 /> },
  { value: 'pan', label: 'Pan', hint: 'Pan the drawing (H)', icon: <Hand /> },
]

export function IconButton({
  hint,
  onClick,
  active,
  children,
  disabled,
  className,
}: {
  hint: string
  onClick?: () => void
  active?: boolean
  children: React.ReactNode
  disabled?: boolean
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-8 w-8', active && 'bg-accent text-foreground', className)}
          onClick={onClick}
          disabled={disabled}
          aria-label={hint}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}

export function TopBar() {
  const tool = useUiStore((s) => s.tool)
  const setTool = useUiStore((s) => s.setTool)
  const leftCollapsed = useUiStore((s) => s.leftCollapsed)
  const rightCollapsed = useUiStore((s) => s.rightCollapsed)
  const toggleLeft = useUiStore((s) => s.toggleLeft)
  const toggleRight = useUiStore((s) => s.toggleRight)
  const ready = useDocumentStore((s) => s.status === 'ready')
  const pageHeight = useDocumentStore((s) => s.pages[s.pageIndex]?.height ?? 1)
  const partLabel = useSessionStore((s) => s.partLabel)
  const inspectionTitle = useSessionStore((s) => s.inspectionTitle)

  const leaderDefault = useSettingsStore((s) => s.leaderDefault)
  const setLeaderDefault = useSettingsStore((s) => s.setLeaderDefault)

  const selectedId = useCharacteristicStore((s) => s.selectedId)
  const selected = useCharacteristicStore((s) => s.items.find((c) => c.id === s.selectedId) ?? null)
  const canUndo = useCharacteristicStore((s) => s.past.length > 0)
  const canRedo = useCharacteristicStore((s) => s.future.length > 0)
  const hasItems = useCharacteristicStore((s) => s.items.length > 0)
  const undo = useCharacteristicStore((s) => s.undo)
  const redo = useCharacteristicStore((s) => s.redo)
  const remove = useCharacteristicStore((s) => s.remove)
  const renumber = useCharacteristicStore((s) => s.renumber)
  const setLeader = useCharacteristicStore((s) => s.setLeader)

  const fileInput = useRef<HTMLInputElement>(null)
  const [importNote, setImportNote] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e' && ready && hasItems) {
        e.preventDefault()
        setExportOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ready, hasItems])

  const leaderChecked = selected ? selected.leader : leaderDefault
  const onLeaderChange = (v: boolean) => {
    if (selected && tool === 'select') setLeader(selected.id, v)
    else setLeaderDefault(v)
  }

  const onImportFile = async (file: File) => {
    try {
      const { warning } = await importProjectFile(file)
      setImportNote(warning ?? `Loaded ${file.name}`)
    } catch (e) {
      setImportNote(e instanceof Error ? e.message : 'Could not read the file')
    }
    window.setTimeout(() => setImportNote(null), 6000)
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3">
      <IconButton hint="Back to library" onClick={closeInspection}>
        <ArrowLeft />
      </IconButton>
      <IconButton hint={leftCollapsed ? 'Show setup panel' : 'Hide setup panel'} onClick={toggleLeft} active={!leftCollapsed}>
        <PanelLeft />
      </IconButton>

      <BrandLogo height={20} className="hidden md:inline-flex" />
      <div className="hidden h-6 w-px bg-border md:block" />
      <div className="min-w-0">
        <div className="truncate whitespace-nowrap text-sm font-semibold tracking-tight">{BRAND.product}</div>
        <div className="truncate text-[11px] leading-none text-muted-foreground">{[partLabel, inspectionTitle].filter(Boolean).join(' · ')}</div>
      </div>

      <div className="mx-1 hidden lg:block">
        <ViewControls />
      </div>

      <div className="flex flex-1 items-center justify-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5" disabled>
              <Sparkles /> Auto
            </Button>
          </TooltipTrigger>
          <TooltipContent>Auto-extract characteristics (Phase 2)</TooltipContent>
        </Tooltip>

        <ToggleGroup type="single" value={tool} onValueChange={(v) => v && setTool(v as ToolMode)} aria-label="Balloon tools">
          {TOOLS.map((t) => (
            <Tooltip key={t.value}>
              <TooltipTrigger asChild>
                <ToggleGroupItem value={t.value} aria-label={t.label} disabled={!ready && t.value !== 'select'}>
                  {t.icon}
                  <span className="hidden whitespace-nowrap 2xl:inline">{t.label}</span>
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent>{t.hint}</TooltipContent>
            </Tooltip>
          ))}
        </ToggleGroup>

        <Tooltip>
          <TooltipTrigger asChild>
            <label
              className={cn(
                'flex h-8 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-xs',
                leaderChecked ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              <Spline className="size-3.5" />
              <span className="hidden 2xl:inline">Leader</span>
              <Switch checked={leaderChecked} onCheckedChange={onLeaderChange} aria-label="Leader line" disabled={!ready} />
            </label>
          </TooltipTrigger>
          <TooltipContent>
            {selected && tool === 'select' ? `Leader line on balloon ${selected.balloonNumber} (L)` : 'Leader line on new balloons (L)'}
          </TooltipContent>
        </Tooltip>

        <div className="flex items-center rounded-md border">
          <IconButton hint="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
            <Undo2 />
          </IconButton>
          <IconButton hint="Redo (Ctrl+Y)" onClick={redo} disabled={!canRedo}>
            <Redo2 />
          </IconButton>
          <IconButton hint="Delete selected balloon (Del)" onClick={() => selectedId && remove(selectedId)} disabled={!selectedId}>
            <Trash2 />
          </IconButton>
          <IconButton hint="Renumber by zone, top-left to bottom-right" onClick={() => renumber(pageHeight)} disabled={!hasItems}>
            <ListOrdered />
          </IconButton>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {importNote && <span className="max-w-[240px] truncate text-[11px] text-muted-foreground" role="status">{importNote}</span>}
        <SaveStatus />
        <IconButton hint="Export FAI package (Ctrl+E)" onClick={() => setExportOpen(true)} disabled={!ready || !hasItems}>
          <Download />
        </IconButton>
        <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
        <IconButton hint="Save as file (Ctrl+S)" onClick={downloadProjectFile} disabled={!ready}>
          <Save />
        </IconButton>
        <IconButton hint="Open file into this inspection" onClick={() => fileInput.current?.click()} disabled={!ready}>
          <FolderOpen />
        </IconButton>
        <IconButton hint={rightCollapsed ? 'Show edit panel' : 'Hide edit panel'} onClick={toggleRight} active={!rightCollapsed}>
          <PanelRight />
        </IconButton>
        <ThemeToggle />
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onImportFile(file)
          e.target.value = ''
        }}
      />
    </header>
  )
}
