import React, { useMemo } from 'react'
import { recentExercises } from '../logic.js'
import { SportIcon } from './SportIcon.jsx'

export function QuickAddStrip({ entries, onQuickAdd }) {
  const recents = useMemo(() => recentExercises(entries, 5), [entries])
  if (!entries || entries.length === 0) {
    return (
      <div className="wk-quick-add">
        <div className="wk-quick-add-label">Quick add</div>
        <div className="wk-quick-chip-row">
          <button className="wk-quick-add-btn" onClick={() => onQuickAdd(null, null)}
            aria-label="Add new exercise">+ New exercise</button>
        </div>
      </div>
    )
  }
  return (
    <div className="wk-quick-add">
      <div className="wk-quick-add-label">
        <span>Quick add</span>
        <button className="wk-quick-add-btn" style={{ marginLeft: 0 }}
          onClick={() => onQuickAdd(null, null)} aria-label="Add new exercise">+ New</button>
      </div>
      <div className="wk-quick-chip-row">
        {recents.map((ex) => (
          <button
            key={ex.key}
            className="wk-quick-chip"
            onClick={() => onQuickAdd(ex, entries)}
            aria-label={`Quick-add ${ex.activity}`}
          >
            <SportIcon name={ex.icon} color={ex.color} size={15} />
            {ex.activity}
          </button>
        ))}
      </div>
    </div>
  )
}
