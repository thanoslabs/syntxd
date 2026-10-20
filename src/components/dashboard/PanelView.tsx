import { buildBars, buildSeries, buildTimeline } from '../../lib/dashboard'
import type { ResolveOutcome } from '../../lib/dashboard'
import { findField, reduceValues } from '../../lib/frame'
import type { DataFrame } from '../../lib/frame'
import { BarViz } from './BarViz'
import { StatViz } from './StatViz'
import { TableViz } from './TableViz'
import { TimelineViz } from './TimelineViz'
import { TimeSeriesViz } from './TimeSeriesViz'

interface PanelViewProps {
  frame: DataFrame
  resolved: ResolveOutcome
}

/** Render a resolved panel; data shaping happens in `lib/dashboard`, drawing in the viz components. */
export function PanelView({ frame, resolved }: PanelViewProps) {
  if (!resolved.ok) return <div className="viz-empty error">{resolved.message}</div>
  if (frame.length === 0) return <div className="viz-empty">The query matched no rows.</div>

  const options = resolved.options
  switch (options.viz) {
    case 'table':
      return <TableViz frame={frame} />
    case 'stat':
      return (
        <StatViz
          stats={options.fields.map((name) => ({
            name,
            value: reduceValues(findField(frame, name)?.values ?? [], options.reducer),
          }))}
          reducer={options.reducer}
          unit={options.unit}
        />
      )
    case 'timeseries':
      return <TimeSeriesViz series={buildSeries(frame, options.x, options.y)} unit={options.unit} />
    case 'bar':
      return <BarViz bars={buildBars(frame, options.x, options.y, options.reducer)} valueName={options.y} unit={options.unit} />
    case 'timeline':
      return <TimelineViz timeline={buildTimeline(frame, options.start, options.end, options.label)} frame={frame} />
  }
}
