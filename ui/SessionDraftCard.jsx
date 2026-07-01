import React from 'react'
import { CATEGORIES, sportIconColor, summarizeMetrics } from '../logic.js'
import { SportIcon } from './SportIcon.jsx'

export function SessionDraftCard({ entry, onDelete }) {
  const cat = CATEGORIES[entry.category] || CATEGORIES.other
  const icon = entry.icon || cat.icon
  const color = sportIconColor(icon, entry.category)
  return (
    <div className="wk-entry-card is-draft">
      <div className="wk-entry-icon" style={{ background: `${color}22`, border: `1px solid ${color}55` }} aria-hidden>
        <SportIcon name={icon} color={color} size={18} />
      </div>
      <div className="wk-entry-body">
        <div className="wk-entry-top">
          <h4 className="wk-entry-name">{entry.activity}</h4>
          <span className="wk-entry-time">{cat.label}</span>
        </div>
        <p className="wk-entry-meta">{summarizeMetrics(entry) || cat.label}</p>
      </div>
      <div className="wk-entry-actions">
        <button
          className="wk-icon-btn"
          onClick={() => onDelete(entry.id)}
          aria-label={`Remove ${entry.activity} from current session`}
          title="Remove"
        >×</button>
      </div>
    </div>
  )
}
