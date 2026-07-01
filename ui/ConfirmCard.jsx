import React, { useState } from 'react'
import { CATEGORIES, CATEGORY_KEYS, categoryFamily, fromKg, localDate, normalizeEntry, sessionEntryMissing } from '../logic.js'
import { metresToDisplay, secondsToDisplay } from '../format.js'
import { ConfirmModal } from './ConfirmModal.jsx'
import { SportIcon } from './SportIcon.jsx'

export function ConfirmCard({
  draft, ambiguous, clarification, onCommit, onCancel, position = 1, total = 1,
  initialTs = Date.now(), title = null, commitLabel = null,
  lastEntry = null,
}) {
  const [category, setCategory] = useState(draft.category)
  const [activity, setActivity] = useState(draft.activity)
  const fam = categoryFamily(category)
  const initialDate = new Date(initialTs)
  const [dateValue, setDateValue] = useState(() => localDate(initialDate))
  const [timeValue, setTimeValue] = useState(() => {
    const h = String(initialDate.getHours()).padStart(2, '0')
    const m = String(initialDate.getMinutes()).padStart(2, '0')
    return `${h}:${m}`
  })

  // Strength sets — editable rows of {weight, reps, unit}, in DISPLAY units.
  // Seed from draft if it has data; otherwise fall back to the last logged entry
  // for this exercise (the "same as last time" default that makes repeat sets
  // one tap: chip → ConfirmCard pre-filled → Save).
  const [sets, setSets] = useState(() => {
    const s = draft.metrics?.sets
    if (Array.isArray(s) && s.length > 0) {
      return s.map((x) => ({
        weight: x.weight ?? '',
        reps: x.reps ?? '',
        unit: x.unit === 'lb' ? 'lb' : 'kg',
      }))
    }
    // Fall back to last entry's display-unit sets when the draft is empty.
    if (lastEntry && categoryFamily(lastEntry.category) === 'strength') {
      const prevSets = lastEntry.metrics?.sets || []
      if (prevSets.length > 0) {
        return prevSets.map((s) => {
          const unit = s.unit === 'lb' ? 'lb' : 'kg'
          return {
            weight: s.weight_kg == null ? '' : String(fromKg(s.weight_kg, unit)),
            reps: s.reps == null ? '' : String(s.reps),
            unit,
          }
        })
      }
    }
    return [{ weight: '', reps: '', unit: 'kg' }]
  })
  // Cardio/other — display-unit metric fields.
  // When the draft is empty and we have a last entry, seed with its values so
  // the user only needs to confirm rather than retype.
  const lastCardio = lastEntry && categoryFamily(lastEntry.category) === 'cardio'
    ? lastEntry : null
  const lastDurationDisplay = lastCardio ? secondsToDisplay(lastCardio.metrics?.duration_s) : null
  const lastDistanceDisplay = lastCardio ? metresToDisplay(lastCardio.metrics?.distance_m) : null
  const [duration, setDuration] = useState(
    draft.metrics?.duration?.value ?? (lastDurationDisplay?.value || ''),
  )
  const [durationUnit, setDurationUnit] = useState(
    draft.metrics?.duration?.unit ?? (lastDurationDisplay?.unit || 'min'),
  )
  const [distance, setDistance] = useState(
    draft.metrics?.distance?.value ?? (lastDistanceDisplay?.value || ''),
  )
  const [distanceUnit, setDistanceUnit] = useState(
    draft.metrics?.distance?.unit ?? (lastDistanceDisplay?.unit || 'km'),
  )
  const [elevation, setElevation] = useState(draft.metrics?.elevation?.value ?? '')
  const [location, setLocation] = useState(
    draft.metrics?.location ?? (lastCardio?.metrics?.location || ''),
  )
  const [note, setNote] = useState(draft.metrics?.note ?? '')
  // Category change crossing a metric family clears the old family's inputs (a
  // strength entry has sets; a cardio one has distance/duration; etc). Since
  // handleCommit only reads the CURRENT family's fields, the old values would be
  // dropped silently on save — so we confirm before clearing when the abandoned
  // family actually holds entered data. pendingCategory holds the requested key
  // while that confirm modal is open.
  const [pendingCategory, setPendingCategory] = useState(null)

  const updateSet = (i, patch) =>
    setSets((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const addSet = () =>
    setSets((prev) => [...prev, { ...(prev[prev.length - 1] || { weight: '', reps: '', unit: 'kg' }) }])
  const removeSet = (i) =>
    setSets((prev) => (prev.length <= 1 ? prev : prev.filter((_, j) => j !== i)))
  const metricNumber = (value) => {
    if (value === '' || value == null) return null
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }

  const familyHasData = (family) => {
    if (family === 'strength') return sets.some((s) => s.weight !== '' || s.reps !== '')
    if (family === 'cardio') return duration !== '' || distance !== '' || elevation !== '' || location !== ''
    return duration !== '' || location !== '' || note !== ''
  }
  const clearFamilyFields = (family) => {
    if (family === 'strength') {
      setSets([{ weight: '', reps: '', unit: 'kg' }])
    } else if (family === 'cardio') {
      setDuration(''); setDistance(''); setElevation(''); setLocation('')
    } else {
      setDuration(''); setLocation(''); setNote('')
    }
  }
  const applyCategory = (k) => {
    const prevFam = categoryFamily(category)
    const nextFam = categoryFamily(k)
    if (nextFam !== prevFam) clearFamilyFields(prevFam)
    setCategory(k)
  }
  // Same-family switches (e.g. running → cycling) reuse the same inputs, so they
  // apply immediately. A cross-family switch only prompts when the abandoned
  // family has data the user would lose; otherwise it switches silently.
  const requestCategory = (k) => {
    if (k === category) return
    const prevFam = categoryFamily(category)
    const nextFam = categoryFamily(k)
    if (nextFam === prevFam || !familyHasData(prevFam)) {
      applyCategory(k)
      return
    }
    setPendingCategory(k)
  }

  const buildCommitDraft = () => {
    let metrics
    if (fam === 'strength') {
      metrics = { sets: sets.map((s) => ({ weight: metricNumber(s.weight), reps: metricNumber(s.reps), unit: s.unit })) }
    } else if (fam === 'cardio') {
      metrics = {}
      if (duration !== '') metrics.duration = { value: metricNumber(duration), unit: durationUnit }
      if (distance !== '') metrics.distance = { value: metricNumber(distance), unit: distanceUnit }
      if (elevation !== '') metrics.elevation = { value: metricNumber(elevation), unit: 'm' }
      if (location) metrics.location = location
    } else {
      metrics = {}
      if (duration !== '') metrics.duration = { value: metricNumber(duration), unit: durationUnit }
      if (location) metrics.location = location
      if (note) metrics.note = note
    }
    return { category, activity: activity.trim() || CATEGORIES[category].label, metrics }
  }

  const commitTs = () => {
    const nextTs = new Date(`${dateValue || localDate()}T${timeValue || '12:00'}`).getTime()
    return Number.isFinite(nextTs) ? nextTs : Date.now()
  }

  const saveBlockedReason = sessionEntryMissing(normalizeEntry(buildCommitDraft(), {
    id: 'confirm-preview',
    ts: commitTs(),
    raw: '',
    source: 'manual',
    confirmed: true,
  }))

  const handleCommit = () => {
    if (saveBlockedReason) return
    // Reassemble a "parsed" object in the LLM's loose shape, then hand it to
    // normalizeEntry so storage is always SI regardless of what was typed.
    onCommit(
      buildCommitDraft(),
      commitTs(),
    )
  }

  return (
    <div className={`wk-card${ambiguous ? ' is-ambiguous' : ''}`}>
      <h3 className="wk-card-title">
        {title || (ambiguous ? 'Check this one' : 'Edit entry')}
        {total > 1 ? ` · ${position}/${total}` : ''}
      </h3>
      {ambiguous && clarification ? (
        <p className="wk-card-sub">{clarification}</p>
      ) : (
        <p className="wk-card-sub">
          {total > 1
            ? 'Tweak anything, then save this part and review the next one.'
            : 'Tweak anything, then save it to your log.'}
        </p>
      )}

      <label className="wk-label">Activity</label>
      <input
        className="wk-input" value={activity}
        onChange={(e) => setActivity(e.target.value)}
        aria-label="Activity name" placeholder="e.g. Deadlift, Trail run"
        enterKeyHint="next" autoComplete="off" autoCorrect="off" spellCheck="false"
      />

      <div className="wk-spacer-12" />
      <div className="wk-grid-2">
        <div>
          <label className="wk-label">Date</label>
          <input
            className="wk-input" type="date" value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
            aria-label="Entry date"
          />
        </div>
        <div>
          <label className="wk-label">Time</label>
          <input
            className="wk-input" type="time" value={timeValue}
            onChange={(e) => setTimeValue(e.target.value)}
            aria-label="Entry time"
          />
        </div>
      </div>

      <div className="wk-spacer-12" />
      <label className="wk-label">Category</label>
      <div className="wk-chip-row">
        {CATEGORY_KEYS.map((k) => {
          const active = k === category
          const color = CATEGORIES[k].color
          return (
            <button
              key={k} className="wk-chip"
              style={active ? { borderColor: color, background: `${color}22`, color: 'var(--text)' } : undefined}
              onClick={() => requestCategory(k)}
              aria-label={`Category ${CATEGORIES[k].label}`}
              aria-pressed={active}
            >
              <SportIcon name={CATEGORIES[k].icon} color={CATEGORIES[k].color} size={16} />{CATEGORIES[k].label}
            </button>
          )
        })}
      </div>

      <div className="wk-spacer-14" />
      {fam === 'strength' ? (
        <div>
          <label className="wk-label">Sets</label>
          {sets.map((s, i) => (
            <div key={i} className="wk-set-row">
              <span className="wk-set-index">{i + 1}</span>
              <input
                className="wk-input" type="number" inputMode="decimal" value={s.weight}
                onChange={(e) => updateSet(i, { weight: e.target.value })}
                aria-label={`Set ${i + 1} weight`} placeholder="kg"
                enterKeyHint="next"
              />
              <input
                className="wk-input" type="number" inputMode="numeric" value={s.reps}
                onChange={(e) => updateSet(i, { reps: e.target.value })}
                aria-label={`Set ${i + 1} reps`} placeholder="reps"
                enterKeyHint={i === sets.length - 1 ? 'done' : 'next'}
              />
              <button
                className="wk-btn-ghost is-muted wk-min44"
                onClick={() => removeSet(i)} aria-label={`Remove set ${i + 1}`}
              >×</button>
            </div>
          ))}
          <div className="wk-btn-row wk-btn-row-finish">
            <select
              value={sets[0]?.unit || 'kg'}
              onChange={(e) => setSets((prev) => prev.map((s) => ({ ...s, unit: e.target.value })))}
              className="wk-input is-auto" aria-label="Weight unit"
            >
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </select>
            <button className="wk-btn-ghost" onClick={addSet} aria-label="Add set">+ set</button>
          </div>
        </div>
      ) : (
        <div>
          <div className="wk-grid-metric">
            <div>
              <label className="wk-label">Duration</label>
              <input
                className="wk-input" type="number" inputMode="decimal" value={duration}
                onChange={(e) => setDuration(e.target.value)} aria-label="Duration" placeholder="min"
              />
            </div>
            <select value={durationUnit} onChange={(e) => setDurationUnit(e.target.value)}
              className="wk-input" aria-label="Duration unit">
              <option value="min">min</option>
              <option value="h">h</option>
              <option value="s">s</option>
            </select>
          </div>
          {fam === 'cardio' && (
            <>
              <div className="wk-spacer-10" />
              <div className="wk-grid-metric">
                <div>
                  <label className="wk-label">Distance</label>
                  <input
                    className="wk-input" type="number" inputMode="decimal" value={distance}
                    onChange={(e) => setDistance(e.target.value)} aria-label="Distance" placeholder="km"
                  />
                </div>
                <select value={distanceUnit} onChange={(e) => setDistanceUnit(e.target.value)}
                  className="wk-input" aria-label="Distance unit">
                  <option value="km">km</option>
                  <option value="mi">mi</option>
                  <option value="m">m</option>
                </select>
              </div>
              <div className="wk-spacer-10" />
              <label className="wk-label">Elevation gain (m)</label>
              <input
                className="wk-input" type="number" inputMode="decimal" value={elevation}
                onChange={(e) => setElevation(e.target.value)} aria-label="Elevation gain in metres" placeholder="m"
              />
            </>
          )}
          <div className="wk-spacer-10" />
          <label className="wk-label">Location</label>
          <input
            className="wk-input" value={location}
            onChange={(e) => setLocation(e.target.value)} aria-label="Location" placeholder="optional"
          />
          {fam === 'other' && (
            <>
              <div className="wk-spacer-10" />
              <label className="wk-label">Note</label>
              <input
                className="wk-input" value={note}
                onChange={(e) => setNote(e.target.value)} aria-label="Note" placeholder="optional"
              />
            </>
          )}
        </div>
      )}

      <div className="wk-spacer-16" />
      <button className="wk-btn-primary" onClick={handleCommit} aria-label="Save entry"
        disabled={!!saveBlockedReason}
        title={saveBlockedReason ? `Missing: ${saveBlockedReason}` : 'Save entry'}>
        {commitLabel || (total > 1 && position < total ? 'Save and review next' : 'Save to log')}
      </button>
      {saveBlockedReason && (
        <p className="wk-current-session-missing">Missing: {saveBlockedReason}.</p>
      )}
      <div className="wk-spacer-10" />
      <button className="wk-btn-secondary is-block" onClick={onCancel} aria-label="Discard entry">Discard</button>

      {pendingCategory && (
        <ConfirmModal
          title={`Switch to ${CATEGORIES[pendingCategory].label}?`}
          body={`${CATEGORIES[pendingCategory].label} logs different metrics, so the ${CATEGORIES[category].label.toLowerCase()} details you entered will be cleared.`}
          confirmLabel="Switch and clear"
          onConfirm={() => { applyCategory(pendingCategory); setPendingCategory(null) }}
          onCancel={() => setPendingCategory(null)}
        />
      )}
    </div>
  )
}
