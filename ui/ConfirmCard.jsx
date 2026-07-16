import React, { useState, useRef, useEffect, useMemo } from 'react'
import {
  ACTIVITY_GROUPS, ACTIVITY_LIBRARY, CATEGORIES, categoryFamily, findActivityLibraryItem,
  fromKg, localDate, normalizeEntry, searchActivityLibrary, sessionEntryMissing,
  sportIconColor, sportIconKey,
} from '../logic.js'
import { metresToDisplay, secondsToDisplay } from '../format.js'
import { ConfirmModal } from './ConfirmModal.jsx'
import { SportIcon } from './SportIcon.jsx'

export function ConfirmCard({
  draft, ambiguous, clarification, onCommit, onCancel, position = 1, total = 1,
  initialTs = Date.now(), title = null, commitLabel = null, helperText = null,
  lastEntry = null, collapseTiming = false,
}) {
  const [category, setCategory] = useState(draft.category)
  const [activity, setActivity] = useState(draft.activity)
  const [activitySearch, setActivitySearch] = useState(draft.activity)
  const [activityGroup, setActivityGroup] = useState('all')
  const [showAllActivities, setShowAllActivities] = useState(false)
  const fam = categoryFamily(category)
  const selectedIcon = sportIconKey(activity, category)
  const selectedColor = sportIconColor(selectedIcon, category)
  const selectedMetricLabel = fam === 'strength' ? 'Sets' : fam === 'cardio' ? 'Distance/time' : 'Duration/notes'
  const groupLabels = useMemo(() => new Map(ACTIVITY_GROUPS.map((group) => [group.key, group.label])), [])
  const activityGroupCounts = useMemo(() => {
    const counts = Object.fromEntries(ACTIVITY_GROUPS.map((group) => [group.key, 0]))
    counts.all = ACTIVITY_LIBRARY.length
    for (const item of ACTIVITY_LIBRARY) counts[item.group] = (counts[item.group] || 0) + 1
    return counts
  }, [])
  const activityResults = useMemo(
    () => searchActivityLibrary(activitySearch, {
      group: activityGroup,
      limit: activitySearch.trim() ? 48 : showAllActivities ? 96 : 6,
    }),
    [activityGroup, activitySearch, showAllActivities],
  )
  const groupActivityCount = activityGroupCounts[activityGroup] || activityResults.length
  const resultCountLabel = activitySearch.trim()
    ? `${activityResults.length} ${activityResults.length === 1 ? 'match' : 'matches'}`
    : showAllActivities || groupActivityCount <= activityResults.length
      ? `${groupActivityCount} activities`
      : `${activityResults.length} of ${groupActivityCount} activities`
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
  // Activity changes can also change metric family (sets vs distance/time vs
  // duration/note). Since handleCommit only reads the CURRENT family's fields,
  // the old values would be dropped silently on save — so we confirm before
  // clearing when the abandoned family actually holds entered data.
  const [pendingActivity, setPendingActivity] = useState(null)

  // The activity-family confirm is a modal NESTED inside this entry sheet (which
  // already owns an outer shell back sentinel). Without its own sentinel, an
  // Android back press while it is open pops the OUTER sentinel and destroys the
  // whole in-progress entry instead of just dismissing the confirm. Push a
  // nested sentinel for the confirm's lifetime so back dismisses only the
  // confirm; the button paths clear pendingActivity, whose effect-cleanup pops
  // the sentinel (the ref guard prevents a double-pop when back already popped).
  const catNavRef = useRef(null)
  useEffect(() => {
    if (!pendingActivity) return undefined
    const navOpen = window.mobius?.nav?.open
    if (typeof navOpen !== 'function') return undefined
    let handle = null
    try {
      handle = navOpen('workout-category-confirm', () => {
        catNavRef.current = null
        setPendingActivity(null)
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
  }, [pendingActivity])

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
  const applyActivity = (item) => {
    if (!item) return
    const prevFam = categoryFamily(category)
    const nextFam = categoryFamily(item.category)
    if (nextFam !== prevFam) clearFamilyFields(prevFam)
    setCategory(item.category)
    setActivity(item.name)
    setActivitySearch(item.name)
  }
  const requestActivity = (item) => {
    if (!item) return
    if (item.name === activity && item.category === category) return
    const prevFam = categoryFamily(category)
    const nextFam = categoryFamily(item.category)
    if (nextFam === prevFam || !familyHasData(prevFam)) {
      applyActivity(item)
      return
    }
    setPendingActivity(item)
  }
  const handleActivityTyping = (value) => {
    setActivitySearch(value)
    setActivity(value)
    setShowAllActivities(false)
    const exact = findActivityLibraryItem(value)
    if (!exact) return
    if (exact.category === category) {
      setActivity(exact.name)
    } else if (!familyHasData(categoryFamily(category))) {
      applyActivity(exact)
    }
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

  const timingFields = (
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
  )

  return (
    <div className={`wk-card wk-confirm-card${ambiguous ? ' is-ambiguous' : ''}`}>
      <h2 className="wk-card-title">
        {title || (ambiguous ? 'Check this one' : 'Edit entry')}
        {total > 1 ? ` · ${position}/${total}` : ''}
      </h2>
      {ambiguous && clarification ? (
        <p className="wk-card-sub">{clarification}</p>
      ) : (
        <p className="wk-card-sub">
          {helperText || (total > 1
            ? 'Tweak anything, then save this part and review the next one.'
            : 'Tweak anything, then add it to your session.')}
        </p>
      )}

      <div className="wk-activity-picker">
        <div className="wk-activity-head">
          <label className="wk-label" htmlFor="wk-activity-search">Activity</label>
          <div className="wk-activity-selected" title={`${CATEGORIES[category].label} · ${selectedMetricLabel}`}>
            <SportIcon name={selectedIcon} color={selectedColor} size={15} />
            <span>{selectedMetricLabel}</span>
          </div>
        </div>
        <input
          id="wk-activity-search"
          className="wk-input wk-activity-search"
          value={activitySearch}
          onChange={(e) => handleActivityTyping(e.target.value)}
          aria-label="Activity name"
          placeholder="Search activities"
          enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck="false"
        />
        <div className="wk-activity-group-row" role="group" aria-label="Activity groups">
          {ACTIVITY_GROUPS.map((group) => (
            <button
              key={group.key}
              type="button"
              className={`wk-activity-group${activityGroup === group.key ? ' is-active' : ''}`}
              onClick={() => {
                setActivityGroup(group.key)
                setShowAllActivities(false)
              }}
              aria-pressed={activityGroup === group.key}
            >
              <span>{group.label}</span>
              <span className="wk-activity-group-count">{activityGroupCounts[group.key] || 0}</span>
            </button>
          ))}
        </div>
        <div className="wk-activity-result-count" aria-live="polite">{resultCountLabel}</div>
        <div className="wk-activity-results" aria-label="Activity results">
          {activityResults.map((item) => {
            const active = item.name === activity && item.category === category
            return (
              <button
                key={`${item.group}:${item.category}:${item.name}`}
                type="button"
                className={`wk-activity-option${active ? ' is-active' : ''}`}
                onClick={() => requestActivity(item)}
                aria-pressed={active}
              >
                <span className="wk-activity-option-icon" aria-hidden>
                  <SportIcon name={item.icon} color={item.color} size={17} />
                </span>
                <span className="wk-activity-option-text">
                  <span className="wk-activity-option-name">{item.name}</span>
                  <span className="wk-activity-option-meta">
                    {groupLabels.get(item.group) || 'Activity'} · {item.metricLabel}
                  </span>
                </span>
              </button>
            )
          })}
          {activityResults.length === 0 && activitySearch.trim() && (
            <button
              type="button"
              className="wk-activity-option is-custom"
              onClick={() => {
                setActivity(activitySearch.trim())
                setActivitySearch(activitySearch.trim())
              }}
            >
              <span className="wk-activity-option-icon" aria-hidden>
                <SportIcon name={selectedIcon} color={selectedColor} size={17} />
              </span>
              <span className="wk-activity-option-text">
                <span className="wk-activity-option-name">{activitySearch.trim()}</span>
                <span className="wk-activity-option-meta">Custom</span>
              </span>
            </button>
          )}
        </div>
        {!activitySearch.trim() && !showAllActivities && groupActivityCount > activityResults.length && (
          <button
            type="button"
            className="wk-activity-more"
            onClick={() => setShowAllActivities(true)}
          >
            View all {groupActivityCount} activities
          </button>
        )}
      </div>

      <div className="wk-spacer-12" />
      {collapseTiming ? (
        <details className="wk-more-options">
          <summary>More options</summary>
          <div className="wk-spacer-10" />
          {timingFields}
        </details>
      ) : timingFields}

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
      <button className="wk-btn-primary" onClick={handleCommit} aria-label={commitLabel || 'Add entry'}
        disabled={!!saveBlockedReason}
        title={saveBlockedReason ? `Missing: ${saveBlockedReason}` : commitLabel || 'Add entry'}>
        {commitLabel || (total > 1 && position < total ? 'Save and review next' : 'Add to session')}
      </button>
      {saveBlockedReason && (
        <p className="wk-current-session-missing">Missing: {saveBlockedReason}.</p>
      )}
      <div className="wk-spacer-10" />
      <button className="wk-btn-secondary is-block" onClick={onCancel} aria-label="Discard entry">Discard</button>

      {pendingActivity && (
        <ConfirmModal
          title={`Switch to ${pendingActivity.name}?`}
          body={`${pendingActivity.name} uses ${pendingActivity.metricLabel} metrics, so the ${CATEGORIES[category].label.toLowerCase()} details you entered will be cleared.`}
          confirmLabel="Switch and clear"
          onConfirm={() => { applyActivity(pendingActivity); setPendingActivity(null) }}
          onCancel={() => setPendingActivity(null)}
        />
      )}
    </div>
  )
}
