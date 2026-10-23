import type { JsonValue } from './json'
import { REDUCERS, aggregateBy, findField } from './frame'
import type { CellValue, ColumnDef, DataFrame, FieldType, FrameQuery, Reducer } from './frame'

export type VizType = 'table' | 'stat' | 'timeseries' | 'bar' | 'timeline'
export type PanelWidth = 4 | 6 | 8 | 12

export const VIZ_TYPES: Array<{ value: VizType; label: string }> = [
  { value: 'table', label: 'Table' },
  { value: 'stat', label: 'Stat' },
  { value: 'timeseries', label: 'Time series' },
  { value: 'bar', label: 'Bar chart' },
  { value: 'timeline', label: 'Timeline' },
]

export const PANEL_WIDTHS: Array<{ value: PanelWidth; label: string }> = [
  { value: 4, label: '1/3' },
  { value: 6, label: '1/2' },
  { value: 8, label: '2/3' },
  { value: 12, label: 'Full' },
]

/** Field mappings. Empty strings / arrays mean "pick automatically". */
export interface PanelOptions {
  /** Time field (time series) or category field (bar). */
  x: string
  /** Value fields (time series, bar, stat). */
  y: string[]
  /** Stat reduction / bar aggregation. */
  reducer: Reducer
  /** Timeline: event start, optional end, and lane label. */
  start: string
  end: string
  label: string
  /** Suffix appended to values, e.g. `ms`. */
  unit: string
}

export interface PanelConfig {
  id: string
  title: string
  viz: VizType
  width: PanelWidth
  query: FrameQuery
  options: PanelOptions
}

export interface Dashboard {
  version: 1
  title: string
  panels: PanelConfig[]
}

export const DEFAULT_OPTIONS: PanelOptions = {
  x: '',
  y: [],
  reducer: 'last',
  start: '',
  end: '',
  label: '',
  unit: '',
}

export const EMPTY_DASHBOARD: Dashboard = { version: 1, title: 'Dashboard', panels: [] }

let idCounter = 0

export function newPanelId(): string {
  idCounter += 1
  return `p${Date.now().toString(36)}${idCounter.toString(36)}`
}

export function createPanel(partial: Partial<Omit<PanelConfig, 'options'>> & { options?: Partial<PanelOptions> } = {}): PanelConfig {
  return {
    id: partial.id ?? newPanelId(),
    title: partial.title ?? 'New panel',
    viz: partial.viz ?? 'table',
    width: partial.width ?? 6,
    query: partial.query ?? { root: '', columns: [] },
    options: { ...DEFAULT_OPTIONS, ...partial.options },
  }
}

/* ------------------------------------------------------------- resolving */

export type ResolvedOptions =
  | { viz: 'table' }
  | { viz: 'stat'; fields: string[]; reducer: Reducer; unit: string }
  | { viz: 'timeseries'; x: string; y: string[]; unit: string }
  | { viz: 'bar'; x: string; y: string; reducer: Reducer; unit: string }
  | { viz: 'timeline'; start: string; end: string | null; label: string | null }

export type ResolveOutcome = { ok: true; options: ResolvedOptions } | { ok: false; message: string }

function namesOf(frame: DataFrame, type: FieldType): string[] {
  return frame.fields.filter((f) => f.type === type).map((f) => f.name)
}

function pick(frame: DataFrame, wanted: string, fallback: string | undefined): string | undefined {
  if (wanted && findField(frame, wanted)) return wanted
  return wanted ? undefined : fallback
}

/** Fill "auto" field mappings from the frame and validate explicit ones. */
export function resolveOptions(viz: VizType, options: PanelOptions, frame: DataFrame): ResolveOutcome {
  const numbers = namesOf(frame, 'number')
  const times = namesOf(frame, 'time')
  const strings = namesOf(frame, 'string')
  const missing = options.y.filter((name) => !findField(frame, name))
  if (viz !== 'table' && viz !== 'timeline' && missing.length > 0) {
    return { ok: false, message: `Field not found: ${missing.join(', ')}` }
  }

  switch (viz) {
    case 'table':
      return { ok: true, options: { viz } }

    case 'stat': {
      const fields = options.y.length > 0 ? options.y : numbers.slice(0, 1)
      if (fields.length === 0) return { ok: false, message: 'Stat needs a numeric field.' }
      return { ok: true, options: { viz, fields, reducer: options.reducer, unit: options.unit } }
    }

    case 'timeseries': {
      const x = pick(frame, options.x, times[0])
      if (!x) return { ok: false, message: options.x ? `Field not found: ${options.x}` : 'Time series needs a time field.' }
      const y = options.y.length > 0 ? options.y : numbers.filter((n) => n !== x)
      if (y.length === 0) return { ok: false, message: 'Time series needs a numeric field.' }
      return { ok: true, options: { viz, x, y, unit: options.unit } }
    }

    case 'bar': {
      const x = pick(frame, options.x, strings[0] ?? frame.fields.find((f) => f.type !== 'number')?.name)
      if (!x) return { ok: false, message: options.x ? `Field not found: ${options.x}` : 'Bar chart needs a category field.' }
      const y = options.y[0] ?? numbers.find((n) => n !== x)
      if (!y) return { ok: false, message: 'Bar chart needs a numeric field.' }
      return { ok: true, options: { viz, x, y, reducer: options.reducer, unit: options.unit } }
    }

    case 'timeline': {
      const start = pick(frame, options.start, times[0])
      if (!start) {
        return { ok: false, message: options.start ? `Field not found: ${options.start}` : 'Timeline needs a time field.' }
      }
      const end = options.end ? pick(frame, options.end, undefined) : times.find((t) => t !== start)
      if (options.end && !end) return { ok: false, message: `Field not found: ${options.end}` }
      const label = options.label ? pick(frame, options.label, undefined) : strings[0]
      if (options.label && !label) return { ok: false, message: `Field not found: ${options.label}` }
      return { ok: true, options: { viz, start, end: end ?? null, label: label ?? null } }
    }
  }
}

/* -------------------------------------------------------- chart builders */

export interface Series {
  name: string
  points: Array<{ x: number; y: number }>
}

/** Numeric series against a time field, sorted by time, skipping null points. */
export function buildSeries(frame: DataFrame, x: string, ys: string[]): Series[] {
  const xs = findField(frame, x)?.values ?? []
  return ys.map((name) => {
    const values = findField(frame, name)?.values ?? []
    const points: Series['points'] = []
    for (let i = 0; i < frame.length; i++) {
      const xv = xs[i]
      const yv = values[i]
      if (typeof xv === 'number' && typeof yv === 'number' && Number.isFinite(yv)) points.push({ x: xv, y: yv })
    }
    points.sort((a, b) => a.x - b.x)
    return { name, points }
  })
}

export function buildBars(frame: DataFrame, x: string, y: string, reducer: Reducer) {
  const categories = findField(frame, x)?.values ?? []
  const values = findField(frame, y)?.values ?? []
  return aggregateBy(categories, values, reducer)
}

export interface TimelineEvent {
  lane: string
  start: number
  end: number | null
  row: number
}

export interface TimelineData {
  lanes: string[]
  events: TimelineEvent[]
  min: number
  max: number
}

/** Group events into lanes (first-seen order) and compute the overall time range. */
export function buildTimeline(frame: DataFrame, start: string, end: string | null, label: string | null): TimelineData {
  const starts = findField(frame, start)?.values ?? []
  const ends = end ? (findField(frame, end)?.values ?? []) : []
  const labels = label ? (findField(frame, label)?.values ?? []) : []
  const lanes: string[] = []
  const events: TimelineEvent[] = []
  let min = Infinity
  let max = -Infinity

  for (let row = 0; row < frame.length; row++) {
    const s = starts[row]
    if (typeof s !== 'number') continue
    const rawEnd = ends[row]
    const e = typeof rawEnd === 'number' && rawEnd >= s ? rawEnd : null
    const laneValue: CellValue = label ? (labels[row] ?? null) : null
    const lane = label ? (laneValue === null ? '(none)' : String(laneValue)) : 'Events'
    if (!lanes.includes(lane)) lanes.push(lane)
    events.push({ lane, start: s, end: e, row })
    min = Math.min(min, s)
    max = Math.max(max, e ?? s)
  }
  return { lanes, events, min, max }
}

/* ------------------------------------------------- import / export */

export function serializeDashboard(dashboard: Dashboard): string {
  return JSON.stringify(dashboard, null, 2)
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback)
const FIELD_TYPES = ['auto', 'string', 'number', 'time', 'boolean']

function parseColumn(raw: unknown): ColumnDef | null {
  if (typeof raw === 'string') return { selector: raw, alias: '', type: 'auto' }
  if (!isRecord(raw)) return null
  const type = str(raw.type, 'auto')
  return {
    selector: str(raw.selector),
    alias: str(raw.alias),
    type: (FIELD_TYPES.includes(type) ? type : 'auto') as ColumnDef['type'],
  }
}

function parsePanel(raw: unknown, index: number): PanelConfig {
  if (!isRecord(raw)) throw new Error(`Panel ${index + 1} must be an object.`)
  const viz = str(raw.viz, 'table')
  if (!VIZ_TYPES.some((v) => v.value === viz)) throw new Error(`Panel ${index + 1}: unknown viz "${viz}".`)
  const width = PANEL_WIDTHS.some((w) => w.value === raw.width) ? (raw.width as PanelWidth) : 6
  const query = isRecord(raw.query) ? raw.query : {}
  const columns = Array.isArray(query.columns) ? query.columns.map(parseColumn).filter((c) => c !== null) : []
  const opts = isRecord(raw.options) ? raw.options : {}
  const reducer = str(opts.reducer, 'last')
  return createPanel({
    id: str(raw.id) || undefined,
    title: str(raw.title, 'Untitled'),
    viz: viz as VizType,
    width,
    query: { root: str(query.root), columns },
    options: {
      x: str(opts.x),
      y: Array.isArray(opts.y) ? opts.y.filter((y): y is string => typeof y === 'string') : typeof opts.y === 'string' ? [opts.y] : [],
      reducer: (REDUCERS as string[]).includes(reducer) ? (reducer as Reducer) : 'last',
      start: str(opts.start),
      end: str(opts.end),
      label: str(opts.label),
      unit: str(opts.unit),
    },
  })
}

/** Parse and normalize an exported dashboard, filling defaults for missing fields. */
export function parseDashboard(text: string): { ok: true; dashboard: Dashboard } | { ok: false; message: string } {
  try {
    const raw: unknown = JSON.parse(text)
    if (!isRecord(raw) || !Array.isArray(raw.panels)) {
      return { ok: false, message: 'Expected an object with a "panels" array.' }
    }
    const panels = raw.panels.map(parsePanel)
    const seen = new Set<string>()
    for (const panel of panels) {
      if (seen.has(panel.id)) panel.id = newPanelId()
      seen.add(panel.id)
    }
    return { ok: true, dashboard: { version: 1, title: str(raw.title, 'Dashboard'), panels } }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

/* ------------------------------------------------------------ example */

/** A deterministic sample document that exercises every visualization. */
export function exampleData(): JsonValue {
  const base = Date.UTC(2026, 9, 19, 0, 0, 0)
  const hour = 3600 * 1000
  const metrics = Array.from({ length: 24 }, (_, i) => {
    const load = 0.55 + 0.45 * Math.sin(((i - 6) / 24) * 2 * Math.PI)
    const requests = Math.round(800 + 2600 * load + ((i * 137) % 180))
    return {
      time: new Date(base + i * hour).toISOString(),
      requests,
      errors: Math.round(requests * (0.004 + (i === 15 ? 0.03 : 0))),
      latency: { p50: Math.round(90 + 60 * load), p95: Math.round(180 + 160 * load + (i === 15 ? 240 : 0)) },
    }
  })
  const deploy = (version: string, env: string, startH: number, minutes: number, status: string) => ({
    version,
    env,
    status,
    started: new Date(base + startH * hour).toISOString(),
    finished: new Date(base + startH * hour + minutes * 60 * 1000).toISOString(),
  })
  return {
    service: 'checkout-api',
    metrics,
    deploys: [
      deploy('2.4.0', 'staging', 2, 35, 'success'),
      deploy('2.4.0', 'production', 5, 80, 'success'),
      deploy('2.4.1', 'staging', 11, 25, 'success'),
      deploy('2.4.1', 'production', 14.5, 95, 'rolled_back'),
      deploy('2.4.2', 'staging', 18, 30, 'success'),
      deploy('2.4.2', 'production', 20, 70, 'success'),
    ],
    endpoints: [
      { path: '/cart', method: 'GET', requests: 21840 },
      { path: '/checkout', method: 'POST', requests: 9120 },
      { path: '/cart/items', method: 'POST', requests: 14310 },
      { path: '/payment', method: 'POST', requests: 8640 },
      { path: '/health', method: 'GET', requests: 2880 },
    ],
  }
}

export function exampleDashboard(): Dashboard {
  return {
    version: 1,
    title: 'checkout-api overview',
    panels: [
      createPanel({ title: 'Requests (24h)', viz: 'stat', width: 4, query: { root: '$.metrics', columns: [] }, options: { y: ['requests'], reducer: 'sum' } }),
      createPanel({ title: 'Errors (24h)', viz: 'stat', width: 4, query: { root: '$.metrics', columns: [] }, options: { y: ['errors'], reducer: 'sum' } }),
      createPanel({ title: 'Peak p95 latency', viz: 'stat', width: 4, query: { root: '$.metrics', columns: [] }, options: { y: ['latency.p95'], reducer: 'max', unit: 'ms' } }),
      createPanel({
        title: 'Latency',
        viz: 'timeseries',
        width: 8,
        query: {
          root: '$.metrics',
          columns: [
            { selector: 'time', alias: '', type: 'time' },
            { selector: 'latency.p50', alias: 'p50', type: 'number' },
            { selector: 'latency.p95', alias: 'p95', type: 'number' },
          ],
        },
        options: { unit: 'ms' },
      }),
      createPanel({ title: 'Requests by endpoint', viz: 'bar', width: 4, query: { root: '$.endpoints', columns: [] }, options: { x: 'path', y: ['requests'], reducer: 'sum' } }),
      createPanel({ title: 'Deploys', viz: 'timeline', width: 8, query: { root: '$.deploys', columns: [] }, options: { start: 'started', end: 'finished', label: 'env' } }),
      createPanel({ title: 'Throughput', viz: 'timeseries', width: 4, query: { root: '$.metrics', columns: [] }, options: { y: ['requests'] } }),
      createPanel({ title: 'Rolled-back deploys', viz: 'table', width: 12, query: { root: "$.deploys[?(@.status == 'rolled_back')]", columns: [] } }),
    ],
  }
}
