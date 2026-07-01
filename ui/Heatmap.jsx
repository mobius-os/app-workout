import React, { useMemo } from 'react'
import { activeDays, localDate } from '../logic.js'

export function Heatmap({ entries }) {
  const days = useMemo(() => activeDays(entries), [entries])
  const today = new Date()
  const dow = today.getDay()
  const lastSunday = new Date(today)
  lastSunday.setDate(today.getDate() - dow)

  const WEEKS = 26
  const weeks = []
  for (let w = WEEKS - 1; w >= 0; w--) {
    const week = []
    for (let d = 0; d < 7; d++) {
      const cell = new Date(lastSunday)
      cell.setDate(lastSunday.getDate() - w * 7 + d)
      const iso = localDate(cell)
      week.push({ iso, has: days.has(iso), isFuture: cell > today })
    }
    weeks.push(week)
  }
  const cell = 11, gap = 2
  const W = WEEKS * (cell + gap), H = 7 * (cell + gap)
  // Count within the rendered window so the label matches what's drawn.
  const count = weeks.flat().filter((d) => d.has).length
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="wk-heatmap" preserveAspectRatio="xMidYMid meet"
      role="img" aria-label={`Activity heatmap: ${count} active day${count === 1 ? '' : 's'} in the last ${WEEKS} weeks`}>
      {weeks.map((week, wi) => week.map((d, di) => (
        <rect key={`${wi}-${di}`}
          x={wi * (cell + gap)} y={di * (cell + gap)} width={cell} height={cell} rx={2}
          fill={d.isFuture ? 'transparent' : d.has ? 'var(--accent)' : 'var(--border)'}
          opacity={d.isFuture ? 0 : d.has ? 1 : 0.4}>
          <title>{d.iso}{d.has ? ' · active' : ''}</title>
        </rect>
      )))}
    </svg>
  )
}
