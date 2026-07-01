import React from 'react'
import { CATEGORIES, categoryFamily } from '../logic.js'
import { SportIcon } from './SportIcon.jsx'

export function CategoryStats({ stats }) {
  if (stats.length === 0) {
    return <div className="wk-empty is-inline">No category data yet.</div>
  }
  return (
    <div className="wk-stat-grid">
      {stats.map((row) => {
        const fam = categoryFamily(row.category)
        // A duration-only cardio category (e.g. HIIT) would read "0 km";
        // fall back to minutes when no distance was ever logged.
        const volume = fam === 'strength'
          ? `${Math.round(row.strengthVolume)} kg-reps`
          : fam === 'cardio' && row.distanceKm > 0
            ? `${Math.round(row.distanceKm * 10) / 10} km`
            : `${Math.round(row.durationMin)} min`
        return (
          <div key={row.category} className="wk-stat-tile">
            <div className="wk-stat-head">
              <SportIcon name={CATEGORIES[row.category].icon} color={row.color} size={18} />
              <span className="wk-stat-label">{row.label}</span>
            </div>
            <div className="wk-stat-value">{volume}</div>
            <div className="wk-stat-label">{row.sessions} session{row.sessions === 1 ? '' : 's'} · {row.entries} entr{row.entries === 1 ? 'y' : 'ies'}</div>
          </div>
        )
      })}
    </div>
  )
}
