import React from 'react'
import { CATEGORIES } from '../logic.js'

export function CategoryVolumeBars({ weeks }) {
  const totals = new Map()
  for (const week of weeks) {
    for (const [category, value] of Object.entries(week.values)) {
      totals.set(category, (totals.get(category) || 0) + value)
    }
  }
  const rows = [...totals.entries()]
    .map(([category, total]) => ({
      category,
      total: Math.round(total * 10) / 10,
      label: CATEGORIES[category]?.label || category,
      color: CATEGORIES[category]?.color || 'var(--muted)',
    }))
    .sort((a, b) => b.total - a.total)
  const max = Math.max(0, ...rows.map((r) => r.total))
  if (rows.length === 0 || max <= 0) {
    return <div className="wk-empty is-inline">No numeric volume this week yet.</div>
  }
  return (
    <div className="wk-bar-list">
      {rows.map((row) => (
        <div key={row.category} className="wk-bar-row">
          <span className="wk-bar-label">{row.label}</span>
          <div className="wk-bar-track">
            <div className="wk-bar-fill" style={{ width: `${Math.max(3, Math.min(100, (row.total / max) * 100))}%`, background: row.color }} />
          </div>
          <span className="wk-bar-label is-right">{row.total}</span>
        </div>
      ))}
    </div>
  )
}
