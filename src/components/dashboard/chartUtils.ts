import { useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { CellValue, FieldType } from '../../lib/frame'
import { formatDateTime } from '../../lib/scale'

/** Categorical slots are assigned in fixed order and never cycled; extra series are dropped. */
export const MAX_SERIES = 8
export const seriesColor = (index: number) => `var(--series-${index + 1})`

/** Rough width of a label in the 11px chart font, used for margins and truncation. */
export const CHAR_WIDTH = 6.6

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return maxChars <= 1 ? '…' : `${text.slice(0, maxChars - 1)}…`
}

/** Track an element's content width so SVG charts render at true pixel size. */
export function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

/** Horizontal bar with a 4px rounded data end and a square baseline end. */
export function barPath(x0: number, x1: number, y: number, h: number): string {
  const len = Math.abs(x1 - x0)
  const r = Math.min(4, len, h / 2)
  const dir = x1 >= x0 ? 1 : -1
  const xr = x1 - dir * r
  return [
    `M${x0},${y}`,
    `H${xr}`,
    `Q${x1},${y} ${x1},${y + r}`,
    `V${y + h - r}`,
    `Q${x1},${y + h} ${xr},${y + h}`,
    `H${x0}`,
    'Z',
  ].join(' ')
}

/** Keep a tooltip inside the chart: place it right of the anchor, or left when it would overflow. */
export function tooltipLeft(anchor: number, chartWidth: number, tooltipWidth = 200): number {
  return anchor + 12 + tooltipWidth > chartWidth ? Math.max(0, anchor - 12 - tooltipWidth) : anchor + 12
}

export function formatCell(value: CellValue, type: FieldType): string {
  if (value === null) return '—'
  if (type === 'time' && typeof value === 'number') return formatDateTime(value)
  return String(value)
}
