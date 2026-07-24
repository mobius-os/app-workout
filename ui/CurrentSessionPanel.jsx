import React, { useState, useEffect, useMemo } from 'react'
import {
  categoryFamily, currentSessionMissing, currentSessionReady, fmtDistance, fmtDuration,
  lastEntryForExercise, normalizeCurrentSession,
} from '../logic.js'
import { SessionDraftCard } from './SessionDraftCard.jsx'
import { SportIcon } from './SportIcon.jsx'

function sessionWorkSummary(entries) {
  let sets = 0
  let distanceM = 0
  let durationS = 0
  for (const entry of entries || []) {
    const fam = categoryFamily(entry.category)
    if (fam === 'strength') {
      sets += Array.isArray(entry.metrics?.sets) ? entry.metrics.sets.length : 0
    } else if (fam === 'cardio') {
      distanceM += Number(entry.metrics?.distance_m) || 0
      durationS += Number(entry.metrics?.duration_s) || 0
    } else {
      durationS += Number(entry.metrics?.duration_s) || 0
    }
  }
  const parts = []
  if (sets > 0) parts.push(`${sets} set${sets === 1 ? '' : 's'}`)
  if (distanceM > 0) parts.push(fmtDistance(distanceM))
  if (durationS > 0 && parts.length < 2) parts.push(fmtDuration(durationS))
  return parts.slice(0, 2).join(' · ') || 'Draft'
}

function restClock(seconds) {
  const safe = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

export function CurrentSessionPanel({
  session, historyEntries = [], onFinish, onDeleteEntry, onEditEntry, onClear, finishing = false,
}) {
  const normalized = useMemo(() => normalizeCurrentSession(session), [session])
  const entries = normalized?.entries || []
  const ready = currentSessionReady(normalized) && !finishing
  const missing = currentSessionMissing(normalized)
  // Ticking clock makes the card read as live: elapsed time since startedAt,
  // refreshed every 30s (cheap; unmounts with the panel when no session).
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])
  const [restTimer, setRestTimer] = useState(null) // { entryId, setIndex, endsAt }
  const [restNow, setRestNow] = useState(() => Date.now())
  const [restAnnouncement, setRestAnnouncement] = useState('')
  useEffect(() => {
    if (!restTimer) return undefined
    const tick = () => {
      const next = Date.now()
      setRestNow(next)
      if (next >= restTimer.endsAt) {
        setRestTimer(null)
        setRestAnnouncement('Rest complete')
      }
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [restTimer?.endsAt])
  const restRemaining = restTimer ? Math.max(0, (restTimer.endsAt - restNow) / 1000) : 0
  const handleSetCompletion = ({ entryId, setIndex, completed }) => {
    if (completed) {
      setRestAnnouncement('')
      setRestNow(Date.now())
      setRestTimer({ entryId, setIndex, endsAt: Date.now() + 90000 })
    } else if (restTimer?.entryId === entryId && restTimer?.setIndex === setIndex) {
      setRestTimer(null)
    }
  }
  const elapsed = normalized?.startedAt && now > normalized.startedAt
    ? fmtDuration((now - normalized.startedAt) / 1000)
    : null
  const workSummary = useMemo(() => sessionWorkSummary(entries), [entries])
  const sessionSubtitle = entries.length > 0
    ? [
        `${entries.length} ${entries.length === 1 ? 'activity' : 'activities'}`,
        workSummary,
        elapsed,
      ].filter(Boolean).join(' · ')
    : 'No activities yet'
  return (
    <section className={`wk-current-session${entries.length > 0 ? ' is-live' : ''}`} aria-label="Current session">
      <div className="wk-current-session-head">
        <div style={{ minWidth: 0 }}>
          <h2 className="wk-current-session-title">
            {entries.length > 0 && <span className="wk-live-dot" aria-hidden />}
            {entries.length > 0 ? 'Live workout' : 'Ready to start'}
          </h2>
          <p className="wk-current-session-sub">
            {finishing ? 'Saving session…' : sessionSubtitle}
          </p>
        </div>
        {entries.length > 0 && (
          <button
            type="button"
            className="wk-btn-ghost is-muted wk-clear-session"
            onClick={onClear}
            aria-label="Clear current session"
            title="Clear current session"
          >
            Clear
          </button>
        )}
      </div>
      {restTimer && (
        <div className="wk-rest-timer" role="timer" aria-live="off" aria-label={`Rest timer ${restClock(restRemaining)} remaining`}>
          <div>
            <span className="wk-rest-label">Rest</span>
            <strong className="wk-rest-value">{restClock(restRemaining)}</strong>
          </div>
          <div className="wk-rest-actions">
            <button type="button" onClick={() => setRestTimer((timer) => ({ ...timer, endsAt: timer.endsAt + 30000 }))}>+30s</button>
            <button type="button" onClick={() => setRestTimer(null)}>Skip</button>
          </div>
        </div>
      )}
      <span className="wk-sr-only" role="status" aria-live="polite" aria-atomic="true">{restAnnouncement}</span>
      {entries.length > 0 ? (
        <div className="wk-current-session-list">
          {entries.map((entry) => (
            <SessionDraftCard
              key={entry.id}
              entry={entry}
              previousEntry={lastEntryForExercise(historyEntries, entry.category, entry.activity)}
              onDelete={onDeleteEntry}
              onEditEntry={onEditEntry}
              onSetCompletion={handleSetCompletion}
            />
          ))}
        </div>
      ) : (
        <div className="wk-current-session-empty">
          <span className="wk-current-session-empty-mark" aria-hidden>
            <SportIcon name="sparkles" color="var(--accent)" size={20} />
          </span>
          <span>
            <strong>Add your first activity</strong>
            <small>Choose from your recent activities or browse the full library.</small>
          </span>
        </div>
      )}
      {entries.length > 0 && (
        <div className="wk-current-session-footer">
          <div className="wk-current-session-status">
            <strong>{ready ? 'Workout ready' : 'Finish the details'}</strong>
            <span>{ready ? 'Everything required is filled in.' : `Still needed: ${missing.join(', ')}.`}</span>
          </div>
          <button
            type="button"
            className="wk-finish-btn"
            disabled={!ready}
            onClick={onFinish}
            aria-label="Finish workout"
            title={ready ? 'Finish workout' : 'Finish once required details are complete'}
          >
            {finishing ? 'Saving…' : 'Finish workout'}
          </button>
        </div>
      )}
    </section>
  )
}
