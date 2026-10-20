import type { JsonValue } from './json'
import { queryJsonPath } from './jsonpath'

/**
 * A small, Grafana-Infinity-style data frame layer: a root JSONPath selects the
 * "rows" of a document, and per-column selectors (relative to each row) pick,
 * rename, and type the fields shown by dashboard visualizations.
 */

export type FieldType = 'string' | 'number' | 'time' | 'boolean'
export type CellValue = string | number | boolean | null

export interface ColumnDef {
  /** Path relative to each row: `a.b`, `a[0]`, `['odd key']`, or `$…`. Empty = the row itself. */
  selector: string
  /** Display name; defaults to the selector. */
  alias: string
  type: FieldType | 'auto'
}

export interface FrameQuery {
  /** JSONPath selecting the rows. Empty = the document (or its items if it's an array). */
  root: string
  /** Columns to extract. Empty = infer from the rows. */
  columns: ColumnDef[]
}

export interface Field {
  name: string
  type: FieldType
  /** Coerced values; `time` fields hold epoch milliseconds. */
  values: CellValue[]
}

export interface DataFrame {
  fields: Field[]
  length: number
}

export type FrameOutcome = { ok: true; frame: DataFrame } | { ok: false; message: string }

export type Reducer = 'last' | 'first' | 'sum' | 'mean' | 'min' | 'max' | 'count'

export const REDUCERS: Reducer[] = ['last', 'first', 'sum', 'mean', 'min', 'max', 'count']

const INFER_SAMPLE = 200
const INFER_DEPTH = 2
const SIMPLE_PATH = /^[A-Za-z_$][\w$-]*(?:\.[A-Za-z_$][\w$-]*|\[\d+\])*$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/
const NUMERIC = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i
const TIME_NAME = /(?:^|[_\-.\s])(?:[Tt]ime(?:stamp)?|[Dd]ate(?:time)?|ts|TS)$|[a-z](?:Time|Date|At|Timestamp)$|_at$/
const IDENT = /^[A-Za-z_$][\w$]*$/

function isObject(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Select the rows a frame is built from. A single array result is unwrapped into its items. */
export function selectRows(value: JsonValue, root: string): { ok: true; rows: JsonValue[] } | { ok: false; message: string } {
  const trimmed = root.trim()
  if (trimmed === '' || trimmed === '$') {
    return { ok: true, rows: Array.isArray(value) ? value : [value] }
  }
  const outcome = queryJsonPath(value, trimmed)
  if (!outcome.ok) return outcome
  const first = outcome.results[0]?.value
  if (outcome.results.length === 1 && Array.isArray(first)) return { ok: true, rows: first }
  return { ok: true, rows: outcome.results.map((r) => r.value) }
}

/** Read a column selector relative to a row; `undefined` when the path is missing. */
export function getAt(row: JsonValue, selector: string): JsonValue | undefined {
  const sel = selector.trim()
  if (sel === '' || sel === '$') return row

  if (SIMPLE_PATH.test(sel)) {
    let current: JsonValue | undefined = row
    for (const part of sel.split(/\.|(?=\[)/)) {
      if (current === undefined) return undefined
      if (part.startsWith('[')) {
        current = Array.isArray(current) ? current[Number(part.slice(1, -1))] : undefined
      } else {
        current = isObject(current) ? current[part] : undefined
      }
    }
    return current
  }

  const query = sel.startsWith('$') ? sel : sel.startsWith('[') ? `$${sel}` : `$.${sel}`
  const outcome = queryJsonPath(row, query)
  return outcome.ok ? outcome.results[0]?.value : undefined
}

function childSelector(parent: string, key: string): string {
  if (IDENT.test(key)) return parent === '' ? key : `${parent}.${key}`
  return `${parent}['${key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`
}

/** Infer columns from the first rows: the union of primitive keys, nested objects flattened. */
export function inferColumns(rows: JsonValue[]): ColumnDef[] {
  const seen = new Set<string>()
  const columns: ColumnDef[] = []
  let sawPrimitive = false

  const visit = (value: JsonValue, prefix: string, depth: number) => {
    for (const [key, child] of Object.entries(value as { [key: string]: JsonValue })) {
      const selector = childSelector(prefix, key)
      if (isObject(child) && depth < INFER_DEPTH) {
        visit(child, selector, depth + 1)
      } else if (!seen.has(selector)) {
        seen.add(selector)
        columns.push({ selector, alias: '', type: 'auto' })
      }
    }
  }

  for (const row of rows.slice(0, INFER_SAMPLE)) {
    if (isObject(row)) visit(row, '', 1)
    else sawPrimitive = true
  }

  if (sawPrimitive && columns.length === 0) return [{ selector: '', alias: 'value', type: 'auto' }]
  return columns
}

/** Convert a number or date-like string to epoch milliseconds. Small numbers are treated as seconds. */
export function parseTime(value: JsonValue | undefined): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    return Math.abs(value) < 1e11 ? value * 1000 : value
  }
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (NUMERIC.test(text)) return parseTime(Number(text))
  const ms = Date.parse(text)
  return Number.isNaN(ms) ? null : ms
}

/** Pick a field type from raw values; `name` hints that epoch numbers are timestamps. */
export function inferType(values: (JsonValue | undefined)[], name = ''): FieldType {
  const present = values.filter((v): v is JsonValue => v !== null && v !== undefined)
  if (present.length === 0) return 'string'

  if (present.every((v) => typeof v === 'number')) {
    const epochish = present.every((v) => (v as number) > 1e9)
    return epochish && TIME_NAME.test(name) ? 'time' : 'number'
  }
  if (present.every((v) => typeof v === 'boolean')) return 'boolean'
  if (present.every((v) => typeof v === 'string')) {
    const strings = present as string[]
    if (strings.every((s) => ISO_DATE.test(s.trim()) && !Number.isNaN(Date.parse(s)))) return 'time'
    if (strings.every((s) => NUMERIC.test(s.trim()))) return 'number'
  }
  return 'string'
}

export function coerce(value: JsonValue | undefined, type: FieldType): CellValue {
  if (value === null || value === undefined) return null
  switch (type) {
    case 'number': {
      if (typeof value === 'number') return value
      if (typeof value === 'string' && NUMERIC.test(value.trim())) return Number(value)
      if (typeof value === 'boolean') return value ? 1 : 0
      return null
    }
    case 'time':
      return parseTime(value)
    case 'boolean':
      if (typeof value === 'boolean') return value
      if (value === 'true' || value === 'false') return value === 'true'
      if (typeof value === 'number') return value !== 0
      return null
    case 'string':
      return typeof value === 'string' ? value : JSON.stringify(value)
  }
}

/** Build a typed data frame from a document and an Infinity-style query. */
export function buildFrame(value: JsonValue, query: FrameQuery): FrameOutcome {
  const selected = selectRows(value, query.root)
  if (!selected.ok) return selected
  const rows = selected.rows

  const columns = query.columns.filter((c) => c.selector.trim() !== '' || c.alias.trim() !== '')
  const defs = columns.length > 0 ? columns : inferColumns(rows)

  const used = new Map<string, number>()
  const fields = defs.map((def): Field => {
    const raw = rows.map((row) => getAt(row, def.selector))
    let name = def.alias.trim() || def.selector.trim() || 'value'
    const count = used.get(name) ?? 0
    used.set(name, count + 1)
    if (count > 0) name = `${name} (${count + 1})`
    const type = def.type === 'auto' ? inferType(raw.slice(0, INFER_SAMPLE), name) : def.type
    return { name, type, values: raw.map((v) => coerce(v, type)) }
  })

  return { ok: true, frame: { fields, length: rows.length } }
}

export function findField(frame: DataFrame, name: string): Field | undefined {
  return frame.fields.find((f) => f.name === name)
}

/** Reduce a field's numeric values to a single number; `null` when nothing to reduce. */
export function reduceValues(values: CellValue[], reducer: Reducer): number | null {
  if (reducer === 'count') return values.filter((v) => v !== null).length
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (nums.length === 0) return null
  switch (reducer) {
    case 'last':
      return nums[nums.length - 1]
    case 'first':
      return nums[0]
    case 'sum':
      return nums.reduce((a, b) => a + b, 0)
    case 'mean':
      return nums.reduce((a, b) => a + b, 0) / nums.length
    case 'min':
      return Math.min(...nums)
    case 'max':
      return Math.max(...nums)
  }
}

/** Group `values` by `categories` (first-seen order) and reduce each group. */
export function aggregateBy(
  categories: CellValue[],
  values: CellValue[],
  reducer: Reducer,
): Array<{ category: string; value: number }> {
  const groups = new Map<string, CellValue[]>()
  categories.forEach((c, i) => {
    const key = c === null ? '(null)' : String(c)
    const group = groups.get(key)
    if (group) group.push(values[i] ?? null)
    else groups.set(key, [values[i] ?? null])
  })
  const out: Array<{ category: string; value: number }> = []
  for (const [category, group] of groups) {
    const value = reduceValues(group, reducer)
    if (value !== null) out.push({ category, value })
  }
  return out
}
