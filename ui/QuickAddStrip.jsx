import React, { useMemo } from 'react'
import { recentExercises } from '../logic.js'
import { SportIcon } from './SportIcon.jsx'

export function QuickAddStrip({ entries, onQuickAdd, hasActiveEntries = false }) {
  const recents = useMemo(() => recentExercises(entries, 3), [entries])
  if (!entries || entries.length === 0) {
    return (
      <section className="wk-quick-add is-empty" aria-label="Add activity">
        <div className="wk-quick-add-empty-mark" aria-hidden>
          <SportIcon name="stopwatch" color="var(--accent)" size={24} />
        </div>
        <h2 className="wk-quick-add-title">Start your workout</h2>
        <p className="wk-quick-add-copy">Add your first activity. You can adjust every set as you train.</p>
        <div className="wk-quick-chip-row">
          <button type="button" className="wk-add-activity-primary" onClick={() => onQuickAdd(null, null)}
            aria-label="Browse activity library"><span aria-hidden>+</span> Add first activity</button>
        </div>
      </section>
    )
  }
  return (
    <section className="wk-quick-add" aria-label="Add activity">
      <div className="wk-quick-add-label">
        <span>
          <strong>Quick add</strong>
          <small>Your recent activities</small>
        </span>
      </div>
      <div className="wk-quick-chip-row">
        {recents.map((ex) => (
          <button
            type="button"
            key={ex.key}
            className="wk-quick-chip"
            onClick={() => onQuickAdd(ex, entries)}
            aria-label={`Add ${ex.activity} to session`}
          >
            <SportIcon name={ex.icon} color={ex.color} size={15} />
            {ex.activity}
          </button>
        ))}
      </div>
      <button type="button" className="wk-add-activity-primary" onClick={() => onQuickAdd(null, null)}
        aria-label="Browse activity library">
        <span aria-hidden>+</span> {hasActiveEntries ? 'Add another activity' : 'Add activity'}
      </button>
    </section>
  )
}
