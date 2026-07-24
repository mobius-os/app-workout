import React, { useMemo } from 'react'
import { groupSessions, localDate } from '../logic.js'
import { groupEntriesByDate } from '../format.js'
import { EntryCard } from './EntryCard.jsx'
import { SportIcon } from './SportIcon.jsx'

export function AllTab({ entries, onDelete, onEdit }) {
  const groups = useMemo(() => groupEntriesByDate(entries), [entries])
  const sessionCount = useMemo(() => groupSessions(entries).length, [entries])
  if (entries.length === 0) {
    return (
      <div className="wk-empty">
        <div className="wk-empty-icon">
          <SportIcon name="history" color="var(--accent)" size={30} />
        </div>
        No entries yet. Finish a session and it lands here.
      </div>
    )
  }
  const todayIso = localDate()
  return (
    <div>
      <header className="wk-history-summary">
        <div>
          <span className="wk-section-kicker">Training log</span>
          <h2>Your workout history</h2>
        </div>
        <div className="wk-history-count" aria-label={`${sessionCount} sessions and ${entries.length} activities`}>
          <strong>{sessionCount}</strong>
          <span>session{sessionCount === 1 ? '' : 's'}</span>
          <i aria-hidden />
          <strong>{entries.length}</strong>
          <span>activit{entries.length === 1 ? 'y' : 'ies'}</span>
        </div>
      </header>
      {groups.map((group) => {
        const dateLabel = group.date === todayIso
          ? 'Today'
          : new Date(`${group.date}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
        return (
          <div key={group.date}>
            <div className="wk-session-label">
              <span className="wk-session-date">{dateLabel}</span>
            </div>
            {group.entries.map((e) => (
              <EntryCard key={e.id} entry={e} onDelete={onDelete} onEdit={onEdit} />
            ))}
          </div>
        )
      })}
    </div>
  )
}
