import { useState } from 'react'
import type { CellValue, DataFrame } from '../../lib/frame'
import { formatCell } from './chartUtils'

const MAX_ROWS = 500

function compare(a: CellValue, b: CellValue): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

export function TableViz({ frame }: { frame: DataFrame }) {
  const [sort, setSort] = useState<{ field: number; desc: boolean } | null>(null)

  if (frame.fields.length === 0) return <div className="viz-empty">No columns.</div>

  const order = Array.from({ length: frame.length }, (_, i) => i)
  if (sort) {
    const values = frame.fields[sort.field]?.values ?? []
    order.sort((a, b) => (sort.desc ? -1 : 1) * compare(values[a] ?? null, values[b] ?? null))
  }

  function toggleSort(field: number) {
    setSort((s) => (s?.field !== field ? { field, desc: false } : s.desc ? null : { field, desc: true }))
  }

  return (
    <div className="viz-table-wrap">
      <table className="viz-table">
        <thead>
          <tr>
            {frame.fields.map((f, i) => (
              <th
                key={f.name}
                className={f.type === 'number' ? 'num' : ''}
                aria-sort={sort?.field === i ? (sort.desc ? 'descending' : 'ascending') : undefined}
              >
                <button type="button" onClick={() => toggleSort(i)}>
                  {f.name}
                  <span className="viz-sort">{sort?.field === i ? (sort.desc ? '↓' : '↑') : ''}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {order.slice(0, MAX_ROWS).map((row) => (
            <tr key={row}>
              {frame.fields.map((f) => {
                const v = f.values[row] ?? null
                return (
                  <td key={f.name} className={`${f.type === 'number' ? 'num' : ''}${v === null ? ' null' : ''}`}>
                    {formatCell(v, f.type)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {frame.length > MAX_ROWS && <div className="viz-note">Showing {MAX_ROWS} of {frame.length} rows.</div>}
    </div>
  )
}
