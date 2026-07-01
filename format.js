// Pure display/analytics helpers used across the Insights and History UI:
// unit-display conversion (seconds/metres), the stored-entry → editable-draft
// projection, date grouping, weekly-volume + per-category aggregation, and the
// per-exercise detail-sheet formatters. No React/DOM — extracted from index.jsx
// unchanged (modularization). Pure logic (CATEGORIES, unit conversions, records,
// session grouping, fmt*) is imported from logic.js.
import {
  CATEGORIES, categoryFamily, fromKg, localDate, groupSessions,
  fmtDistance, fmtDuration,
} from './logic.js'

export function secondsToDisplay(seconds) {
  const s = Number(seconds)
  if (!Number.isFinite(s) || s <= 0) return { value: '', unit: 'min' }
  if (s % 3600 === 0) return { value: s / 3600, unit: 'h' }
  if (s % 60 === 0) return { value: s / 60, unit: 'min' }
  return { value: s, unit: 's' }
}

export function metresToDisplay(metres) {
  const m = Number(metres)
  if (!Number.isFinite(m) || m <= 0) return { value: '', unit: 'km' }
  if (m >= 1000 && m % 1000 === 0) return { value: m / 1000, unit: 'km' }
  return { value: m, unit: 'm' }
}

export function draftFromStoredEntry(entry) {
  const category = CATEGORIES[entry.category] ? entry.category : 'other'
  const fam = categoryFamily(category)
  let metrics
  if (fam === 'strength') {
    metrics = {
      sets: (entry.metrics?.sets || []).map((set) => {
        const unit = set.unit === 'lb' ? 'lb' : 'kg'
        return {
          weight: set.weight_kg == null ? '' : fromKg(set.weight_kg, unit),
          reps: set.reps ?? '',
          unit,
        }
      }),
    }
  } else if (fam === 'cardio') {
    const duration = secondsToDisplay(entry.metrics?.duration_s)
    const distance = metresToDisplay(entry.metrics?.distance_m)
    metrics = {
      duration,
      distance,
      elevation: entry.metrics?.elevation_m == null ? undefined : { value: entry.metrics.elevation_m, unit: 'm' },
      location: entry.metrics?.location || '',
    }
  } else {
    const duration = secondsToDisplay(entry.metrics?.duration_s)
    metrics = {
      duration,
      location: entry.metrics?.location || '',
      note: entry.metrics?.note || '',
    }
  }
  return { category, activity: entry.activity || CATEGORIES[category].label, metrics }
}

export function groupEntriesByDate(entries) {
  const byDate = new Map()
  for (const entry of [...(entries || [])].sort((a, b) => b.ts - a.ts)) {
    const key = entry.localDate || localDate(new Date(entry.ts))
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key).push(entry)
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, rows]) => ({ date, entries: rows }))
}

export function startOfWeekTs(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d.getTime()
}

export function entryVolume(entry) {
  const fam = categoryFamily(entry.category)
  if (fam === 'strength') {
    return (entry.metrics?.sets || []).reduce((sum, s) => sum + ((s.weight_kg || 0) * (s.reps || 0)), 0)
  }
  if (fam === 'cardio') return (entry.metrics?.distance_m || 0) / 1000
  return (entry.metrics?.duration_s || 0) / 60
}

export function weeklyVolumeByCategory(entries) {
  const now = Date.now()
  // Build the 6 week-start keys with CALENDAR arithmetic (setDate + the same
  // startOfWeekTs entries use), so a bucket key equals startOfWeekTs(entry.ts)
  // exactly. Subtracting a fixed 7*24h in ms drifts by an hour across a DST
  // transition, landing off the true local midnight — then byTs.get() misses
  // and that week's entries silently vanish from the chart.
  const weeks = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - (5 - i) * 7)
    const ts = startOfWeekTs(d.getTime())
    return {
      ts,
      label: new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' }),
      values: {},
    }
  })
  const byTs = new Map(weeks.map((w) => [w.ts, w]))
  for (const entry of entries || []) {
    const weekTs = startOfWeekTs(entry.ts)
    const week = byTs.get(weekTs)
    if (!week) continue
    const amount = entryVolume(entry)
    if (amount > 0) {
      week.values[entry.category] = Math.round(((week.values[entry.category] || 0) + amount) * 10) / 10
    }
  }
  return weeks
}

export function categoryStats(entries) {
  const sessions = groupSessions(entries)
  // Precompute entry-id → sessionId in O(n) to avoid the O(n²) sessions.find
  // scan that fired for every entry below.
  const sessionByEntry = new Map()
  for (const s of sessions) {
    for (const e of s.entries) sessionByEntry.set(e.id, s.sessionId)
  }
  const byCategory = new Map()
  for (const entry of entries || []) {
    const cat = CATEGORIES[entry.category] ? entry.category : 'other'
    if (!byCategory.has(cat)) {
      byCategory.set(cat, {
        category: cat,
        label: CATEGORIES[cat].label,
        color: CATEGORIES[cat].color,
        entries: 0,
        sessions: new Set(),
        strengthVolume: 0,
        distanceKm: 0,
        durationMin: 0,
      })
    }
    const row = byCategory.get(cat)
    row.entries += 1
    const sid = sessionByEntry.get(entry.id)
    if (sid) row.sessions.add(sid)
    const fam = categoryFamily(cat)
    if (fam === 'strength') row.strengthVolume += entryVolume(entry)
    else if (fam === 'cardio') {
      row.distanceKm += (entry.metrics?.distance_m || 0) / 1000
      row.durationMin += (entry.metrics?.duration_s || 0) / 60
    } else {
      row.durationMin += (entry.metrics?.duration_s || 0) / 60
    }
  }
  return [...byCategory.values()]
    .map((row) => ({ ...row, sessions: row.sessions.size }))
    .sort((a, b) => b.entries - a.entries)
}

// Best weight (kg) rendered back in the user's chosen unit, e.g. "100kg".
export function fmtWeight(weightKg, unit) {
  return `${fromKg(weightKg, unit)}${unit || 'kg'}`
}

// Pace number (seconds/km) → "5:00/km". Mirrors fmtPace but takes the already-
// computed pace from a record so we don't re-derive distance/duration.
export function paceLabel(secPerKm) {
  if (secPerKm == null) return '—'
  const mins = Math.floor(secPerKm / 60)
  const secs = String(Math.round(secPerKm % 60)).padStart(2, '0')
  return `${mins}:${secs}/km`
}

export function shortDate(ts) {
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// Pick which series to plot for an exercise: strength → e1RM, cardio → distance
// (or duration if it never logs distance), everything else → duration.
export function detailTrend(detail) {
  const { family, points, records } = detail
  if (points.length === 0) return null
  // A trend is only meaningful if some point has a positive value. Without this,
  // an exercise whose sets all lack reps (e1RM=0) — or a note-only "other" log —
  // would draw a flat line pinned at "0kg/0m" and read as real data.
  const signal = (series) => series.some((p) => (Number(p.value) || 0) > 0)
  if (family === 'strength') {
    const unit = records.unit || 'kg'
    const series = points.map((p) => ({ ts: p.ts, value: p.e1rm }))
    return signal(series)
      ? { label: 'Estimated 1RM', series, fmt: (v) => fmtWeight(Math.round(v * 10) / 10, unit) }
      : null
  }
  if (family === 'cardio') {
    const hasDist = points.some((p) => (p.distance_m || 0) > 0)
    const series = points.map((p) => ({ ts: p.ts, value: hasDist ? p.distance_m : p.duration_s }))
    return signal(series)
      ? { label: hasDist ? 'Distance' : 'Duration', series, fmt: (v) => (hasDist ? fmtDistance(v) : fmtDuration(v)) }
      : null
  }
  const series = points.map((p) => ({ ts: p.ts, value: p.duration_s }))
  return signal(series) ? { label: 'Duration', series, fmt: (v) => fmtDuration(v) } : null
}

// Headline record tiles per family, mirroring Hevy's exercise summary.
export function detailRecordTiles(detail) {
  const r = detail.records
  if (detail.family === 'strength') {
    const unit = r.unit || 'kg'
    return [
      { label: 'Est. 1RM', value: r.bestE1rm ? fmtWeight(r.bestE1rm, unit) : '—' },
      { label: 'Heaviest', value: r.heaviest_kg ? fmtWeight(r.heaviest_kg, unit) : '—' },
      { label: 'Best set vol', value: r.bestSetVolume_kg ? `${Math.round(fromKg(r.bestSetVolume_kg, unit))} ${unit}` : '—' },
      { label: 'Best session', value: r.bestSessionVolume_kg ? `${Math.round(fromKg(r.bestSessionVolume_kg, unit))} ${unit}` : '—' },
      { label: 'Most reps', value: r.mostReps || '—' },
    ]
  }
  if (detail.family === 'cardio') {
    return [
      { label: 'Longest', value: r.maxDistance_m ? fmtDistance(r.maxDistance_m) : '—' },
      { label: 'Longest time', value: r.maxDuration_s ? fmtDuration(r.maxDuration_s) : '—' },
      { label: 'Best pace', value: paceLabel(r.bestPace_s_per_km) },
      { label: 'Total dist', value: r.totalDistance_m ? fmtDistance(r.totalDistance_m) : '—' },
      ...(r.maxElevation_m ? [{ label: 'Max elev', value: `↑${Math.round(r.maxElevation_m)}m` }] : []),
    ]
  }
  return [
    { label: 'Longest', value: r.maxDuration_s ? fmtDuration(r.maxDuration_s) : '—' },
    { label: 'Total time', value: r.totalDuration_s ? fmtDuration(r.totalDuration_s) : '—' },
    { label: 'Sessions', value: detail.sessionCount },
  ]
}

// One history line per session, newest first.
export function detailHistorySummary(point, family) {
  if (family === 'strength') {
    const parts = []
    if (point.topWeight_kg) parts.push(`${fmtWeight(point.topWeight_kg, point.unit)} top`)
    if (point.sets) parts.push(`${point.sets} set${point.sets === 1 ? '' : 's'}`)
    if (point.volume_kg) parts.push(`${Math.round(fromKg(point.volume_kg, point.unit))} ${point.unit || 'kg'} vol`)
    return parts.join(' · ') || '—'
  }
  if (family === 'cardio') {
    const parts = []
    if (point.distance_m) parts.push(fmtDistance(point.distance_m))
    if (point.pace_s_per_km != null) parts.push(paceLabel(point.pace_s_per_km))
    if (point.duration_s) parts.push(fmtDuration(point.duration_s))
    if (point.elevation_m) parts.push(`↑${Math.round(point.elevation_m)}m`)
    return parts.join(' · ') || '—'
  }
  const parts = []
  if (point.duration_s) parts.push(fmtDuration(point.duration_s))
  if (point.note) parts.push(point.note)
  if (point.location) parts.push(point.location)
  return parts.join(' · ') || '—'
}

