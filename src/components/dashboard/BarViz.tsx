import { useState } from 'react'
import { formatNumber, niceTicks, withUnit } from '../../lib/scale'
import { CHAR_WIDTH, barPath, seriesColor, tooltipLeft, truncate, useElementWidth } from './chartUtils'

const MAX_BARS = 30
const ROW = 28
const BAR = 18
const AXIS = 22
const VALUE_SPACE = 56

interface BarVizProps {
  bars: Array<{ category: string; value: number }>
  valueName: string
  unit: string
}

export function BarViz({ bars, valueName, unit }: BarVizProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  if (bars.length === 0) return <div className="viz-empty">No numeric values to plot.</div>

  const rows = bars.slice(0, MAX_BARS)
  const values = rows.map((b) => b.value)
  const x = niceTicks(Math.min(0, ...values), Math.max(0, ...values), 4)
  const longest = Math.max(...rows.map((b) => b.category.length))
  const labelW = Math.min(width * 0.4, 12 + longest * CHAR_WIDTH)
  const maxChars = Math.floor((labelW - 12) / CHAR_WIDTH)
  const plotW = Math.max(10, width - labelW - VALUE_SPACE)
  const height = rows.length * ROW + AXIS
  const sx = (v: number) => labelW + ((v - x.min) / (x.max - x.min)) * plotW
  const hovered = hover === null ? null : rows[hover]

  return (
    <div className="viz-chart">
      {bars.length > MAX_BARS && <div className="viz-note">Showing the first {MAX_BARS} of {bars.length} categories.</div>}
      <div className="viz-plot" ref={ref}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`Bar chart of ${valueName}`}>
            {x.ticks.map((t) => (
              <g key={t}>
                <line className="viz-grid" x1={sx(t)} x2={sx(t)} y1={0} y2={rows.length * ROW} />
                <text className="viz-tick" x={sx(t)} y={height - 6} textAnchor="middle">
                  {formatNumber(t)}
                </text>
              </g>
            ))}
            {rows.map((b, i) => {
              const yTop = i * ROW + (ROW - BAR) / 2
              const tip = sx(b.value)
              return (
                <g key={b.category} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <rect className={`viz-row-hit${hover === i ? ' active' : ''}`} x={0} y={i * ROW} width={width} height={ROW} />
                  <text className="viz-label" x={labelW - 10} y={i * ROW + ROW / 2} dy="0.32em" textAnchor="end">
                    {truncate(b.category, maxChars)}
                  </text>
                  {b.value !== 0 && <path d={barPath(sx(0), tip, yTop, BAR)} style={{ fill: seriesColor(0) }} />}
                  <text
                    className="viz-value"
                    x={b.value < 0 ? tip - 6 : tip + 6}
                    y={i * ROW + ROW / 2}
                    dy="0.32em"
                    textAnchor={b.value < 0 ? 'end' : 'start'}
                  >
                    {formatNumber(b.value)}
                  </text>
                </g>
              )
            })}
            <line className="viz-axis" x1={sx(0)} x2={sx(0)} y1={0} y2={rows.length * ROW} />
          </svg>
        )}
        {hovered && hover !== null && (
          <div className="viz-tooltip" style={{ left: tooltipLeft(sx(Math.max(0, hovered.value)), width), top: hover * ROW }}>
            <div className="viz-tooltip-title">{hovered.category}</div>
            <div className="viz-tooltip-row">
              <span className="viz-swatch" style={{ background: seriesColor(0) }} />
              <span className="viz-tooltip-name">{valueName}</span>
              <span className="viz-tooltip-value">{withUnit(formatNumber(hovered.value), unit)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
