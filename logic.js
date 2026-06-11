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
export const CATEGORIES = {
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

export const CATEGORY_KEYS = Object.keys(CATEGORIES)

// Which metric family a category logs. Strength logs sets; the cardio family
// logs duration/distance; everything else logs duration/location/note. The
// LLM is told this split so it returns the right metrics shape, but we re-derive
// it here at normalize time rather than trusting the model's `family`.
export function categoryFamily(category) {
  return CATEGORIES[category]?.family || 'other'
}

// Default gap (ms) that splits one session from the next. Two entries within
// 4h of each other belong to the same session; a longer gap starts a new one.
export const SESSION_GAP_MS = 4 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Unit conversion — we STORE SI (kg, metres, seconds) so analytics never has
// to branch on unit. The composer/LLM may report lb/mi/km/etc; we convert on
// the way in and format back out for display.
// ---------------------------------------------------------------------------

const LB_PER_KG = 2.2046226218

export function toKg(value, unit) {
  const v = Number(value)
  if (!isFinite(v)) return 0
  return unit === 'lb' ? Math.round((v / LB_PER_KG) * 100) / 100 : v
}

export function fromKg(kg, unit) {
  const v = Number(kg)
  if (!isFinite(v)) return 0
  return unit === 'lb' ? Math.round(v * LB_PER_KG * 10) / 10 : v
}

// distance → metres. Accepts m, km, mi.
export function toMetres(value, unit) {
  if (value === '' || value == null) return null
  const v = Number(value)
  if (!isFinite(v)) return null
  if (unit === 'km') return Math.round(v * 1000)
  if (unit === 'mi') return Math.round(v * 1609.344)
  return Math.round(v)
}

// duration → seconds. Accepts s, min, h.
export function toSeconds(value, unit) {
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

export function localDate(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function uid() {
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
export function extractFirstJsonObject(text) {
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

export function draftFromParsed(parsed, fallback = {}) {
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

export function draftsFromParsedPayload(payload) {
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

export function normalizeEntry(parsed, opts = {}) {
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

export function normalizeStoredEntries(entries) {
  if (!Array.isArray(entries)) return []
  return entries
    .map(normalizeStoredEntry)
    .filter(Boolean)
    .sort((a, b) => a.ts - b.ts)
}

export function mergeEntriesForSave(localEntries, remoteEntries, deletedIds = []) {
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
// In-progress session draft. The embedded agent writes current_session.json;
// the UI commits it to entries.json only when the user presses Finish session.
// ---------------------------------------------------------------------------

export function normalizeCurrentSession(session, now = Date.now()) {
  if (!session || typeof session !== 'object') return null
  const startedAtRaw = Number(session.startedAt ?? session.startTs ?? now)
  const startedAt = Number.isFinite(startedAtRaw) ? startedAtRaw : now
  const id = textOrNull(session.id) || `session-${startedAt}`
  const entries = normalizeStoredEntries(
    (Array.isArray(session.entries) ? session.entries : [])
      .map((entry, index) => ({
        ...entry,
        ts: Number.isFinite(Number(entry?.ts)) ? Number(entry.ts) : startedAt + index * 1000,
        sessionId: textOrNull(entry?.sessionId) || id,
      })),
  ).map((entry, index) => ({
    ...entry,
    sessionId: id,
    ts: startedAt + index * 1000,
    localDate: localDate(new Date(startedAt)),
    source: entry.source || 'ai',
    confirmed: entry.confirmed !== false,
  }))

  return {
    id,
    startedAt,
    localDate: textOrNull(session.localDate) || localDate(new Date(startedAt)),
    status: textOrNull(session.status) || 'active',
    entries,
    pendingQuestion: textOrNull(session.pendingQuestion),
  }
}

export function sessionEntryMissing(entry) {
  if (!entry || typeof entry !== 'object') return 'entry'
  const fam = categoryFamily(entry.category)
  const activity = textOrNull(entry.activity)
  const genericActivity = activity === CATEGORIES[entry.category]?.label &&
    ['strength', 'cardio', 'sport', 'other'].includes(entry.category)
  if (!activity || genericActivity) return 'activity'
  if (fam === 'strength') {
    const sets = Array.isArray(entry.metrics?.sets) ? entry.metrics.sets : []
    if (sets.length === 0) return `${activity} sets`
    const incomplete = sets.find((set) => {
      const weight = numberOrNull(set?.weight_kg)
      const reps = numberOrNull(set?.reps)
      return weight == null || weight <= 0 || reps == null || reps <= 0
    })
    if (incomplete) return `${activity} reps and weight`
    return null
  }
  if (fam === 'cardio') {
    const duration = numberOrNull(entry.metrics?.duration_s)
    const distance = numberOrNull(entry.metrics?.distance_m)
    if ((duration == null || duration <= 0) && (distance == null || distance <= 0)) {
      return `${activity} duration or distance`
    }
    return null
  }
  const duration = numberOrNull(entry.metrics?.duration_s)
  if (
    (duration == null || duration <= 0) &&
    !textOrNull(entry.metrics?.note) &&
    !textOrNull(entry.metrics?.location)
  ) {
    return `${activity} duration or note`
  }
  return null
}

export function currentSessionReady(session) {
  const normalized = normalizeCurrentSession(session)
  return !!(normalized && normalized.entries.length > 0 && normalized.entries.every((entry) => !sessionEntryMissing(entry)))
}

export function entriesFromCurrentSession(session) {
  const normalized = normalizeCurrentSession(session)
  if (!normalized || !currentSessionReady(normalized)) return []
  return normalized.entries.map((entry, index) => ({
    ...entry,
    id: uid(),
    ts: normalized.startedAt + index * 1000,
    localDate: normalized.localDate,
    sessionId: normalized.id,
    confirmed: true,
  }))
}

// ---------------------------------------------------------------------------
// Session grouping — entries within SESSION_GAP_MS of each other (in time
// order) share a sessionId. groupSessions takes the full append-only entries
// list and returns derived session objects without mutating the entries.
// ---------------------------------------------------------------------------

export function groupSessions(entries, gapMs = SESSION_GAP_MS) {
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
export function assignSession(entries, ts, gapMs = SESSION_GAP_MS) {
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
export function currentSession(entries, now = Date.now(), gapMs = SESSION_GAP_MS) {
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

export function epley1RM(weightKg, reps) {
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
export function strengthPRs(entries) {
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
export function cardioBests(entries) {
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
// Per-exercise analytics (Hevy-style). Every distinct activity gets a detail
// view: lifetime records, set-records (best weight at each rep target, strength
// only), and a per-session trend the UI draws as a hand-rolled SVG — no chart
// runtime, so the drill-down works offline like the rest of Insights.
//
// An exercise is keyed by category + activity so a Deadlift logged as strength
// never merges with a same-named entry in another category. The activity string
// is matched exactly (the agent is consistent about names); the UI passes the
// same category+activity it rendered, so a clicked row always resolves.
// ---------------------------------------------------------------------------

export function exerciseKey(category, activity) {
  return `${category}::${typeof activity === 'string' ? activity.trim() : ''}`
}

// Every logged exercise, one row, ranked by how often it's logged then recency.
// Generalizes the old in-component exerciseStats (now testable here): each row
// carries the headline best metric plus the category icon/color so the UI never
// has to recompute them. Callers slice for "top N"; the full list is the
// browse surface for the per-exercise drill-down.
export function exerciseList(entries) {
  const sessions = groupSessions(entries)
  const sessionByEntry = new Map()
  for (const s of sessions) for (const e of s.entries) sessionByEntry.set(e.id, s.sessionId)

  const byKey = new Map()
  for (const e of entries || []) {
    const key = exerciseKey(e.category, e.activity)
    let row = byKey.get(key)
    if (!row) {
      row = {
        key,
        activity: e.activity,
        category: e.category,
        family: categoryFamily(e.category),
        icon: CATEGORIES[e.category]?.icon || CATEGORIES.other.icon,
        color: CATEGORIES[e.category]?.color || CATEGORIES.other.color,
        entries: 0,
        sessionIds: new Set(),
        lastTs: 0,
        best: '',
        bestScore: 0,
        topWeight: 0,
        topUnit: 'kg',
      }
      byKey.set(key, row)
    }
    row.entries += 1
    row.lastTs = Math.max(row.lastTs, Number(e.ts) || 0)
    const sid = sessionByEntry.get(e.id)
    if (sid) row.sessionIds.add(sid)
    if (row.family === 'strength') {
      for (const set of e.metrics?.sets || []) {
        const w = Number(set.weight_kg) || 0
        if (w > row.topWeight) { row.topWeight = w; row.topUnit = set.unit === 'lb' ? 'lb' : 'kg' }
        const score = epley1RM(set.weight_kg, set.reps)
        if (score > row.bestScore) {
          row.bestScore = score
          row.best = `${fromKg(set.weight_kg, set.unit)}${set.unit || 'kg'} × ${set.reps}`
        }
      }
    } else if (row.family === 'cardio') {
      const distance = Number(e.metrics?.distance_m) || 0
      const duration = Number(e.metrics?.duration_s) || 0
      const score = distance || duration
      if (score > row.bestScore) {
        row.bestScore = score
        row.best = [distance ? fmtDistance(distance) : '', duration ? fmtDuration(duration) : ''].filter(Boolean).join(' · ')
      }
    } else {
      const duration = Number(e.metrics?.duration_s) || 0
      if (duration > row.bestScore) {
        row.bestScore = duration
        row.best = fmtDuration(duration)
      }
    }
  }
  return [...byKey.values()]
    .map((row) => ({
      key: row.key,
      activity: row.activity,
      category: row.category,
      family: row.family,
      icon: row.icon,
      color: row.color,
      entries: row.entries,
      sessions: row.sessionIds.size,
      lastTs: row.lastTs,
      // Fall back to the heaviest weight when no set had reps to score an e1RM,
      // so a weight-but-no-reps lift reads "100kg" not "—" (matches the per-set
      // summary the feed already shows for the same data).
      best: row.best || (row.topWeight > 0 ? `${fromKg(row.topWeight, row.topUnit)}${row.topUnit}` : '—'),
    }))
    .sort((a, b) => (b.entries - a.entries) || (b.lastTs - a.lastTs))
}

// One point per session for the trend chart. Aggregates the exercise's sets/
// metrics within a session: strength → best e1RM + top weight + tonnage;
// cardio → summed distance/duration + pace; other → summed duration.
function exerciseSessionPoint(session, family) {
  const base = { ts: session.startTs, localDate: session.localDate }
  if (family === 'strength') {
    let topWeight = 0, bestE1rm = 0, volume = 0, reps = 0, sets = 0, unit = 'kg'
    for (const e of session.entries) {
      for (const set of e.metrics?.sets || []) {
        const w = Number(set.weight_kg) || 0
        const r = Number(set.reps) || 0
        // Display unit follows the HEAVIEST set, not any-lb-wins: topWeight_kg is
        // that set's SI weight, so unit must be its unit or the UI renders a kg PR
        // in lb (100kg top shown as 220.5lb when a lighter lb warmup exists).
        if (w > topWeight) { topWeight = w; unit = set.unit === 'lb' ? 'lb' : 'kg' }
        const er = epley1RM(set.weight_kg, set.reps)
        if (er > bestE1rm) bestE1rm = er
        if (w > 0 && r > 0) { volume += w * r; reps += r; sets += 1 }
      }
    }
    return { ...base, value: bestE1rm, e1rm: bestE1rm, topWeight_kg: topWeight, volume_kg: Math.round(volume), reps, sets, unit }
  }
  if (family === 'cardio') {
    let distance = 0, duration = 0, elevation = 0
    for (const e of session.entries) {
      distance += Number(e.metrics?.distance_m) || 0
      duration += Number(e.metrics?.duration_s) || 0
      elevation += Number(e.metrics?.elevation_m) || 0
    }
    return { ...base, value: distance || duration, distance_m: distance, duration_s: duration, elevation_m: elevation, pace_s_per_km: paceSecPerKm(duration, distance) }
  }
  let duration = 0, note = null, location = null
  for (const e of session.entries) {
    duration += Number(e.metrics?.duration_s) || 0
    if (!note) note = textOrNull(e.metrics?.note)
    if (!location) location = textOrNull(e.metrics?.location)
  }
  return { ...base, value: duration, duration_s: duration, note, location }
}

// Lifetime headline records for one exercise, mirroring Hevy's summary tiles.
function exerciseRecords(mine, points, family) {
  if (family === 'strength') {
    let heaviest = 0, bestE1rm = 0, bestSetVolume = 0, mostReps = 0, unit = 'kg', heaviestDate = null, e1rmDate = null
    for (const e of mine) {
      for (const set of e.metrics?.sets || []) {
        const w = Number(set.weight_kg) || 0
        const r = Number(set.reps) || 0
        // Lifetime display unit follows the heaviest set (same reason as
        // exerciseSessionPoint) — not any-lb-wins, which would label every PR
        // tile in lb forever after a single off-unit warmup.
        if (w > heaviest) { heaviest = w; heaviestDate = e.localDate; unit = set.unit === 'lb' ? 'lb' : 'kg' }
        const er = epley1RM(set.weight_kg, set.reps)
        if (er > bestE1rm) { bestE1rm = er; e1rmDate = e.localDate }
        if (w > 0 && r > 0 && w * r > bestSetVolume) bestSetVolume = w * r
        if (r > mostReps) mostReps = r
      }
    }
    return {
      family, unit,
      heaviest_kg: heaviest, heaviestDate,
      bestE1rm, e1rmDate,
      bestSetVolume_kg: Math.round(bestSetVolume),
      bestSessionVolume_kg: points.reduce((m, p) => Math.max(m, p.volume_kg || 0), 0),
      totalVolume_kg: points.reduce((s, p) => s + (p.volume_kg || 0), 0),
      mostReps,
    }
  }
  if (family === 'cardio') {
    let maxDistance = 0, maxDuration = 0, maxElevation = 0, bestPace = null, totalDistance = 0, totalDuration = 0
    for (const p of points) {
      if ((p.distance_m || 0) > maxDistance) maxDistance = p.distance_m
      if ((p.duration_s || 0) > maxDuration) maxDuration = p.duration_s
      if ((p.elevation_m || 0) > maxElevation) maxElevation = p.elevation_m
      if (p.pace_s_per_km != null && (bestPace == null || p.pace_s_per_km < bestPace)) bestPace = p.pace_s_per_km
      totalDistance += p.distance_m || 0
      totalDuration += p.duration_s || 0
    }
    return { family, maxDistance_m: maxDistance, maxDuration_s: maxDuration, maxElevation_m: maxElevation, bestPace_s_per_km: bestPace, totalDistance_m: totalDistance, totalDuration_s: totalDuration }
  }
  let maxDuration = 0, totalDuration = 0
  for (const p of points) {
    if ((p.duration_s || 0) > maxDuration) maxDuration = p.duration_s
    totalDuration += p.duration_s || 0
  }
  return { family, maxDuration_s: maxDuration, totalDuration_s: totalDuration, sessions: points.length }
}

// Best weight lifted at each rep count (strength only) — Hevy's "Set Records".
function exerciseSetRecords(mine) {
  const byReps = new Map()
  for (const e of mine) {
    for (const set of e.metrics?.sets || []) {
      const w = Number(set.weight_kg) || 0
      const r = Number(set.reps) || 0
      if (w <= 0 || r <= 0) continue
      const prev = byReps.get(r)
      if (!prev || w > prev.weight_kg) {
        byReps.set(r, { reps: r, weight_kg: w, unit: set.unit === 'lb' ? 'lb' : 'kg', localDate: e.localDate, e1rm: epley1RM(set.weight_kg, set.reps) })
      }
    }
  }
  return [...byReps.values()].sort((a, b) => a.reps - b.reps)
}

// The full drill-down for one exercise: chronological per-session points (for
// the trend), lifetime records, and set-records. Returns null when the
// exercise has no entries (e.g. it was just deleted).
export function exerciseDetail(entries, category, activity) {
  const key = exerciseKey(category, activity)
  const mine = (entries || []).filter((e) => exerciseKey(e.category, e.activity) === key)
  if (mine.length === 0) return null
  const family = categoryFamily(category)
  const cat = CATEGORIES[category] || CATEGORIES.other
  const sessions = groupSessions(mine) // ascending by startTs
  const points = sessions.map((s) => exerciseSessionPoint(s, family))
  return {
    key,
    activity: mine[mine.length - 1].activity || activity,
    category,
    family,
    icon: cat.icon,
    color: cat.color,
    entryCount: mine.length,
    sessionCount: sessions.length,
    firstTs: sessions.length ? sessions[0].startTs : null,
    lastTs: sessions.length ? sessions[sessions.length - 1].endTs : null,
    points,
    records: exerciseRecords(mine, points, family),
    setRecords: family === 'strength' ? exerciseSetRecords(mine) : [],
  }
}

// ---------------------------------------------------------------------------
// Category split for the donut: count of entries per category.
// ---------------------------------------------------------------------------

export function categorySplit(entries) {
  const counts = new Map()
  for (const e of entries || []) {
    counts.set(e.category, (counts.get(e.category) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([category, count]) => ({
      category,
      label: CATEGORIES[category]?.label || category,
      color: CATEGORIES[category]?.color || 'var(--muted)',
      count,
    }))
    .sort((a, b) => b.count - a.count)
}

// Volume over time — one point per local day, one numeric series per category
// family. Strength volume = Σ(weight_kg × reps); cardio volume = Σ distance_m
// (km for readability); other = Σ duration_s (minutes). Returns rows keyed by
// date with a column per category present, suitable for a stacked bar/area.
export function volumeByDay(entries) {
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
export function activeDays(entries) {
  const s = new Set()
  for (const e of entries || []) s.add(e.localDate)
  return s
}

// Current consecutive-day streak ending today (or yesterday, so a not-yet-
// logged today doesn't read as a broken streak).
export function currentStreak(entries, today = localDate()) {
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

export function migrateLegacyState(oldState) {
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

export function fmtDuration(seconds) {
  const s = Math.round(Number(seconds) || 0)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  if (m > 0) return `${m}m`
  return `${s}s`
}

export function fmtDistance(metres) {
  const m = Number(metres) || 0
  if (m >= 1000) return `${(Math.round((m / 1000) * 10) / 10).toFixed(1)}km`
  return `${Math.round(m)}m`
}

// Pace as a raw number (seconds per km) so analytics can compare/min it; the
// display formatter (fmtPace) wraps this. Returns null when either side is
// missing, so a duration-only or distance-only entry has no spurious pace.
export function paceSecPerKm(durationS, distanceM) {
  const d = Number(distanceM) || 0
  const s = Number(durationS) || 0
  if (d <= 0 || s <= 0) return null
  const secPerKm = s / (d / 1000)
  return Number.isFinite(secPerKm) ? secPerKm : null
}

export function fmtPace(durationS, distanceM) {
  const secPerKm = paceSecPerKm(durationS, distanceM)
  if (secPerKm == null) return null
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
// ---------------------------------------------------------------------------
// Quick-add helpers — speed-up the "log same as last time" flow.
// ---------------------------------------------------------------------------

// The most recent stored entry for a given exercise (category + activity).
// Returns null when no history exists. Used to pre-fill ConfirmCard with the
// previous session's weight/reps so a repeat set is one tap (chip → save).
export function lastEntryForExercise(entries, category, activity) {
  const key = exerciseKey(category, activity)
  let best = null
  for (const e of entries || []) {
    if (exerciseKey(e.category, e.activity) === key) {
      if (!best || e.ts > best.ts) best = e
    }
  }
  return best
}

// The N most recently logged distinct exercises (category + activity pairs),
// ordered by last-logged time descending. Used to render quick-add chips on
// the Log tab so tapping a chip pre-fills the ConfirmCard.
export function recentExercises(entries, n = 5) {
  const seen = new Map()
  const sorted = [...(entries || [])].sort((a, b) => b.ts - a.ts)
  for (const e of sorted) {
    const key = exerciseKey(e.category, e.activity)
    if (!seen.has(key)) {
      seen.set(key, {
        key,
        category: e.category,
        activity: e.activity,
        icon: CATEGORIES[e.category]?.icon || CATEGORIES.other.icon,
        color: CATEGORIES[e.category]?.color || CATEGORIES.other.color,
        lastTs: e.ts,
      })
    }
    if (seen.size >= n) break
  }
  return [...seen.values()]
}

export function summarizeMetrics(entry) {
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
