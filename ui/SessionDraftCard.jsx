import React, { useState, useRef, useEffect } from 'react'
import {
  CATEGORIES, categoryFamily, fromKg, sportIconColor, summarizeMetrics, sessionEntryMissing,
} from '../logic.js'
import { secondsToDisplay, metresToDisplay, draftFromStoredEntry } from '../format.js'
import { SportIcon } from './SportIcon.jsx'

// A worksheet cell that holds its own in-progress text and commits on blur or
// Enter, so typing "100" is ONE coalesced durable write instead of three
// serialized CAS writes (one per keystroke). It re-syncs from the committed
// value when that value changes AND the cell is idle, so a co-writer's poll
// update to this entry still surfaces without clobbering active typing.
function DraftCell({ value, onCommit, ...rest }) {
  const [text, setText] = useState(value)
  const activeRef = useRef(false)
  useEffect(() => { if (!activeRef.current) setText(value) }, [value])
  return (
    <input
      {...rest}
      value={text}
      onFocus={() => { activeRef.current = true }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { activeRef.current = false; onCommit(text) }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
    />
  )
}

// A distance/duration cell: a numeric value plus a VISIBLE unit selector, so the
// SI-stored value is never edited unit-blind. Before this, a cardio row rendered
// `metresToDisplay(...).value` with only a placeholder hint and INFERRED the unit
// from the current stored value — so a stored 1500m showed a bare "1500" and
// typing "2" over it saved 2m, not 2km. Now the unit is on screen (1500 m) and
// selectable, and it stays STABLE for the edit session (local state) rather than
// being re-inferred on every keystroke. Holds local state so keystrokes coalesce
// into one commit on blur / unit change. The number is interpreted in the
// selected unit (same contract as the add-form's ConfirmCard fields).
function MetricCell({ label, ariaLabel, displayValue, displayUnit, units, onCommit }) {
  const [value, setValue] = useState(displayValue)
  const [unit, setUnit] = useState(displayUnit)
  const activeRef = useRef(false)
  useEffect(() => {
    if (activeRef.current) return
    setValue(displayValue)
    setUnit(displayUnit)
  }, [displayValue, displayUnit])
  const commit = (nextValue, nextUnit) => {
    onCommit(nextValue === '' ? undefined : { value: nextValue, unit: nextUnit })
  }
  return (
    <div className="wk-worksheet-field">
      <label className="wk-worksheet-label">{label}</label>
      <div className="wk-grid-metric">
        <input
          className="wk-input" type="number" inputMode="decimal" value={value}
          onFocus={() => { activeRef.current = true }}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => { activeRef.current = false; commit(value, unit) }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          aria-label={ariaLabel} placeholder={displayUnit}
        />
        <select
          className="wk-input" value={unit}
          onChange={(e) => { const u = e.target.value; setUnit(u); commit(value, u) }}
          aria-label={`${ariaLabel} unit`}
        >
          {units.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
    </div>
  )
}

// A live-session row is now an EDITABLE worksheet, not a display card. The add
// form logs a fast, possibly-incomplete entry (N sets, reps/weight maybe blank);
// this is where the owner fills the gaps in place so Finish can unlock.
//
// Editing rebuilds the entry's DISPLAY-unit draft, patches the one field, and
// hands the patched draft up via onEditEntry(entryId, metricsDraft). index.jsx
// re-normalizes it back to SI through the same serialized sessionWrite path as
// delete/quick-add, so per-set edits ride the existing CAS/merge machinery — no
// new write path, no new concurrency surface. Each cell coalesces its keystrokes
// (commit on blur/Enter) and re-derives the full draft from the committed entry
// at commit time, so a co-writer's poll update is never masked by stale input.
export function SessionDraftCard({ entry, onDelete, onEditEntry }) {
  const cat = CATEGORIES[entry.category] || CATEGORIES.other
  const icon = entry.icon || cat.icon
  const color = sportIconColor(icon, entry.category)
  const fam = categoryFamily(entry.category)
  const missingReason = sessionEntryMissing(entry)
  const incomplete = !!missingReason

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

  const distanceDisplay = metresToDisplay(entry.metrics?.distance_m)
  const durationDisplay = secondsToDisplay(entry.metrics?.duration_s)

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
                  <DraftCell
                    className="wk-input" type="number" inputMode="numeric" value={repsVal}
                    onCommit={(v) => emitStrengthSet(i, { reps: v })}
                    aria-label={`Set ${i + 1} reps`} placeholder="reps"
                  />
                  <span className="wk-worksheet-x" aria-hidden>×</span>
                  <DraftCell
                    className="wk-input" type="number" inputMode="decimal" value={weightVal}
                    onCommit={(v) => emitStrengthSet(i, { weight: v })}
                    aria-label={`Set ${i + 1} weight in ${unit}`} placeholder={unit}
                  />
                  <span className="wk-worksheet-unit">{unit}</span>
                </div>
              )
            })}
          </div>
        ) : fam === 'cardio' ? (
          <div className="wk-worksheet" role="group" aria-label={`${entry.activity} details`}>
            <MetricCell
              label="Distance" ariaLabel={`${entry.activity} distance`}
              displayValue={distanceDisplay.value} displayUnit={distanceDisplay.unit}
              units={['km', 'mi', 'm']}
              onCommit={(distance) => emitField({ distance })}
            />
            <MetricCell
              label="Duration" ariaLabel={`${entry.activity} duration`}
              displayValue={durationDisplay.value} displayUnit={durationDisplay.unit}
              units={['min', 'h', 's']}
              onCommit={(duration) => emitField({ duration })}
            />
          </div>
        ) : (
          <div className="wk-worksheet" role="group" aria-label={`${entry.activity} details`}>
            <MetricCell
              label="Duration" ariaLabel={`${entry.activity} duration`}
              displayValue={durationDisplay.value} displayUnit={durationDisplay.unit}
              units={['min', 'h', 's']}
              onCommit={(duration) => emitField({ duration })}
            />
            <div className="wk-worksheet-field">
              <label className="wk-worksheet-label">Note</label>
              <DraftCell
                className="wk-input" value={entry.metrics?.note || ''}
                onCommit={(v) => emitField({ note: v })}
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
