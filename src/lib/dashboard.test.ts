import { describe, expect, it } from 'vitest'
import {
  buildBars,
  buildSeries,
  buildTimeline,
  createPanel,
  DEFAULT_OPTIONS,
  exampleDashboard,
  exampleData,
  parseDashboard,
  resolveOptions,
  serializeDashboard,
} from './dashboard'
import { buildFrame } from './frame'
import type { DataFrame } from './frame'

const frame: DataFrame = {
  length: 3,
  fields: [
    { name: 'when', type: 'time', values: [3000, 1000, 2000] },
    { name: 'until', type: 'time', values: [3500, null, 1500] },
    { name: 'host', type: 'string', values: ['a', 'b', 'a'] },
    { name: 'cpu', type: 'number', values: [30, 10, null] },
    { name: 'mem', type: 'number', values: [1, 2, 3] },
  ],
}

describe('resolveOptions', () => {
  it('auto-picks fields per visualization', () => {
    expect(resolveOptions('timeseries', DEFAULT_OPTIONS, frame)).toEqual({
      ok: true,
      options: { viz: 'timeseries', x: 'when', y: ['cpu', 'mem'], unit: '' },
    })
    expect(resolveOptions('bar', DEFAULT_OPTIONS, frame)).toEqual({
      ok: true,
      options: { viz: 'bar', x: 'host', y: 'cpu', reducer: 'last', unit: '' },
    })
    expect(resolveOptions('stat', DEFAULT_OPTIONS, frame)).toMatchObject({ ok: true, options: { fields: ['cpu'] } })
    expect(resolveOptions('timeline', DEFAULT_OPTIONS, frame)).toEqual({
      ok: true,
      options: { viz: 'timeline', start: 'when', end: 'until', label: 'host' },
    })
  })

  it('honours explicit mappings and reports missing fields', () => {
    expect(resolveOptions('timeseries', { ...DEFAULT_OPTIONS, y: ['mem'] }, frame)).toMatchObject({
      ok: true,
      options: { y: ['mem'] },
    })
    expect(resolveOptions('stat', { ...DEFAULT_OPTIONS, y: ['nope'] }, frame)).toEqual({
      ok: false,
      message: 'Field not found: nope',
    })
    expect(resolveOptions('timeline', { ...DEFAULT_OPTIONS, end: 'nope' }, frame).ok).toBe(false)
  })

  it('explains when no suitable field exists', () => {
    const strings: DataFrame = { length: 1, fields: [{ name: 's', type: 'string', values: ['x'] }] }
    expect(resolveOptions('timeseries', DEFAULT_OPTIONS, strings)).toEqual({
      ok: false,
      message: 'Time series needs a time field.',
    })
    expect(resolveOptions('table', DEFAULT_OPTIONS, strings).ok).toBe(true)
  })
})

describe('chart builders', () => {
  it('builds sorted series without null points', () => {
    expect(buildSeries(frame, 'when', ['cpu'])).toEqual([
      { name: 'cpu', points: [{ x: 1000, y: 10 }, { x: 3000, y: 30 }] },
    ])
  })

  it('aggregates bars by category', () => {
    expect(buildBars(frame, 'host', 'mem', 'sum')).toEqual([
      { category: 'a', value: 4 },
      { category: 'b', value: 2 },
    ])
  })

  it('groups timeline events into lanes', () => {
    const timeline = buildTimeline(frame, 'when', 'until', 'host')
    expect(timeline.lanes).toEqual(['a', 'b'])
    expect(timeline.events).toEqual([
      { lane: 'a', start: 3000, end: 3500, row: 0 },
      { lane: 'b', start: 1000, end: null, row: 1 },
      { lane: 'a', start: 2000, end: null, row: 2 },
    ])
    expect([timeline.min, timeline.max]).toEqual([1000, 3500])
    expect(buildTimeline(frame, 'when', null, null).lanes).toEqual(['Events'])
  })
})

describe('import / export', () => {
  it('round-trips a dashboard', () => {
    const dashboard = exampleDashboard()
    expect(parseDashboard(serializeDashboard(dashboard))).toEqual({ ok: true, dashboard })
  })

  it('normalizes partial input', () => {
    const result = parseDashboard('{"panels":[{"viz":"bar","query":{"columns":["a",{"selector":"b","type":"bogus"}]},"options":{"y":"n"}}]}')
    if (!result.ok) throw new Error(result.message)
    const [panel] = result.dashboard.panels
    expect(panel.viz).toBe('bar')
    expect(panel.width).toBe(6)
    expect(panel.query.columns).toEqual([
      { selector: 'a', alias: '', type: 'auto' },
      { selector: 'b', alias: '', type: 'auto' },
    ])
    expect(panel.options.y).toEqual(['n'])
  })

  it('re-ids duplicate panels and rejects bad input', () => {
    const a = createPanel({ id: 'same' })
    const result = parseDashboard(JSON.stringify({ panels: [a, a] }))
    expect(result.ok && new Set(result.dashboard.panels.map((p) => p.id)).size).toBe(2)
    expect(parseDashboard('{"panels":[{"viz":"pie"}]}')).toEqual({ ok: false, message: 'Panel 1: unknown viz "pie".' })
    expect(parseDashboard('[]').ok).toBe(false)
    expect(parseDashboard('{').ok).toBe(false)
  })
})

describe('example', () => {
  it('every example panel resolves against the example data', () => {
    const data = exampleData()
    for (const panel of exampleDashboard().panels) {
      const outcome = buildFrame(data, panel.query)
      if (!outcome.ok) throw new Error(`${panel.title}: ${outcome.message}`)
      expect(outcome.frame.length, panel.title).toBeGreaterThan(0)
      expect(resolveOptions(panel.viz, panel.options, outcome.frame), panel.title).toMatchObject({ ok: true })
    }
  })
})
