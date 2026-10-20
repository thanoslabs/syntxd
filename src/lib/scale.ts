/** Axis helpers for the dashboard charts: nice numeric ticks, time ticks, and label formatting. */

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const FIXED_STEPS = [
  SECOND,
  5 * SECOND,
  15 * SECOND,
  30 * SECOND,
  MINUTE,
  5 * MINUTE,
  15 * MINUTE,
  30 * MINUTE,
  HOUR,
  3 * HOUR,
  6 * HOUR,
  12 * HOUR,
]
const DAY_STEPS = [1, 2, 7, 14]
const MONTH_STEPS = [1, 3, 6, 12]

export interface NumericTicks {
  min: number
  max: number
  ticks: number[]
}

export interface TimeTicks {
  ticks: number[]
  /** Approximate tick spacing in ms, used to pick a label format. */
  step: number
}

function niceStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / magnitude
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return nice * magnitude
}

/** Expand [min, max] to round bounds and return evenly spaced, round ticks. */
export function niceTicks(min: number, max: number, count = 5): NumericTicks {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] }
  if (min > max) [min, max] = [max, min]
  if (min === max) {
    const pad = min === 0 ? 1 : Math.abs(min) * 0.1
    min -= min === 0 ? 0 : pad
    max += pad
  }
  const step = niceStep((max - min) / Math.max(1, count))
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const decimals = Math.max(0, -Math.floor(Math.log10(step)))
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(decimals)))
  return { min: ticks[0], max: ticks[ticks.length - 1], ticks }
}

/** Ticks aligned to local clock/calendar boundaries, at most roughly `count` of them. */
export function timeTicks(min: number, max: number, count = 6): TimeTicks {
  const span = max - min
  if (!Number.isFinite(span) || span <= 0) return { ticks: Number.isFinite(min) ? [min] : [], step: HOUR }

  for (const step of FIXED_STEPS) {
    if (span / step > count) continue
    const offset = -new Date(min).getTimezoneOffset() * MINUTE
    const ticks: number[] = []
    for (let t = Math.ceil((min + offset) / step) * step - offset; t <= max; t += step) ticks.push(t)
    return { ticks, step }
  }

  for (const days of DAY_STEPS) {
    if (span / (days * DAY) > count) continue
    const d = new Date(min)
    d.setHours(0, 0, 0, 0)
    if (d.getTime() < min) d.setDate(d.getDate() + 1)
    const ticks: number[] = []
    for (; d.getTime() <= max; d.setDate(d.getDate() + days)) ticks.push(d.getTime())
    return { ticks, step: days * DAY }
  }

  const monthSpan = span / (30 * DAY)
  const months = MONTH_STEPS.find((m) => monthSpan / m <= count) ?? 12 * Math.ceil(niceStep(monthSpan / 12 / count))
  const d = new Date(min)
  d.setHours(0, 0, 0, 0)
  d.setDate(1)
  if (d.getTime() < min) d.setMonth(d.getMonth() + 1)
  while (d.getMonth() % Math.min(months, 12) !== 0) d.setMonth(d.getMonth() + 1)
  if (months > 12) while (d.getFullYear() % (months / 12) !== 0) d.setFullYear(d.getFullYear() + 1)
  const ticks: number[] = []
  for (; d.getTime() <= max; d.setMonth(d.getMonth() + months)) ticks.push(d.getTime())
  return { ticks, step: months * 30 * DAY }
}

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const plain = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })

/** Compact number label: 950, 1.2K, 3.4M. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  return Math.abs(value) >= 1000 ? compact.format(value) : plain.format(value)
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Format a tick label with precision matching the tick spacing. */
export function formatTimeTick(ms: number, step: number): string {
  const d = new Date(ms)
  if (step < MINUTE) return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  if (step < DAY) {
    const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
    return d.getHours() === 0 && d.getMinutes() === 0 ? `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}` : time
  }
  if (step < 28 * DAY) return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`
  if (step < 360 * DAY) return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
  return String(d.getFullYear())
}

/** Full timestamp for tooltips and tables: `2026-10-19 14:05:00`. */
export function formatDateTime(ms: number): string {
  const d = new Date(ms)
  const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  return `${date} ${time}`
}

/** Human duration: `45s`, `12m 5s`, `3h 20m`, `2d 4h`. */
export function formatDuration(ms: number): string {
  const s = Math.round(Math.abs(ms) / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`
  const days = Math.floor(h / 24)
  return h % 24 ? `${days}d ${h % 24}h` : `${days}d`
}

const grouped = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })

/** Headline number for stat tiles: grouped digits, compact only when very large. */
export function formatStat(value: number): string {
  return Math.abs(value) >= 1e7 ? compact.format(value) : grouped.format(value)
}

export function withUnit(text: string, unit: string): string {
  return unit ? `${text} ${unit}` : text
}
