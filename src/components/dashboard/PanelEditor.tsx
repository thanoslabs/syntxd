import type { ReactNode } from 'react'
import { PANEL_WIDTHS, VIZ_TYPES } from '../../lib/dashboard'
import type { PanelConfig, PanelOptions, PanelWidth, VizType } from '../../lib/dashboard'
import { REDUCERS, inferColumns, selectRows } from '../../lib/frame'
import type { ColumnDef, DataFrame, FieldType, Reducer } from '../../lib/frame'
import type { JsonValue } from '../../lib/json'

const COLUMN_TYPES: Array<ColumnDef['type']> = ['auto', 'string', 'number', 'time', 'boolean']

interface PanelEditorProps {
  panel: PanelConfig
  value: JsonValue | null
  frame: DataFrame | null
  frameError: string | null
  onChange: (panel: PanelConfig) => void
  onDone: () => void
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`editor-field${wide ? ' wide' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  )
}

export function PanelEditor({ panel, value, frame, frameError, onChange, onDone }: PanelEditorProps) {
  const fields = frame?.fields ?? []
  const names = (types?: FieldType[]) => fields.filter((f) => !types || types.includes(f.type)).map((f) => f.name)
  const columns = panel.query.columns

  const setOptions = (patch: Partial<PanelOptions>) => onChange({ ...panel, options: { ...panel.options, ...patch } })
  const setColumns = (next: ColumnDef[]) => onChange({ ...panel, query: { ...panel.query, columns: next } })
  const setColumn = (index: number, patch: Partial<ColumnDef>) =>
    setColumns(columns.map((c, i) => (i === index ? { ...c, ...patch } : c)))

  function fillInferred() {
    if (value === null) return
    const rows = selectRows(value, panel.query.root)
    if (rows.ok) setColumns(inferColumns(rows.rows))
  }

  const fieldSelect = (label: string, current: string, onPick: (name: string) => void, types?: FieldType[], allowNone = false) => {
    const options = names(types)
    if (current && !options.includes(current)) options.unshift(current)
    return (
      <Field label={label}>
        <select value={current} onChange={(e) => onPick(e.target.value)}>
          <option value="">{allowNone ? 'None' : 'Auto'}</option>
          {options.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Field>
    )
  }

  const valuePicker = (multi: boolean, autoHint = 'all numeric') => {
    const options = names(['number'])
    for (const y of panel.options.y) if (!options.includes(y)) options.push(y)
    if (!multi) {
      return fieldSelect('Value', panel.options.y[0] ?? '', (n) => setOptions({ y: n ? [n] : [] }), ['number'])
    }
    return (
      <fieldset className="editor-field wide">
        <legend>Values {panel.options.y.length === 0 && <em>(auto: {autoHint})</em>}</legend>
        <div className="editor-checks">
          {options.length === 0 && <span className="editor-hint">No numeric fields.</span>}
          {options.map((n) => (
            <label key={n}>
              <input
                type="checkbox"
                checked={panel.options.y.includes(n)}
                onChange={(e) =>
                  setOptions({ y: e.target.checked ? [...panel.options.y, n] : panel.options.y.filter((y) => y !== n) })
                }
              />
              {n}
            </label>
          ))}
        </div>
      </fieldset>
    )
  }

  const reducerSelect = (label: string) => (
    <Field label={label}>
      <select value={panel.options.reducer} onChange={(e) => setOptions({ reducer: e.target.value as Reducer })}>
        {REDUCERS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </Field>
  )

  const unitInput = (
    <Field label="Unit">
      <input type="text" value={panel.options.unit} placeholder="e.g. ms" onChange={(e) => setOptions({ unit: e.target.value })} />
    </Field>
  )

  return (
    <div className="panel-editor">
      <div className="editor-grid">
        <Field label="Title">
          <input type="text" value={panel.title} onChange={(e) => onChange({ ...panel, title: e.target.value })} />
        </Field>
        <Field label="Visualization">
          <select value={panel.viz} onChange={(e) => onChange({ ...panel, viz: e.target.value as VizType })}>
            {VIZ_TYPES.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Width">
          <select value={panel.width} onChange={(e) => onChange({ ...panel, width: Number(e.target.value) as PanelWidth })}>
            {PANEL_WIDTHS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Rows (JSONPath)" wide>
          <input
            type="text"
            className={`mono${frameError ? ' invalid' : ''}`}
            value={panel.query.root}
            placeholder="$.items  ·  $..events[?(@.level == 'error')]  ·  empty = whole document"
            spellCheck={false}
            onChange={(e) => onChange({ ...panel, query: { ...panel.query, root: e.target.value } })}
          />
          <span className={`editor-hint${frameError ? ' error' : ''}`}>
            {frameError ?? (frame ? `${frame.length} ${frame.length === 1 ? 'row' : 'rows'} · ${fields.length} fields` : 'No data')}
          </span>
        </Field>
      </div>

      <fieldset className="editor-columns">
        <legend>
          Columns {columns.length === 0 && <em>(auto-detected — add columns to pick, rename, or retype fields)</em>}
        </legend>
        {columns.map((c, i) => (
          <div key={i} className="editor-column">
            <input
              type="text"
              className="mono"
              value={c.selector}
              placeholder="selector, e.g. user.name"
              aria-label="Column selector"
              spellCheck={false}
              onChange={(e) => setColumn(i, { selector: e.target.value })}
            />
            <input
              type="text"
              value={c.alias}
              placeholder="alias"
              aria-label="Column alias"
              onChange={(e) => setColumn(i, { alias: e.target.value })}
            />
            <select value={c.type} aria-label="Column type" onChange={(e) => setColumn(i, { type: e.target.value as ColumnDef['type'] })}>
              {COLUMN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button type="button" aria-label="Remove column" onClick={() => setColumns(columns.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
        <div className="editor-row-actions">
          <button type="button" onClick={() => setColumns([...columns, { selector: '', alias: '', type: 'auto' }])}>
            + Column
          </button>
          {columns.length === 0 ? (
            <button type="button" onClick={fillInferred} disabled={value === null}>
              Customize detected columns
            </button>
          ) : (
            <button type="button" onClick={() => setColumns([])}>
              Reset to auto
            </button>
          )}
        </div>
      </fieldset>

      {panel.viz !== 'table' && (
        <div className="editor-grid">
          {panel.viz === 'timeseries' && (
            <>
              {fieldSelect('Time field', panel.options.x, (x) => setOptions({ x }), ['time'])}
              {unitInput}
              {valuePicker(true)}
            </>
          )}
          {panel.viz === 'bar' && (
            <>
              {fieldSelect('Category', panel.options.x, (x) => setOptions({ x }))}
              {valuePicker(false)}
              {reducerSelect('Aggregate')}
              {unitInput}
            </>
          )}
          {panel.viz === 'stat' && (
            <>
              {reducerSelect('Calculation')}
              {unitInput}
              {valuePicker(true, 'first numeric')}
            </>
          )}
          {panel.viz === 'timeline' && (
            <>
              {fieldSelect('Start', panel.options.start, (start) => setOptions({ start }), ['time'])}
              {fieldSelect('End', panel.options.end, (end) => setOptions({ end }), ['time'])}
              {fieldSelect('Lane', panel.options.label, (label) => setOptions({ label }))}
            </>
          )}
        </div>
      )}

      <div className="editor-row-actions end">
        <button type="button" className="primary" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  )
}
