import { useState } from 'react'
import type { TimelineData, TimelineEvent } from '../../lib/dashboard'
import type { DataFrame } from '../../lib/frame'
import { formatDateTime, formatDuration, formatTimeTick, timeTicks } from '../../lib/scale'
import { CHAR_WIDTH, formatCell, seriesColor, tooltipLeft, truncate, useElementWidth } from './chartUtils'

const MAX_LANES = 30
const ROW = 28
const BAR = 14
const AXIS = 22
const RIGHT = 16
const TOOLTIP_FIELDS = 6

interface TimelineVizProps {
  timeline: TimelineData
  frame: DataFrame
}

export function TimelineViz({ timeline, frame }: TimelineVizProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<TimelineEvent | null>(null)

  if (timeline.events.length === 0) return <div className="viz-empty">No events with a valid start time.</div>

  const lanes = timeline.lanes.slice(0, MAX_LANES)
  const events = timeline.events.filter((e) => lanes.includes(e.lane))
  // Pad a zero-width range so a single instant sits mid-chart.
  const pad = timeline.max === timeline.min ? 60_000 : 0
  const min = timeline.min - pad
  const max = timeline.max + pad

  const longest = Math.max(...lanes.map((l) => l.length))
  const labelW = Math.min(width * 0.3, 12 + longest * CHAR_WIDTH)
  const maxChars = Math.floor((labelW - 12) / CHAR_WIDTH)
  const plotW = Math.max(10, width - labelW - RIGHT)
  const height = lanes.length * ROW + AXIS
  const sx = (t: number) => labelW + ((t - min) / (max - min)) * plotW
  const laneY = (lane: string) => lanes.indexOf(lane) * ROW
  const ticks = timeTicks(min, max, Math.max(2, Math.floor(plotW / 90)))

  return (
    <div className="viz-chart">
      {timeline.lanes.length > MAX_LANES && (
        <div className="viz-note">Showing the first {MAX_LANES} of {timeline.lanes.length} lanes.</div>
      )}
      <div className="viz-plot" ref={ref}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label="Timeline of events">
            {ticks.ticks.map((t) => (
              <g key={t}>
                <line className="viz-grid" x1={sx(t)} x2={sx(t)} y1={0} y2={lanes.length * ROW} />
                <text className="viz-tick" x={sx(t)} y={height - 6} textAnchor="middle">
                  {formatTimeTick(t, ticks.step)}
                </text>
              </g>
            ))}
            {lanes.map((lane) => (
              <g key={lane}>
                <line className="viz-lane" x1={labelW} x2={labelW + plotW} y1={laneY(lane) + ROW} y2={laneY(lane) + ROW} />
                <text className="viz-label" x={labelW - 10} y={laneY(lane) + ROW / 2} dy="0.32em" textAnchor="end">
                  {truncate(lane, maxChars)}
                </text>
              </g>
            ))}
            {events.map((e) => {
              const active = hover === e
              const yMid = laneY(e.lane) + ROW / 2
              const handlers = { onMouseEnter: () => setHover(e), onMouseLeave: () => setHover(null) }
              if (e.end === null) {
                return (
                  <g key={e.row} {...handlers}>
                    <circle className="viz-hit-dot" cx={sx(e.start)} cy={yMid} r={10} />
                    <circle className={`viz-dot${active ? ' active' : ''}`} cx={sx(e.start)} cy={yMid} r={5} style={{ fill: seriesColor(0) }} />
                  </g>
                )
              }
              const x0 = sx(e.start)
              return (
                <rect
                  key={e.row}
                  {...handlers}
                  className={`viz-event${active ? ' active' : ''}`}
                  x={x0}
                  y={yMid - BAR / 2}
                  width={Math.max(3, sx(e.end) - x0)}
                  height={BAR}
                  rx={4}
                  style={{ fill: seriesColor(0) }}
                />
              )
            })}
          </svg>
        )}
        {hover && (
          <div className="viz-tooltip" style={{ left: tooltipLeft(sx(hover.end ?? hover.start), width, 240), top: laneY(hover.lane) + ROW }}>
            <div className="viz-tooltip-title">{hover.lane}</div>
            <div className="viz-tooltip-row">
              <span className="viz-tooltip-name">Start</span>
              <span className="viz-tooltip-value">{formatDateTime(hover.start)}</span>
            </div>
            {hover.end !== null && (
              <>
                <div className="viz-tooltip-row">
                  <span className="viz-tooltip-name">End</span>
                  <span className="viz-tooltip-value">{formatDateTime(hover.end)}</span>
                </div>
                <div className="viz-tooltip-row">
                  <span className="viz-tooltip-name">Duration</span>
                  <span className="viz-tooltip-value">{formatDuration(hover.end - hover.start)}</span>
                </div>
              </>
            )}
            {frame.fields
              .filter((f) => f.type !== 'time')
              .slice(0, TOOLTIP_FIELDS)
              .map((f) => (
                <div key={f.name} className="viz-tooltip-row">
                  <span className="viz-tooltip-name">{f.name}</span>
                  <span className="viz-tooltip-value">{formatCell(f.values[hover.row] ?? null, f.type)}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
