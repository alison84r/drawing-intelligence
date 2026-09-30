import { useCallback, useEffect, useMemo, useRef } from 'react'
import { AgGridReact } from 'ag-grid-react'
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type CellValueChangedEvent,
  type ColDef,
  type ColumnState,
  type GridApi,
  type GridReadyEvent,
  type ICellRendererParams,
  type RowClickedEvent,
  type ValueFormatterParams,
  type ValueGetterParams,
  type ValueParserParams,
} from 'ag-grid-community'
import { useTheme } from '@/components/theme/ThemeProvider'
import { Fcf } from '@/components/gdt/Fcf'
import { StatusBadge } from '@/components/layout/RightPanel'
import { balloonLabel, useCharacteristicStore, type Characteristic } from '@/store/characteristicStore'
import { useDocumentStore } from '@/store/documentStore'
import { useSettingsStore, type DefaultTolerances } from '@/store/settingsStore'
import { deriveLimits, displayStatus, fmt, hasNumericTolerance, parseNumber, placesOf, requirementText } from '@/lib/tolerance'

ModuleRegistry.registerModules([AllCommunityModule])

const COLUMN_STATE_KEY = 'di.grid.columns'

const gridTheme = themeQuartz
  .withParams(
    {
      accentColor: '#e11d48',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 12,
      headerFontSize: 11,
      headerFontWeight: 600,
      rowHeight: 30,
      headerHeight: 30,
      spacing: 5,
      wrapperBorder: false,
      wrapperBorderRadius: 0,
      backgroundColor: '#ffffff',
      foregroundColor: '#0f172a',
      headerBackgroundColor: '#f8fafc',
      borderColor: '#e2e8f0',
      oddRowBackgroundColor: '#fcfcfd',
      selectedRowBackgroundColor: 'rgba(225,29,72,.10)',
      rowHoverColor: 'rgba(15,23,42,.04)',
    },
    'light',
  )
  .withParams(
    {
      backgroundColor: '#0f172a',
      foregroundColor: '#f1f5f9',
      headerBackgroundColor: '#1e293b',
      borderColor: '#1e293b',
      oddRowBackgroundColor: '#131c2e',
      selectedRowBackgroundColor: 'rgba(244,63,94,.18)',
      rowHoverColor: 'rgba(241,245,249,.05)',
      accentColor: '#f43f5e',
    },
    'dark',
  )

type Row = Characteristic

const DESCRIPTIONS = [
  'Linear', 'Diameter', 'Radius', 'Angular', 'Chamfer', 'Thread', 'Surface Finish',
  'Flatness', 'Position', 'Perpendicularity', 'Parallelism', 'Profile', 'Runout', 'Concentricity', 'Note', 'Other',
]
const TOL_TYPES = ['Bilateral', 'Unilateral', 'Limits', 'Basic', 'Reference', 'GD&T', 'Attribute']
const EDITABLE_FIELDS: (keyof Characteristic)[] = [
  'descriptionType', 'toleranceType', 'specification', 'nominal', 'places', 'tolHigh', 'tolLow', 'units', 'zone',
  'measurementType', 'designator', 'result', 'comments', 'count',
]

const num = (p: ValueParserParams<Row>) => parseNumber(String(p.newValue ?? ''))

function FcfCell(p: ICellRendererParams<Row>) {
  const c = p.data
  if (!c || c.toleranceType !== 'GD&T' || !c.gdt) return null
  return <Fcf gdt={c.gdt} size="sm" />
}

function StatusCell(p: ICellRendererParams<Row, string>) {
  return p.value ? <StatusBadge status={p.value as 'Draft' | 'Accepted' | 'Pass' | 'Fail'} /> : null
}

function buildColumns(defaults: DefaultTolerances): ColDef<Row>[] {
  const limitsOf = (c: Row) => deriveLimits(c, defaults)
  const tolFormatter = (side: 'high' | 'low') => (p: ValueFormatterParams<Row>) => {
    const c = p.data
    if (!c || !hasNumericTolerance(c)) return ''
    const L = limitsOf(c)
    const typed = side === 'high' ? c.tolHigh : c.tolLow
    const v = side === 'high' ? L.high : L.low
    if (v === null) return ''
    const text = (v > 0 && c.toleranceType !== 'Limits' ? '+' : '') + fmt(v, Math.max(c.places, 1))
    return typed === null && L.auto ? `${text} auto` : text
  }
  return [
    {
      headerName: '#',
      colId: 'balloon',
      width: 62,
      pinned: 'left',
      editable: false,
      valueGetter: (p) => (p.data ? balloonLabel(p.data) : ''),
      comparator: (a: string, b: string) => parseFloat(a) - parseFloat(b) || a.localeCompare(b),
      cellStyle: { color: '#e11d48', fontWeight: 600 },
      sort: 'asc',
    },
    { field: 'descriptionType', headerName: 'Description', width: 120, cellEditor: 'agSelectCellEditor', cellEditorParams: { values: DESCRIPTIONS } },
    { field: 'toleranceType', headerName: 'Tol. type', width: 100, cellEditor: 'agSelectCellEditor', cellEditorParams: { values: TOL_TYPES } },
    {
      headerName: 'GD&T',
      colId: 'gdt',
      width: 140,
      editable: false,
      sortable: false,
      valueGetter: (p) => (p.data?.gdt ? `${p.data.gdt.symbol} ${p.data.gdt.zone}${p.data.gdt.tolerance} ${p.data.gdt.datums.join(' ')}` : ''),
      cellRenderer: FcfCell,
    },
    {
      field: 'specification',
      headerName: 'Requirement',
      width: 160,
      valueFormatter: (p) => (p.data ? requirementText(p.data, limitsOf(p.data)) || p.value || '' : ''),
      tooltipValueGetter: (p) => (p.data ? requirementText(p.data, limitsOf(p.data)) : ''),
      getQuickFilterText: (p) => (p.data ? `${p.value ?? ''} ${requirementText(p.data, limitsOf(p.data))}` : ''),
    },
    {
      headerName: 'Nominal',
      colId: 'nominal',
      width: 92,
      type: 'numericColumn',
      // The cell value is the printed text ("3.10", not 3.1) so the number of places survives
      // editing and a change from "3.1" to "3.10" is still seen as a change.
      valueGetter: (p: ValueGetterParams<Row>) => (p.data && p.data.nominal !== null ? fmt(p.data.nominal, p.data.places) : ''),
      valueSetter: (p) => {
        const typed = String(p.newValue ?? '').trim()
        const n = parseNumber(typed)
        p.data.nominal = n
        if (typed) p.data.places = placesOf(typed)
        if (!p.data.specification && n !== null) p.data.specification = typed
        return true
      },
      comparator: (a: string, b: string) => (parseFloat(a) || 0) - (parseFloat(b) || 0),
    },
    { field: 'tolHigh', headerName: 'High', width: 104, type: 'numericColumn', valueParser: num, valueFormatter: tolFormatter('high'), cellClassRules: { 'text-muted-foreground': (p) => p.data?.tolHigh === null } },
    { field: 'tolLow', headerName: 'Low', width: 104, type: 'numericColumn', valueParser: num, valueFormatter: tolFormatter('low'), cellClassRules: { 'text-muted-foreground': (p) => p.data?.tolLow === null } },
    { headerName: 'Min', colId: 'min', width: 84, editable: false, type: 'numericColumn', valueGetter: (p: ValueGetterParams<Row>) => (p.data ? limitsOf(p.data).min : null), valueFormatter: (p) => (p.data ? fmt(p.value as number | null, p.data.places) : '') },
    { headerName: 'Max', colId: 'max', width: 84, editable: false, type: 'numericColumn', valueGetter: (p: ValueGetterParams<Row>) => (p.data ? limitsOf(p.data).max : null), valueFormatter: (p) => (p.data ? fmt(p.value as number | null, p.data.places) : '') },
    { field: 'units', headerName: 'Units', width: 72, cellEditor: 'agSelectCellEditor', cellEditorParams: { values: ['mm', 'in', 'deg'] } },
    { field: 'count', headerName: 'Qty', width: 64, type: 'numericColumn', valueParser: (p) => Math.max(1, Math.round(parseNumber(String(p.newValue ?? '')) ?? 1)) },
    { field: 'zone', headerName: 'Zone', width: 76, valueParser: (p) => String(p.newValue ?? '').toUpperCase() },
    { field: 'measurementType', headerName: 'Type', width: 96, cellEditor: 'agSelectCellEditor', cellEditorParams: { values: ['Variable', 'Attribute'] } },
    { field: 'designator', headerName: 'Designator', width: 100, cellEditor: 'agSelectCellEditor', cellEditorParams: { values: ['', 'Key', 'Critical', 'Major', 'Minor'] } },
    {
      field: 'result',
      headerName: 'Result',
      width: 96,
      type: 'numericColumn',
      cellEditorSelector: (p) =>
        p.data?.measurementType === 'Attribute' || p.data?.descriptionType === 'Note'
          ? { component: 'agSelectCellEditor', params: { values: ['', 'Pass', 'Fail'] } }
          : { component: 'agTextCellEditor' },
      valueParser: (p) => {
        const raw = String(p.newValue ?? '').trim()
        if (raw === '') return null
        return parseNumber(raw) ?? raw
      },
      cellClassRules: {
        'text-status-pass font-semibold': (p) => !!p.data && displayStatus(p.data, limitsOf(p.data)) === 'Pass',
        'text-status-fail font-semibold': (p) => !!p.data && displayStatus(p.data, limitsOf(p.data)) === 'Fail',
      },
    },
    {
      headerName: 'Status',
      colId: 'status',
      width: 96,
      editable: false,
      valueGetter: (p: ValueGetterParams<Row>) => (p.data ? displayStatus(p.data, limitsOf(p.data)) : ''),
      cellRenderer: StatusCell,
    },
    { field: 'comments', headerName: 'Comments', width: 180 },
  ]
}

export function CharacteristicsGrid({ quickFilter }: { quickFilter: string }) {
  const { theme } = useTheme()
  const items = useCharacteristicStore((s) => s.items)
  const selectedId = useCharacteristicStore((s) => s.selectedId)
  const select = useCharacteristicStore((s) => s.select)
  const update = useCharacteristicStore((s) => s.update)
  const defaults = useSettingsStore((s) => s.defaults)
  const setPageIndex = useDocumentStore((s) => s.setPageIndex)
  const apiRef = useRef<GridApi<Row> | null>(null)

  // The grid mutates row objects while editing, so hand it copies and commit changes back to the store.
  const rowData = useMemo(() => items.map((c) => ({ ...c })), [items])
  const columnDefs = useMemo(() => buildColumns(defaults), [defaults])

  const onGridReady = useCallback((e: GridReadyEvent<Row>) => {
    apiRef.current = e.api
    if (import.meta.env.DEV) (window as unknown as { __gridApi: GridApi<Row> }).__gridApi = e.api
    try {
      const raw = localStorage.getItem(COLUMN_STATE_KEY)
      if (raw) e.api.applyColumnState({ state: JSON.parse(raw) as ColumnState[], applyOrder: true })
    } catch {
      /* ignore bad saved state */
    }
  }, [])

  const saveColumnState = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    try {
      localStorage.setItem(COLUMN_STATE_KEY, JSON.stringify(api.getColumnState()))
    } catch {
      /* storage unavailable */
    }
  }, [])

  const onCellValueChanged = useCallback(
    (e: CellValueChangedEvent<Row>) => {
      const row = e.data
      const patch: Partial<Characteristic> = {}
      for (const f of EDITABLE_FIELDS) (patch as Record<string, unknown>)[f] = row[f]
      if (import.meta.env.DEV) (window as unknown as { __lastCellEvent: unknown }).__lastCellEvent = { field: e.colDef.field, newValue: e.newValue, data: { ...row } }
      if (e.colDef.field === 'descriptionType' && row.descriptionType === 'Angular') patch.units = 'deg'
      if (e.colDef.field === 'measurementType' && row.measurementType === 'Attribute') patch.toleranceType = 'Attribute'
      update(row.id, patch)
    },
    [update],
  )

  const onRowClicked = useCallback(
    (e: RowClickedEvent<Row>) => {
      if (!e.data) return
      select(e.data.id)
      setPageIndex(e.data.page)
    },
    [select, setPageIndex],
  )

  // Mirror external selection (balloon clicks) into the grid.
  useEffect(() => {
    const api = apiRef.current
    if (!api) return
    api.forEachNode((n) => {
      const want = n.data?.id === selectedId
      if (n.isSelected() !== want) n.setSelected(want)
    })
    if (selectedId) {
      const node = api.getRowNode(selectedId)
      if (node) api.ensureNodeVisible(node, 'middle')
    }
  }, [selectedId, rowData])

  useEffect(() => {
    apiRef.current?.setGridOption('quickFilterText', quickFilter)
  }, [quickFilter])

  return (
    <div className="h-full w-full" data-ag-theme-mode={theme} data-testid="boc-grid">
      <AgGridReact<Row>
        theme={gridTheme}
        rowData={rowData}
        columnDefs={columnDefs}
        getRowId={(p) => p.data.id}
        defaultColDef={{ sortable: true, filter: true, resizable: true, editable: true, minWidth: 56 }}
        rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
        singleClickEdit={false}
        stopEditingWhenCellsLoseFocus
        enableCellTextSelection
        suppressMovableColumns={false}
        tooltipShowDelay={400}
        onGridReady={onGridReady}
        onCellValueChanged={onCellValueChanged}
        onRowClicked={onRowClicked}
        onColumnResized={(e) => e.finished && saveColumnState()}
        onColumnMoved={(e) => e.finished && saveColumnState()}
        onSortChanged={saveColumnState}
        onColumnVisible={saveColumnState}
      />
    </div>
  )
}
