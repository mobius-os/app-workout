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
// They are per-CATEGORY fallbacks — sportIconKey (below) refines the icon from
// the activity name, so entries usually carry a more specific key than these.
const CATEGORIES = {
  strength: { label: 'Strength', icon: 'barbell', color: '#6366f1', family: 'strength' },
  cardio: { label: 'Cardio', icon: 'heartbeat', color: '#ef4444', family: 'cardio' },
  running: { label: 'Running', icon: 'run', color: '#f97316', family: 'cardio' },
  cycling: { label: 'Cycling', icon: 'bike', color: '#14b8a6', family: 'cardio' },
  swimming: { label: 'Swimming', icon: 'swimming', color: '#06b6d4', family: 'cardio' },
  rowing: { label: 'Rowing', icon: 'kayak', color: '#3b82f6', family: 'cardio' },
  hiking: { label: 'Hiking', icon: 'trekking', color: '#10b981', family: 'cardio' },
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

// ---------------------------------------------------------------------------
// Sport-icon matcher — picks an icon from the activity NAME, not just the
// category, so "Tennis" filed under the generic `sport` category gets a tennis
// ball and a "Morning Run" filed under plain `cardio` gets the runner. Pure
// keyword data + one matcher; index.jsx maps the returned key to inline SVG
// (no external fetches — CSP + offline).
//
// Matching is on whole words with a trailing-s strip ("Squats" hits "squat");
// multi-word keywords match as phrases. Rules run in order and the first hit
// wins, so gym-lift vocabulary is checked before sport words — "Barbell Row"
// stays a lift, it never becomes rowing. A rule with `family` applies only to
// entries whose category maps to that metric family; that is how the bare word
// "row" resolves to the barbell for strength entries and to the rowing icon
// for everything else. No keyword hit → the entry's category icon.
// ---------------------------------------------------------------------------

const SPORT_ICON_RULES = [
  { icon: 'barbell', family: 'strength', words: ['row'] },
  { icon: 'barbell', words: [
    'bench', 'press', 'squat', 'deadlift', 'rdl', 'ohp', 'curl', 'barbell',
    'dumbbell', 'kettlebell', 'snatch', 'clean', 'jerk', 'thruster', 'lunge',
    'pull', 'pullup', 'chinup', 'pulldown', 'push', 'pushup', 'pushdown',
    'dip', 'shrug', 'raise', 'extension', 'fly', 'flye', 'plank', 'crunch',
    'situp', 'lift', 'weights', 'hypertrophy',
  ] },
  { icon: 'run', words: ['run', 'running', 'jog', 'jogging', 'sprint', 'marathon', 'parkrun', 'track'] },
  { icon: 'bike', words: ['bike', 'biking', 'cycling', 'cycle', 'ride', 'riding', 'spin', 'spinning', 'mtb', 'peloton', 'velodrome'] },
  { icon: 'swimming', words: ['swim', 'swimming', 'freestyle', 'breaststroke', 'backstroke', 'butterfly', 'pool', 'laps'] },
  { icon: 'kayak', words: ['rowing', 'row', 'erg', 'ergometer', 'kayak', 'canoe', 'paddle', 'paddling', 'sup'] },
  { icon: 'mountain', words: ['climb', 'climbing', 'boulder', 'bouldering', 'crag', 'belay', 'mountaineering'] },
  { icon: 'trekking', words: ['hike', 'hiking', 'trek', 'trekking', 'ruck', 'rucking', 'trail'] },
  { icon: 'walk', words: ['walk', 'walking', 'stroll', 'steps'] },
  { icon: 'yoga', words: ['yoga', 'pilates', 'meditation', 'vinyasa', 'hatha', 'breathwork'] },
  { icon: 'stretching', words: ['stretch', 'stretching', 'mobility', 'foam', 'warmup', 'cooldown'] },
  { icon: 'jump-rope', words: ['skipping', 'jump rope', 'jumprope', 'double unders'] },
  { icon: 'karate', words: ['boxing', 'kickboxing', 'mma', 'karate', 'judo', 'bjj', 'jiu', 'taekwondo', 'muay', 'sparring', 'martial', 'wrestling'] },
  { icon: 'ball-basketball', words: ['basketball', 'hoops', 'netball'] },
  { icon: 'ball-tennis', words: ['tennis', 'padel', 'squash', 'badminton', 'pickleball', 'racquetball'] },
  { icon: 'ball-football', words: ['football', 'soccer', 'futsal', 'rugby', 'volleyball', 'handball', 'hockey', 'golf', 'cricket', 'baseball'] },
  { icon: 'treadmill', words: ['treadmill', 'elliptical', 'stairmaster', 'stepmill', 'stairs'] },
  { icon: 'heartbeat', words: ['hiit', 'cardio', 'conditioning', 'circuit', 'metcon', 'intervals', 'tabata', 'crossfit', 'wod'] },
]

// Per-icon accent so the same sport is the same color everywhere it appears,
// independent of which category the entry was filed under. Category-level
// charts (volume bars, stat tiles) keep CATEGORIES[*].color — they aggregate
// categories, not sports.
const SPORT_ICON_COLORS = {
  barbell: '#6366f1',
  heartbeat: '#ef4444',
  run: '#f97316',
  bike: '#14b8a6',
  swimming: '#06b6d4',
  kayak: '#3b82f6',
  trekking: '#10b981',
  walk: '#84cc16',
  mountain: '#f59e0b',
  yoga: '#8b5cf6',
  stretching: '#a78bfa',
  'jump-rope': '#fb7185',
  karate: '#e11d48',
  'ball-football': '#ec4899',
  'ball-basketball': '#ea580c',
  'ball-tennis': '#a3e635',
  treadmill: '#f87171',
  sparkles: '#a1a1aa',
}

function sportIconKey(activity, category) {
  const cat = CATEGORY_KEYS.includes(category) ? category : 'other'
  const text = (typeof activity === 'string' ? activity : '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  const tokens = new Set()
  for (const word of text.split(' ')) {
    if (!word) continue
    tokens.add(word)
    if (word.length > 3 && word.endsWith('s')) tokens.add(word.slice(0, -1))
  }
  const family = categoryFamily(cat)
  for (const rule of SPORT_ICON_RULES) {
    if (rule.family && rule.family !== family) continue
    for (const word of rule.words) {
      const hit = word.includes(' ')
        ? ` ${text} `.includes(` ${word} `)
        : tokens.has(word)
      if (hit) return rule.icon
    }
  }
  return CATEGORIES[cat].icon
}

function sportIconColor(icon, category) {
  return SPORT_ICON_COLORS[icon] || CATEGORIES[category]?.color || CATEGORIES.other.color
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

  const activity = (typeof parsed?.activity === 'string' && parsed.activity.trim())
    ? parsed.activity.trim()
    : CATEGORIES[category].label
  return {
    id: opts.id || uid(),
    ts,
    localDate: localDate(at),
    sessionId: opts.sessionId || null, // assigned by assignSession at commit
    category,
    activity,
    icon: sportIconKey(activity, category), // app owns the icon, ignore parsed.icon
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

  const activity = textOrNull(entry.activity) || CATEGORIES[category].label
  return {
    id: textOrNull(entry.id) || uid(),
    ts,
    localDate: textOrNull(entry.localDate) || localDate(new Date(ts)),
    sessionId: textOrNull(entry.sessionId) || null,
    category,
    activity,
    icon: sportIconKey(activity, category),
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
// In-progress session draft. The embedded agent and quick-add both write
// current_session.json; the UI commits it to entries.json only when the
// user presses Finish session.
// ---------------------------------------------------------------------------

function normalizeCurrentSession(session, now = Date.now()) {
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

function sessionEntryMissing(entry) {
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

function currentSessionReady(session) {
  const normalized = normalizeCurrentSession(session)
  return !!(normalized && normalized.entries.length > 0 && normalized.entries.every((entry) => !sessionEntryMissing(entry)))
}

function entriesFromCurrentSession(session) {
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

// Quick-add and the embedded chat agent are co-writers of the SAME
// current_session.json draft: logging an entry implicitly starts a session
// when none is active, and extends the active one otherwise. Routing the
// result through normalizeCurrentSession keeps the two writers byte-
// compatible — id "session-<startedAt>", status "active", entries stamped
// with the shared sessionId/localDate and startedAt + index*1000 ordering,
// exactly the shape the agent prompt documents. Never mutates the input.
function appendEntryToCurrentSession(session, entry, now = Date.now()) {
  const active = normalizeCurrentSession(session, now)
  if (active) {
    return normalizeCurrentSession({ ...active, entries: [...active.entries, entry] }, now)
  }
  const tsRaw = Number(entry?.ts)
  const startedAt = Number.isFinite(tsRaw) ? tsRaw : now
  return normalizeCurrentSession({
    id: `session-${startedAt}`,
    startedAt,
    status: 'active',
    entries: [entry],
  }, now)
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

function exerciseKey(category, activity) {
  return `${category}::${typeof activity === 'string' ? activity.trim() : ''}`
}

// Every logged exercise, one row, ranked by how often it's logged then recency.
// Generalizes the old in-component exerciseStats (now testable here): each row
// carries the headline best metric plus the category icon/color so the UI never
// has to recompute them. Callers slice for "top N"; the full list is the
// browse surface for the per-exercise drill-down.
function exerciseList(entries) {
  const sessions = groupSessions(entries)
  const sessionByEntry = new Map()
  for (const s of sessions) for (const e of s.entries) sessionByEntry.set(e.id, s.sessionId)

  const byKey = new Map()
  for (const e of entries || []) {
    const key = exerciseKey(e.category, e.activity)
    let row = byKey.get(key)
    if (!row) {
      const icon = sportIconKey(e.activity, e.category)
      row = {
        key,
        activity: e.activity,
        category: e.category,
        family: categoryFamily(e.category),
        icon,
        color: sportIconColor(icon, e.category),
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
function exerciseDetail(entries, category, activity) {
  const key = exerciseKey(category, activity)
  const mine = (entries || []).filter((e) => exerciseKey(e.category, e.activity) === key)
  if (mine.length === 0) return null
  const family = categoryFamily(category)
  const sessions = groupSessions(mine) // ascending by startTs
  const points = sessions.map((s) => exerciseSessionPoint(s, family))
  const icon = sportIconKey(activity, category)
  return {
    key,
    activity: mine[mine.length - 1].activity || activity,
    category,
    family,
    icon,
    color: sportIconColor(icon, category),
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

function categorySplit(entries) {
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
        icon: sportIconKey(exercise, 'strength'),
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

// Pace as a raw number (seconds per km) so analytics can compare/min it; the
// display formatter (fmtPace) wraps this. Returns null when either side is
// missing, so a duration-only or distance-only entry has no spurious pace.
function paceSecPerKm(durationS, distanceM) {
  const d = Number(distanceM) || 0
  const s = Number(durationS) || 0
  if (d <= 0 || s <= 0) return null
  const secPerKm = s / (d / 1000)
  return Number.isFinite(secPerKm) ? secPerKm : null
}

function fmtPace(durationS, distanceM) {
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
function lastEntryForExercise(entries, category, activity) {
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
function recentExercises(entries, n = 5) {
  const seen = new Map()
  const sorted = [...(entries || [])].sort((a, b) => b.ts - a.ts)
  for (const e of sorted) {
    const key = exerciseKey(e.category, e.activity)
    if (!seen.has(key)) {
      const icon = sportIconKey(e.activity, e.category)
      seen.set(key, {
        key,
        category: e.category,
        activity: e.activity,
        icon,
        color: sportIconColor(icon, e.category),
        lastTs: e.ts,
      })
    }
    if (seen.size >= n) break
  }
  return [...seen.values()]
}

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
  normalizeCurrentSession,
  sessionEntryMissing,
  currentSessionReady,
  entriesFromCurrentSession,
  appendEntryToCurrentSession,
  draftsFromParsedPayload,
  groupSessions,
  summarizeMetrics,
  lastEntryForExercise,
  recentExercises,
  sportIconKey,
  sportIconColor,
}
// ===== INLINE-LOGIC END =====

const CHAT_HEIGHT_CACHE_VERSION = 1

function chatHeightKey(appId) {
  return `workout:${appId}:chat-height:v${CHAT_HEIGHT_CACHE_VERSION}`
}

function readChatHeight(appId) {
  if (typeof localStorage === 'undefined') return 64
  const saved = localStorage.getItem(chatHeightKey(appId))
  if (saved == null) return 64
  const raw = Number(saved)
  if (!Number.isFinite(raw)) return 64
  return Math.min(82, Math.max(44, raw))
}

// ---------------------------------------------------------------------------
// Sport + chrome icons — the rendering half of logic.js's icon keys. logic.js
// stores a Tabler icon KEY per entry (it stays JSX-free; sportIconKey picks
// the key from the activity name); this map turns that key into the inline
// SVG inner markup, copied verbatim from Tabler's outline set. Drawn with the
// shared <SportIcon> below so every render site picks up the same
// stroke/sizing. history / chart-bar / stopwatch are app chrome (tab bar),
// not sport keys.
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
  trekking: (
    <>
      <path d="M12 4m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M7 21l2 -4" />
      <path d="M13 21v-4l-3 -3l1 -6l3 4l3 2" />
      <path d="M10 14l-1.827 -1.218a2 2 0 0 1 -.831 -2.15l.28 -1.117a2 2 0 0 1 1.939 -1.515h1.439l4 1l3 -2" />
      <path d="M17 12v9" />
      <path d="M16 20h2" />
    </>
  ),
  walk: (
    <>
      <path d="M13 4m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M7 21l3 -4" />
      <path d="M16 21l-2 -4l-3 -3l1 -6" />
      <path d="M6 12l2 -3l4 -1l3 3l3 1" />
    </>
  ),
  stretching: (
    <>
      <path d="M11 4a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" />
      <path d="M6.5 21l3.5 -5" />
      <path d="M5 11l7 -2" />
      <path d="M16 21l-4 -7v-5l7 -4" />
    </>
  ),
  'jump-rope': (
    <>
      <path d="M6 14v-6a3 3 0 1 1 6 0v8a3 3 0 0 0 6 0v-6" />
      <path d="M16 3m0 2a2 2 0 0 1 2 -2h0a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h0a2 2 0 0 1 -2 -2z" />
      <path d="M4 14m0 2a2 2 0 0 1 2 -2h0a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h0a2 2 0 0 1 -2 -2z" />
    </>
  ),
  karate: (
    <>
      <path d="M18 4m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M3 9l4.5 1l3 2.5" />
      <path d="M13 21v-8l3 -5.5" />
      <path d="M8 4.5l4 2l4 1l4 3.5l-2 3.5" />
    </>
  ),
  'ball-basketball': (
    <>
      <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M5.65 5.65l12.7 12.7" />
      <path d="M5.65 18.35l12.7 -12.7" />
      <path d="M12 3a9 9 0 0 0 9 9" />
      <path d="M3 12a9 9 0 0 1 9 9" />
    </>
  ),
  'ball-tennis': (
    <>
      <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M6 5.3a9 9 0 0 1 0 13.4" />
      <path d="M18 5.3a9 9 0 0 0 0 13.4" />
    </>
  ),
  treadmill: (
    <>
      <path d="M10 3a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" />
      <path d="M3 14l4 1l.5 -.5" />
      <path d="M12 18v-3l-3 -2.923l.75 -5.077" />
      <path d="M6 10v-2l4 -1l2.5 2.5l2.5 .5" />
      <path d="M21 22a1 1 0 0 0 -1 -1h-16a1 1 0 0 0 -1 1" />
      <path d="M18 21l1 -11l2 -1" />
    </>
  ),
  history: (
    <>
      <path d="M12 8l0 4l2 2" />
      <path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" />
    </>
  ),
  'chart-bar': (
    <>
      <path d="M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
      <path d="M15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
      <path d="M9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
      <path d="M4 20h14" />
    </>
  ),
  stopwatch: (
    <>
      <path d="M5 13a7 7 0 1 0 14 0a7 7 0 0 0 -14 0z" />
      <path d="M14.5 10.5l-2.5 2.5" />
      <path d="M17 8l1 -1" />
      <path d="M14 3h-4" />
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

  // Subscribe to external writes to `path` (e.g. the embedded agent updating
  // current_session.json mid-session) so a mounted view repaints instead of
  // showing its stale mount-time read. No-op unsubscribe when the offline
  // runtime isn't present.
  function subscribe(path, cb) {
    const ms = (typeof window !== 'undefined') ? window.mobius?.storage : null
    if (ms && typeof ms.subscribe === 'function') {
      try { return ms.subscribe(path, cb) } catch { return () => {} }
    }
    return () => {}
  }

  return { get, set, pendingCount, subscribe }
}

// ---------------------------------------------------------------------------
// Embedded shell chat. Like the LaTeX app, Workout uses the real Möbius chat
// iframe as the interaction surface. The sub-agent edits current_session.json;
// the mini-app commits it to entries.json when the user finishes the session.
// ---------------------------------------------------------------------------

function workoutAgentPrompt(appId) {
  return [
    `You are the Workout training-log sub-agent for Möbius app id ${appId}.`,
    '',
    `Your job is to maintain /data/apps/${appId}/current_session.json as the`,
    'active workout draft. The user should talk naturally. Your default action',
    'is to update the current session, not to explain forms. The app has a',
    'Finish session button that commits this draft into entries.json; do not',
    'write entries.json for normal logging.',
    '',
    'Always read current_session.json before writing. If it is missing/null,',
    'create a new active session whose startedAt is the time of the first',
    'activity the user describes, or now if no time is given. Preserve existing',
    'draft entries unless the user asks you to change/delete them. Write the',
    'whole current_session.json object back after changes.',
    '',
    'current_session.json shape:',
    '{',
    '  "id": "session-<startedAt>",',
    '  "startedAt": 1780000000000,',
    '  "localDate": "YYYY-MM-DD",',
    '  "status": "active",',
    '  "entries": [Entry, Entry],',
    '  "pendingQuestion": "short missing-detail question or null"',
    '}',
    '',
    'Entry shape inside entries:',
    '{',
    '  "id": "stable unique string",',
    '  "ts": 1780000000000,',
    '  "localDate": "YYYY-MM-DD",',
    '  "sessionId": "session-<startedAt>",',
    '  "category": "strength|cardio|running|cycling|swimming|rowing|hiking|yoga|sport|other",',
    '  "activity": "Deadlift",',
    '  "icon": "(optional — the app derives the icon from activity + category)",',
    '  "metrics": { ... },',
    '  "raw": "the user text that caused/updated this entry",',
    '  "source": "ai",',
    '  "confirmed": true',
    '}',
    '',
    'Use the session startedAt for the first entry, then +1000ms per additional',
    'entry so ordering is stable. localDate is the user-facing local day.',
    'All entries in one active workout share the same sessionId.',
    '',
    'Required metric rules:',
    '- strength metrics: {"sets":[{"weight_kg": number, "reps": number, "unit":"kg"|"lb"}]}. Strength requires exercise name, at least one set, and every set needs both reps and weight. Convert lb to weight_kg but keep unit as "lb" for display. If the user gives sets without reps/weight, ask before adding. If the user gives reps/weight without the exercise, ask before adding.',
    '- cardio/running/cycling/swimming/rowing/hiking metrics: {"duration_s": number|null, "distance_m": number|null, "elevation_m": number|null, "location": string|null}. These require the activity plus at least one of duration_s or distance_m. Convert miles/mi/km/m to metres and hours/minutes/seconds to seconds.',
    '- yoga/sport/other metrics: {"duration_s": number|null, "location": string|null, "note": string|null}. These require activity plus duration_s or a useful note/location.',
    '',
    'Question behavior:',
    '- If a required field is missing, do not add an incomplete entry. Ask one',
    '  concise follow-up question and set pendingQuestion to that question.',
    '- If the runtime exposes AskUserQuestion, use it. If the runtime exposes',
    '  request_user_input, use it. Otherwise ask in chat.',
    '- When the user answers, update the pending activity in current_session.json',
    '  rather than creating a duplicate.',
    '',
    'Examples:',
    '- "I did 2 sets of deadlifts" -> ask for reps and weight; do not add yet.',
    '- "I did two sets with 20 kg" -> ask which exercise; do not add yet.',
    '- "I swam for 40 minutes" -> add Swimming with duration_s 2400.',
    '- "I swam 20 miles" -> add Swimming with distance_m 32187.',
    '- "3 sets of deadlift 5 reps at 120kg, then swam 40 minutes, hiked 8km, and ran a marathon" -> split into four entries in the same current session.',
    '',
    'Committed history:',
    '- You may read entries.json for context or analytics if helpful. Do not',
    '  write it unless the user explicitly asks to edit committed history.',
    '- The app owns committing current_session.json to entries.json when Finish',
    '  session is pressed.',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Styles — one module-level stylesheet (the `wk-` prefix scopes it to this
// app's iframe) rendered once at the root as <style>{CSS}</style>. Every
// color/font is a CSS token painted by the Möbius shell, so the app inherits
// future themes for free. Render-time dynamic values (per-category accent
// colors, the measured chat-panel height, the bar-fill %) stay inline; every
// app-driven state that used to be an S.foo(active) helper is now a modifier
// class (.is-active / :disabled). Shared-chrome blocks are fenced with
// mobius-ui markers so a future extraction is mechanical.
// ---------------------------------------------------------------------------

const CSS = `
/* mobius-ui:Root v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-root {
  position: relative;
  display: flex; flex-direction: column;
  height: 100%; width: 100%; max-width: 100%;
  overflow: hidden;
  background: var(--bg); color: var(--text); font-family: var(--font);
  -webkit-tap-highlight-color: transparent;
}
.wk-scroll {
  flex: 1; min-height: 0;
  overflow-y: auto; overflow-x: hidden;
  padding: 14px 16px 16px;
  word-break: break-word; overflow-wrap: anywhere;
  overscroll-behavior: contain;
}
/* /mobius-ui:Root */

/* mobius-ui:Focus v1 -- shared keyboard focus ring (WCAG 2.4.7); never bare outline:none */
:where(button,a,input,textarea,select,summary,[role="button"],[tabindex]:not([tabindex="-1"])):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
/* /mobius-ui:Focus */

/* Web cap so the column doesn't sprawl on desktop while staying mobile-first. */
.wk-inner { width: 100%; max-width: 720px; margin-left: auto; margin-right: auto; }

/* mobius-ui:Header v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-header {
  flex: 0 0 auto;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: max(12px, env(safe-area-inset-top)) 16px 10px;
  background: var(--surface); border-bottom: 1px solid var(--border);
}
.wk-title { margin: 0; font-size: 18px; font-weight: 760; letter-spacing: 0; user-select: none; }
.wk-subtitle { margin: 2px 0 0; font-size: 12px; color: var(--muted); user-select: none; }
/* /mobius-ui:Header */

/* mobius-ui:Segmented v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-tabbar {
  flex: 0 0 auto;
  display: flex; gap: 4px; padding: 8px 12px;
  background: var(--surface); border-bottom: 1px solid var(--border);
}
.wk-tab-btn {
  flex: 1; min-height: 44px; padding: 10px 8px;
  display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 6px;
  border: 1px solid transparent; border-radius: 8px;
  background: transparent; color: var(--muted);
  font-family: var(--font); font-size: 12px; font-weight: 700; cursor: pointer;
  touch-action: manipulation; user-select: none;
}
.wk-tab-btn.is-active {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--text);
}
@media (prefers-reduced-motion: no-preference) {
  .wk-tab-btn:active { opacity: 0.75; }
}
.wk-tab-icon { display: flex; line-height: 1; }
/* /mobius-ui:Segmented */

/* mobius-ui:ChatEmbed v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-chat-embed {
  flex: 1 1 auto; min-height: 0;
  overflow: hidden; background: var(--bg);
}
.wk-chat-embed iframe { display: block; width: 100%; height: 100%; border: 0; }
/* /mobius-ui:ChatEmbed */

/* Resizable embedded-chat panel — app-specific drag chrome above the ChatEmbed. */
.wk-chat-panel {
  flex: 0 0 auto;
  min-height: min(360px, 70%);
  max-height: calc(100% - 110px);
  display: flex; flex-direction: column;
  background: var(--bg);
  padding-bottom: env(safe-area-inset-bottom);
}
.wk-chat-resizer {
  flex: 0 0 9px;
  display: flex; align-items: center; justify-content: center;
  cursor: ns-resize;
  background: var(--surface);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  touch-action: none;
}
.wk-chat-resizer-bar {
  width: 44px; height: 3px; border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 65%, transparent);
}
.wk-chat-error {
  flex: 0 0 auto;
  margin: 8px 14px 0;
  padding: 8px 10px;
  border: 1px solid var(--border); border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--text); font-size: 12px;
}

/* mobius-ui:Card v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; padding: 16px; margin-bottom: 14px;
}
.wk-card.is-ambiguous { border-color: var(--accent); }
.wk-card-title { margin: 0 0 4px; font-size: 16px; font-weight: 700; }
.wk-card-sub { margin: 0 0 12px; font-size: 12px; color: var(--muted); }
/* /mobius-ui:Card */

/* mobius-ui:Button v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-btn-primary {
  width: 100%; min-height: 48px; padding: 14px 16px; border-radius: 12px;
  border: none; background: var(--accent); color: #fff;
  font-family: var(--font); font-size: 15px; font-weight: 600; cursor: pointer;
  touch-action: manipulation; user-select: none;
}
.wk-btn-primary:disabled { pointer-events: none; opacity: 0.6; }
@media (prefers-reduced-motion: no-preference) {
  .wk-btn-primary:not(:disabled):active { opacity: 0.82; transform: scale(0.98); }
}
.wk-btn-secondary {
  min-height: 44px; padding: 12px 14px; border-radius: 10px;
  border: 1px solid var(--border); background: var(--surface2, var(--surface));
  color: var(--text); font-family: var(--font);
  font-size: 14px; font-weight: 600; cursor: pointer;
  touch-action: manipulation; user-select: none;
}
.wk-btn-secondary:disabled { pointer-events: none; opacity: 0.6; }
@media (prefers-reduced-motion: no-preference) {
  .wk-btn-secondary:not(:disabled):active { opacity: 0.8; transform: scale(0.97); }
}
.wk-btn-secondary.is-block { width: 100%; }
.wk-btn-secondary.is-danger { background: var(--danger); color: #fff; border-color: var(--danger); }
.wk-btn-ghost {
  min-height: 44px; padding: 10px 12px; border-radius: 8px;
  border: none; background: transparent; color: var(--accent);
  font-family: var(--font); font-size: 13px; font-weight: 600; cursor: pointer;
  touch-action: manipulation; user-select: none;
}
.wk-btn-ghost:disabled { pointer-events: none; opacity: 0.55; }
@media (prefers-reduced-motion: no-preference) {
  .wk-btn-ghost:not(:disabled):active { opacity: 0.75; }
}
.wk-btn-ghost.is-muted { color: var(--muted); }
.wk-btn-row { display: flex; gap: 8px; flex-wrap: wrap; }
/* /mobius-ui:Button */

/* Entry feed card — app-specific list row with a per-sport icon tile. Tight
   rows: the icon names the sport, the meta line carries the key numbers. */
.wk-entry-card {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 10px; margin-bottom: 6px;
  background: color-mix(in srgb, var(--surface) 94%, #000);
  border: 1px solid var(--border); border-radius: 8px;
}
.wk-entry-card.is-draft { background: color-mix(in srgb, var(--bg) 62%, var(--surface)); }
.wk-entry-icon {
  width: 32px; height: 32px; flex-shrink: 0; border-radius: 8px;
  display: flex; align-items: center; justify-content: center; font-size: 18px;
}
.wk-entry-body { flex: 1; min-width: 0; }
.wk-entry-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.wk-entry-name { margin: 0; font-size: 14px; font-weight: 760; letter-spacing: 0; }
.wk-entry-time { font-size: 12px; color: var(--muted); white-space: nowrap; }
.wk-entry-meta { margin: 3px 0 0; font-size: 13px; font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums; }
.wk-entry-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.wk-icon-btn {
  width: 32px; height: 32px; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center; line-height: 1;
  border: none; background: transparent; color: var(--muted);
  font-family: var(--font); font-size: 14px; font-weight: 800; cursor: pointer;
  touch-action: manipulation; user-select: none;
}
.wk-icon-btn:disabled { pointer-events: none; opacity: 0.5; }
@media (prefers-reduced-motion: no-preference) {
  .wk-icon-btn:not(:disabled):active { opacity: 0.7; transform: scale(0.9); }
}
.wk-icon-btn.is-accent { color: var(--accent); }

/* Current-session draft panel — app-specific. The is-live treatment (accent
   wash + pulsing dot + ticking elapsed time) makes the in-progress workout
   read as the one live thing on the screen. */
.wk-current-session {
  margin-bottom: 14px; overflow: hidden;
  border: 1px solid var(--border); border-radius: 10px; background: var(--surface);
}
.wk-current-session.is-live {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 9%, var(--surface)), var(--surface) 60%);
  box-shadow: 0 6px 20px color-mix(in srgb, var(--accent) 12%, transparent);
}
.wk-current-session-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px; border-bottom: 1px solid var(--border);
}
.wk-current-session-title {
  margin: 0; display: flex; align-items: center;
  font-size: 14px; line-height: 1.25; font-weight: 800; letter-spacing: 0; user-select: none;
}
.wk-live-dot {
  width: 8px; height: 8px; flex-shrink: 0; border-radius: 999px;
  margin-right: 7px; background: var(--accent);
}
@keyframes wk-live-pulse {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 50%, transparent); }
  60% { box-shadow: 0 0 0 6px transparent; }
}
@media (prefers-reduced-motion: no-preference) {
  .wk-live-dot { animation: wk-live-pulse 2.2s ease-in-out infinite; }
}
.wk-current-session-sub { margin: 3px 0 0; color: var(--muted); font-size: 12px; user-select: none; }
.wk-current-session-list { padding: 8px 10px 2px; }
.wk-current-session-empty { padding: 16px 12px; color: var(--muted); font-size: 13px; }
.wk-current-session-missing { margin: 0; padding: 0 12px 12px; color: var(--muted); font-size: 12px; line-height: 1.45; }
.wk-finish-btn {
  min-height: 38px; padding: 10px 12px; border-radius: 8px;
  border: none; background: var(--accent); color: #fff;
  font-family: var(--font); font-size: 13px; font-weight: 800;
  white-space: nowrap; cursor: pointer;
  touch-action: manipulation; user-select: none;
}
.wk-finish-btn:disabled { opacity: 0.52; cursor: not-allowed; pointer-events: none; }
@media (prefers-reduced-motion: no-preference) {
  .wk-finish-btn:not(:disabled):active { opacity: 0.82; transform: scale(0.97); }
}

/* Date-group label rows in the log / all tabs — app-specific. */
.wk-session-label {
  display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
  margin: 20px 0 9px; font-size: 12px; color: var(--muted); font-weight: 700;
  user-select: none;
}
.wk-session-date { color: var(--text); font-size: 13px; font-weight: 800; letter-spacing: 0; user-select: none; }

/* mobius-ui:Input v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-input {
  display: block; width: 100%; box-sizing: border-box; min-height: 44px; padding: 12px;
  background: var(--surface2, var(--surface)); color: var(--text);
  border: 1px solid var(--border); border-radius: 10px;
  font-family: var(--font); font-size: 16px;
}
.wk-input:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent);
}
.wk-input.is-auto { width: auto; }
.wk-label { display: block; margin-bottom: 4px; font-size: 12px; font-weight: 600; color: var(--muted); }
/* /mobius-ui:Input */

.wk-set-row {
  display: grid; grid-template-columns: 24px 1fr 1fr auto;
  align-items: center; gap: 8px; padding: 6px 0;
}
.wk-set-index { font-size: 13px; font-weight: 600; color: var(--muted); }

/* Category chips for the confirm card — app-specific (per-category accent inline). */
.wk-chip-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.wk-chip {
  display: flex; align-items: center; gap: 6px;
  min-height: 44px; padding: 8px 12px; border-radius: 999px;
  border: 1px solid var(--border); background: transparent; color: var(--muted);
  font-family: var(--font); font-size: 13px; font-weight: 600; cursor: pointer;
  touch-action: manipulation; user-select: none;
}
@media (prefers-reduced-motion: no-preference) {
  .wk-chip:active { opacity: 0.8; transform: scale(0.96); }
}

/* Chart / insight cards — app-specific. */
.wk-chart-card {
  background: color-mix(in srgb, var(--surface) 94%, #000); border: 1px solid var(--border);
  border-radius: 8px; padding: 14px; margin-bottom: 14px;
}
.wk-chart-card.is-nested { margin-top: 14px; }
.wk-chart-card.is-last { margin-top: 14px; margin-bottom: 0; }
.wk-chart-title { margin: 0 0 2px; font-size: 14px; font-weight: 700; user-select: none; }
.wk-chart-sub { margin: 0 0 10px; font-size: 12px; color: var(--muted); user-select: none; }
.wk-streak-value { font-size: 34px; font-weight: 800; color: var(--accent); }
.wk-streak-unit { font-size: 15px; font-weight: 600; color: var(--muted); }

.wk-pr-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 4px; }
.wk-pr-th {
  padding: 8px 6px; text-align: left; font-weight: 600; color: var(--muted);
  border-bottom: 1px solid var(--border);
  font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;
  user-select: none;
}
.wk-pr-th.is-right { text-align: right; }
.wk-pr-td { padding: 10px 6px; border-bottom: 1px solid var(--border); }
.wk-pr-td.is-right { text-align: right; font-variant-numeric: tabular-nums; }
.wk-pr-td.is-strong { font-weight: 700; }

.wk-heatmap { display: block; width: 100%; height: auto; margin-top: 8px; }
.wk-sparkline { display: block; width: 100%; height: auto; }

/* mobius-ui:Empty v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-empty {
  padding: 48px 16px; text-align: center; color: var(--muted);
  font-size: 13px; line-height: 1.6;
}
.wk-empty.is-inline { padding: 18px 8px; }
.wk-empty-icon {
  width: 58px; height: 58px; margin: 0 auto 14px; border-radius: 18px;
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 34%, var(--border));
}
/* /mobius-ui:Empty */

.wk-loading { padding: 40px 16px; text-align: center; color: var(--muted); font-size: 13px; }

/* mobius-ui:Sheet v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-modal-scrim {
  position: absolute; inset: 0; z-index: 100;
  display: flex; align-items: center; justify-content: center;
  padding: 20px; background: rgba(0, 0, 0, 0.5);
}
.wk-modal {
  width: 100%; max-width: 320px; padding: 20px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  overscroll-behavior: contain;
}
.wk-modal-title { margin: 0 0 6px; font-size: 16px; font-weight: 700; user-select: none; }
.wk-modal-body { margin: 0 0 16px; font-size: 13px; line-height: 1.5; color: var(--muted); }
.wk-modal-btns { display: flex; gap: 8px; justify-content: flex-end; }
/* /mobius-ui:Sheet */

/* mobius-ui:SyncPill v1 — keep in sync; library candidate. */
.wk-pill {
  padding: 4px 10px; border-radius: 999px;
  font-size: 12px; font-weight: 600; letter-spacing: 0.2px; white-space: nowrap;
  background: transparent; border: 1px solid var(--border); color: var(--muted);
  user-select: none;
}
.wk-pill.is-pending { background: var(--surface2, var(--surface)); }
.wk-pill.is-offline {
  background: var(--surface2, var(--surface));
  border-color: var(--accent); color: var(--accent);
}
/* /mobius-ui:SyncPill */

/* Category-volume bars — app-specific (per-category accent inline). */
.wk-bar-list { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.wk-bar-row { display: grid; grid-template-columns: 88px 1fr 48px; gap: 10px; align-items: center; }
.wk-bar-label { font-size: 12px; color: var(--muted); font-weight: 700; overflow: hidden; text-overflow: ellipsis; }
.wk-bar-label.is-right { text-align: right; font-variant-numeric: tabular-nums; }
.wk-bar-track {
  height: 10px; border-radius: 999px; overflow: hidden;
  background: color-mix(in srgb, var(--border) 72%, transparent);
}
.wk-bar-fill { height: 100%; border-radius: 999px; }

/* Category stat tiles — app-specific. */
.wk-stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(138px, 1fr)); gap: 10px; }
.wk-stat-tile {
  padding: 12px; border: 1px solid var(--border); border-radius: 8px;
  background: color-mix(in srgb, var(--bg) 55%, transparent);
}
.wk-stat-head { display: flex; align-items: center; gap: 8px; }
.wk-stat-value { margin: 7px 0 2px; font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; }
.wk-stat-label { font-size: 12px; color: var(--muted); font-weight: 700; user-select: none; }

/* A tappable exercise name (opens the per-exercise detail sheet). Renders as
   plain text but is a real <button> for keyboard + screen-reader access. */
.wk-ex-link {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 0; margin: 0; border: none; background: none;
  font: inherit; color: var(--text); font-weight: 700; cursor: pointer; text-align: left;
  touch-action: manipulation; user-select: none;
}
@media (prefers-reduced-motion: no-preference) {
  .wk-ex-link:active { opacity: 0.75; }
}
.wk-ex-chevron { margin-left: 2px; color: var(--muted); font-weight: 700; }

/* Per-exercise detail sheet (Hevy-style drill-down) — Sheet variant: centered,
   all-corner radius, full-height column with its own scroll body. */
/* mobius-ui:Sheet v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-sheet-scrim {
  position: absolute; inset: 0; z-index: 120;
  display: flex; align-items: center; justify-content: center;
  padding: 16px; background: rgba(0, 0, 0, 0.55);
}
.wk-sheet {
  width: 100%; max-width: 480px; max-height: 88%;
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.4);
}
.wk-sheet-head {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 14px 14px 12px; border-bottom: 1px solid var(--border);
}
.wk-sheet-title { margin: 0; font-size: 16px; font-weight: 800; letter-spacing: 0; user-select: none; }
.wk-sheet-sub { margin: 2px 0 0; font-size: 12px; color: var(--muted); user-select: none; }
.wk-sheet-body { padding: 14px; overflow-y: auto; overscroll-behavior: contain; }
/* /mobius-ui:Sheet */

.wk-sheet-head-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }

.wk-rec-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 8px; }
.wk-rec-tile {
  padding: 10px; border: 1px solid var(--border); border-radius: 8px;
  background: color-mix(in srgb, var(--bg) 55%, transparent);
}
.wk-rec-label { font-size: 12px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; user-select: none; }
.wk-rec-value { margin: 3px 0 0; font-size: 17px; font-weight: 800; font-variant-numeric: tabular-nums; }

.wk-trend-meta {
  display: flex; justify-content: space-between; gap: 10px; margin-top: 4px;
  font-size: 12px; color: var(--muted); font-weight: 600; font-variant-numeric: tabular-nums;
  user-select: none;
}
.wk-hist-list { display: flex; flex-direction: column; }
.wk-hist-row {
  display: flex; justify-content: space-between; gap: 10px;
  padding: 9px 0; border-bottom: 1px solid var(--border); font-size: 13px;
}
.wk-hist-row.is-last { border-bottom: none; }
.wk-hist-date { color: var(--muted); font-weight: 600; white-space: nowrap; }
.wk-hist-summary { text-align: right; font-variant-numeric: tabular-nums; }

/* Confirm-card layout helpers — app-specific spacers + grids. */
.wk-spacer-10 { height: 10px; }
.wk-spacer-12 { height: 12px; }
.wk-spacer-14 { height: 14px; }
.wk-spacer-16 { height: 16px; }
.wk-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.wk-grid-metric { display: grid; grid-template-columns: 1fr 80px; gap: 8px; align-items: end; }
.wk-btn-row-finish { justify-content: space-between; align-items: center; margin-top: 4px; }
.wk-min44 { min-width: 44px; }

/* Quick-add strip — recent exercise chips on the Log tab so a repeat set is one tap. */
.wk-quick-add {
  margin-bottom: 14px;
  padding: 12px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
}
.wk-quick-add-label {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  margin-bottom: 8px; font-size: 12px; font-weight: 700; color: var(--muted);
  user-select: none;
}
.wk-quick-chip {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 38px; padding: 6px 12px; border-radius: 999px;
  border: 1px solid var(--border); background: color-mix(in srgb, var(--bg) 65%, transparent);
  color: var(--text); font-family: var(--font); font-size: 13px; font-weight: 600;
  cursor: pointer; touch-action: manipulation; user-select: none;
  white-space: nowrap;
}
@media (prefers-reduced-motion: no-preference) {
  .wk-quick-chip:active { opacity: 0.75; transform: scale(0.96); }
}
.wk-quick-chip-row {
  display: flex; gap: 6px; flex-wrap: wrap;
}
.wk-quick-add-btn {
  min-height: 38px; padding: 6px 14px; border-radius: 999px;
  border: 1px dashed var(--border); background: transparent;
  color: var(--accent); font-family: var(--font); font-size: 13px; font-weight: 700;
  cursor: pointer; touch-action: manipulation; user-select: none;
  white-space: nowrap;
}
@media (prefers-reduced-motion: no-preference) {
  .wk-quick-add-btn:active { opacity: 0.75; }
}

/* mobius-ui:ReducedMotion v1 -- honor the OS reduce-motion setting */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
/* /mobius-ui:ReducedMotion */
`


// ---------------------------------------------------------------------------
// Sync status — observes the offline runtime and exposes a {state, pending,
// online} snapshot the UI paints as a pill.
// ---------------------------------------------------------------------------

function useSyncStatus(store) {
  const [pending, setPending] = useState(0)
  const [online, setOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true)

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
    }
  }, [refresh])

  // bump: called after a store.set to refresh pending count. Flash chrome
  // removed (standard: nothing shown when online+idle).
  const bump = useCallback(() => { refresh() }, [refresh])

  return { pending, online, bump, refresh }
}

// Standard: show nothing when online+idle. Only surface Offline state.
function SyncPill({ status }) {
  const { pending, online } = status
  if (online && pending === 0) return null
  const label = !online
    ? (pending > 0 ? `Offline · ${pending} pending` : 'Offline')
    : null
  if (!label) return null
  return (
    <span className="wk-pill is-offline" role="status" aria-live="polite"
      title="Changes save locally and sync when you're back online."
      aria-label={`Offline${pending > 0 ? `, ${pending} pending` : ''}`}>
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// In-app confirm modal.
// ---------------------------------------------------------------------------

function ConfirmModal({ title, body, confirmLabel, onConfirm, onCancel }) {
  return (
    <div className="wk-modal-scrim" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="wk-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="wk-modal-title">{title}</h3>
        <p className="wk-modal-body">{body}</p>
        <div className="wk-modal-btns">
          <button className="wk-btn-secondary" onClick={onCancel} aria-label="Cancel">Cancel</button>
          <button
            className="wk-btn-secondary is-danger"
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
      <button className="wk-btn-primary" onClick={handleCommit} aria-label="Save entry">
        {commitLabel || (total > 1 && position < total ? 'Save and review next' : 'Save to log')}
      </button>
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

function AgentChatPanel({ appId, token, store, onEntriesMaybeChanged, height, quickActions }) {
  const mountRef = useRef(null)
  const [error, setError] = useState(null)
  const onEntriesRef = useRef(onEntriesMaybeChanged)
  useEffect(() => { onEntriesRef.current = onEntriesMaybeChanged }, [onEntriesMaybeChanged])
  const quickActionsRef = useRef(quickActions)
  useEffect(() => { quickActionsRef.current = quickActions }, [quickActions])
  const systemPrompt = useMemo(() => workoutAgentPrompt(appId), [appId])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || !window.mobius || typeof window.mobius.chat !== 'function') {
      setError('Embedded chat is not available in this shell.')
      return undefined
    }
    let disposed = false
    let handle = null
    setError(null)

    window.mobius.chat({
      mount,
      persist: 'chat_id.json',
      title: 'Workout',
      systemPrompt,
      picker: true,
      quickActions: quickActionsRef.current,
      onTurnDone: () => { onEntriesRef.current?.() },
      onError: ({ error: chatError }) => {
        setError(typeof chatError === 'string' ? chatError : 'Embedded chat reported an error.')
      },
    }).then((nextHandle) => {
      if (disposed) {
        nextHandle.destroy()
        return
      }
      handle = nextHandle
    }).catch((e) => {
      if (!disposed) setError(e.message || 'Could not mount embedded chat.')
    })

    return () => {
      disposed = true
      if (handle) handle.destroy()
    }
  }, [systemPrompt])

  return (
    <section className="workout-chat-panel wk-chat-panel" style={{ flex: `0 0 ${height}%` }}>
      {error && <div className="wk-chat-error">{error}</div>}
      <div className="wk-chat-embed" ref={mountRef} />
    </section>
  )
}

// ---------------------------------------------------------------------------
// QuickAddStrip — shows the 5 most recently used exercises as tap chips.
// Tapping a chip opens a ConfirmCard pre-filled with the last logged values
// (weight/reps/unit for strength, duration/distance for cardio). A "+ New"
// button lets the user open a blank ConfirmCard for any exercise.
// This turns "same as last time" from type-in-chat into a single tap.
// ---------------------------------------------------------------------------

function QuickAddStrip({ entries, onQuickAdd }) {
  const recents = useMemo(() => recentExercises(entries, 5), [entries])
  if (!entries || entries.length === 0) {
    return (
      <div className="wk-quick-add">
        <div className="wk-quick-add-label">Quick add</div>
        <div className="wk-quick-chip-row">
          <button className="wk-quick-add-btn" onClick={() => onQuickAdd(null, null)}
            aria-label="Add new exercise">+ New exercise</button>
        </div>
      </div>
    )
  }
  return (
    <div className="wk-quick-add">
      <div className="wk-quick-add-label">
        <span>Quick add</span>
        <button className="wk-quick-add-btn" style={{ marginLeft: 0 }}
          onClick={() => onQuickAdd(null, null)} aria-label="Add new exercise">+ New</button>
      </div>
      <div className="wk-quick-chip-row">
        {recents.map((ex) => (
          <button
            key={ex.key}
            className="wk-quick-chip"
            onClick={() => onQuickAdd(ex, entries)}
            aria-label={`Quick-add ${ex.activity}`}
          >
            <SportIcon name={ex.icon} color={ex.color} size={15} />
            {ex.activity}
          </button>
        ))}
      </div>
    </div>
  )
}

function EntryCard({ entry, onDelete, onEdit }) {
  const cat = CATEGORIES[entry.category] || CATEGORIES.other
  const icon = entry.icon || cat.icon
  const color = sportIconColor(icon, entry.category)
  const time = new Date(entry.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return (
    <div className="wk-entry-card">
      <div className="wk-entry-icon" style={{ background: `${color}22`, border: `1px solid ${color}55` }} aria-hidden>
        <SportIcon name={icon} color={color} size={18} />
      </div>
      <div className="wk-entry-body">
        <div className="wk-entry-top">
          <h4 className="wk-entry-name">{entry.activity}</h4>
          <span className="wk-entry-time">{time}</span>
        </div>
        <p className="wk-entry-meta">{summarizeMetrics(entry) || cat.label}</p>
      </div>
      <div className="wk-entry-actions">
        <button
          className="wk-icon-btn is-accent"
          onClick={() => onEdit(entry)}
          aria-label={`Edit ${entry.activity}`}
          title="Edit"
        >✎</button>
        <button
          className="wk-icon-btn"
          onClick={() => onDelete(entry.id)}
          aria-label={`Delete ${entry.activity}`}
          title="Delete"
        >×</button>
      </div>
    </div>
  )
}

function SessionDraftCard({ entry }) {
  const cat = CATEGORIES[entry.category] || CATEGORIES.other
  const icon = entry.icon || cat.icon
  const color = sportIconColor(icon, entry.category)
  return (
    <div className="wk-entry-card is-draft">
      <div className="wk-entry-icon" style={{ background: `${color}22`, border: `1px solid ${color}55` }} aria-hidden>
        <SportIcon name={icon} color={color} size={18} />
      </div>
      <div className="wk-entry-body">
        <div className="wk-entry-top">
          <h4 className="wk-entry-name">{entry.activity}</h4>
          <span className="wk-entry-time">{cat.label}</span>
        </div>
        <p className="wk-entry-meta">{summarizeMetrics(entry) || cat.label}</p>
      </div>
    </div>
  )
}

function CurrentSessionPanel({ session, onFinish, finishing = false }) {
  const normalized = useMemo(() => normalizeCurrentSession(session), [session])
  const entries = normalized?.entries || []
  const ready = currentSessionReady(normalized) && !finishing
  const missing = entries.map(sessionEntryMissing).filter(Boolean)
  // Ticking clock makes the card read as live: elapsed time since startedAt,
  // refreshed every 30s (cheap; unmounts with the panel when no session).
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])
  const elapsed = normalized?.startedAt && now > normalized.startedAt
    ? fmtDuration((now - normalized.startedAt) / 1000)
    : null
  return (
    <section className="wk-current-session is-live" aria-label="Current session">
      <div className="wk-current-session-head">
        <div style={{ minWidth: 0 }}>
          <h3 className="wk-current-session-title">
            <span className="wk-live-dot" aria-hidden />Live session
          </h3>
          <p className="wk-current-session-sub">
            {entries.length > 0
              ? `${entries.length} ${entries.length === 1 ? 'activity' : 'activities'}${elapsed ? ` · ${elapsed}` : ''}`
              : 'No activities yet'}
          </p>
        </div>
        <button
          type="button"
          className="wk-finish-btn"
          disabled={!ready}
          onClick={onFinish}
          aria-label="Finish session"
          title={ready ? 'Finish session' : 'Finish session once required details are complete'}
        >
          Finish session
        </button>
      </div>
      {entries.length > 0 ? (
        <div className="wk-current-session-list">
          {entries.map((entry) => <SessionDraftCard key={entry.id} entry={entry} />)}
        </div>
      ) : (
        <div className="wk-current-session-empty">Add an activity with Quick add, or tell the chat what you did.</div>
      )}
      {missing.length > 0 && (
        <p className="wk-current-session-missing">Missing: {missing.join(', ')}.</p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Streak heatmap — hand-rolled SVG. 26×7 calendar (half a year — a full 53
// weeks renders ~7px cells on a phone, too small to read); days with any
// entry tint with the accent.
// ---------------------------------------------------------------------------

function Heatmap({ entries }) {
  const days = useMemo(() => activeDays(entries), [entries])
  const today = new Date()
  const dow = today.getDay()
  const lastSunday = new Date(today)
  lastSunday.setDate(today.getDate() - dow)

  const WEEKS = 26
  const weeks = []
  for (let w = WEEKS - 1; w >= 0; w--) {
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
  const W = WEEKS * (cell + gap), H = 7 * (cell + gap)
  // Count within the rendered window so the label matches what's drawn.
  const count = weeks.flat().filter((d) => d.has).length
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="wk-heatmap" preserveAspectRatio="xMidYMid meet"
      role="img" aria-label={`Activity heatmap: ${count} active day${count === 1 ? '' : 's'} in the last ${WEEKS} weeks`}>
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
function fmtWeight(weightKg, unit) {
  return `${fromKg(weightKg, unit)}${unit || 'kg'}`
}

// Pace number (seconds/km) → "5:00/km". Mirrors fmtPace but takes the already-
// computed pace from a record so we don't re-derive distance/duration.
function paceLabel(secPerKm) {
  if (secPerKm == null) return '—'
  const mins = Math.floor(secPerKm / 60)
  const secs = String(Math.round(secPerKm % 60)).padStart(2, '0')
  return `${mins}:${secs}/km`
}

function shortDate(ts) {
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ---------------------------------------------------------------------------
// Sparkline — a hand-rolled SVG line for one exercise's per-session trend.
// Like the Heatmap, it intentionally uses no chart runtime so the per-exercise
// drill-down works offline. A single point renders as one dot.
// ---------------------------------------------------------------------------

function Sparkline({ points, color, label }) {
  const vals = (points || []).map((p) => Number(p.value) || 0)
  if (vals.length === 0) return null
  const W = 320, H = 96, padX = 8, padTop = 12, padBottom = 14
  const n = vals.length
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = (max - min) || Math.max(1, max)
  const x = (i) => (n <= 1 ? W / 2 : padX + (i * (W - 2 * padX)) / (n - 1))
  const y = (v) => H - padBottom - ((v - min) / span) * (H - padTop - padBottom)
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(vals[i]).toFixed(1)}`).join(' ')
  const area = n > 1 ? `${line} L${x(n - 1).toFixed(1)},${H - padBottom} L${x(0).toFixed(1)},${H - padBottom} Z` : ''
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="wk-sparkline"
      role="img" aria-label={`${label || 'Trend'} across ${n} session${n === 1 ? '' : 's'}`}>
      {area && <path d={area} fill={color} opacity={0.13} />}
      {n > 1 && <path d={line} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />}
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(vals[i])} r={n > 30 ? 1.6 : 2.6} fill={color}>
          <title>{shortDate(p.ts)}</title>
        </circle>
      ))}
    </svg>
  )
}

// Pick which series to plot for an exercise: strength → e1RM, cardio → distance
// (or duration if it never logs distance), everything else → duration.
function detailTrend(detail) {
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
function detailRecordTiles(detail) {
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
function detailHistorySummary(point, family) {
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

// ---------------------------------------------------------------------------
// ExerciseDetailSheet — the Hevy-style per-exercise drill-down: records,
// a trend sparkline, set-records (strength), and full session history.
// ---------------------------------------------------------------------------

function ExerciseDetailSheet({ detail, onClose }) {
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
      color: CATEGORIES[category]?.color || 'var(--muted)',
    }))
    .sort((a, b) => b.total - a.total)
  const max = Math.max(0, ...rows.map((r) => r.total))
  if (rows.length === 0 || max <= 0) {
    return <div className="wk-empty is-inline">No numeric volume this week yet.</div>
  }
  return (
    <div className="wk-bar-list">
      {rows.map((row) => (
        <div key={row.category} className="wk-bar-row">
          <span className="wk-bar-label">{row.label}</span>
          <div className="wk-bar-track">
            <div className="wk-bar-fill" style={{ width: `${Math.max(3, Math.min(100, (row.total / max) * 100))}%`, background: row.color }} />
          </div>
          <span className="wk-bar-label is-right">{row.total}</span>
        </div>
      ))}
    </div>
  )
}

function CategoryStats({ stats }) {
  if (stats.length === 0) {
    return <div className="wk-empty is-inline">No category data yet.</div>
  }
  return (
    <div className="wk-stat-grid">
      {stats.map((row) => {
        const fam = categoryFamily(row.category)
        // A duration-only cardio category (e.g. HIIT) would read "0 km";
        // fall back to minutes when no distance was ever logged.
        const volume = fam === 'strength'
          ? `${Math.round(row.strengthVolume)} kg-reps`
          : fam === 'cardio' && row.distanceKm > 0
            ? `${Math.round(row.distanceKm * 10) / 10} km`
            : `${Math.round(row.durationMin)} min`
        return (
          <div key={row.category} className="wk-stat-tile">
            <div className="wk-stat-head">
              <SportIcon name={CATEGORIES[row.category].icon} color={row.color} size={18} />
              <span className="wk-stat-label">{row.label}</span>
            </div>
            <div className="wk-stat-value">{volume}</div>
            <div className="wk-stat-label">{row.sessions} session{row.sessions === 1 ? '' : 's'} · {row.entries} entr{row.entries === 1 ? 'y' : 'ies'}</div>
          </div>
        )
      })}
    </div>
  )
}

// A tappable exercise name + icon that opens the per-exercise detail sheet.
function ExerciseLink({ icon, color, activity, onOpen }) {
  return (
    <button type="button" className="wk-ex-link" onClick={onOpen} aria-label={`${activity} details`}>
      <SportIcon name={icon} color={color} size={16} />
      {activity}
      <span className="wk-ex-chevron" aria-hidden>›</span>
    </button>
  )
}

function InsightsTab({ entries }) {
  const weeks = useMemo(() => weeklyVolumeByCategory(entries), [entries])
  const stats = useMemo(() => categoryStats(entries), [entries])
  const exercises = useMemo(() => exerciseList(entries), [entries])
  const prs = useMemo(() => strengthPRs(entries), [entries])
  const cardio = useMemo(() => cardioBests(entries), [entries])
  const streak = useMemo(() => currentStreak(entries), [entries])
  const [selected, setSelected] = useState(null) // { category, activity }
  const detail = useMemo(
    () => (selected ? exerciseDetail(entries, selected.category, selected.activity) : null),
    [entries, selected],
  )
  const openEx = (category, activity) => setSelected({ category, activity })

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

      {detail && <ExerciseDetailSheet detail={detail} onClose={() => setSelected(null)} />}
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
      <div className="wk-empty">
        <div className="wk-empty-icon">
          <SportIcon name="history" color="var(--accent)" size={30} />
        </div>
        No entries yet. Finish a session and it lands here.
      </div>
    )
  }
  const todayIso = localDate()
  return (
    <div>
      <p className="wk-card-sub">{entries.length} total {entries.length === 1 ? 'entry' : 'entries'}.</p>
      {groups.map((group) => {
        const dateLabel = group.date === todayIso
          ? 'Today'
          : new Date(`${group.date}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
        return (
          <div key={group.date}>
            <div className="wk-session-label">
              <span className="wk-session-date">{dateLabel}</span>
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
  const [tab, setTab] = useState('session')
  const [entries, setEntries] = useState(null)
  const [currentSession, setCurrentSession] = useState(null)
  const [bootStatus, setBootStatus] = useState('loading')
  const syncStatus = useSyncStatus(store)
  const saveQueueRef = useRef({ inFlight: false, pending: null })
  // Re-entrancy guard for Finish session: the handler is async (awaits the
  // current_session.json clear), so a fast double-tap would otherwise run
  // entriesFromCurrentSession twice on the same draft — each call mints fresh
  // uids, so both id-distinct copies survive the id-keyed merge and the
  // session commits twice. The ref flips synchronously, blocking the second
  // tap before React re-renders the disabled button.
  const finishInFlightRef = useRef(false)
  const [finishing, setFinishing] = useState(false)
  // Brief "Session saved" confirmation after Finish. Auto-clears in 3s.
  const [sessionSaved, setSessionSaved] = useState(false)
  const sessionSavedTimerRef = useRef(null)
  const bodyRef = useRef(null)
  const [chatHeight, setChatHeight] = useState(() => readChatHeight(appId))

  const quickActions = useMemo(() => [
    { label: 'Log a workout', prompt: 'Log a workout for me.' },
    { label: 'What did I train this week?', prompt: 'Summarize what I trained this week.' },
  ], [])

  const [editingEntry, setEditingEntry] = useState(null)
  // quickAddDraft: { category, activity, metrics } pre-filled from the last
  // logged instance of that exercise. null when not open. lastEntryForQuickAdd
  // is the matching stored entry (for the ConfirmCard defaulting logic).
  const [quickAddDraft, setQuickAddDraft] = useState(null)
  const [lastEntryForQuickAdd, setLastEntryForQuickAdd] = useState(null)
  const [deletePending, setDeletePending] = useState(null) // entry id awaiting confirm
  const navHandleRef = useRef(null)

  const bumpSync = syncStatus.bump

  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    try { localStorage.setItem(chatHeightKey(appId), String(chatHeight)) } catch {}
  }, [appId, chatHeight])

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
    // A transient empty read (offline cache miss, a network blip, a half-written
    // file) is indistinguishable from a genuinely-empty store. On the post-chat
    // REFRESH path (no setReady) we already have a loaded list, so keep it rather
    // than blanking the whole log on a momentary empty read. Only the initial
    // boot (setReady) renders the real empty state.
    if (!options.setReady) {
      setEntries((prev) => (Array.isArray(prev) && prev.length > 0 ? prev : []))
      return []
    }
    setEntries([])
    setBootStatus('ready')
    return []
  }, [bumpSync, store])

  const loadCurrentSession = useCallback(async () => {
    const loaded = await store.get('current_session.json')
    const normalized = normalizeCurrentSession(loaded)
    setCurrentSession(normalized)
    if (loaded && JSON.stringify(loaded) !== JSON.stringify(normalized)) {
      store.set('current_session.json', normalized).then((r) => bumpSync(r))
    }
    return normalized
  }, [bumpSync, store])

  // Initial load. entries.json is the append-only log. If it's missing but a
  // legacy state.json exists, migrate its logged history to strength entries.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      loadEntries({ allowMigration: true, setReady: true }),
      loadCurrentSession(),
    ]).then(([loaded]) => {
      if (cancelled) return
      // Emit app_ready once data has loaded. item_count = session count so
      // Dreaming can gauge how active this log is without counting raw entries.
      const sessionCount = groupSessions(loaded || []).length
      window.mobius?.signal?.('app_ready', { item_count: sessionCount })
    })
    return () => { cancelled = true }
  }, [loadCurrentSession, loadEntries])

  // The embedded agent writes current_session.json mid-session from a
  // chat turn; without a subscription the card keeps its stale mount-time
  // read and the owner sees a blank panel after the agent logs a set.
  // Re-load on every external write so agent-written drafts surface live.
  useEffect(() => {
    const unsub = store.subscribe('current_session.json', () => { loadCurrentSession() })
    return () => { if (typeof unsub === 'function') unsub() }
  }, [store, loadCurrentSession])
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
        window.mobius?.signal?.('error', {
          message: err?.message || 'entries save failed',
          source: 'save',
        })
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

  const closeNestedNav = useCallback(() => {
    try { navHandleRef.current?.close?.() } catch {}
    navHandleRef.current = null
  }, [])

  // Quick-add writes the current-session draft, never entries.json directly.
  // The first saved entry implicitly starts a session (the CurrentSessionPanel
  // appearing with the entry IS the save feedback); entries reach committed
  // history exactly once, when Finish session commits the draft.
  const commitQuickAdd = useCallback(async (draft, ts) => {
    const entry = normalizeEntry(draft, {
      ts,
      raw: '',
      source: 'manual',
      confirmed: true,
    })
    // Read-modify-write against the store, not just React state: the embedded
    // agent co-writes current_session.json and this client may not have
    // re-loaded its latest draft yet. Fall back to local state so a transient
    // empty read can't fork a second session while one is on screen.
    const loaded = await store.get('current_session.json')
    const next = appendEntryToCurrentSession(loaded || currentSession, entry, ts)
    setCurrentSession(next)
    closeNestedNav()
    setQuickAddDraft(null)
    setLastEntryForQuickAdd(null)
    setTab('session')
    const result = await store.set('current_session.json', next)
    bumpSync(result)
    window.mobius?.signal?.('item_created')
  }, [bumpSync, closeNestedNav, currentSession, store])

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
    setTab('history')
  }, [editingEntry, entries, persist])

  const deleteEntry = useCallback((id) => {
    persist((entries || []).filter((e) => e.id !== id), { deletedIds: [id] })
    window.mobius?.signal?.('item_deleted')
  }, [entries, persist])

  const finishCurrentSession = useCallback(async () => {
    if (finishInFlightRef.current) return
    const committed = entriesFromCurrentSession(currentSession)
    if (committed.length === 0) return
    finishInFlightRef.current = true
    setFinishing(true)
    try {
      const nextEntries = mergeEntriesForSave([...(entries || []), ...committed], entries)
      persist(nextEntries)
      setCurrentSession(null)
      const result = await store.set('current_session.json', null)
      bumpSync(result)
      // Reload entries after clearing the session — the agent may have
      // written directly to entries.json during the session, and our
      // optimistic merge above wouldn't include those. A fresh load also
      // settles any in-flight flushSaves race.
      loadEntries({ allowMigration: false })

      // Show a brief "Session saved" confirmation on the Session tab.
      clearTimeout(sessionSavedTimerRef.current)
      setSessionSaved(true)
      sessionSavedTimerRef.current = setTimeout(() => setSessionSaved(false), 3000)

      // session_logged: one signal per user "Finish session" gesture.
      const durationMin = currentSession
        ? Math.round((Date.now() - (currentSession.startedAt || Date.now())) / 60000)
        : undefined
      window.mobius?.signal?.('session_logged', {
        exercise_count: committed.length,
        ...(durationMin != null && durationMin > 0 ? { duration_min: durationMin } : {}),
      })

      // pr_hit: emit once per strength exercise that sets a new e1RM.
      const prevPRs = strengthPRs(entries || [])
      const prevMap = new Map(prevPRs.map((pr) => [pr.activity, pr.e1rm]))
      const nextPRs = strengthPRs(nextEntries)
      for (const pr of nextPRs) {
        const prev = prevMap.get(pr.activity)
        if (prev == null || pr.e1rm > prev) {
          window.mobius?.signal?.('pr_hit', { exercise: pr.activity })
        }
      }
    } finally {
      finishInFlightRef.current = false
      setFinishing(false)
    }
  }, [bumpSync, currentSession, entries, loadEntries, persist, store])

  const resizeChatBy = useCallback((deltaPct) => {
    setChatHeight((value) => Math.min(82, Math.max(44, value + deltaPct)))
  }, [])

  const beginChatResize = useCallback((event) => {
    event.preventDefault()
    const body = bodyRef.current
    const panel = body?.querySelector?.('.workout-chat-panel')
    if (!body || !panel) return
    const total = body.getBoundingClientRect().height
    if (!total) return
    const startY = event.clientY
    const startHeight = panel.getBoundingClientRect().height
    const minPx = Math.min(360, total * 0.44)
    const maxPx = Math.max(minPx, total - 110)

    const onMove = (moveEvent) => {
      const nextPx = Math.min(maxPx, Math.max(minPx, startHeight + startY - moveEvent.clientY))
      setChatHeight(Math.min(82, Math.max(44, (nextPx / total) * 100)))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      // A touch drag can end with pointercancel (the browser claims the gesture)
      // instead of pointerup. Without removing on cancel too, the pointermove
      // listener leaks and keeps resizing the panel on every later touch.
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [])

  const handleResizeKey = useCallback((event) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      resizeChatBy(4)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      resizeChatBy(-4)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setChatHeight(44)
    } else if (event.key === 'End') {
      event.preventDefault()
      setChatHeight(82)
    }
  }, [resizeChatBy])

  // Open the quick-add ConfirmCard. `ex` is a recentExercises row (has
  // category + activity) or null for a blank new entry. `allEntries` is the
  // current entries array, used to look up the last logged values.
  const openQuickAdd = useCallback(async (ex, allEntries) => {
    closeNestedNav()
    if (window.mobius?.nav?.open) {
      const handle = window.mobius.nav.open('workout-quick-add', () => {
        navHandleRef.current = null
        setQuickAddDraft(null)
        setLastEntryForQuickAdd(null)
      })
      navHandleRef.current = handle
      await handle.ready?.catch(() => false)
      if (navHandleRef.current !== handle) return
    }
    if (ex && allEntries) {
      const last = lastEntryForExercise(allEntries, ex.category, ex.activity)
      setLastEntryForQuickAdd(last)
      setQuickAddDraft({ category: ex.category, activity: ex.activity, metrics: {} })
    } else {
      setLastEntryForQuickAdd(null)
      setQuickAddDraft({ category: 'strength', activity: '', metrics: {} })
    }
  }, [closeNestedNav])

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
    if (editingEntry || deletePending || quickAddDraft) return
    closeNestedNav()
  }, [editingEntry, deletePending, quickAddDraft, closeNestedNav])

  useEffect(() => () => closeNestedNav(), [closeNestedNav])

  if (bootStatus === 'loading') {
    return <div className="wk-root"><style>{CSS}</style><div className="wk-loading">Loading…</div></div>
  }

  const subtitle = tab === 'session' ? (currentSession ? 'Session in progress.' : 'Ready to train.')
    : tab === 'insights' ? 'See the shape of it.'
    : 'Everything you\'ve logged.'

  return (
    <div className="wk-root">
      <style>{CSS}</style>
      <div className="wk-header">
        <div>
          <h1 className="wk-title">Workout</h1>
          <p className="wk-subtitle">{subtitle}</p>
        </div>
        <SyncPill status={syncStatus} />
      </div>

      {!editingEntry && !quickAddDraft && (
        <nav className="wk-tabbar" role="tablist" aria-label="Activity tabs">
          <button className={`wk-tab-btn${tab === 'session' ? ' is-active' : ''}`} onClick={() => setTab('session')}
            role="tab" aria-selected={tab === 'session'} aria-label="Session">
            <span className="wk-tab-icon" aria-hidden><SportIcon name="stopwatch" size={15} /></span>Session
          </button>
          <button className={`wk-tab-btn${tab === 'history' ? ' is-active' : ''}`} onClick={() => setTab('history')}
            role="tab" aria-selected={tab === 'history'} aria-label="History">
            <span className="wk-tab-icon" aria-hidden><SportIcon name="history" size={15} /></span>History
          </button>
          <button className={`wk-tab-btn${tab === 'insights' ? ' is-active' : ''}`} onClick={() => setTab('insights')}
            role="tab" aria-selected={tab === 'insights'} aria-label="Insights">
            <span className="wk-tab-icon" aria-hidden><SportIcon name="chart-bar" size={15} /></span>Insights
          </button>
        </nav>
      )}

      <div ref={bodyRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="wk-scroll">
          <div className="wk-inner">
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
            ) : quickAddDraft ? (
              <ConfirmCard
                draft={quickAddDraft}
                ambiguous={false}
                clarification=""
                initialTs={Date.now()}
                title="Log exercise"
                commitLabel="Save to log"
                lastEntry={lastEntryForQuickAdd}
                onCommit={commitQuickAdd}
                onCancel={() => {
                  closeNestedNav()
                  setQuickAddDraft(null)
                  setLastEntryForQuickAdd(null)
                }}
              />
            ) : (
              <>
                {tab === 'session' && (
                  <>
                    {sessionSaved && (
                      <div className="wk-card" role="status" style={{ marginBottom: 14, textAlign: 'center', color: 'var(--accent)' }}>
                        Session saved — find it in History.
                      </div>
                    )}
                    {currentSession && (
                      <CurrentSessionPanel
                        session={currentSession}
                        onFinish={finishCurrentSession}
                        finishing={finishing}
                      />
                    )}
                    {/* Quick-add stays visible during an active session — it
                        appends to the draft, so the next tap logs entry #2. */}
                    <QuickAddStrip entries={entries} onQuickAdd={openQuickAdd} />
                  </>
                )}
                {tab === 'history' && (
                  <AllTab
                    entries={entries}
                    onDelete={openDeleteConfirm}
                    onEdit={(entry) => openEditEntry(entry, 'history')}
                  />
                )}
                {tab === 'insights' && (
                  <InsightsTab entries={entries} />
                )}
              </>
            )}
          </div>
        </div>

        {!editingEntry && !quickAddDraft && tab === 'session' && (
          <>
            <div
              className="workout-chat-resizer wk-chat-resizer"
              role="separator"
              aria-label="Resize workout chat"
              aria-orientation="horizontal"
              aria-valuemin={44}
              aria-valuemax={82}
              aria-valuenow={Math.round(chatHeight)}
              tabIndex={0}
              onPointerDown={beginChatResize}
              onKeyDown={handleResizeKey}
            >
              <span className="wk-chat-resizer-bar" aria-hidden />
            </div>
            <AgentChatPanel
              appId={appId}
              token={token}
              store={store}
              height={chatHeight}
              quickActions={quickActions}
              onEntriesMaybeChanged={() => {
                loadEntries({ allowMigration: false })
                loadCurrentSession()
              }}
            />
          </>
        )}
      </div>

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
