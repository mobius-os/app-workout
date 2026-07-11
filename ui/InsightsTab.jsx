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
    <div>
      <div className="wk-chart-card">
        <h3 className="wk-chart-title">Streak</h3>
        <p className="wk-chart-sub">Consecutive days with at least one logged activity.</p>
        <div className="wk-streak-value">
          {streak} <span className="wk-streak-unit">day{streak === 1 ? '' : 's'}</span>
        </div>
        <Heatmap entries={entries} />
      </div>

      {prs.length > 0 && (
        <div className="wk-chart-card">
          <h3 className="wk-chart-title">Strength PRs</h3>
          <p className="wk-chart-sub">Best estimated 1RM per lift.</p>
          <table className="wk-pr-table">
            <thead>
              <tr>
                <th className="wk-pr-th">Lift</th>
                <th className="wk-pr-th is-right">Top set</th>
                <th className="wk-pr-th is-right">e1RM</th>
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
          <h3 className="wk-chart-title">Cardio bests</h3>
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
          <h3 className="wk-chart-title">Exercises</h3>
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
        <h3 className="wk-chart-title">Weekly volume</h3>
        <p className="wk-chart-sub">Strength = kg-reps, cardio = km, other = min — last 6 weeks.</p>
        <CategoryVolumeBars weeks={weeks} />
      </div>

      <div className="wk-chart-card">
        <h3 className="wk-chart-title">Category stats</h3>
        <p className="wk-chart-sub">Sessions and useful totals by activity type.</p>
        <CategoryStats stats={stats} />
      </div>

      {detail && <ExerciseDetailSheet detail={detail} onClose={closeDetail} />}
    </div>
  )
}
