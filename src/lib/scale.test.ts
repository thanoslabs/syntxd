import { describe, expect, it } from 'vitest'
import { formatDuration, formatNumber, formatStat, niceTicks, timeTicks, withUnit } from './scale'

describe('niceTicks', () => {
  it('rounds bounds outward to a nice step', () => {
    expect(niceTicks(3, 97, 5)).toEqual({ min: 0, max: 100, ticks: [0, 20, 40, 60, 80, 100] })
  })

  it('handles decimals without float noise', () => {
    expect(niceTicks(0.1, 0.27, 4).ticks).toEqual([0.1, 0.15, 0.2, 0.25, 0.3])
  })

  it('pads a flat range', () => {
    const { min, max } = niceTicks(50, 50)
    expect(min).toBeLessThan(50)
    expect(max).toBeGreaterThan(50)
    expect(niceTicks(0, 0).ticks).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
  })

  it('falls back for non-finite input', () => {
    expect(niceTicks(Infinity, -Infinity).ticks).toEqual([0, 1])
  })
})

describe('timeTicks', () => {
  const hour = 3600 * 1000
  const day = 24 * hour

  function check(min: number, max: number) {
    const { ticks, step } = timeTicks(min, max, 6)
    expect(ticks.length).toBeGreaterThan(0)
    expect(ticks.length).toBeLessThanOrEqual(8)
    for (const t of ticks) {
      expect(t).toBeGreaterThanOrEqual(min)
      expect(t).toBeLessThanOrEqual(max)
    }
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]).toBeGreaterThan(ticks[i - 1])
    return step
  }

  it('picks clock steps for sub-day spans', () => {
    const start = Date.UTC(2026, 0, 1, 0, 7)
    expect(check(start, start + 23 * hour)).toBe(6 * hour)
    expect(check(start, start + 50 * 1000)).toBe(15 * 1000)
  })

  it('picks day and month steps for longer spans', () => {
    const start = Date.UTC(2026, 0, 1, 12)
    expect(check(start, start + 10 * day)).toBe(2 * day)
    expect(check(start, start + 300 * day)).toBe(90 * day)
    check(start, start + 3000 * day)
  })

  it('handles an empty range', () => {
    expect(timeTicks(5, 5).ticks).toEqual([5])
  })
})

describe('formatting', () => {
  it('formats compact numbers', () => {
    expect(formatNumber(950)).toBe('950')
    expect(formatNumber(1.234)).toBe('1.23')
    expect(formatNumber(1250)).toBe('1.3K')
    expect(formatNumber(3_400_000)).toBe('3.4M')
  })

  it('formats durations', () => {
    expect(formatDuration(45_000)).toBe('45s')
    expect(formatDuration(725_000)).toBe('12m 5s')
    expect(formatDuration(3 * 3600_000 + 20 * 60_000)).toBe('3h 20m')
    expect(formatDuration(52 * 3600_000)).toBe('2d 4h')
  })
})

describe('stat formatting', () => {
  it('groups digits and only compacts very large numbers', () => {
    expect(formatStat(64824)).toBe('64,824')
    expect(formatStat(12.3456)).toBe('12.35')
    expect(formatStat(42_000_000)).toBe('42M')
    expect(withUnit('5', 'ms')).toBe('5 ms')
    expect(withUnit('5', '')).toBe('5')
  })
})
