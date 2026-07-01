import React, { useEffect } from 'react'
import { CATEGORIES } from '../logic.js'
import { detailHistorySummary, detailRecordTiles, detailTrend, fmtWeight, shortDate } from '../format.js'
import { Sparkline } from './Sparkline.jsx'
import { SportIcon } from './SportIcon.jsx'

export function ExerciseDetailSheet({ detail, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const trend = detailTrend(detail)
  const tiles = detailRecordTiles(detail)
  const history = [...detail.points].reverse()
  const range = detail.firstTs
    ? `${shortDate(detail.firstTs)} – ${shortDate(detail.lastTs)}`
    : ''

  return (
    <div className="wk-sheet-scrim" onClick={onClose} role="presentation">
      <div className="wk-sheet" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={`${detail.activity} details`}>
        <div className="wk-sheet-head">
          <div className="wk-sheet-head-brand">
            <div className="wk-entry-icon" style={{ background: `${detail.color}22`, border: `1px solid ${detail.color}55` }} aria-hidden>
              <SportIcon name={detail.icon} color={detail.color} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h3 className="wk-sheet-title">{detail.activity}</h3>
              <p className="wk-sheet-sub">
                {CATEGORIES[detail.category]?.label || detail.category} · {detail.sessionCount} session{detail.sessionCount === 1 ? '' : 's'}{range ? ` · ${range}` : ''}
              </p>
            </div>
          </div>
          <button className="wk-icon-btn" onClick={onClose} aria-label="Close" title="Close">×</button>
        </div>

        <div className="wk-sheet-body">
          <div className="wk-rec-grid">
            {tiles.map((t) => (
              <div key={t.label} className="wk-rec-tile">
                <div className="wk-rec-label">{t.label}</div>
                <div className="wk-rec-value">{t.value}</div>
              </div>
            ))}
          </div>

          {trend && (
            <div className="wk-chart-card is-nested">
              <h3 className="wk-chart-title">{trend.label} over time</h3>
              {detail.points.length >= 2 ? (
                <>
                  <Sparkline points={trend.series} color={detail.color} label={trend.label} />
                  <div className="wk-trend-meta">
                    <span>{shortDate(trend.series[0].ts)} · {trend.fmt(trend.series[0].value)}</span>
                    <span>{shortDate(trend.series[trend.series.length - 1].ts)} · {trend.fmt(trend.series[trend.series.length - 1].value)}</span>
                  </div>
                </>
              ) : (
                <p className="wk-chart-sub">Log this {detail.family === 'strength' ? 'lift' : 'activity'} again to see a trend.</p>
              )}
            </div>
          )}

          {detail.setRecords.length > 0 && (
            <div className="wk-chart-card is-nested">
              <h3 className="wk-chart-title">Set records</h3>
              <p className="wk-chart-sub">Best weight at each rep count.</p>
              <table className="wk-pr-table">
                <thead>
                  <tr>
                    <th className="wk-pr-th">Reps</th>
                    <th className="wk-pr-th is-right">Best weight</th>
                    <th className="wk-pr-th is-right">e1RM</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.setRecords.map((s) => (
                    <tr key={s.reps}>
                      <td className="wk-pr-td">{s.reps}</td>
                      <td className="wk-pr-td is-right">{fmtWeight(s.weight_kg, s.unit)}</td>
                      <td className="wk-pr-td is-right">{fmtWeight(s.e1rm, s.unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="wk-chart-card is-last">
            <h3 className="wk-chart-title">History</h3>
            <div className="wk-hist-list">
              {history.map((p, i) => (
                <div key={`${p.ts}-${i}`} className={`wk-hist-row${i === history.length - 1 ? ' is-last' : ''}`}>
                  <span className="wk-hist-date">{new Date(p.ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  <span className="wk-hist-summary">{detailHistorySummary(p, detail.family)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
