import React, { useState, useRef, useEffect } from 'react'
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

  // Strength — ONE uniform spec: [Sets N] [Reps] [Weight] [unit], in DISPLAY
  // units. On commit we REPLICATE the single reps/weight into N identical sets.
  // (The per-row worksheet lives on the live-session card now; the add form is a
  // fast single-tap entry that seeds from last time.) Blank reps/weight are
  // allowed — the user fills them in later on the session worksheet.
  //
  // Seed order: draft's own first set if present; else the last logged entry's
  // LAST set (the "same as last time" default — one set, not all of last time's).
  const seedStrength = () => {
    const dsets = draft.metrics?.sets
    if (Array.isArray(dsets) && dsets.length > 0) {
      const first = dsets[0]
      return {
        sets: String(dsets.length),
        reps: first.reps ?? '',
        weight: first.weight ?? '',
        unit: first.unit === 'lb' ? 'lb' : 'kg',
      }
    }
    if (lastEntry && categoryFamily(lastEntry.category) === 'strength') {
      const prevSets = lastEntry.metrics?.sets || []
      if (prevSets.length > 0) {
        const last = prevSets[prevSets.length - 1]
        const unit = last.unit === 'lb' ? 'lb' : 'kg'
        return {
          sets: '1',
          reps: last.reps == null ? '' : String(last.reps),
          weight: last.weight_kg == null ? '' : String(fromKg(last.weight_kg, unit)),
          unit,
        }
      }
    }
    return { sets: '1', reps: '', weight: '', unit: 'kg' }
  }
  const seed = seedStrength()
  const [setCount, setSetCount] = useState(seed.sets)
  const [reps, setReps] = useState(seed.reps)
  const [weight, setWeight] = useState(seed.weight)
  const [strengthUnit, setStrengthUnit] = useState(seed.unit)
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

  // The category-switch confirm is a modal NESTED inside this entry sheet (which
  // already owns an outer shell back sentinel). Without its own sentinel, an
  // Android back press while it is open pops the OUTER sentinel and destroys the
  // whole in-progress entry instead of just dismissing the confirm. Push a
  // nested sentinel for the confirm's lifetime so back dismisses only the
  // confirm; the button paths clear pendingCategory, whose effect-cleanup pops
  // the sentinel (the ref guard prevents a double-pop when back already popped).
  const catNavRef = useRef(null)
  useEffect(() => {
    if (!pendingCategory) return undefined
    const navOpen = window.mobius?.nav?.open
    if (typeof navOpen !== 'function') return undefined
    let handle = null
    try {
      handle = navOpen('workout-category-confirm', () => {
        catNavRef.current = null
        setPendingCategory(null)
      })
    } catch { handle = null }
    if (!handle) return undefined
    catNavRef.current = handle
    handle.ready?.then(undefined, () => { if (catNavRef.current === handle) catNavRef.current = null })
    return () => {
      if (catNavRef.current === handle) {
        catNavRef.current = null
        try { handle.close?.() } catch {}
      }
    }
  }, [pendingCategory])

  // Sets is an integer ≥ 1. A blank or sub-1 typed value clamps to 1 on the way
  // into the commit draft; the input itself stays lenient so the user can clear
  // and retype without the field snapping under them mid-edit.
  const clampSetCount = (value) => {
    const n = Math.floor(Number(value))
    return Number.isFinite(n) && n >= 1 ? n : 1
  }
  const stepSetCount = (delta) =>
    setSetCount((prev) => String(Math.max(1, clampSetCount(prev) + delta)))
  const metricNumber = (value) => {
    if (value === '' || value == null) return null
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }

  const familyHasData = (family) => {
    if (family === 'strength') return weight !== '' || reps !== ''
    if (family === 'cardio') return duration !== '' || distance !== '' || elevation !== '' || location !== ''
    return duration !== '' || location !== '' || note !== ''
  }
  const clearFamilyFields = (family) => {
    if (family === 'strength') {
      setSetCount('1'); setReps(''); setWeight(''); setStrengthUnit('kg')
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
      // REPLICATE the single spec into N identical sets. Blank reps/weight pass
      // through as null (allowed — completed later on the session worksheet).
      const n = clampSetCount(setCount)
      const one = { weight: metricNumber(weight), reps: metricNumber(reps), unit: strengthUnit }
      metrics = { sets: Array.from({ length: n }, () => ({ ...one })) }
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

  // The add form intentionally lets a partial entry through: the owner logs
  // "3 sets of squats" now and fills reps/weight in later on the live-session
  // worksheet. So Save is blocked ONLY on a missing activity (a generic category
  // label is not a real activity name) — never on blank reps/weight, blank
  // duration, or blank distance. The completeness gate (currentSessionReady +
  // the "Missing: …" summary) still lives on CurrentSessionPanel, which is where
  // the entry gets finished.
  const commitPreview = normalizeEntry(buildCommitDraft(), {
    id: 'confirm-preview',
    ts: commitTs(),
    raw: '',
    source: 'manual',
    confirmed: true,
  })
  const activityMissing = sessionEntryMissing(commitPreview) === 'activity'
  const saveBlockedReason = activityMissing ? 'activity' : null

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
          {/* One uniform spec: N sets of the same reps × weight. Reps/weight may
              be left blank and completed later on the live-session worksheet. */}
          <div className="wk-grid-metric">
            <div>
              <label className="wk-label">Sets</label>
              <div className="wk-stepper">
                <button
                  type="button" className="wk-btn-ghost is-muted wk-min44"
                  onClick={() => stepSetCount(-1)} aria-label="Fewer sets"
                  disabled={clampSetCount(setCount) <= 1}
                >−</button>
                <input
                  className="wk-input wk-stepper-input" type="number" inputMode="numeric"
                  min="1" value={setCount}
                  onChange={(e) => setSetCount(e.target.value)}
                  onBlur={() => setSetCount(String(clampSetCount(setCount)))}
                  aria-label="Number of sets" enterKeyHint="next"
                />
                <button
                  type="button" className="wk-btn-ghost is-muted wk-min44"
                  onClick={() => stepSetCount(1)} aria-label="More sets"
                >+</button>
              </div>
            </div>
            <div>
              <label className="wk-label">Unit</label>
              <select
                value={strengthUnit}
                onChange={(e) => setStrengthUnit(e.target.value)}
                className="wk-input" aria-label="Weight unit"
              >
                <option value="kg">kg</option>
                <option value="lb">lb</option>
              </select>
            </div>
          </div>
          <div className="wk-spacer-10" />
          <div className="wk-grid-metric">
            <div>
              <label className="wk-label">Reps</label>
              <input
                className="wk-input" type="number" inputMode="numeric" value={reps}
                onChange={(e) => setReps(e.target.value)}
                aria-label="Reps per set" placeholder="reps" enterKeyHint="next"
              />
            </div>
            <div>
              <label className="wk-label">Weight</label>
              <input
                className="wk-input" type="number" inputMode="decimal" value={weight}
                onChange={(e) => setWeight(e.target.value)}
                aria-label="Weight per set" placeholder={strengthUnit} enterKeyHint="done"
              />
            </div>
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
