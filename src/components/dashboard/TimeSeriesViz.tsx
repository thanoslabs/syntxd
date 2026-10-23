import { useState } from 'react'
import type { MouseEvent } from 'react'
import type { Series } from '../../lib/dashboard'
import { formatDateTime, formatNumber, formatTimeTick, niceTicks, timeTicks, withUnit } from '../../lib/scale'
import { CHAR_WIDTH, MAX_SERIES, seriesColor, tooltipLeft, useElementWidth } from './chartUtils'

const HEIGHT = 220
const TOP = 10
const RIGHT = 16
const BOTTOM = 26

interface TimeSeriesVizProps {
  series: Series[]
  unit: string
}

export function TimeSeriesViz({ series, unit }: TimeSeriesVizProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [hoverX, setHoverX] = useState<number | null>(null)

  const shown = series.slice(0, MAX_SERIES)
  const points = shown.flatMap((s) => s.points)
  const xs = [...new Set(points.map((p) => p.x))].sort((a, b) => a - b)

  if (points.length === 0) return <div className="viz-empty">No numeric points with a valid time.</div>

  const xMin = xs[0]
  const xMax = xs[xs.length - 1]
  let yMin = Math.min(...points.map((p) => p.y))
  const yMax = Math.max(...points.map((p) => p.y))
  // Anchor at zero when the data sits close to it; otherwise zoom to the data range.
  if (yMin >= 0 && yMin < yMax - yMin) yMin = 0
  const y = niceTicks(yMin, yMax, 4)
  const yLabels = y.ticks.map(formatNumber)
  const left = 10 + Math.max(...yLabels.map((l) => l.length)) * CHAR_WIDTH
  const plotW = Math.max(10, width - left - RIGHT)
  const plotH = HEIGHT - TOP - BOTTOM

  const sx = (v: number) => left + (xMax === xMin ? plotW / 2 : ((v - xMin) / (xMax - xMin)) * plotW)
  const sy = (v: number) => TOP + plotH - ((v - y.min) / (y.max - y.min)) * plotH
  const xTicks = timeTicks(xMin, xMax, Math.max(2, Math.floor(plotW / 90)))

  function handleMove(event: MouseEvent<SVGRectElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const target = xMin + ((event.clientX - rect.left) / rect.width) * (xMax - xMin)
    let nearest = xs[0]
    for (const x of xs) if (Math.abs(x - target) < Math.abs(nearest - target)) nearest = x
    setHoverX(nearest)
  }

  const hoverRows =
    hoverX === null
      ? []
      : shown.map((s, i) => ({ name: s.name, color: seriesColor(i), point: s.points.find((p) => p.x === hoverX) }))

  return (
    <div className="viz-chart">
      {shown.length > 1 && (
        <ul className="viz-legend">
          {shown.map((s, i) => (
            <li key={s.name}>
              <span className="viz-swatch" style={{ background: seriesColor(i) }} />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      {series.length > MAX_SERIES && <div className="viz-note">Showing the first {MAX_SERIES} of {series.length} series.</div>}

      <div className="viz-plot" ref={ref}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label={`Time series of ${shown.map((s) => s.name).join(', ')}`}>
            {y.ticks.map((t, i) => (
              <g key={t}>
                <line className="viz-grid" x1={left} x2={left + plotW} y1={sy(t)} y2={sy(t)} />
                <text className="viz-tick" x={left - 8} y={sy(t)} dy="0.32em" textAnchor="end">
                  {yLabels[i]}
                </text>
              </g>
            ))}
            {xTicks.ticks.map((t) => (
              <text key={t} className="viz-tick" x={sx(t)} y={HEIGHT - 8} textAnchor="middle">
                {formatTimeTick(t, xTicks.step)}
              </text>
            ))}

            {shown.length === 1 && shown[0].points.length > 1 && (
              <path
                className="viz-area"
                style={{ fill: seriesColor(0) }}
                d={`${shown[0].points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x)},${sy(p.y)}`).join(' ')} L${sx(shown[0].points.at(-1)!.x)},${sy(y.min)} L${sx(shown[0].points[0].x)},${sy(y.min)} Z`}
              />
            )}
            {shown.map((s, i) =>
              s.points.length === 1 ? (
                <circle key={s.name} className="viz-dot" cx={sx(s.points[0].x)} cy={sy(s.points[0].y)} r={4} style={{ fill: seriesColor(i) }} />
              ) : (
                <path
                  key={s.name}
                  className="viz-line"
                  style={{ stroke: seriesColor(i) }}
                  d={s.points.map((p, j) => `${j ? 'L' : 'M'}${sx(p.x)},${sy(p.y)}`).join(' ')}
                />
              ),
            )}

            {hoverX !== null && (
              <g>
                <line className="viz-crosshair" x1={sx(hoverX)} x2={sx(hoverX)} y1={TOP} y2={TOP + plotH} />
                {hoverRows.map(
                  (r) => r.point && <circle key={r.name} className="viz-dot" cx={sx(r.point.x)} cy={sy(r.point.y)} r={4} style={{ fill: r.color }} />,
                )}
              </g>
            )}
            <rect
              className="viz-hit"
              x={left}
              y={TOP}
              width={plotW}
              height={plotH}
              onMouseMove={handleMove}
              onMouseLeave={() => setHoverX(null)}
            />
          </svg>
        )}

        {hoverX !== null && (
          <div className="viz-tooltip" style={{ left: tooltipLeft(sx(hoverX), width), top: TOP }}>
            <div className="viz-tooltip-title">{formatDateTime(hoverX)}</div>
            {hoverRows.map((r) => (
              <div key={r.name} className="viz-tooltip-row">
                <span className="viz-swatch" style={{ background: r.color }} />
                <span className="viz-tooltip-name">{r.name}</span>
                <span className="viz-tooltip-value">{r.point ? withUnit(formatNumber(r.point.y), unit) : '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
