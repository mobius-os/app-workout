import React from 'react'
import {
  CATEGORIES, categoryFamily, fromKg, sportIconColor, summarizeMetrics, sessionEntryMissing,
} from '../logic.js'
import { secondsToDisplay, metresToDisplay, draftFromStoredEntry } from '../format.js'
import { SportIcon } from './SportIcon.jsx'

// A live-session row is now an EDITABLE worksheet, not a display card. The add
// form logs a fast, possibly-incomplete entry (N sets, reps/weight maybe blank);
// this is where the owner fills the gaps in place so Finish can unlock.
//
// Editing a field rebuilds the entry's DISPLAY-unit draft, patches the one field,
// and hands the patched draft up via onEditEntry(entryId, metricsDraft). index.jsx
// re-normalizes it back to SI through the same serialized sessionWrite path as
// delete/quick-add, so per-set edits ride the existing CAS/merge machinery — no
// new write path, no new concurrency surface.
export function SessionDraftCard({ entry, onDelete, onEditEntry }) {
  const cat = CATEGORIES[entry.category] || CATEGORIES.other
  const icon = entry.icon || cat.icon
  const color = sportIconColor(icon, entry.category)
  const fam = categoryFamily(entry.category)
  const missingReason = sessionEntryMissing(entry)
  const incomplete = !!missingReason

  // Editing rebuilds the FULL display-unit draft for this entry, patches it, and
  // sends it up. Re-deriving the draft from the stored entry each edit (rather
  // than holding local state) keeps the row a pure function of the committed
  // session, so a co-writer's poll update is never masked by stale local input.
  const emitStrengthSet = (setIndex, patch) => {
    if (!onEditEntry) return
    const draft = draftFromStoredEntry(entry)
    const sets = (draft.metrics?.sets || []).map((s, i) => (i === setIndex ? { ...s, ...patch } : s))
    onEditEntry(entry.id, { ...draft.metrics, sets })
  }
  const emitField = (patchMetrics) => {
    if (!onEditEntry) return
    const draft = draftFromStoredEntry(entry)
    onEditEntry(entry.id, { ...draft.metrics, ...patchMetrics })
  }

  return (
    <div className={`wk-entry-card is-draft${incomplete ? ' is-incomplete' : ''}`}>
      <div className="wk-entry-icon" style={{ background: `${color}22`, border: `1px solid ${color}55` }} aria-hidden>
        <SportIcon name={icon} color={color} size={18} />
      </div>
      <div className="wk-entry-body">
        <div className="wk-entry-top">
          <h4 className="wk-entry-name">{entry.activity}</h4>
          <span className="wk-entry-time">{cat.label}</span>
        </div>

        {fam === 'strength' ? (
          <div className="wk-worksheet" role="group" aria-label={`${entry.activity} sets`}>
            {(entry.metrics?.sets || []).map((set, i) => {
              const unit = set.unit === 'lb' ? 'lb' : 'kg'
              const repsVal = set.reps == null ? '' : String(set.reps)
              const weightVal = set.weight_kg == null ? '' : String(fromKg(set.weight_kg, unit))
              const setIncomplete =
                set.reps == null || set.reps <= 0 || set.weight_kg == null || set.weight_kg <= 0
              return (
                <div key={i} className={`wk-worksheet-row${setIncomplete ? ' is-incomplete' : ''}`}>
                  <span className="wk-set-index">{i + 1}</span>
                  <input
                    className="wk-input" type="number" inputMode="numeric" value={repsVal}
                    onChange={(e) => emitStrengthSet(i, { reps: e.target.value })}
                    aria-label={`Set ${i + 1} reps`} placeholder="reps"
                  />
                  <span className="wk-worksheet-x" aria-hidden>×</span>
                  <input
                    className="wk-input" type="number" inputMode="decimal" value={weightVal}
                    onChange={(e) => emitStrengthSet(i, { weight: e.target.value })}
                    aria-label={`Set ${i + 1} weight in ${unit}`} placeholder={unit}
                  />
                  <span className="wk-worksheet-unit">{unit}</span>
                </div>
              )
            })}
          </div>
        ) : fam === 'cardio' ? (
          <div className="wk-worksheet" role="group" aria-label={`${entry.activity} details`}>
            <div className="wk-worksheet-field">
              <label className="wk-worksheet-label">Distance</label>
              <input
                className="wk-input" type="number" inputMode="decimal"
                value={metresToDisplay(entry.metrics?.distance_m).value}
                onChange={(e) => emitField({
                  distance: e.target.value === ''
                    ? undefined
                    : { value: e.target.value, unit: metresToDisplay(entry.metrics?.distance_m).unit },
                })}
                aria-label={`${entry.activity} distance`} placeholder="km"
              />
            </div>
            <div className="wk-worksheet-field">
              <label className="wk-worksheet-label">Duration</label>
              <input
                className="wk-input" type="number" inputMode="decimal"
                value={secondsToDisplay(entry.metrics?.duration_s).value}
                onChange={(e) => emitField({
                  duration: e.target.value === ''
                    ? undefined
                    : { value: e.target.value, unit: secondsToDisplay(entry.metrics?.duration_s).unit },
                })}
                aria-label={`${entry.activity} duration`} placeholder="min"
              />
            </div>
          </div>
        ) : (
          <div className="wk-worksheet" role="group" aria-label={`${entry.activity} details`}>
            <div className="wk-worksheet-field">
              <label className="wk-worksheet-label">Duration</label>
              <input
                className="wk-input" type="number" inputMode="decimal"
                value={secondsToDisplay(entry.metrics?.duration_s).value}
                onChange={(e) => emitField({
                  duration: e.target.value === ''
                    ? undefined
                    : { value: e.target.value, unit: secondsToDisplay(entry.metrics?.duration_s).unit },
                })}
                aria-label={`${entry.activity} duration`} placeholder="min"
              />
            </div>
            <div className="wk-worksheet-field">
              <label className="wk-worksheet-label">Note</label>
              <input
                className="wk-input" value={entry.metrics?.note || ''}
                onChange={(e) => emitField({ note: e.target.value })}
                aria-label={`${entry.activity} note`} placeholder="optional"
              />
            </div>
          </div>
        )}

        {incomplete
          ? <p className="wk-entry-meta wk-current-session-missing">Missing: {missingReason}.</p>
          : <p className="wk-entry-meta">{summarizeMetrics(entry) || cat.label}</p>}
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
