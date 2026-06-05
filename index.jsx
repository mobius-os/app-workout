import React, {
  useState, useEffect, useCallback, useMemo, useRef,
} from 'react'
// The pure logic lives in logic.js (the test target) and is inlined below by
// build-entry.mjs, because Mobius's installer compiles ONLY this single entry
// file — a relative import of a sibling module can't be resolved at install.
// Edit logic.js, then `node build-entry.mjs` to regenerate the block.
// ===== INLINE-LOGIC START (generated from logic.js — run build-entry.mjs) =====
// ---------------------------------------------------------------------------
// Pure logic — no React, no DOM, no window. Everything here is a function of
// its inputs so it can be unit-tested under `node --test` without a browser.
//
// The app (index.jsx) imports these; so do the tests in __tests__/. Keeping
// the parse→normalize mapping, session grouping, and the analytics math out
// of the component means we can prove the load-bearing behavior offline (the
// LLM call itself can't be tested offline, but everything downstream of its
// JSON can).
// ---------------------------------------------------------------------------

// The 10-category enum. The LLM picks the KEY; the app owns the icon + color
// so a model that hallucinates an emoji can't drift the look of the app. Any
// unrecognized key the model returns collapses to `other` at normalize time.
//
// `icon` is a Tabler icon KEY (e.g. 'barbell'), not a glyph: logic.js stays
// pure (no JSX/SVG), so the rendering layer (index.jsx) maps the key to inline
// Tabler SVG markup. The keys below all resolve to real Tabler outline icons.
const CATEGORIES = {
  strength: { label: 'Strength', icon: 'barbell', color: '#6366f1', family: 'strength' },
  cardio: { label: 'Cardio', icon: 'heartbeat', color: '#ef4444', family: 'cardio' },
  running: { label: 'Running', icon: 'run', color: '#f97316', family: 'cardio' },
  cycling: { label: 'Cycling', icon: 'bike', color: '#14b8a6', family: 'cardio' },
  swimming: { label: 'Swimming', icon: 'swimming', color: '#06b6d4', family: 'cardio' },
  rowing: { label: 'Rowing', icon: 'kayak', color: '#3b82f6', family: 'cardio' },
  hiking: { label: 'Hiking', icon: 'mountain', color: '#10b981', family: 'cardio' },
  yoga: { label: 'Yoga', icon: 'yoga', color: '#8b5cf6', family: 'other' },
  sport: { label: 'Sport', icon: 'ball-football', color: '#ec4899', family: 'other' },
  other: { label: 'Other', icon: 'sparkles', color: '#a1a1aa', family: 'other' },
}

const CATEGORY_KEYS = Object.keys(CATEGORIES)

// Which metric family a category logs. Strength logs sets; the cardio family
// logs duration/distance; everything else logs duration/location/note. The
// LLM is told this split so it returns the right metrics shape, but we re-derive
// it here at normalize time rather than trusting the model's `family`.
function categoryFamily(category) {
  return CATEGORIES[category]?.family || 'other'
}

// Default gap (ms) that splits one session from the next. Two entries within
// 4h of each other belong to the same session; a longer gap starts a new one.
const SESSION_GAP_MS = 4 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Unit conversion — we STORE SI (kg, metres, seconds) so analytics never has
// to branch on unit. The composer/LLM may report lb/mi/km/etc; we convert on
// the way in and format back out for display.
// ---------------------------------------------------------------------------

const LB_PER_KG = 2.2046226218

function toKg(value, unit) {
  const v = Number(value)
  if (!isFinite(v)) return 0
  return unit === 'lb' ? Math.round((v / LB_PER_KG) * 100) / 100 : v
}

function fromKg(kg, unit) {
  const v = Number(kg)
  if (!isFinite(v)) return 0
  return unit === 'lb' ? Math.round(v * LB_PER_KG * 10) / 10 : v
}

// distance → metres. Accepts m, km, mi.
function toMetres(value, unit) {
  if (value === '' || value == null) return null
  const v = Number(value)
  if (!isFinite(v)) return null
  if (unit === 'km') return Math.round(v * 1000)
  if (unit === 'mi') return Math.round(v * 1609.344)
  return Math.round(v)
}

// duration → seconds. Accepts s, min, h.
function toSeconds(value, unit) {
  if (value === '' || value == null) return null
  const v = Number(value)
  if (!isFinite(v)) return null
  if (unit === 'min') return Math.round(v * 60)
  if (unit === 'h') return Math.round(v * 3600)
  return Math.round(v)
}

// ---------------------------------------------------------------------------
// Local-day ISO (YYYY-MM-DD) for a Date — the user thinks "did I train today"
// in their local clock, not UTC, so we slice from local components.
// ---------------------------------------------------------------------------

function localDate(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2, 9)
}

// Extract the first BALANCED, parseable JSON object from a string that may be
// wrapped in prose or ```json fences. A greedy /\{[\s\S]*\}/ breaks when the
// model adds a trailing brace or commentary after the object; this scans each
// '{' for a string-aware balanced match and returns the first that JSON.parses
// (or null). Kept for tests and legacy parsed payload migration.
function extractFirstJsonObject(text) {
  if (typeof text !== 'string') return null
  for (let i = text.indexOf('{'); i >= 0; i = text.indexOf('{', i + 1)) {
    let depth = 0, inStr = false, esc = false
    for (let j = i; j < text.length; j++) {
      const c = text[j]
      if (inStr) {
        if (esc) esc = false
        else if (c === '\\') esc = true
        else if (c === '"') inStr = false
      } else if (c === '"') inStr = true
      else if (c === '{') depth++
      else if (c === '}') {
        depth -= 1
        if (depth === 0) {
          try { return JSON.parse(text.slice(i, j + 1)) } catch { break }
        }
      }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// parseEntry → normalizeEntry. Older/custom parsers returned a loose,
// display-unit JSON blob; normalizeEntry turns that into the canonical stored
// Entry shape with SI units, a clamped category, and a stable id+ts. Keeping
// it pure means tests can feed a hand-written "parsed" object and assert the
// stored entry exactly.
//
// parsed shape:
//   { category, activity, icon?, metrics, ambiguous?, clarification? }
// or for multi-activity input:
//   { entries: [{ category, activity, metrics, ambiguous?, clarification? }],
//     ambiguous?, clarification? }
//   strength metrics: { sets: [{ weight, reps, unit }] }
//   cardio metrics:   { duration: {value,unit}, distance: {value,unit},
//                       location, elevation: {value,unit} }
//   other metrics:    { duration: {value,unit}, location, note }
// ---------------------------------------------------------------------------

function draftFromParsed(parsed, fallback = {}) {
  const entry = parsed && typeof parsed === 'object' ? parsed : {}
  return {
    draft: {
      category: CATEGORY_KEYS.includes(entry.category) ? entry.category : 'other',
      activity: typeof entry.activity === 'string' ? entry.activity : '',
      metrics: (entry.metrics && typeof entry.metrics === 'object') ? entry.metrics : {},
    },
    ambiguous: !!(entry.ambiguous || fallback.ambiguous),
    clarification: typeof entry.clarification === 'string' && entry.clarification.trim()
      ? entry.clarification.trim()
      : (typeof fallback.clarification === 'string' ? fallback.clarification : ''),
  }
}

function draftsFromParsedPayload(payload) {
  if (!payload || typeof payload !== 'object') return []
  const fallback = {
    ambiguous: !!payload.ambiguous,
    clarification: typeof payload.clarification === 'string' ? payload.clarification : '',
  }
  const rows = Array.isArray(payload.entries) ? payload.entries : [payload]
  return rows
    .filter((row) => row && typeof row === 'object')
    .map((row) => draftFromParsed(row, fallback))
}

function normalizeEntry(parsed, opts = {}) {
  const tsValue = Number(opts.ts ?? Date.now())
  const ts = Number.isFinite(tsValue) ? tsValue : Date.now()
  const at = new Date(ts)
  const category = CATEGORY_KEYS.includes(parsed?.category) ? parsed.category : 'other'
  const family = categoryFamily(category)
  const m = parsed?.metrics || {}

  let metrics
  if (family === 'strength') {
    metrics = {
      sets: (Array.isArray(m.sets) ? m.sets : []).map((s) => {
        const rawWeight = finiteMetricNumber(s.weight)
        const rawReps = finiteMetricNumber(s.reps)
        return {
          // Store SI (kg). reps is dimensionless. We keep the user's display
          // unit on the set so the card can echo "100kg" vs "225lb" back.
          weight_kg: rawWeight == null ? null : Math.max(0, toKg(rawWeight, s.unit || 'kg')),
          reps: rawReps == null ? null : Math.max(0, Math.round(rawReps)),
          unit: s.unit === 'lb' ? 'lb' : 'kg',
        }
      }),
    }
  } else if (family === 'cardio') {
    metrics = {
      duration_s: m.duration ? toSeconds(m.duration.value, m.duration.unit) : null,
      distance_m: m.distance ? toMetres(m.distance.value, m.distance.unit) : null,
      elevation_m: m.elevation ? toMetres(m.elevation.value, m.elevation.unit) : null,
      location: m.location || null,
    }
  } else {
    metrics = {
      duration_s: m.duration ? toSeconds(m.duration.value, m.duration.unit) : null,
      location: m.location || null,
      note: m.note || null,
    }
  }

  return {
    id: opts.id || uid(),
    ts,
    localDate: localDate(at),
    sessionId: opts.sessionId || null, // assigned by assignSession at commit
    category,
    activity: (typeof parsed?.activity === 'string' && parsed.activity.trim())
      ? parsed.activity.trim()
      : CATEGORIES[category].label,
    icon: CATEGORIES[category].icon, // app owns the icon, ignore parsed.icon
    metrics,
    raw: opts.raw || '',
    source: opts.source || 'ai',
    confirmed: opts.confirmed !== false,
  }
}

function textOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberOrNull(value) {
  if (value === '' || value == null) return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function finiteMetricNumber(value) {
  if (value === '' || value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function normalizeStoredEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const ts = Number(entry.ts)
  if (!Number.isFinite(ts)) return null
  const category = CATEGORY_KEYS.includes(entry.category) ? entry.category : 'other'
  const family = categoryFamily(category)
  const sourceMetrics = entry.metrics && typeof entry.metrics === 'object' ? entry.metrics : {}
  let metrics

  if (family === 'strength') {
    metrics = {
      sets: (Array.isArray(sourceMetrics.sets) ? sourceMetrics.sets : [])
        .map((s) => {
          const sourceWeight = s?.weight_kg ?? (
            numberOrNull(s?.weight) == null ? null : toKg(s?.weight, s?.unit || 'kg')
          )
          const weight_kg = numberOrNull(sourceWeight)
          const reps = numberOrNull(s?.reps) == null ? null : Math.max(0, Math.round(Number(s.reps)))
          if (Number(sourceWeight) < 0 && (!reps || reps <= 0)) return null
          return {
            weight_kg,
            reps,
            unit: s?.unit === 'lb' ? 'lb' : 'kg',
          }
        })
        .filter(Boolean)
    }
  } else if (family === 'cardio') {
    metrics = {
      duration_s: numberOrNull(sourceMetrics.duration_s),
      distance_m: numberOrNull(sourceMetrics.distance_m),
      elevation_m: numberOrNull(sourceMetrics.elevation_m),
      location: textOrNull(sourceMetrics.location),
    }
  } else {
    metrics = {
      duration_s: numberOrNull(sourceMetrics.duration_s),
      location: textOrNull(sourceMetrics.location),
      note: textOrNull(sourceMetrics.note),
    }
  }

  return {
    id: textOrNull(entry.id) || uid(),
    ts,
    localDate: textOrNull(entry.localDate) || localDate(new Date(ts)),
    sessionId: textOrNull(entry.sessionId) || null,
    category,
    activity: textOrNull(entry.activity) || CATEGORIES[category].label,
    icon: CATEGORIES[category].icon,
    metrics,
    raw: typeof entry.raw === 'string' ? entry.raw : '',
    source: textOrNull(entry.source) || 'ai',
    confirmed: entry.confirmed !== false,
  }
}

function normalizeStoredEntries(entries) {
  if (!Array.isArray(entries)) return []
  return entries
    .map(normalizeStoredEntry)
    .filter(Boolean)
    .sort((a, b) => a.ts - b.ts)
}

function mergeEntriesForSave(localEntries, remoteEntries, deletedIds = []) {
  const deleted = new Set((deletedIds || []).filter(Boolean))
  const merged = new Map()
  for (const entry of normalizeStoredEntries(remoteEntries)) {
    if (!deleted.has(entry.id)) merged.set(entry.id, entry)
  }
  for (const entry of normalizeStoredEntries(localEntries)) {
    if (!deleted.has(entry.id)) merged.set(entry.id, entry)
  }
  return [...merged.values()].sort((a, b) => a.ts - b.ts)
}

// ---------------------------------------------------------------------------
// Session grouping — entries within SESSION_GAP_MS of each other (in time
// order) share a sessionId. groupSessions takes the full append-only entries
// list and returns derived session objects without mutating the entries.
// ---------------------------------------------------------------------------

function groupSessions(entries, gapMs = SESSION_GAP_MS) {
  const sorted = [...(entries || [])]
    .filter((e) => Number.isFinite(Number(e?.ts)))
    .sort((a, b) => Number(a.ts) - Number(b.ts))
  const sessions = []
  let current = null
  for (const e of sorted) {
    const ts = Number(e.ts)
    // Merge into the open session only within the gap AND when the stored
    // sessionId agrees (or the entry has none). Respecting an explicit
    // sessionId stops two deliberately-separate sessions that happen to fall
    // within the gap from being silently fused.
    if (
      current &&
      ts >= current.lastTs &&
      ts - current.lastTs <= gapMs &&
      (!e.sessionId || e.sessionId === current.sessionId)
    ) {
      current.entries.push(e)
      current.lastTs = ts
    } else {
      current = {
        sessionId: e.sessionId || `s-${ts}`,
        startTs: ts,
        lastTs: ts,
        localDate: e.localDate || localDate(new Date(ts)),
        entries: [e],
      }
      sessions.push(current)
    }
  }
  return sessions.map((s) => ({
    sessionId: s.sessionId,
    startTs: s.startTs,
    endTs: s.lastTs,
    localDate: s.localDate,
    entries: s.entries,
    categories: [...new Set(s.entries.map((e) => e.category))],
  }))
}

// Decide which sessionId a NEW entry at `ts` joins. If the newest existing
// entry is within gapMs, reuse its sessionId; otherwise mint a fresh one. This
// is what makes "did another set with 90" land in the same session as the
// deadlift it follows.
function assignSession(entries, ts, gapMs = SESSION_GAP_MS) {
  const sorted = [...(entries || [])].sort((a, b) => b.ts - a.ts)
  const newest = sorted[0]
  // Reuse the newest session only for an entry at or after it within the gap.
  // Requiring ts >= newest.ts stops a back-dated entry from being absorbed
  // into an arbitrarily future-dated session.
  if (newest && newest.sessionId && ts >= newest.ts && ts - newest.ts <= gapMs) {
    return newest.sessionId
  }
  return `s-${ts}`
}

// The current open session today, for feeding context to the LLM so a bare
// "another set with 90" can resolve against the last logged activity. Returns
// null if the newest entry is older than the gap.
function currentSession(entries, now = Date.now(), gapMs = SESSION_GAP_MS) {
  const sessions = groupSessions(entries, gapMs)
  if (sessions.length === 0) return null
  const last = sessions[sessions.length - 1]
  if (now - last.endTs > gapMs) return null
  return last
}

// ---------------------------------------------------------------------------
// e1RM (Epley) — estimate a one-rep max from a (weight, reps) pair so a
// 100kg×5 ranks above a 110kg×1. Used to rank strength PRs.
// ---------------------------------------------------------------------------

function epley1RM(weightKg, reps) {
  const w = Number(weightKg)
  const r = Number(reps)
  // Both must be finite and positive — a negative weight/reps from a bad parse
  // would otherwise yield a plausible-looking but invalid estimate.
  if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) return 0
  if (r === 1) return Math.round(w * 10) / 10
  return Math.round(w * (1 + r / 30) * 10) / 10
}

// Best e1RM per strength activity across all entries. Tie-break on heavier
// absolute weight, then more reps.
function strengthPRs(entries) {
  const byActivity = new Map()
  for (const e of entries || []) {
    if (categoryFamily(e.category) !== 'strength') continue
    for (const s of e.metrics?.sets || []) {
      const e1rm = epley1RM(s.weight_kg, s.reps)
      const prev = byActivity.get(e.activity)
      if (
        !prev ||
        e1rm > prev.e1rm ||
        (e1rm === prev.e1rm && s.weight_kg > prev.weight_kg)
      ) {
        byActivity.set(e.activity, {
          activity: e.activity,
          weight_kg: s.weight_kg,
          reps: s.reps,
          unit: s.unit || 'kg',
          localDate: e.localDate,
          e1rm,
        })
      }
    }
  }
  return [...byActivity.values()].sort((a, b) => b.e1rm - a.e1rm)
}

// Cardio bests — fastest pace / longest distance / longest duration per
// cardio-family activity. Returns one row per activity with the headline best.
function cardioBests(entries) {
  const byActivity = new Map()
  for (const e of entries || []) {
    if (categoryFamily(e.category) !== 'cardio') continue
    const dist = e.metrics?.distance_m || 0
    const dur = e.metrics?.duration_s || 0
    const prev = byActivity.get(e.activity) || {
      activity: e.activity,
      category: e.category,
      maxDistance_m: 0,
      maxDuration_s: 0,
    }
    prev.maxDistance_m = Math.max(prev.maxDistance_m, dist)
    prev.maxDuration_s = Math.max(prev.maxDuration_s, dur)
    byActivity.set(e.activity, prev)
  }
  return [...byActivity.values()].sort((a, b) => b.maxDistance_m - a.maxDistance_m)
}

// ---------------------------------------------------------------------------
// Category split for the donut: count of entries per category.
// ---------------------------------------------------------------------------

function categorySplit(entries) {
  const counts = new Map()
  for (const e of entries || []) {
    counts.set(e.category, (counts.get(e.category) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([category, count]) => ({
      category,
      label: CATEGORIES[category]?.label || category,
      color: CATEGORIES[category]?.color || '#a1a1aa',
      count,
    }))
    .sort((a, b) => b.count - a.count)
}

// Volume over time — one point per local day, one numeric series per category
// family. Strength volume = Σ(weight_kg × reps); cardio volume = Σ distance_m
// (km for readability); other = Σ duration_s (minutes). Returns rows keyed by
// date with a column per category present, suitable for a stacked bar/area.
function volumeByDay(entries) {
  const byDay = new Map()
  for (const e of entries || []) {
    const day = e.localDate
    if (!byDay.has(day)) byDay.set(day, { date: day })
    const row = byDay.get(day)
    const fam = categoryFamily(e.category)
    let v = 0
    if (fam === 'strength') {
      for (const s of e.metrics?.sets || []) v += (s.weight_kg || 0) * (s.reps || 0)
    } else if (fam === 'cardio') {
      v = (e.metrics?.distance_m || 0) / 1000 // km
    } else {
      v = (e.metrics?.duration_s || 0) / 60 // minutes
    }
    row[e.category] = Math.round(((row[e.category] || 0) + v) * 10) / 10
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date))
}

// Set of local dates that have any entry — drives the streak heatmap (the one
// chart that must work offline, since it needs no recharts).
function activeDays(entries) {
  const s = new Set()
  for (const e of entries || []) s.add(e.localDate)
  return s
}

// Current consecutive-day streak ending today (or yesterday, so a not-yet-
// logged today doesn't read as a broken streak).
function currentStreak(entries, today = localDate()) {
  const days = activeDays(entries)
  if (days.size === 0) return 0
  let streak = 0
  const cursor = new Date(`${today}T00:00:00`)
  // Allow today to be empty without breaking the streak: start counting from
  // today if logged, else from yesterday.
  if (!days.has(localDate(cursor))) cursor.setDate(cursor.getDate() - 1)
  for (let i = 0; i < 3660; i++) {
    if (days.has(localDate(cursor))) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    } else {
      break
    }
  }
  return streak
}

// ---------------------------------------------------------------------------
// Migration — the OLD gym stored a `programs` map + a `history` array of
// session rows ({date, sets:[{exercise,reps,weight}]}). Convert each history
// row's sets into ONE strength Entry per row (its sets become the entry's
// sets). Programs themselves are templates, not logged activity, so they're
// dropped — but their logged history is preserved as strength entries.
// ---------------------------------------------------------------------------

function migrateLegacyState(oldState) {
  if (!oldState || !Array.isArray(oldState.history)) return []
  const out = []
  for (const row of oldState.history) {
    if (!Array.isArray(row.sets) || row.sets.length === 0) continue
    // Group the flat sets back by exercise so each exercise is one entry.
    const byExercise = new Map()
    for (const s of row.sets) {
      const name = s.exercise || 'Lift'
      if (!byExercise.has(name)) byExercise.set(name, [])
      byExercise.get(name).push({
        weight_kg: Number(s.weight) || 0,
        reps: Number(s.reps) || 0,
        unit: 'kg',
      })
    }
    // Reconstruct a ts from the local date (noon, to avoid TZ edge flips).
    const baseTs = row.date ? new Date(`${row.date}T12:00:00`).getTime() : Date.now()
    let offset = 0
    const sessionId = `s-${baseTs}`
    for (const [exercise, sets] of byExercise) {
      const ts = baseTs + offset
      offset += 1000
      out.push({
        id: uid(),
        ts,
        localDate: row.date || localDate(new Date(ts)),
        sessionId,
        category: 'strength',
        activity: exercise,
        icon: CATEGORIES.strength.icon,
        metrics: { sets },
        raw: row.notes || '',
        source: 'migration',
        confirmed: true,
      })
    }
  }
  return out.sort((a, b) => a.ts - b.ts)
}

// ---------------------------------------------------------------------------
// Display formatters — pure, used by both the card and the feed.
// ---------------------------------------------------------------------------

function fmtDuration(seconds) {
  const s = Math.round(Number(seconds) || 0)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  if (m > 0) return `${m}m`
  return `${s}s`
}

function fmtDistance(metres) {
  const m = Number(metres) || 0
  if (m >= 1000) return `${(Math.round((m / 1000) * 10) / 10).toFixed(1)}km`
  return `${Math.round(m)}m`
}

function fmtPace(durationS, distanceM) {
  const d = Number(distanceM) || 0
  const s = Number(durationS) || 0
  if (d <= 0 || s <= 0) return null
  const secPerKm = s / (d / 1000)
  if (!Number.isFinite(secPerKm)) return null
  const mins = Math.floor(secPerKm / 60)
  const secs = String(Math.round(secPerKm % 60)).padStart(2, '0')
  return `${mins}:${secs}/km`
}

function summarizeStrengthSets(sets) {
  const rows = Array.isArray(sets) ? sets : []
  if (rows.length === 0) return ''
  const groups = new Map()
  for (const s of rows) {
    const unit = s.unit === 'lb' ? 'lb' : 'kg'
    const weight = numberOrNull(s.weight_kg) == null ? null : fromKg(s.weight_kg, unit)
    const reps = numberOrNull(s.reps) == null ? null : Math.max(0, Math.round(Number(s.reps)))
    const key = `${reps ?? 'n/a'}|${weight ?? 'n/a'}|${unit}`
    groups.set(key, (groups.get(key) || 0) + 1)
  }
  return [...groups.entries()].map(([key, count]) => {
    const [reps, weight, unit] = key.split('|')
    if (reps === 'n/a' && weight === 'n/a') return count === 1 ? '1 set' : `${count} sets`
    if (reps === 'n/a') return count === 1 ? `1 set @ ${weight}${unit}` : `${count} sets @ ${weight}${unit}`
    if (weight === 'n/a') return `${count}×${reps}`
    return `${count}×${reps} @ ${weight}${unit}`
  }).join(' · ')
}

// One-line summary of an entry's metrics, for the feed card.
function summarizeMetrics(entry) {
  const fam = categoryFamily(entry.category)
  if (fam === 'strength') {
    return summarizeStrengthSets(entry.metrics?.sets)
  }
  if (fam === 'cardio') {
    const parts = []
    if (entry.metrics?.distance_m) parts.push(fmtDistance(entry.metrics.distance_m))
    const pace = fmtPace(entry.metrics?.duration_s, entry.metrics?.distance_m)
    if (pace) parts.push(pace)
    if (entry.metrics?.duration_s) parts.push(fmtDuration(entry.metrics.duration_s))
    if (entry.metrics?.elevation_m) parts.push(`↑${Math.round(entry.metrics.elevation_m)}m`)
    if (entry.metrics?.location) parts.push(entry.metrics.location)
    return parts.join(' · ')
  }
  const parts = []
  if (entry.metrics?.duration_s) parts.push(fmtDuration(entry.metrics.duration_s))
  if (entry.metrics?.location) parts.push(entry.metrics.location)
  if (entry.metrics?.note) parts.push(entry.metrics.note)
  return parts.join(' · ')
}

export {
  normalizeEntry,
  normalizeStoredEntries,
  mergeEntriesForSave,
  draftsFromParsedPayload,
  groupSessions,
  summarizeMetrics,
}
// ===== INLINE-LOGIC END =====

// ---------------------------------------------------------------------------
// Category icons — the rendering half of CATEGORIES. logic.js stores a Tabler
// icon KEY per category (it stays JSX-free); this map turns that key into the
// inline SVG inner markup, copied verbatim from Tabler's outline set. Drawn
// with the shared <SportIcon> below so every render site picks up the same
// stroke/sizing.
// Icons: Tabler Icons (MIT) — https://tabler.io/icons
const ICONS = {
  barbell: (
    <>
      <path d="M2 12h1" />
      <path d="M6 8h-2a1 1 0 0 0 -1 1v6a1 1 0 0 0 1 1h2" />
      <path d="M6 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1 -1v-10a1 1 0 0 0 -1 -1h-1a1 1 0 0 0 -1 1" />
      <path d="M9 12h6" />
      <path d="M15 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1 -1v-10a1 1 0 0 0 -1 -1h-1a1 1 0 0 0 -1 1" />
      <path d="M18 8h2a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-2" />
      <path d="M22 12h-1" />
    </>
  ),
  heartbeat: (
    <>
      <path d="M19.5 13.572l-7.5 7.428l-2.896 -2.868m-6.117 -8.104a5 5 0 0 1 9.013 -3.022a5 5 0 1 1 7.5 6.572" />
      <path d="M3 13h2l2 3l2 -6l1 3h3" />
    </>
  ),
  run: (
    <>
      <path d="M11.007 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
      <path d="M4 17l5 1l.75 -1.5" />
      <path d="M15 21v-4l-4 -3l1 -6" />
      <path d="M7 12v-3l5 -1l3 3l3 1" />
    </>
  ),
  bike: (
    <>
      <path d="M2 18a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
      <path d="M16 18a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
      <path d="M12 19v-4l-3 -3l5 -4l2 3h3" />
      <path d="M13.007 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    </>
  ),
  swimming: (
    <>
      <path d="M15 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M6 11l4 -2l3.5 3l-1.5 2" />
      <path d="M3 16.75a2.4 2.4 0 0 0 1 .25a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 1 -.25" />
    </>
  ),
  kayak: (
    <>
      <path d="M6.414 6.414a2 2 0 0 0 0 -2.828l-1.414 -1.414l-2.828 2.828l1.414 1.414a2 2 0 0 0 2.828 0" />
      <path d="M17.586 17.586a2 2 0 0 0 0 2.828l1.414 1.414l2.828 -2.828l-1.414 -1.414a2 2 0 0 0 -2.828 0" />
      <path d="M6.5 6.5l11 11" />
      <path d="M22 2.5c-9.983 2.601 -17.627 7.952 -20 19.5c9.983 -2.601 17.627 -7.952 20 -19.5" />
      <path d="M6.5 12.5l5 5" />
      <path d="M12.5 6.5l5 5" />
    </>
  ),
  mountain: (
    <>
      <path d="M3 20h18l-6.921 -14.612a2.3 2.3 0 0 0 -4.158 0l-6.921 14.612" />
      <path d="M7.5 11l2 2.5l2.5 -2.5l2 3l2.5 -2" />
    </>
  ),
  yoga: (
    <>
      <path d="M4 20h4l1.5 -3" />
      <path d="M17 20l-1 -5h-5l1 -7" />
      <path d="M4 10l4 -1l4 -1l4 1.5l4 1.5" />
      <path d="M10.007 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    </>
  ),
  'ball-football': (
    <>
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M12 7l4.76 3.45l-1.76 5.55h-6l-1.76 -5.55l4.76 -3.45" />
      <path d="M12 7v-4m3 13l2.5 3m-.74 -8.55l3.74 -1.45m-11.44 7.05l-2.56 2.95m.74 -8.55l-3.74 -1.45" />
    </>
  ),
  sparkles: (
    <>
      <path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6" />
    </>
  ),
}

// Renders a category's Tabler icon. `name` is the CATEGORIES[k].icon key; an
// unknown key falls back to the neutral `sparkles` glyph so a future category
// added in logic.js without a matching ICONS entry still draws something.
function SportIcon({ name, color, size = 20 }) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size}
      fill="none" stroke={color || 'currentColor'} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden
    >
      {ICONS[name] || ICONS.sparkles}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Storage layer — two paths into the same place:
//   1. window.mobius.storage  — the offline runtime. Reads/writes the local
//      outbox so the app works without a network, then syncs on reconnect.
//   2. fetch(/api/storage/...) — direct backend call when the runtime isn't
//      installed yet.
// We probe `window.mobius?.storage` at call time (not module load) so the
// runtime can be injected after the app boots without us missing it.
// ---------------------------------------------------------------------------

function makeStore(appId, token) {
  const auth = { Authorization: `Bearer ${token}` }
  const base = `/api/storage/apps/${appId}`

  async function get(path) {
    const ms = (typeof window !== 'undefined') ? window.mobius?.storage : null
    if (ms && typeof ms.get === 'function') {
      try { return await ms.get(path) } catch { /* fall through */ }
    }
    try {
      const r = await fetch(`${base}/${path}`, { headers: auth })
      if (r.status === 404) return null
      if (!r.ok) return null
      const text = await r.text()
      if (!text) return null
      try { return JSON.parse(text) } catch { return null }
    } catch { return null }
  }

  // Returns the shim's {synced:true} | {queued:true} when the runtime is
  // present so callers can branch their UI. When the runtime isn't loaded we
  // fall back to a direct PUT and synthesize the same shape on success.
  async function set(path, value) {
    const ms = (typeof window !== 'undefined') ? window.mobius?.storage : null
    if (ms && typeof ms.set === 'function') {
      try { return await ms.set(path, value) } catch { /* fall through */ }
    }
    try {
      const r = await fetch(`${base}/${path}`, {
        method: 'PUT',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      })
      if (r.ok) return { synced: true }
      return { queued: false, error: true }
    } catch {
      return { queued: false, error: true }
    }
  }

  async function pendingCount() {
    const ms = (typeof window !== 'undefined') ? window.mobius?.storage : null
    if (ms && typeof ms.pendingCount === 'function') {
      try { return await ms.pendingCount() } catch { return 0 }
    }
    return 0
  }

  return { get, set, pendingCount }
}

// ---------------------------------------------------------------------------
// Embedded shell chat. Like the LaTeX app, Workout uses the real Möbius chat
// iframe as the interaction surface. The sub-agent edits entries.json; the
// mini-app refreshes structured state after each turn.
// ---------------------------------------------------------------------------

function workoutAgentPrompt(appId) {
  return [
    `You are the Workout training-log sub-agent for Möbius app id ${appId}.`,
    '',
    `Your job is to maintain /data/apps/${appId}/entries.json as the user's`,
    'structured workout log. The user should talk to you naturally. Your',
    'default action is to update the log, not to tell the user how to fill a',
    'form. If details are missing, write the best-effort entry with null',
    'numeric values, then ask a short follow-up question in chat.',
    '',
    'Always read the existing entries.json before writing. If it is missing,',
    'treat it as an empty JSON array. Preserve existing entries unless the user',
    'asks you to change or delete them. Write the whole JSON array back after',
    'changes.',
    '',
    'Entry shape:',
    '{',
    '  "id": "stable unique string",',
    '  "ts": 1780000000000,',
    '  "localDate": "YYYY-MM-DD",',
    '  "sessionId": "s-<timestamp>",',
    '  "category": "strength|cardio|running|cycling|swimming|rowing|hiking|yoga|sport|other",',
    '  "activity": "Deadlift",',
    '  "icon": "barbell|heartbeat|run|bike|swimming|kayak|mountain|yoga|ball-football|sparkles",',
    '  "metrics": { ... },',
    '  "raw": "the user text that caused/updated this entry",',
    '  "source": "ai",',
    '  "confirmed": true',
    '}',
    '',
    'Use the current date/time for new entries unless the user gives another',
    'date/time. localDate is the user-facing local day. For now, grouping is',
    'by localDate; sessionId can be "s-" plus the entry timestamp, or reused',
    'for entries from the same message.',
    '',
    'Metric rules:',
    '- strength metrics: {"sets":[{"weight_kg": number|null, "reps": number|null, "unit":"kg"|"lb"}]}. Use null for unknown weight or reps. If the user says "three sets of deadlifts", write three set objects with null weight_kg and null reps.',
    '- cardio/running/cycling/swimming/rowing/hiking metrics: {"duration_s": number|null, "distance_m": number|null, "elevation_m": number|null, "location": string|null}.',
    '- yoga/sport/other metrics: {"duration_s": number|null, "location": string|null, "note": string|null}.',
    '',
    'Icon keys by category: strength=barbell, cardio=heartbeat, running=run, cycling=bike, swimming=swimming, rowing=kayak, hiking=mountain, yoga=yoga, sport=ball-football, other=sparkles.',
    '',
    'Example: if the user says "I have done three sets of deadlifts and one',
    'hour climbing", append a Deadlift strength entry with three unknown sets',
    'and a Climbing sport entry with duration_s 3600. Then ask "How many reps',
    'did you do for the deadlift sets?" Do not wait to create the entries.',
    '',
    'When the user answers a follow-up, update the existing entry rather than',
    'creating a duplicate. Keep unknown fields as null. Never use 0 to mean',
    'unknown.',
  ].join('\n')
}

async function createAppChat(appId, token, systemPrompt) {
  const r = await fetch('/api/app-chats', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: 'Workout', system_prompt: systemPrompt }),
  })
  if (!r.ok) throw new Error(`create chat -> ${r.status}`)
  const data = await r.json()
  if (!data || !data.id) throw new Error('create chat returned no id')
  return String(data.id)
}

async function updateAppChatPrompt(chatId, token, systemPrompt) {
  if (!chatId) return
  const r = await fetch(`/api/app-chats/${encodeURIComponent(chatId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ system_prompt: systemPrompt }),
  })
  if (!r.ok) throw new Error(`update chat prompt -> ${r.status}`)
}

// ---------------------------------------------------------------------------
// Styles — every color/font is a CSS token painted by the Möbius shell, so the
// app inherits future themes for free. Single object named `S`.
// ---------------------------------------------------------------------------

const S = {
  root: {
    height: '100%', display: 'flex', flexDirection: 'column',
    background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)',
    maxWidth: '100%', overflow: 'hidden',
  },
  // Web cap so the column doesn't sprawl on desktop while staying mobile-first.
  inner: {
    width: '100%', maxWidth: '720px', marginLeft: 'auto', marginRight: 'auto',
  },
  header: {
    padding: '18px 20px 14px', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', flexShrink: 0,
    borderBottom: '1px solid var(--border)',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.03), transparent)',
  },
  title: { fontSize: '22px', fontWeight: 760, letterSpacing: 0, margin: 0 },
  subtitle: { fontSize: '12px', color: 'var(--muted)', margin: '2px 0 0' },

  scroll: {
    flex: 1, overflowY: 'auto', overflowX: 'hidden',
    padding: '14px 16px 16px',
    wordBreak: 'break-word', overflowWrap: 'anywhere',
    minHeight: 0,
  },

  tabbar: {
    flexShrink: 0,
    display: 'flex', background: 'color-mix(in srgb, var(--surface) 94%, #000)',
    borderBottom: '1px solid var(--border)',
    padding: '6px 10px',
    gap: '6px',
  },
  tabBtn: (active) => ({
    flex: 1, padding: '10px 8px', border: '1px solid transparent', cursor: 'pointer',
    borderRadius: '12px',
    background: active ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'transparent',
    color: active ? 'var(--text)' : 'var(--muted)',
    fontFamily: 'var(--font)', fontSize: '12px', fontWeight: 700,
    display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '6px',
    minHeight: '44px',
  }),
  tabIcon: { display: 'flex', lineHeight: 1 },

  chatPanel: {
    flex: '0 0 38%',
    minHeight: '240px',
    maxHeight: '56%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--surface)',
    borderTop: '1px solid var(--border)',
  },
  chatHead: {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'baseline',
    gap: '10px',
    minHeight: '34px',
    padding: '7px 12px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface)',
  },
  chatHeadTitle: {
    fontSize: '11px',
    lineHeight: 1,
    color: 'var(--muted)',
    fontWeight: 800,
    letterSpacing: 0,
  },
  chatHeadHint: {
    fontSize: '12px',
    color: 'var(--muted)',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  chatEmbed: {
    flex: '1 1 auto',
    minHeight: 0,
    overflow: 'hidden',
    background: 'var(--bg)',
  },
  chatError: {
    flex: '0 0 auto',
    margin: '8px 14px 0',
    padding: '8px 10px',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
    color: 'var(--text)',
    fontSize: '12px',
  },

  card: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '8px', padding: '16px', marginBottom: '14px',
  },
  cardTitle: { fontSize: '16px', fontWeight: 700, margin: '0 0 4px' },
  cardSub: { fontSize: '12px', color: 'var(--muted)', margin: '0 0 12px' },

  btnPrimary: {
    width: '100%', padding: '14px 16px', borderRadius: '12px',
    border: 'none', background: 'var(--accent)', color: '#fff',
    fontFamily: 'var(--font)', fontSize: '15px', fontWeight: 600,
    cursor: 'pointer', minHeight: '48px',
  },
  btnSecondary: {
    padding: '12px 14px', borderRadius: '10px', minHeight: '44px',
    border: '1px solid var(--border)', background: 'var(--surface2, var(--surface))',
    color: 'var(--text)', fontFamily: 'var(--font)',
    fontSize: '14px', fontWeight: 600, cursor: 'pointer',
  },
  btnGhost: {
    padding: '10px 12px', borderRadius: '8px', minHeight: '44px',
    border: 'none', background: 'transparent',
    color: 'var(--accent)', fontFamily: 'var(--font)',
    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
  },
  btnRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' },

  // Entry feed card
  entryCard: {
    background: 'color-mix(in srgb, var(--surface) 94%, #000)',
    border: '1px solid var(--border)',
    borderRadius: '8px', padding: '13px', marginBottom: '10px',
    display: 'flex', gap: '12px', alignItems: 'flex-start',
  },
  entryIcon: (color) => ({
    width: '42px', height: '42px', borderRadius: '8px', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '20px', background: `${color}22`, border: `1px solid ${color}55`,
  }),
  entryBody: { flex: 1, minWidth: 0 },
  entryTop: { display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'baseline' },
  entryName: { fontSize: '15px', fontWeight: 760, margin: 0, letterSpacing: 0 },
  entryTime: { fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap' },
  entryMeta: { fontSize: '13px', color: 'var(--text)', margin: '5px 0 0', fontVariantNumeric: 'tabular-nums' },
  entryRaw: { fontSize: '11px', color: 'var(--muted)', margin: '6px 0 0', fontStyle: 'italic' },
  entryActions: { display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 },

  sessionLabel: {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px',
    fontSize: '12px', color: 'var(--muted)', fontWeight: 700, margin: '20px 0 9px',
  },
  sessionDate: {
    color: 'var(--text)', fontSize: '13px', fontWeight: 800, letterSpacing: 0,
  },
  sessionSpan: {
    fontSize: '11px', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap',
  },

  // Inputs (confirm card + manual fallback)
  textInput: {
    width: '100%', fontFamily: 'var(--font)', fontSize: '14px',
    padding: '12px', minHeight: '44px',
    background: 'var(--surface2, var(--surface))', color: 'var(--text)',
    border: '1px solid var(--border)', borderRadius: '10px',
    outline: 'none', boxSizing: 'border-box',
  },
  label: { fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--muted)' },

  setRow: {
    display: 'grid', gridTemplateColumns: '24px 1fr 1fr auto',
    alignItems: 'center', gap: '8px', padding: '6px 0',
  },

  // Category chips for the confirm card
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' },
  chip: (active, color) => ({
    padding: '8px 12px', borderRadius: '999px', minHeight: '44px',
    border: `1px solid ${active ? color : 'var(--border)'}`,
    background: active ? `${color}22` : 'transparent',
    color: active ? 'var(--text)' : 'var(--muted)',
    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: '6px',
  }),

  chartCard: {
    background: 'color-mix(in srgb, var(--surface) 94%, #000)', border: '1px solid var(--border)',
    borderRadius: '8px', padding: '14px', marginBottom: '14px',
  },
  chartTitle: { fontSize: '14px', fontWeight: 700, margin: '0 0 2px' },
  chartSub: { fontSize: '11px', color: 'var(--muted)', margin: '0 0 10px' },

  prTable: { width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginTop: '4px' },
  prTh: {
    textAlign: 'left', fontWeight: 600, color: 'var(--muted)',
    padding: '8px 6px', borderBottom: '1px solid var(--border)',
    fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px',
  },
  prTd: { padding: '10px 6px', borderBottom: '1px solid var(--border)' },

  heatmap: { width: '100%', height: 'auto', display: 'block', marginTop: '8px' },

  empty: {
    textAlign: 'center', padding: '48px 16px', color: 'var(--muted)',
    fontSize: '13px', lineHeight: 1.6,
  },
  emptyIcon: {
    width: '58px', height: '58px', borderRadius: '18px', margin: '0 auto 14px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'color-mix(in srgb, var(--accent) 16%, transparent)',
    border: '1px solid color-mix(in srgb, var(--accent) 34%, var(--border))',
  },
  loading: { textAlign: 'center', padding: '40px 16px', color: 'var(--muted)', fontSize: '13px' },

  // In-app confirm modal for destructive actions in the sandbox.
  modalScrim: {
    position: 'absolute', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
  },
  modal: {
    background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)',
    padding: '20px', maxWidth: '320px', width: '100%',
    boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
  },
  modalTitle: { fontSize: '16px', fontWeight: 700, margin: '0 0 6px' },
  modalBody: { fontSize: '13px', color: 'var(--muted)', margin: '0 0 16px', lineHeight: 1.5 },
  modalBtns: { display: 'flex', gap: '8px', justifyContent: 'flex-end' },

  pill: (variant) => ({
    fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '999px',
    letterSpacing: '0.2px',
    background: variant === 'offline' || variant === 'pending'
      ? 'var(--surface2, var(--surface))' : 'transparent',
    border: `1px solid ${variant === 'offline' ? 'var(--accent)' : 'var(--border)'}`,
    color: variant === 'offline' ? 'var(--accent)' : 'var(--muted)',
    whiteSpace: 'nowrap',
  }),

  barList: { display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' },
  barRow: { display: 'grid', gridTemplateColumns: '88px 1fr 48px', gap: '10px', alignItems: 'center' },
  barLabel: { fontSize: '12px', color: 'var(--muted)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' },
  barTrack: {
    height: '10px', borderRadius: '999px',
    background: 'color-mix(in srgb, var(--border) 72%, transparent)', overflow: 'hidden',
  },
  barFill: (color, pct) => ({
    height: '100%', width: `${Math.max(3, Math.min(100, pct))}%`,
    borderRadius: '999px', background: color,
  }),
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(138px, 1fr))', gap: '10px' },
  statTile: {
    border: '1px solid var(--border)', borderRadius: '8px', padding: '12px',
    background: 'color-mix(in srgb, var(--bg) 55%, transparent)',
  },
  statValue: { fontSize: '18px', fontWeight: 800, margin: '7px 0 2px', fontVariantNumeric: 'tabular-nums' },
  statLabel: { fontSize: '11px', color: 'var(--muted)', fontWeight: 700 },
}

// ---------------------------------------------------------------------------
// Sync status — observes the offline runtime and exposes a {state, pending,
// online} snapshot the UI paints as a pill.
// ---------------------------------------------------------------------------

function useSyncStatus(store) {
  const [pending, setPending] = useState(0)
  const [online, setOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [flash, setFlash] = useState(null)
  const flashTimerRef = useRef(null)

  const refresh = useCallback(async () => {
    try { setPending(await store.pendingCount()) } catch { /* keep previous */ }
  }, [store])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 10_000)
    function onOnline() { setOnline(true); refresh() }
    function onOffline() { setOnline(false); refresh() }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      clearInterval(id)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    }
  }, [refresh])

  const bump = useCallback((result) => {
    if (result && result.queued) setFlash('pending')
    else if (result && result.synced) setFlash('saved')
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => {
      setFlash(null); flashTimerRef.current = null
    }, 1200)
    refresh()
  }, [refresh])

  return { pending, online, flash, bump, refresh }
}

function SyncPill({ status }) {
  const { pending, online, flash } = status
  let label, variant
  if (!online && pending > 0) { label = `Offline · ${pending} pending`; variant = 'offline' }
  else if (!online) { label = 'Offline'; variant = 'offline' }
  else if (pending > 0) { label = `Syncing · ${pending}`; variant = 'pending' }
  else if (flash === 'saved') { label = 'Saved'; variant = 'saved' }
  else if (flash === 'pending') { label = 'Queued'; variant = 'pending' }
  else return null
  return (
    <span style={S.pill(variant)} role="status" aria-live="polite"
      aria-label={variant === 'offline' ? `Offline${pending > 0 ? `, ${pending} pending` : ''}` : label}>
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// In-app confirm modal.
// ---------------------------------------------------------------------------

function ConfirmModal({ title, body, confirmLabel, onConfirm, onCancel }) {
  return (
    <div style={S.modalScrim} onClick={onCancel} role="dialog" aria-modal="true">
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={S.modalTitle}>{title}</h3>
        <p style={S.modalBody}>{body}</p>
        <div style={S.modalBtns}>
          <button style={S.btnSecondary} onClick={onCancel} aria-label="Cancel">Cancel</button>
          <button
            style={{ ...S.btnSecondary, background: 'var(--danger)', color: '#fff', borderColor: 'var(--danger)' }}
            onClick={onConfirm}
            aria-label={confirmLabel}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Confirm card — the editable review surface shown for EVERY parsed entry
// before it commits. Ambiguous/failed parses land here pre-filled with
// whatever the model managed; clean parses land here too (never auto-commit).
// Editing here mutates a local draft; Save runs normalizeEntry on commit.
// ---------------------------------------------------------------------------

function ConfirmCard({
  draft, ambiguous, clarification, onCommit, onCancel, position = 1, total = 1,
  initialTs = Date.now(), title = null, commitLabel = null,
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
  const [sets, setSets] = useState(() => {
    const s = draft.metrics?.sets
    if (Array.isArray(s) && s.length > 0) {
      return s.map((x) => ({
        weight: x.weight ?? '',
        reps: x.reps ?? '',
        unit: x.unit === 'lb' ? 'lb' : 'kg',
      }))
    }
    return [{ weight: '', reps: '', unit: 'kg' }]
  })
  // Cardio/other — display-unit metric fields.
  const [duration, setDuration] = useState(draft.metrics?.duration?.value ?? '')
  const [durationUnit, setDurationUnit] = useState(draft.metrics?.duration?.unit ?? 'min')
  const [distance, setDistance] = useState(draft.metrics?.distance?.value ?? '')
  const [distanceUnit, setDistanceUnit] = useState(draft.metrics?.distance?.unit ?? 'km')
  const [elevation, setElevation] = useState(draft.metrics?.elevation?.value ?? '')
  const [location, setLocation] = useState(draft.metrics?.location ?? '')
  const [note, setNote] = useState(draft.metrics?.note ?? '')

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

  const handleCommit = () => {
    // Reassemble a "parsed" object in the LLM's loose shape, then hand it to
    // normalizeEntry so storage is always SI regardless of what was typed.
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
    const nextTs = new Date(`${dateValue || localDate()}T${timeValue || '12:00'}`).getTime()
    onCommit(
      { category, activity: activity.trim() || CATEGORIES[category].label, metrics },
      Number.isFinite(nextTs) ? nextTs : Date.now(),
    )
  }

  return (
    <div style={{ ...S.card, borderColor: ambiguous ? 'var(--accent)' : 'var(--border)' }}>
      <h3 style={S.cardTitle}>
        {title || (ambiguous ? 'Check this one' : 'Edit entry')}
        {total > 1 ? ` · ${position}/${total}` : ''}
      </h3>
      {ambiguous && clarification ? (
        <p style={S.cardSub}>{clarification}</p>
      ) : (
        <p style={S.cardSub}>
          {total > 1
            ? 'Tweak anything, then save this part and review the next one.'
            : 'Tweak anything, then save it to your log.'}
        </p>
      )}

      <label style={S.label}>Activity</label>
      <input
        style={S.textInput} value={activity}
        onChange={(e) => setActivity(e.target.value)}
        aria-label="Activity name" placeholder="e.g. Deadlift, Trail run"
      />

      <div style={{ height: '12px' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div>
          <label style={S.label}>Date</label>
          <input
            style={S.textInput} type="date" value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
            aria-label="Entry date"
          />
        </div>
        <div>
          <label style={S.label}>Time</label>
          <input
            style={S.textInput} type="time" value={timeValue}
            onChange={(e) => setTimeValue(e.target.value)}
            aria-label="Entry time"
          />
        </div>
      </div>

      <div style={{ height: '12px' }} />
      <label style={S.label}>Category</label>
      <div style={S.chipRow}>
        {CATEGORY_KEYS.map((k) => (
          <button
            key={k} style={S.chip(k === category, CATEGORIES[k].color)}
            onClick={() => setCategory(k)}
            aria-label={`Category ${CATEGORIES[k].label}`}
            aria-pressed={k === category}
          >
            <SportIcon name={CATEGORIES[k].icon} color={CATEGORIES[k].color} size={16} />{CATEGORIES[k].label}
          </button>
        ))}
      </div>

      <div style={{ height: '14px' }} />
      {fam === 'strength' ? (
        <div>
          <label style={S.label}>Sets</label>
          {sets.map((s, i) => (
            <div key={i} style={S.setRow}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)' }}>{i + 1}</span>
              <input
                style={S.textInput} type="number" inputMode="decimal" value={s.weight}
                onChange={(e) => updateSet(i, { weight: e.target.value })}
                aria-label={`Set ${i + 1} weight`} placeholder="n/a"
              />
              <input
                style={S.textInput} type="number" inputMode="numeric" value={s.reps}
                onChange={(e) => updateSet(i, { reps: e.target.value })}
                aria-label={`Set ${i + 1} reps`} placeholder="n/a"
              />
              <button
                style={{ ...S.btnGhost, color: 'var(--muted)', minWidth: '44px' }}
                onClick={() => removeSet(i)} aria-label={`Remove set ${i + 1}`}
              >×</button>
            </div>
          ))}
          <div style={{ ...S.btnRow, justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
            <select
              value={sets[0]?.unit || 'kg'}
              onChange={(e) => setSets((prev) => prev.map((s) => ({ ...s, unit: e.target.value })))}
              style={{ ...S.textInput, width: 'auto' }} aria-label="Weight unit"
            >
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </select>
            <button style={S.btnGhost} onClick={addSet} aria-label="Add set">+ set</button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '8px', alignItems: 'end' }}>
            <div>
              <label style={S.label}>Duration</label>
              <input
                style={S.textInput} type="number" inputMode="decimal" value={duration}
                onChange={(e) => setDuration(e.target.value)} aria-label="Duration" placeholder="n/a"
              />
            </div>
            <select value={durationUnit} onChange={(e) => setDurationUnit(e.target.value)}
              style={S.textInput} aria-label="Duration unit">
              <option value="min">min</option>
              <option value="h">h</option>
              <option value="s">s</option>
            </select>
          </div>
          {fam === 'cardio' && (
            <>
              <div style={{ height: '10px' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '8px', alignItems: 'end' }}>
                <div>
                  <label style={S.label}>Distance</label>
                  <input
                    style={S.textInput} type="number" inputMode="decimal" value={distance}
                    onChange={(e) => setDistance(e.target.value)} aria-label="Distance" placeholder="n/a"
                  />
                </div>
                <select value={distanceUnit} onChange={(e) => setDistanceUnit(e.target.value)}
                  style={S.textInput} aria-label="Distance unit">
                  <option value="km">km</option>
                  <option value="mi">mi</option>
                  <option value="m">m</option>
                </select>
              </div>
              <div style={{ height: '10px' }} />
              <label style={S.label}>Elevation gain (m)</label>
              <input
                style={S.textInput} type="number" inputMode="decimal" value={elevation}
                onChange={(e) => setElevation(e.target.value)} aria-label="Elevation gain in metres" placeholder="n/a"
              />
            </>
          )}
          <div style={{ height: '10px' }} />
          <label style={S.label}>Location</label>
          <input
            style={S.textInput} value={location}
            onChange={(e) => setLocation(e.target.value)} aria-label="Location" placeholder="optional"
          />
          {fam === 'other' && (
            <>
              <div style={{ height: '10px' }} />
              <label style={S.label}>Note</label>
              <input
                style={S.textInput} value={note}
                onChange={(e) => setNote(e.target.value)} aria-label="Note" placeholder="optional"
              />
            </>
          )}
        </div>
      )}

      <div style={{ height: '16px' }} />
      <button style={S.btnPrimary} onClick={handleCommit} aria-label="Save entry">
        {commitLabel || (total > 1 && position < total ? 'Save and review next' : 'Save to log')}
      </button>
      <div style={{ height: '10px' }} />
      <button style={{ ...S.btnSecondary, width: '100%' }} onClick={onCancel} aria-label="Discard entry">Discard</button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Entry feed — entries grouped into derived sessions, newest first.
// ---------------------------------------------------------------------------

function secondsToDisplay(seconds) {
  const s = Number(seconds)
  if (!Number.isFinite(s) || s <= 0) return { value: '', unit: 'min' }
  if (s % 3600 === 0) return { value: s / 3600, unit: 'h' }
  if (s % 60 === 0) return { value: s / 60, unit: 'min' }
  return { value: s, unit: 's' }
}

function metresToDisplay(metres) {
  const m = Number(metres)
  if (!Number.isFinite(m) || m <= 0) return { value: '', unit: 'km' }
  if (m >= 1000 && m % 1000 === 0) return { value: m / 1000, unit: 'km' }
  return { value: m, unit: 'm' }
}

function draftFromStoredEntry(entry) {
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

function groupEntriesByDate(entries) {
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

function AgentChatPanel({ appId, token, store, onEntriesMaybeChanged }) {
  const mountRef = useRef(null)
  const [chatId, setChatId] = useState(null)
  const [error, setError] = useState(null)
  const onEntriesRef = useRef(onEntriesMaybeChanged)
  useEffect(() => { onEntriesRef.current = onEntriesMaybeChanged }, [onEntriesMaybeChanged])
  const systemPrompt = useMemo(() => workoutAgentPrompt(appId), [appId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const saved = await store.get('chat_id.json')
        if (cancelled) return
        if (saved && saved.id) {
          const id = String(saved.id)
          updateAppChatPrompt(id, token, systemPrompt).catch(() => {})
          setChatId(id)
          return
        }
      } catch {
        // Fall through to creating a fresh chat.
      }
      try {
        const id = await createAppChat(appId, token, systemPrompt)
        if (cancelled) return
        setChatId(id)
        store.set('chat_id.json', { id }).catch(() => {})
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not start the workout agent chat.')
      }
    })()
    return () => { cancelled = true }
  }, [appId, store, systemPrompt, token])

  useEffect(() => {
    const mount = mountRef.current
    if (!chatId) return undefined
    if (!mount || !window.mobius || typeof window.mobius.chat !== 'function') {
      setError('Embedded chat is not available in this shell.')
      return undefined
    }
    let disposed = false
    let handle = null
    setError(null)

    window.mobius.chat({
      mount,
      chatId,
      title: 'Workout',
      systemPrompt,
    }).then((nextHandle) => {
      if (disposed) {
        nextHandle.destroy()
        return
      }
      handle = nextHandle
      handle
        .on('ready', ({ chatId: resolved }) => {
          if (!resolved) return
          const next = String(resolved)
          if (next !== chatId) {
            setChatId(next)
            store.set('chat_id.json', { id: next }).catch(() => {})
          }
        })
        .on('turn-done', () => { if (onEntriesRef.current) onEntriesRef.current() })
        .on('error', ({ error: chatError }) => {
          setError(chatError || 'Embedded chat reported an error.')
        })
    }).catch((e) => {
      if (!disposed) setError(e.message || 'Could not mount embedded chat.')
    })

    return () => {
      disposed = true
      if (handle) handle.destroy()
    }
  }, [chatId, store, systemPrompt])

  return (
    <section style={S.chatPanel}>
      <div style={S.chatHead}>
        <span style={S.chatHeadTitle}>Agent</span>
        <span style={S.chatHeadHint}>Tell it what you trained — it edits the log</span>
      </div>
      {error && <div style={S.chatError}>{error}</div>}
      <style>{'.workout-chat-embed iframe{display:block;width:100%;height:100%;border:0}'}</style>
      <div className="workout-chat-embed" style={S.chatEmbed} ref={mountRef} />
    </section>
  )
}

function EntryCard({ entry, onDelete, onEdit }) {
  const cat = CATEGORIES[entry.category] || CATEGORIES.other
  const time = new Date(entry.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return (
    <div style={S.entryCard}>
      <div style={S.entryIcon(cat.color)} aria-hidden>
        <SportIcon name={entry.icon || cat.icon} color={cat.color} />
      </div>
      <div style={S.entryBody}>
        <div style={S.entryTop}>
          <h4 style={S.entryName}>{entry.activity}</h4>
          <span style={S.entryTime}>{time}</span>
        </div>
        <p style={S.entryMeta}>{summarizeMetrics(entry) || cat.label}</p>
      </div>
      <div style={S.entryActions}>
        <button
          style={{ ...S.btnGhost, color: 'var(--accent)', padding: '4px 8px', minHeight: '36px' }}
          onClick={() => onEdit(entry)} aria-label={`Edit ${entry.activity}`}
        >Edit</button>
        <button
          style={{ ...S.btnGhost, color: 'var(--muted)', padding: '4px 8px', minHeight: '36px' }}
          onClick={() => onDelete(entry.id)} aria-label={`Delete ${entry.activity}`}
        >×</button>
      </div>
    </div>
  )
}

function LogTab({ entries, onDelete, onEdit }) {
  const groups = useMemo(() => groupEntriesByDate(entries), [entries])
  if (entries.length === 0) {
    return (
      <div style={S.empty}>
        <div style={S.emptyIcon}>
          <SportIcon name="barbell" color="var(--accent)" size={30} />
        </div>
        <strong style={{ color: 'var(--text)' }}>Start with one sentence.</strong><br />
        Try "ran 5k in 24 min", "3x5 squat at 80kg", or "hiked 8h in Hawaii".
      </div>
    )
  }
  const todayIso = localDate()
  return (
    <div>
      {groups.map((group) => {
        const dateLabel = group.date === todayIso
          ? 'Today'
          : new Date(`${group.date}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
        return (
          <div key={group.date}>
            <div style={S.sessionLabel}>
              <span style={S.sessionDate}>{dateLabel}</span>
              <span style={S.sessionSpan}>{group.entries.length} entr{group.entries.length === 1 ? 'y' : 'ies'}</span>
            </div>
            {group.entries.map((e) => (
              <EntryCard key={e.id} entry={e} onDelete={onDelete} onEdit={onEdit} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Streak heatmap — hand-rolled SVG. 53×7 calendar; days with any entry tint
// with the accent.
// ---------------------------------------------------------------------------

function Heatmap({ entries }) {
  const days = useMemo(() => activeDays(entries), [entries])
  const today = new Date()
  const dow = today.getDay()
  const lastSunday = new Date(today)
  lastSunday.setDate(today.getDate() - dow)

  const weeks = []
  for (let w = 52; w >= 0; w--) {
    const week = []
    for (let d = 0; d < 7; d++) {
      const cell = new Date(lastSunday)
      cell.setDate(lastSunday.getDate() - w * 7 + d)
      const iso = localDate(cell)
      week.push({ iso, has: days.has(iso), isFuture: cell > today })
    }
    weeks.push(week)
  }
  const cell = 11, gap = 2
  const W = 53 * (cell + gap), H = 7 * (cell + gap)
  const count = days.size
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={S.heatmap} preserveAspectRatio="xMidYMid meet"
      role="img" aria-label={`Activity heatmap: ${count} active day${count === 1 ? '' : 's'} in the last 53 weeks`}>
      {weeks.map((week, wi) => week.map((d, di) => (
        <rect key={`${wi}-${di}`}
          x={wi * (cell + gap)} y={di * (cell + gap)} width={cell} height={cell} rx={2}
          fill={d.isFuture ? 'transparent' : d.has ? 'var(--accent)' : 'var(--border)'}
          opacity={d.isFuture ? 0 : d.has ? 1 : 0.4}>
          <title>{d.iso}{d.has ? ' · active' : ''}</title>
        </rect>
      )))}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Insights tab — pure React/CSS widgets so the app has no chart runtime to
// load, cache, or fail offline.
// ---------------------------------------------------------------------------

function startOfWeekTs(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d.getTime()
}

function entryVolume(entry) {
  const fam = categoryFamily(entry.category)
  if (fam === 'strength') {
    return (entry.metrics?.sets || []).reduce((sum, s) => sum + ((s.weight_kg || 0) * (s.reps || 0)), 0)
  }
  if (fam === 'cardio') return (entry.metrics?.distance_m || 0) / 1000
  return (entry.metrics?.duration_s || 0) / 60
}

function weeklyVolumeByCategory(entries) {
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

function categoryStats(entries) {
  const sessions = groupSessions(entries)
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
    const session = sessions.find((s) => s.entries.some((e) => e.id === entry.id))
    if (session) row.sessions.add(session.sessionId)
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

function CategoryVolumeBars({ weeks }) {
  const totals = new Map()
  for (const week of weeks) {
    for (const [category, value] of Object.entries(week.values)) {
      totals.set(category, (totals.get(category) || 0) + value)
    }
  }
  const rows = [...totals.entries()]
    .map(([category, total]) => ({
      category,
      total: Math.round(total * 10) / 10,
      label: CATEGORIES[category]?.label || category,
      color: CATEGORIES[category]?.color || '#a1a1aa',
    }))
    .sort((a, b) => b.total - a.total)
  const max = Math.max(0, ...rows.map((r) => r.total))
  if (rows.length === 0 || max <= 0) {
    return <div style={{ ...S.empty, padding: '18px 8px' }}>No numeric volume this week yet.</div>
  }
  return (
    <div style={S.barList}>
      {rows.map((row) => (
        <div key={row.category} style={S.barRow}>
          <span style={S.barLabel}>{row.label}</span>
          <div style={S.barTrack}>
            <div style={S.barFill(row.color, (row.total / max) * 100)} />
          </div>
          <span style={{ ...S.barLabel, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.total}</span>
        </div>
      ))}
    </div>
  )
}

function CategoryStats({ stats }) {
  if (stats.length === 0) {
    return <div style={{ ...S.empty, padding: '18px 8px' }}>No category data yet.</div>
  }
  return (
    <div style={S.statGrid}>
      {stats.map((row) => {
        const fam = categoryFamily(row.category)
        const volume = fam === 'strength'
          ? `${Math.round(row.strengthVolume)} kg-reps`
          : fam === 'cardio'
            ? `${Math.round(row.distanceKm * 10) / 10} km`
            : `${Math.round(row.durationMin)} min`
        return (
          <div key={row.category} style={S.statTile}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <SportIcon name={CATEGORIES[row.category].icon} color={row.color} size={18} />
              <span style={S.statLabel}>{row.label}</span>
            </div>
            <div style={S.statValue}>{volume}</div>
            <div style={S.statLabel}>{row.sessions} session{row.sessions === 1 ? '' : 's'} · {row.entries} entr{row.entries === 1 ? 'y' : 'ies'}</div>
          </div>
        )
      })}
    </div>
  )
}

function InsightsTab({ entries }) {
  const weeks = useMemo(() => weeklyVolumeByCategory(entries), [entries])
  const stats = useMemo(() => categoryStats(entries), [entries])
  const prs = useMemo(() => strengthPRs(entries), [entries])
  const cardio = useMemo(() => cardioBests(entries), [entries])
  const streak = useMemo(() => currentStreak(entries), [entries])

  if (entries.length === 0) {
    return (
      <div style={S.empty}>
        <div style={S.emptyIcon}>
          <SportIcon name="heartbeat" color="var(--accent)" size={30} />
        </div>
        Log a few activities and your weekly volume, category stats, PRs, and streak will fill in here.
      </div>
    )
  }

  return (
    <div>
      <div style={S.chartCard}>
        <h3 style={S.chartTitle}>Current streak</h3>
        <p style={S.chartSub}>Consecutive days with at least one logged activity.</p>
        <div style={{ fontSize: '34px', fontWeight: 800, color: 'var(--accent)' }}>
          {streak} <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--muted)' }}>day{streak === 1 ? '' : 's'}</span>
        </div>
        <Heatmap entries={entries} />
      </div>

      <div style={S.chartCard}>
        <h3 style={S.chartTitle}>Weekly volume</h3>
        <p style={S.chartSub}>Strength = kg-reps, cardio = km, other = minutes across the last 6 weeks.</p>
        <CategoryVolumeBars weeks={weeks} />
      </div>

      <div style={S.chartCard}>
        <h3 style={S.chartTitle}>Category stats</h3>
        <p style={S.chartSub}>Sessions and useful totals by activity type.</p>
        <CategoryStats stats={stats} />
      </div>

      {prs.length > 0 && (
        <div style={S.chartCard}>
          <h3 style={S.chartTitle}>Strength PRs</h3>
          <p style={S.chartSub}>Ranked by estimated 1-rep max (Epley).</p>
          <table style={S.prTable}>
            <thead>
              <tr>
                <th style={S.prTh}>Lift</th>
                <th style={{ ...S.prTh, textAlign: 'right' }}>Top set</th>
                <th style={{ ...S.prTh, textAlign: 'right' }}>e1RM</th>
              </tr>
            </thead>
            <tbody>
              {prs.map((p) => (
                <tr key={p.activity}>
                  <td style={S.prTd}>{p.activity}</td>
                  <td style={{ ...S.prTd, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fromKg(p.weight_kg, p.unit)}{p.unit} × {p.reps}
                  </td>
                  <td style={{ ...S.prTd, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {fromKg(p.e1rm, p.unit)}{p.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cardio.length > 0 && (
        <div style={S.chartCard}>
          <h3 style={S.chartTitle}>Cardio bests</h3>
          <p style={S.chartSub}>Longest distance and duration per activity.</p>
          <table style={S.prTable}>
            <thead>
              <tr>
                <th style={S.prTh}>Activity</th>
                <th style={{ ...S.prTh, textAlign: 'right' }}>Distance</th>
                <th style={{ ...S.prTh, textAlign: 'right' }}>Duration</th>
              </tr>
            </thead>
            <tbody>
              {cardio.map((c) => (
                <tr key={c.activity}>
                  <td style={S.prTd}>{c.activity}</td>
                  <td style={{ ...S.prTd, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {c.maxDistance_m ? fmtDistance(c.maxDistance_m) : '—'}
                  </td>
                  <td style={{ ...S.prTd, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {c.maxDuration_s ? fmtDuration(c.maxDuration_s) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// All tab — flat, newest-first list of every entry with delete.
// ---------------------------------------------------------------------------

function AllTab({ entries, onDelete, onEdit }) {
  const groups = useMemo(() => groupEntriesByDate(entries), [entries])
  if (entries.length === 0) {
    return (
      <div style={S.empty}>
        <div style={S.emptyIcon}>
          <SportIcon name="sparkles" color="var(--accent)" size={30} />
        </div>
        No entries yet.
      </div>
    )
  }
  const todayIso = localDate()
  return (
    <div>
      <p style={S.cardSub}>{entries.length} total {entries.length === 1 ? 'entry' : 'entries'}.</p>
      {groups.map((group) => {
        const dateLabel = group.date === todayIso
          ? 'Today'
          : new Date(`${group.date}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
        return (
          <div key={group.date}>
            <div style={S.sessionLabel}>
              <span style={S.sessionDate}>{dateLabel}</span>
              <span style={S.sessionSpan}>{group.entries.length} entr{group.entries.length === 1 ? 'y' : 'ies'}</span>
            </div>
            {group.entries.map((e) => (
              <EntryCard key={e.id} entry={e} onDelete={onDelete} onEdit={onEdit} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default function App({ appId, token }) {
  const store = useMemo(() => makeStore(appId, token), [appId, token])
  const [tab, setTab] = useState('log')
  const [entries, setEntries] = useState(null)
  const [bootStatus, setBootStatus] = useState('loading')
  const syncStatus = useSyncStatus(store)
  const saveQueueRef = useRef({ inFlight: false, pending: null })

  const [editingEntry, setEditingEntry] = useState(null)
  const [deletePending, setDeletePending] = useState(null) // entry id awaiting confirm
  const navHandleRef = useRef(null)

  const bumpSync = syncStatus.bump

  const loadEntries = useCallback(async (options = {}) => {
    const loaded = await store.get('entries.json')
    const normalizedLoaded = normalizeStoredEntries(loaded)
    if (normalizedLoaded.length > 0) {
      setEntries(normalizedLoaded)
      if (options.setReady) setBootStatus('ready')
      if (Array.isArray(loaded) && JSON.stringify(loaded) !== JSON.stringify(normalizedLoaded)) {
        store.set('entries.json', normalizedLoaded).then((r) => bumpSync(r))
      }
      return normalizedLoaded
    }
    if (options.allowMigration) {
      const legacy = await store.get('state.json')
      if (legacy && Array.isArray(legacy.history) && legacy.history.length > 0) {
        const migrated = normalizeStoredEntries(migrateLegacyState(legacy))
        setEntries(migrated)
        if (options.setReady) setBootStatus('ready')
        store.set('entries.json', migrated).then((r) => bumpSync(r))
        return migrated
      }
    }
    setEntries([])
    if (options.setReady) setBootStatus('ready')
    return []
  }, [bumpSync, store])

  // Initial load. entries.json is the append-only log. If it's missing but a
  // legacy state.json exists, migrate its logged history to strength entries.
  useEffect(() => {
    let cancelled = false
    loadEntries({ allowMigration: true, setReady: true }).then(() => {
      if (cancelled) return
    })
    return () => { cancelled = true }
  }, [loadEntries])
  const flushSaves = useCallback(async () => {
    const q = saveQueueRef.current
    if (q.inFlight) return
    q.inFlight = true
    while (q.pending) {
      const pending = q.pending
      q.pending = null
      const nextEntries = pending.entries
      try {
        const remoteEntries = await store.get('entries.json')
        const mergedEntries = mergeEntriesForSave(nextEntries, remoteEntries, pending.deletedIds)
        const result = await store.set('entries.json', mergedEntries)
        bumpSync(result)
        if (!q.pending) setEntries(mergedEntries)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('entries save failed', err)
        bumpSync({ synced: false, error: true })
      }
    }
    q.inFlight = false
  }, [store, bumpSync])

  // Append-only write: optimistic local update + serialized write-through.
  const persist = useCallback((nextEntries, options = {}) => {
    setEntries(nextEntries)
    const previous = saveQueueRef.current.pending
    const deletedIds = new Set([
      ...(previous?.deletedIds || []),
      ...(options.deletedIds || []),
    ])
    saveQueueRef.current.pending = {
      entries: nextEntries,
      deletedIds: [...deletedIds],
    }
    flushSaves()
  }, [flushSaves])

  const commitEditedEntry = useCallback((edited, ts) => {
    if (!editingEntry) return
    const sessionId = editingEntry.sessionId || assignSession(
      (entries || []).filter((entry) => entry.id !== editingEntry.id),
      ts,
    )
    const entry = normalizeEntry(edited, {
      id: editingEntry.id,
      ts,
      sessionId,
      raw: editingEntry.raw || '',
      source: editingEntry.source || 'manual',
      confirmed: true,
    })
    persist((entries || []).map((row) => (row.id === editingEntry.id ? entry : row)))
    setEditingEntry(null)
    setTab('log')
  }, [editingEntry, entries, persist])

  const deleteEntry = useCallback((id) => {
    persist((entries || []).filter((e) => e.id !== id), { deletedIds: [id] })
  }, [entries, persist])

  const closeNestedNav = useCallback(() => {
    try { navHandleRef.current?.close?.() } catch {}
    navHandleRef.current = null
  }, [])

  const openEditEntry = useCallback(async (entry, nextTab = null) => {
    if (!entry) return
    closeNestedNav()
    if (window.mobius?.nav?.open) {
      const handle = window.mobius.nav.open('workout-edit', () => {
        navHandleRef.current = null
        setEditingEntry(null)
      })
      navHandleRef.current = handle
      await handle.ready?.catch(() => false)
      if (navHandleRef.current !== handle) return
    }
    if (nextTab) setTab(nextTab)
    setEditingEntry(entry)
  }, [closeNestedNav])

  const openDeleteConfirm = useCallback(async (id) => {
    if (!id) return
    closeNestedNav()
    if (window.mobius?.nav?.open) {
      const handle = window.mobius.nav.open('workout-delete', () => {
        navHandleRef.current = null
        setDeletePending(null)
      })
      navHandleRef.current = handle
      await handle.ready?.catch(() => false)
      if (navHandleRef.current !== handle) return
    }
    setDeletePending(id)
  }, [closeNestedNav])

  useEffect(() => {
    if (editingEntry || deletePending) return
    closeNestedNav()
  }, [editingEntry, deletePending, closeNestedNav])

  useEffect(() => () => closeNestedNav(), [closeNestedNav])

  if (bootStatus === 'loading') {
    return <div style={S.root}><div style={S.loading}>Loading…</div></div>
  }

  const subtitle = tab === 'log' ? 'Log anything.'
    : tab === 'insights' ? 'See the shape of it.'
    : 'Everything you\'ve logged.'

  return (
    <div style={{ ...S.root, position: 'relative' }}>
      <div style={S.header}>
        <div>
          <h1 style={S.title}>Workout</h1>
          <p style={S.subtitle}>{subtitle}</p>
        </div>
        <SyncPill status={syncStatus} />
      </div>

      {!editingEntry && (
        <nav style={S.tabbar} role="tablist" aria-label="Activity tabs">
          <button style={S.tabBtn(tab === 'log')} onClick={() => setTab('log')}
            role="tab" aria-selected={tab === 'log'} aria-label="Log">
            <span style={S.tabIcon} aria-hidden>✎</span>Log
          </button>
          <button style={S.tabBtn(tab === 'insights')} onClick={() => setTab('insights')}
            role="tab" aria-selected={tab === 'insights'} aria-label="Insights">
            <span style={S.tabIcon} aria-hidden>▦</span>Insights
          </button>
          <button style={S.tabBtn(tab === 'all')} onClick={() => setTab('all')}
            role="tab" aria-selected={tab === 'all'} aria-label="All entries">
            <span style={S.tabIcon} aria-hidden>≣</span>All
          </button>
        </nav>
      )}

      <div style={S.scroll}>
        <div style={S.inner}>
          {editingEntry ? (
            <ConfirmCard
              draft={draftFromStoredEntry(editingEntry)}
              ambiguous={!editingEntry.confirmed}
              clarification={!editingEntry.confirmed ? 'Some fields may still be n/a.' : ''}
              initialTs={editingEntry.ts}
              title="Edit log entry"
              commitLabel="Save changes"
              onCommit={commitEditedEntry}
              onCancel={() => {
                closeNestedNav()
                setEditingEntry(null)
              }}
            />
          ) : (
            <>
              {tab === 'log' && (
                <LogTab
                  entries={entries}
                  onDelete={openDeleteConfirm}
                  onEdit={openEditEntry}
                />
              )}
              {tab === 'insights' && (
                <InsightsTab entries={entries} />
              )}
              {tab === 'all' && (
                <AllTab
                  entries={entries}
                  onDelete={openDeleteConfirm}
                  onEdit={(entry) => openEditEntry(entry, 'log')}
                />
              )}
            </>
          )}
        </div>
      </div>

      {!editingEntry && (
        <AgentChatPanel
          appId={appId}
          token={token}
          store={store}
          onEntriesMaybeChanged={() => loadEntries({ allowMigration: false })}
        />
      )}

      {deletePending && (
        <ConfirmModal
          title="Delete this entry?"
          body="It will be removed from your log and analytics. This can't be undone."
          confirmLabel="Delete"
          onConfirm={() => { deleteEntry(deletePending); closeNestedNav(); setDeletePending(null) }}
          onCancel={() => { closeNestedNav(); setDeletePending(null) }}
        />
      )}
    </div>
  )
}
