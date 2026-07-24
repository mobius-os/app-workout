import React, {
  useState, useMemo, useCallback, useEffect, useRef,
} from 'react'
import { cardioBests, currentStreak, exerciseDetail, exerciseList, fmtDistance, fmtDuration, fromKg, strengthPRs } from '../logic.js'
import { categoryStats, weeklyVolumeByCategory } from '../format.js'
import { CategoryStats } from './CategoryStats.jsx'
import { CategoryVolumeBars } from './CategoryVolumeBars.jsx'
import { ExerciseDetailSheet } from './ExerciseDetailSheet.jsx'
import { ExerciseLink } from './ExerciseLink.jsx'
import { Heatmap } from './Heatmap.jsx'
import { SportIcon } from './SportIcon.jsx'

export function InsightsTab({ entries }) {
  const weeks = useMemo(() => weeklyVolumeByCategory(entries), [entries])
  const stats = useMemo(() => categoryStats(entries), [entries])
  const exercises = useMemo(() => exerciseList(entries), [entries])
  const prs = useMemo(() => strengthPRs(entries), [entries])
  const cardio = useMemo(() => cardioBests(entries), [entries])
  const streak = useMemo(() => currentStreak(entries), [entries])
  const trainingSummary = useMemo(() => {
    const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000)
    const recent = entries.filter((entry) => entry.ts >= cutoff)
    const sessions = new Set(recent.map((entry) => entry.sessionId || entry.localDate || String(entry.ts)))
    const activities = new Set(entries.map((entry) => entry.activity?.trim()).filter(Boolean))
    const latestTs = Math.max(0, ...entries.map((entry) => Number(entry.ts) || 0))
    const latest = latestTs
      ? new Date(latestTs).toLocaleDateString([], { month: 'short', day: 'numeric' })
      : '—'
    return { recentSessions: sessions.size, activities: activities.size, latest }
  }, [entries])
  const [selected, setSelected] = useState(null) // { category, activity }
  const detailNavHandleRef = useRef(null)
  const detail = useMemo(
    () => (selected ? exerciseDetail(entries, selected.category, selected.activity) : null),
    [entries, selected],
  )

  const closeDetailNav = useCallback(() => {
    try { detailNavHandleRef.current?.close?.() } catch {}
    detailNavHandleRef.current = null
  }, [])

  const closeDetail = useCallback(() => {
    closeDetailNav()
    setSelected(null)
  }, [closeDetailNav])

  const openEx = useCallback(async (category, activity) => {
    closeDetailNav()
    if (window.mobius?.nav?.open) {
      const handle = window.mobius.nav.open('workout-exercise-detail', () => {
        detailNavHandleRef.current = null
        setSelected(null)
      })
      detailNavHandleRef.current = handle
      await handle.ready?.catch(() => false)
      if (detailNavHandleRef.current !== handle) return
    }
    setSelected({ category, activity })
    // insights_viewed: opening an exercise-detail sheet is the other way the
    // analytics surface gets used. No activity name in the payload — a custom
    // exercise label is user-entered text; the source enum is all Reflection needs.
    window.mobius?.signal?.('insights_viewed', { source: 'exercise_detail' })
  }, [closeDetailNav])

  useEffect(() => () => closeDetailNav(), [closeDetailNav])

  if (entries.length === 0) {
    return (
      <div className="wk-empty">
        <div className="wk-empty-icon">
          <SportIcon name="heartbeat" color="var(--accent)" size={30} />
        </div>
        Log a few activities and your weekly volume, category stats, PRs, and streak will fill in here.
      </div>
    )
  }

  return (
    <div className="wk-insights-grid">
      <div className="wk-progress-card">
        <div className="wk-progress-head">
          <div>
            <span className="wk-section-kicker">Your training</span>
            <h2>Progress at a glance</h2>
            <p>Consistency, variety, and your most recent activity.</p>
          </div>
          <span className="wk-progress-badge">{streak > 0 ? `${streak} day streak` : 'Ready for today'}</span>
        </div>
        <div className="wk-progress-stats">
          <div>
            <strong>{trainingSummary.recentSessions}</strong>
            <span>sessions in 30 days</span>
          </div>
          <div>
            <strong>{trainingSummary.activities}</strong>
            <span>activities trained</span>
          </div>
          <div>
            <strong>{trainingSummary.latest}</strong>
            <span>last workout</span>
          </div>
        </div>
        <Heatmap entries={entries} />
        <p className="wk-heatmap-caption">Active days over the last 26 weeks</p>
      </div>

      {prs.length > 0 && (
        <div className="wk-chart-card">
          <h2 className="wk-chart-title">Strength PRs</h2>
          <p className="wk-chart-sub">Estimated one-rep max from your best set.</p>
          <table className="wk-pr-table">
            <thead>
              <tr>
                <th className="wk-pr-th">Lift</th>
                <th className="wk-pr-th is-right">Top set</th>
                <th className="wk-pr-th is-right">Est. 1RM</th>
              </tr>
            </thead>
            <tbody>
              {prs.map((p) => (
                <tr key={p.activity}>
                  <td className="wk-pr-td">
                    <button type="button" className="wk-ex-link" onClick={() => openEx('strength', p.activity)} aria-label={`${p.activity} details`}>
                      {p.activity}<span className="wk-ex-chevron" aria-hidden>›</span>
                    </button>
                  </td>
                  <td className="wk-pr-td is-right">
                    {fromKg(p.weight_kg, p.unit)}{p.unit} × {p.reps}
                  </td>
                  <td className="wk-pr-td is-right is-strong">
                    {fromKg(p.e1rm, p.unit)}{p.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cardio.length > 0 && (
        <div className="wk-chart-card">
          <h2 className="wk-chart-title">Cardio bests</h2>
          <p className="wk-chart-sub">Longest distance and duration per activity.</p>
          <table className="wk-pr-table">
            <thead>
              <tr>
                <th className="wk-pr-th">Activity</th>
                <th className="wk-pr-th is-right">Distance</th>
                <th className="wk-pr-th is-right">Duration</th>
              </tr>
            </thead>
            <tbody>
              {cardio.map((c) => (
                <tr key={c.activity}>
                  <td className="wk-pr-td">
                    <button type="button" className="wk-ex-link" onClick={() => openEx(c.category, c.activity)} aria-label={`${c.activity} details`}>
                      {c.activity}<span className="wk-ex-chevron" aria-hidden>›</span>
                    </button>
                  </td>
                  <td className="wk-pr-td is-right">
                    {c.maxDistance_m ? fmtDistance(c.maxDistance_m) : '—'}
                  </td>
                  <td className="wk-pr-td is-right">
                    {c.maxDuration_s ? fmtDuration(c.maxDuration_s) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {exercises.length > 0 && (
        <div className="wk-chart-card">
          <h2 className="wk-chart-title">Exercises</h2>
          <p className="wk-chart-sub">Tap an exercise for its trend, records, and history.</p>
          <table className="wk-pr-table">
            <thead>
              <tr>
                <th className="wk-pr-th">Exercise</th>
                <th className="wk-pr-th is-right">Best</th>
                <th className="wk-pr-th is-right">Sessions</th>
              </tr>
            </thead>
            <tbody>
              {exercises.slice(0, 8).map((row) => (
                <tr key={row.key}>
                  <td className="wk-pr-td">
                    <ExerciseLink icon={row.icon} color={row.color} activity={row.activity}
                      onOpen={() => openEx(row.category, row.activity)} />
                  </td>
                  <td className="wk-pr-td is-right">{row.best}</td>
                  <td className="wk-pr-td is-right">{row.sessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="wk-chart-card">
        <h2 className="wk-chart-title">Six-week volume mix</h2>
        <p className="wk-chart-sub">Strength in kg-reps, cardio in km, and other activities in minutes.</p>
        <CategoryVolumeBars weeks={weeks} />
      </div>

      <div className="wk-chart-card">
        <h2 className="wk-chart-title">Category stats</h2>
        <p className="wk-chart-sub">Sessions and useful totals by activity type.</p>
        <CategoryStats stats={stats} />
      </div>

      {detail && <ExerciseDetailSheet detail={detail} onClose={closeDetail} />}
    </div>
  )
}
