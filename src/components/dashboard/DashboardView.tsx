import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPanel, parseDashboard, resolveOptions, serializeDashboard } from '../../lib/dashboard'
import type { Dashboard, PanelConfig } from '../../lib/dashboard'
import { buildFrame } from '../../lib/frame'
import type { JsonValue } from '../../lib/json'
import { PanelEditor } from './PanelEditor'
import { PanelView } from './PanelView'

interface DashboardViewProps {
  value: JsonValue | null
  dashboard: Dashboard
  onChange: (dashboard: Dashboard) => void
  editingId: string | null
  onEdit: (id: string | null) => void
  onLoadExample: () => void
}

interface PanelCardProps {
  panel: PanelConfig
  value: JsonValue | null
  editing: boolean
  isFirst: boolean
  isLast: boolean
  onChange: (panel: PanelConfig) => void
  onEdit: (editing: boolean) => void
  onDuplicate: () => void
  onMove: (delta: number) => void
  onRemove: () => void
}

function PanelCard({ panel, value, editing, isFirst, isLast, onChange, onEdit, onDuplicate, onMove, onRemove }: PanelCardProps) {
  const outcome = useMemo(() => (value === null ? null : buildFrame(value, panel.query)), [value, panel.query])
  const frame = outcome?.ok ? outcome.frame : null
  const frameError = outcome && !outcome.ok ? outcome.message : null
  const resolved = useMemo(() => (frame ? resolveOptions(panel.viz, panel.options, frame) : null), [frame, panel.viz, panel.options])
  const ref = useRef<HTMLElement>(null)

  // The editor widens the panel to a full row, which can move it; keep it in view.
  useEffect(() => {
    if (editing) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [editing])

  return (
    <section
      ref={ref}
      className={`panel${editing ? ' editing' : ''}`}
      style={{ '--span': editing ? 12 : panel.width } as CSSProperties}
    >
      <header className="panel-header">
        <h2 title={panel.title}>{panel.title || 'Untitled'}</h2>
        <div className="panel-actions">
          <button type="button" onClick={() => onMove(-1)} disabled={isFirst} aria-label="Move panel earlier" title="Move earlier">
            ←
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={isLast} aria-label="Move panel later" title="Move later">
            →
          </button>
          <button type="button" onClick={onDuplicate} aria-label="Duplicate panel" title="Duplicate">
            ⧉
          </button>
          <button type="button" onClick={() => onEdit(!editing)} aria-pressed={editing} title="Edit">
            {editing ? 'Close' : 'Edit'}
          </button>
          <button type="button" onClick={onRemove} aria-label="Remove panel" title="Remove">
            ✕
          </button>
        </div>
      </header>

      {editing && (
        <PanelEditor
          panel={panel}
          value={value}
          frame={frame}
          frameError={frameError}
          onChange={onChange}
          onDone={() => onEdit(false)}
        />
      )}

      <div className="panel-body">
        {value === null ? (
          <div className="viz-empty">No valid JSON input.</div>
        ) : frameError ? (
          <div className="viz-empty error">{frameError}</div>
        ) : (
          frame && resolved && <PanelView frame={frame} resolved={resolved} />
        )}
      </div>
    </section>
  )
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dashboard'
}

export function DashboardView({ value, dashboard, onChange, editingId, onEdit, onLoadExample }: DashboardViewProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const panels = dashboard.panels

  const setPanels = (next: PanelConfig[]) => onChange({ ...dashboard, panels: next })

  function addPanel() {
    const panel = createPanel({ title: `Panel ${panels.length + 1}` })
    setPanels([...panels, panel])
    onEdit(panel.id)
  }

  function movePanel(index: number, delta: number) {
    const next = [...panels]
    const [panel] = next.splice(index, 1)
    next.splice(index + delta, 0, panel)
    setPanels(next)
  }

  function duplicatePanel(index: number) {
    const copy = createPanel({ ...panels[index], id: undefined, title: `${panels[index].title} (copy)` })
    setPanels([...panels.slice(0, index + 1), copy, ...panels.slice(index + 1)])
  }

  function handleExport() {
    const blob = new Blob([serializeDashboard(dashboard)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${slug(dashboard.title)}.dashboard.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(file: File | undefined) {
    if (!file) return
    const result = parseDashboard(await file.text())
    if (result.ok) {
      onChange(result.dashboard)
      onEdit(null)
      setImportError(null)
    } else {
      setImportError(`Couldn't import ${file.name}: ${result.message}`)
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard-toolbar">
        <input
          className="dashboard-title"
          type="text"
          value={dashboard.title}
          onChange={(e) => onChange({ ...dashboard, title: e.target.value })}
          aria-label="Dashboard title"
        />
        <div className="actions">
          <button type="button" onClick={addPanel}>
            + Add panel
          </button>
          <button type="button" onClick={() => fileInput.current?.click()}>
            Import
          </button>
          <button type="button" onClick={handleExport} disabled={panels.length === 0}>
            Export
          </button>
          <button type="button" onClick={onLoadExample} title="Replaces the input JSON and dashboard with an example">
            Load example
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            void handleImport(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>

      {importError && <div className="error-banner">{importError}</div>}
      {value === null && panels.length > 0 && (
        <div className="error-banner">The input isn't valid JSON — switch to Explore to fix it.</div>
      )}

      {panels.length === 0 ? (
        <div className="dashboard-empty">
          <p>
            Build a dashboard from your JSON: each panel selects rows with a JSONPath query, picks columns, and renders
            them as a table, stat, time series, bar chart, or timeline.
          </p>
          <p className="dashboard-empty-hint">
            Dashboards aren't saved — use <strong>Export</strong> to keep one and <strong>Import</strong> to reuse it.
          </p>
          <div className="actions">
            <button type="button" onClick={addPanel}>
              + Add panel
            </button>
            <button type="button" onClick={onLoadExample}>
              Load example
            </button>
          </div>
        </div>
      ) : (
        <div className="dashboard-grid">
          {panels.map((panel, i) => (
            <PanelCard
              key={panel.id}
              panel={panel}
              value={value}
              editing={editingId === panel.id}
              isFirst={i === 0}
              isLast={i === panels.length - 1}
              onChange={(next) => setPanels(panels.map((p) => (p.id === panel.id ? next : p)))}
              onEdit={(editing) => onEdit(editing ? panel.id : null)}
              onDuplicate={() => duplicatePanel(i)}
              onMove={(delta) => movePanel(i, delta)}
              onRemove={() => {
                setPanels(panels.filter((p) => p.id !== panel.id))
                if (editingId === panel.id) onEdit(null)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
