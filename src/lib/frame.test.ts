import { describe, expect, it } from 'vitest'
import type { JsonValue } from './json'
import { aggregateBy, buildFrame, coerce, getAt, inferColumns, inferType, parseTime, reduceValues, selectRows } from './frame'

const doc: JsonValue = {
  items: [
    { name: 'a', n: 1, at: '2026-01-01T00:00:00Z', meta: { ok: true, score: '5' } },
    { name: 'b', n: 2, at: '2026-01-02T00:00:00Z', meta: { ok: false, score: '7.5' }, extra: 'x' },
  ],
  'odd key': { 'a b': 3 },
}

describe('selectRows', () => {
  it('uses the document (or its items) when the root is empty', () => {
    expect(selectRows([1, 2], '')).toEqual({ ok: true, rows: [1, 2] })
    expect(selectRows({ a: 1 }, '$')).toEqual({ ok: true, rows: [{ a: 1 }] })
  })

  it('unwraps a single array result', () => {
    const result = selectRows(doc, '$.items')
    expect(result.ok && result.rows).toHaveLength(2)
  })

  it('returns each match for multi-result queries', () => {
    expect(selectRows(doc, '$.items[*].n')).toEqual({ ok: true, rows: [1, 2] })
  })

  it('reports invalid JSONPath', () => {
    expect(selectRows(doc, '$.[').ok).toBe(false)
  })
})

describe('getAt', () => {
  const row: JsonValue = { a: { b: [10, { c: 'deep' }] }, 'x y': 1, 'dash-key': 2 }

  it('reads simple dotted and indexed paths', () => {
    expect(getAt(row, 'a.b[0]')).toBe(10)
    expect(getAt(row, 'a.b[1].c')).toBe('deep')
    expect(getAt(row, 'dash-key')).toBe(2)
  })

  it('falls back to JSONPath for bracketed keys', () => {
    expect(getAt(row, "['x y']")).toBe(1)
    expect(getAt(row, "$['x y']")).toBe(1)
  })

  it('returns the row for an empty selector and undefined when missing', () => {
    expect(getAt(5, '')).toBe(5)
    expect(getAt(row, 'a.nope.c')).toBeUndefined()
    expect(getAt(row, 'a.b[9]')).toBeUndefined()
  })
})

describe('inferColumns', () => {
  it('unions keys across rows and flattens nested objects', () => {
    const result = selectRows(doc, '$.items')
    const columns = result.ok ? inferColumns(result.rows) : []
    expect(columns.map((c) => c.selector)).toEqual(['name', 'n', 'at', 'meta.ok', 'meta.score', 'extra'])
  })

  it('quotes non-identifier keys', () => {
    expect(inferColumns([{ 'a b': { c: 1 } }]).map((c) => c.selector)).toEqual(["['a b'].c"])
  })

  it('uses a single value column for primitive rows', () => {
    expect(inferColumns([1, 2])).toEqual([{ selector: '', alias: 'value', type: 'auto' }])
  })
})

describe('type inference & coercion', () => {
  it('infers types from values', () => {
    expect(inferType([1, 2, null])).toBe('number')
    expect(inferType(['1', '2.5'])).toBe('number')
    expect(inferType([true, false])).toBe('boolean')
    expect(inferType(['2026-01-01', '2026-01-02T10:00:00Z'])).toBe('time')
    expect(inferType(['a', 1])).toBe('string')
    expect(inferType([])).toBe('string')
  })

  it('treats epoch numbers as time only when the name suggests it', () => {
    expect(inferType([1760000000], 'created_at')).toBe('time')
    expect(inferType([1760000000], 'timestamp')).toBe('time')
    expect(inferType([1760000000], 'format')).toBe('number')
    expect(inferType([12], 'time')).toBe('number')
  })

  it('parses seconds, milliseconds, and date strings', () => {
    expect(parseTime(1760000000)).toBe(1760000000000)
    expect(parseTime(1760000000000)).toBe(1760000000000)
    expect(parseTime('1760000000')).toBe(1760000000000)
    expect(parseTime('2026-01-01T00:00:00Z')).toBe(Date.UTC(2026, 0, 1))
    expect(parseTime('nope')).toBeNull()
  })

  it('coerces values to the requested type', () => {
    expect(coerce('7.5', 'number')).toBe(7.5)
    expect(coerce('x', 'number')).toBeNull()
    expect(coerce('true', 'boolean')).toBe(true)
    expect(coerce({ a: 1 }, 'string')).toBe('{"a":1}')
    expect(coerce(undefined, 'string')).toBeNull()
  })
})

describe('buildFrame', () => {
  it('infers columns and types', () => {
    const outcome = buildFrame(doc, { root: '$.items', columns: [] })
    if (!outcome.ok) throw new Error(outcome.message)
    const { frame } = outcome
    expect(frame.length).toBe(2)
    expect(frame.fields.map((f) => [f.name, f.type])).toEqual([
      ['name', 'string'],
      ['n', 'number'],
      ['at', 'time'],
      ['meta.ok', 'boolean'],
      ['meta.score', 'number'],
      ['extra', 'string'],
    ])
    expect(frame.fields[2].values).toEqual([Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 2)])
    expect(frame.fields[5].values).toEqual([null, 'x'])
  })

  it('applies explicit columns, aliases, and types, de-duplicating names', () => {
    const outcome = buildFrame(doc, {
      root: '$.items',
      columns: [
        { selector: 'meta.score', alias: 'score', type: 'auto' },
        { selector: 'n', alias: 'score', type: 'string' },
        { selector: '', alias: '', type: 'auto' },
      ],
    })
    if (!outcome.ok) throw new Error(outcome.message)
    expect(outcome.frame.fields.map((f) => f.name)).toEqual(['score', 'score (2)'])
    expect(outcome.frame.fields[0].values).toEqual([5, 7.5])
    expect(outcome.frame.fields[1].values).toEqual(['1', '2'])
  })

  it('propagates JSONPath errors', () => {
    expect(buildFrame(doc, { root: '$[?(', columns: [] }).ok).toBe(false)
  })
})

describe('reducers', () => {
  const values = [3, null, 1, 'x', 5]

  it('reduces numeric values', () => {
    expect(reduceValues(values, 'first')).toBe(3)
    expect(reduceValues(values, 'last')).toBe(5)
    expect(reduceValues(values, 'sum')).toBe(9)
    expect(reduceValues(values, 'mean')).toBe(3)
    expect(reduceValues(values, 'min')).toBe(1)
    expect(reduceValues(values, 'max')).toBe(5)
    expect(reduceValues(values, 'count')).toBe(4)
    expect(reduceValues([null], 'sum')).toBeNull()
  })

  it('aggregates by category in first-seen order', () => {
    expect(aggregateBy(['b', 'a', 'b', null], [1, 2, 3, 4], 'sum')).toEqual([
      { category: 'b', value: 4 },
      { category: 'a', value: 2 },
      { category: '(null)', value: 4 },
    ])
  })
})
