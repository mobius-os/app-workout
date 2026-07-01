import React, { useState, useEffect, useMemo } from 'react'
import { currentSessionReady, fmtDuration, normalizeCurrentSession, sessionEntryMissing } from '../logic.js'
import { SessionDraftCard } from './SessionDraftCard.jsx'

export function CurrentSessionPanel({ session, onFinish, onDeleteEntry, onClear, finishing = false }) {
  const normalized = useMemo(() => normalizeCurrentSession(session), [session])
  const entries = normalized?.entries || []
  const ready = currentSessionReady(normalized) && !finishing
  const missing = entries.map(sessionEntryMissing).filter(Boolean)
  // Ticking clock makes the card read as live: elapsed time since startedAt,
  // refreshed every 30s (cheap; unmounts with the panel when no session).
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])
  const elapsed = normalized?.startedAt && now > normalized.startedAt
    ? fmtDuration((now - normalized.startedAt) / 1000)
    : null
  return (
    <section className="wk-current-session is-live" aria-label="Current session">
      <div className="wk-current-session-head">
        <div style={{ minWidth: 0 }}>
          <h3 className="wk-current-session-title">
            <span className="wk-live-dot" aria-hidden />Live session
          </h3>
          <p className="wk-current-session-sub">
            {entries.length > 0
              ? `${entries.length} ${entries.length === 1 ? 'activity' : 'activities'}${elapsed ? ` · ${elapsed}` : ''}`
              : 'No activities yet'}
          </p>
        </div>
        <div className="wk-current-session-actions">
          <button
            type="button"
            className="wk-btn-ghost is-muted"
            onClick={onClear}
            aria-label="Clear current session"
            title="Clear current session"
          >
            Clear
          </button>
          <button
            type="button"
            className="wk-finish-btn"
            disabled={!ready}
            onClick={onFinish}
            aria-label="Finish session"
            title={ready ? 'Finish session' : 'Finish session once required details are complete'}
          >
            Finish session
          </button>
        </div>
      </div>
      {entries.length > 0 ? (
        <div className="wk-current-session-list">
          {entries.map((entry) => <SessionDraftCard key={entry.id} entry={entry} onDelete={onDeleteEntry} />)}
        </div>
      ) : (
        <div className="wk-current-session-empty">Add an activity with Quick add, or tell the chat what you did.</div>
      )}
      {missing.length > 0 && (
        <p className="wk-current-session-missing">Missing: {missing.join(', ')}.</p>
      )}
    </section>
  )
}
