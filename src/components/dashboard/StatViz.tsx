import type { Reducer } from '../../lib/frame'
import { formatStat } from '../../lib/scale'

interface StatVizProps {
  stats: Array<{ name: string; value: number | null }>
  reducer: Reducer
  unit: string
}

export function StatViz({ stats, reducer, unit }: StatVizProps) {
  return (
    <div className="viz-stats">
      {stats.map((s) => (
        <div key={s.name} className="viz-stat">
          <div className="viz-stat-value">
            {s.value === null ? '—' : formatStat(s.value)}
            {unit && s.value !== null && <span className="viz-stat-unit">{unit}</span>}
          </div>
          <div className="viz-stat-label">
            {reducer} of {s.name}
          </div>
        </div>
      ))}
    </div>
  )
}
