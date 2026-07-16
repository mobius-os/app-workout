import React, { useMemo } from 'react'
import { recentExercises } from '../logic.js'
import { SportIcon } from './SportIcon.jsx'

export function QuickAddStrip({ entries, onQuickAdd, onOpenCoach }) {
  const recents = useMemo(() => recentExercises(entries, 3), [entries])
  if (!entries || entries.length === 0) {
    return (
      <div className="wk-quick-add is-empty">
        <div className="wk-quick-add-label">
          <span>Add activity</span>
        </div>
        <div className="wk-quick-chip-row">
          <button className="wk-quick-add-btn" onClick={() => onQuickAdd(null, null)}
            aria-label="Browse activity library">Browse activities</button>
        </div>
        {onOpenCoach && (
          <button type="button" className="wk-coach-cta" onClick={onOpenCoach}>
            <span className="wk-coach-cta-icon" aria-hidden><SportIcon name="sparkles" size={18} /></span>
            <span><strong>Plan with coach</strong><small>Repeat, adapt, or build today’s session</small></span>
            <span aria-hidden>›</span>
          </button>
        )}
      </div>
    )
  }
  return (
    <div className="wk-quick-add">
      <div className="wk-quick-add-label">
        <span>Add activity</span>
        <button className="wk-quick-add-btn" style={{ marginLeft: 0 }}
          onClick={() => onQuickAdd(null, null)} aria-label="Browse activity library">Browse</button>
      </div>
      <div className="wk-quick-chip-row">
        {recents.map((ex) => (
          <button
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
      {onOpenCoach && (
        <button type="button" className="wk-coach-cta" onClick={onOpenCoach}>
          <span className="wk-coach-cta-icon" aria-hidden><SportIcon name="sparkles" size={18} /></span>
          <span><strong>Plan with coach</strong><small>Repeat, adapt, or build today’s session</small></span>
          <span aria-hidden>›</span>
        </button>
      )}
    </div>
  )
}
