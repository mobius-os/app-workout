// ---------------------------------------------------------------------------
// Pure logic — no React, no DOM, no window. Everything here is a function of
// its inputs so it can be unit-tested under `node --test` without a browser.
// SOURCE OF TRUTH for index.jsx's inlined logic block: run `node build-entry.mjs`
// after editing this file. (This file was reverse-synced from index.jsx during
// the integrity-fix pass; the two are byte-identical modulo the export keyword.)
// ---------------------------------------------------------------------------

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
export const CATEGORIES = {
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

export const CATEGORY_KEYS = Object.keys(CATEGORIES)

// Which metric family a category logs. Strength logs sets; the cardio family
// logs duration/distance; everything else logs duration/location/note. The
// LLM is told this split so it returns the right metrics shape, but we re-derive
// it here at normalize time rather than trusting the model's `family`.
export function categoryFamily(category) {
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

export const SPORT_ICON_RULES = [
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
export const SPORT_ICON_COLORS = {
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

export function sportIconKey(activity, category) {
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

export function sportIconColor(icon, category) {
  return SPORT_ICON_COLORS[icon] || CATEGORIES[category]?.color || CATEGORIES.other.color
}

// Default gap (ms) that splits one session from the next. Two entries within
// 4h of each other belong to the same session; a longer gap starts a new one.
export const SESSION_GAP_MS = 4 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Unit conversion — we STORE SI (kg, metres, seconds) so analytics never has
// to branch on unit. The composer/LLM may report lb/mi/km/etc; we convert on
// the way in and format back out for display.
// ---------------------------------------------------------------------------

export const LB_PER_KG = 2.2046226218

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

export function textOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function numberOrNull(value) {
  if (value === '' || value == null) return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function finiteMetricNumber(value) {
  if (value === '' || value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function stableStringify(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

export function stableHash(value) {
  const text = stableStringify(value)
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function deterministicStoredEntryId(entry, prefix = 'entry') {
  return `${prefix}-${stableHash({
    ts: Number.isFinite(Number(entry?.ts)) ? Number(entry.ts) : null,
    sessionId: textOrNull(entry?.sessionId),
    category: CATEGORY_KEYS.includes(entry?.category) ? entry.category : 'other',
    activity: textOrNull(entry?.activity),
    metrics: entry?.metrics && typeof entry.metrics === 'object' ? entry.metrics : {},
    raw: typeof entry?.raw === 'string' ? entry.raw : '',
    source: textOrNull(entry?.source) || 'ai',
  })}`
}

export function normalizeStoredEntry(entry, opts = {}) {
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
    id: textOrNull(entry.id) || opts.fallbackId || deterministicStoredEntryId(entry),
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

export function normalizeStoredEntries(entries, opts = {}) {
  if (!Array.isArray(entries)) return []
  return entries
    .map((entry, index) => normalizeStoredEntry(entry, {
      fallbackId: typeof opts.fallbackId === 'function' ? opts.fallbackId(entry, index) : undefined,
    }))
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

export function mergeEntriesWriteIntents(a = {}, b = {}) {
  a = a || {}
  b = b || {}
  return {
    upsertEntries: [
      ...(a.upsertEntries || []),
      ...(b.upsertEntries || []),
    ],
    deletedIds: [...new Set([
      ...(a.deletedIds || []),
      ...(b.deletedIds || []),
    ].filter(Boolean))],
    waiters: [
      ...(a.waiters || []),
      ...(b.waiters || []),
      ...(a.waiter ? [a.waiter] : []),
      ...(b.waiter ? [b.waiter] : []),
    ],
  }
}

export function applyEntriesWriteMutation(remoteEntries, mutation = {}) {
  return mergeEntriesForSave(
    mutation.upsertEntries || [],
    remoteEntries,
    mutation.deletedIds || [],
  )
}

// ---------------------------------------------------------------------------
// In-progress session draft. The embedded agent and quick-add both write
// current_session.json; the UI commits it to entries.json only when the
// user presses Finish session.
// ---------------------------------------------------------------------------

// True when a raw current_session.json read carries any entry with no id of
// its own. Position is NOT a stable identity (the embedded agent rewrites the
// file with different id-less entries at the same indices, so a positional id
// would alias two distinct entries to one and mergeCurrentSessions would drop
// one). Operates on the RAW shape so finish() can tell whether it must persist
// a reconciled id-stamp before committing entries.json.
export function currentSessionNeedsIdAssignment(rawSession) {
  if (!rawSession || typeof rawSession !== 'object') return false
  const entries = Array.isArray(rawSession.entries) ? rawSession.entries : []
  return entries.some((entry) => !textOrNull(entry?.id))
}

export function normalizeCurrentSession(session, now = Date.now()) {
  if (!session || typeof session !== 'object') return null
  const startedAtRaw = Number(session.startedAt ?? session.startTs ?? now)
  const startedAt = Number.isFinite(startedAtRaw) ? startedAtRaw : now
  const id = textOrNull(session.id) || `session-${startedAt}`
  const entries = normalizeStoredEntries(
    (Array.isArray(session.entries) ? session.entries : [])
      .map((entry, index) => ({
        ...entry,
        // Mint a FRESH random uid() for a draft entry that arrives without one
        // (a co-writing agent or a malformed write may omit it, violating the
        // prompt contract). A position-derived id (`${id}-e${index}`) was the
        // old choice and it ALIASED distinct entries: when the agent rewrites
        // the file with different id-less entries at the same indices, two
        // distinct entries collapse to one id and mergeCurrentSessions drops
        // one. A content hash is also wrong — two legitimately-identical sets
        // (3×5 squat logged twice) are DISTINCT entries that must not collapse.
        // So each id-less entry gets its own random identity here. Load-time
        // readers reconcile ids in memory, and finish() persists reconciled ids
        // before committing, so two distinct id-less entries can never alias.
        id: textOrNull(entry?.id) || uid(),
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
    // Preserve the draft entry's stable id. Committing a draft must be
    // idempotent: if Finish is retried after entries.json was written durably
    // but the draft-clear failed, the re-commit has to produce the SAME id so
    // mergeEntriesForSave (keyed on id) dedups it instead of double-writing the
    // workout to permanent history. Mint a fresh id only for a legacy draft that
    // never carried one.
    id: entry.id || uid(),
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
export function appendEntryToCurrentSession(session, entry, now = Date.now()) {
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

// Reconcile two views of the same current-session draft by entry id (union),
// so a poll read never clobbers a co-writer's entry. The draft has two
// concurrent writers — the embedded agent (cross-context) and this client's
// quick-add — and the whole file is written last-write-wins with no CAS. The
// 5s visible-tab poll reads the store and the quick-add does a read-modify-
// write; either can race the other:
//
//   poll reads remote [A,B]  →  agent writes C → store is [A,B,C]
//   quick-add appends D to its stale local [A,B] → set [A,B,D]   // drops C
//   (or, symmetrically, a poll's blind replace overwrites an un-flushed D)
//
// Blind `setCurrentSession(remote)` and "transform the fresh read" both lose
// the entry that exists on only one side. Merging on the STABLE per-entry id
// (the agent prompt mandates it; quick-add's normalizeEntry mints a uid; both
// survive normalizeCurrentSession) keeps every entry from both sides.
//
// Identity is the id, not a content signature: two legitimately-identical sets
// (3×5 squat logged twice) are distinct entries and must not collapse. On an
// id collision the `prefer` side wins ('local' so the user's just-edited copy
// isn't reverted by a slightly older remote read; 'remote' when settling a
// post-write read). Order: local entries first (preserving the on-screen
// order), then remote-only entries appended; normalizeCurrentSession re-stamps
// the positional ts/sessionId so the result stays byte-compatible. Entries
// without an id (legacy/malformed) are kept positionally and never merged
// away. Never mutates either input. A null/empty side yields the other.
export function mergeCurrentSessions(localSession, remoteSession, { prefer = 'local', now = Date.now() } = {}) {
  const local = normalizeCurrentSession(localSession, now)
  const remote = normalizeCurrentSession(remoteSession, now)
  if (!local) return remote
  if (!remote) return local

  // Earliest startedAt wins so both writers converge on one session identity
  // even if their clocks differed by a tick. Re-derive the id from it so the
  // result keeps the `id = session-<startedAt>` contract both writers and
  // appendEntryToCurrentSession follow (lowering startedAt without this would
  // leave the stale higher-startedAt id behind).
  const startedAt = Math.min(local.startedAt, remote.startedAt)
  const id = `session-${startedAt}`

  const localById = new Map()
  for (const entry of local.entries) {
    if (entry.id) localById.set(entry.id, entry)
  }
  const remoteById = new Map()
  for (const entry of remote.entries) {
    if (entry.id) remoteById.set(entry.id, entry)
  }

  const merged = []
  const seen = new Set()
  // Local order first. For an id present on both sides, `prefer` decides which
  // copy's fields survive (the ids are identical, so order is unaffected).
  for (const entry of local.entries) {
    if (!entry.id) { merged.push(entry); continue }
    if (seen.has(entry.id)) continue
    seen.add(entry.id)
    const remoteMatch = remoteById.get(entry.id)
    merged.push(prefer === 'remote' && remoteMatch ? remoteMatch : entry)
  }
  // Then remote-only entries (e.g. the agent's just-written set) appended.
  for (const entry of remote.entries) {
    if (!entry.id) { merged.push(entry); continue }
    if (seen.has(entry.id)) continue
    seen.add(entry.id)
    merged.push(entry)
  }

  // Re-stamp the positional ts by merged-array index so the merged order (local
  // first, remote-only appended) survives normalizeCurrentSession's ts-sort.
  // The inputs are already-normalized sessions whose entries carry positional
  // ts relative to their OWN side, so without this the sort could interleave
  // the two sides by stale per-side ts.
  const ordered = merged.map((entry, index) => ({ ...entry, ts: startedAt + index * 1000 }))

  return normalizeCurrentSession({
    ...local,
    id,
    startedAt,
    entries: ordered,
  }, now)
}

// The content signature of one draft entry, IGNORING app-stamped fields (id,
// ts, sessionId, localDate, icon are all assigned by normalize, not authored).
// Used to reconcile id-less current_session.json reads against the in-memory
// draft by authored content. Two legitimately-identical sets share a signature;
// that's fine here because claim-once reconciliation gives repeated same-content
// entries distinct ids instead of deduping them.
export function draftEntryContentSig(entry) {
  return stableStringify({
    category: CATEGORY_KEYS.includes(entry?.category) ? entry.category : 'other',
    activity: textOrNull(entry?.activity),
    metrics: entry?.metrics && typeof entry.metrics === 'object' ? entry.metrics : {},
    raw: typeof entry?.raw === 'string' ? entry.raw : '',
    source: textOrNull(entry?.source) || 'ai',
  })
}

// True when two normalized sessions are the SAME draft modulo app-stamped ids:
// same entry count, and each position's content signature matches. Kept as a
// narrow equality predicate for same-draft checks; it is order-sensitive on
// purpose because a co-writer's reorder/insert/edit is a real divergence.
export function sameDraftIgnoringIds(a, b) {
  if (!a || !b) return false
  if (a.entries.length !== b.entries.length) return false
  return a.entries.every((entry, index) => (
    draftEntryContentSig(entry) === draftEntryContentSig(b.entries[index])
  ))
}

// Reconcile the ids of a RAW current_session.json read against the in-memory
// truth, returning a raw session whose id-less entries carry STABLE ids.
//
// THE ROOT-CAUSE FIX. The embedded agent may rewrite current_session.json with
// entries that have NO id (a prompt-contract violation we must absorb). The old
// design minted a FRESH RANDOM id per id-less entry on EVERY read inside
// normalizeCurrentSession. That made two reads of the SAME id-less disk state
// produce DIFFERENT ids — and mergeCurrentSessions (keyed on id) then UNIONED
// them, duplicating the entry into permanent history on Finish. The old window
// was reachable whenever a load-time persist-back of the stamped draft did not
// land before the next read: a falsely-{synced:true} dead-letter, a failed/
// throwing write, or simply concurrent mount-loads racing the first persist-back.
//
// The fix removes the per-read randomness at its source: id assignment for an
// id-less entry RECONCILES against the in-memory truth by CONTENT instead of
// re-minting. Each id-less raw entry is MATCHED to an in-memory entry with the
// SAME content signature (draftEntryContentSig — authored fields only) and
// REUSES that entry's already-stable id; a fresh uid is minted ONLY for an entry
// whose content has no unclaimed match in the in-memory truth. So a re-read of
// the same id-less content converges on the SAME id without a load-time disk
// stamp — the merge sees identical ids and keeps ONE entry.
//
// MATCHING IS BY CONTENT, NEVER BY POSITION. The codebase's standing invariant
// (see currentSessionNeedsIdAssignment / normalizeCurrentSession above and
// mergeCurrentSessions) is that "position is NOT a stable identity": the agent
// rewrites the file with different id-less entries at the same indices, so a
// positional match would ALIAS two distinct entries to one id and silently drop
// one — the very data-loss class this whole fix exists to prevent. We therefore
// match on content only. The trade-off is intentional: two legitimately-
// identical sets (3×5 squat logged twice) share a signature, so the SECOND
// id-less occurrence claims the SECOND in-memory id of that signature (claim-
// once below), and only an occurrence with NO remaining same-content in-memory
// id mints fresh. An in-place metric edit (content drifted) is therefore treated
// as a NEW entry here; the merge keeps both the old in-memory copy and the
// edited one rather than collapsing distinct content onto one slot — never
// losing the edit, and never aliasing two distinct entries.
//
// CLAIM-ONCE: each in-memory id is reused at most once. A second id-less entry
// of the same content can't re-claim an id already taken by the first, so two
// identical-content draft entries keep two distinct ids (one reused, one fresh).
//
// SIGNATURES ARE COMPUTED ON NORMALIZED CONTENT. The raw disk entry and the
// in-memory entry are NOT byte-identical even for the same workout: normalize
// canonicalizes metrics (e.g. a strength set gains `unit:"kg"`, weights convert
// to SI). Signing the RAW entry against the NORMALIZED in-memory entry would
// therefore never match, re-minting on every read and reviving the duplication.
// So both sides are normalized through normalizeCurrentSession (which preserves
// entry ORDER) before signing, and the reconciled ids are mapped back onto the
// raw entries by that preserved position. The raw entries keep all their
// authored fields; only their id is filled in.
//
// Operates from the RAW read but matches on normalized content. Entries that
// already carry an id pass through untouched. Returns a new raw session (never
// mutates the input); a null/non-object read passes through.
export function reconcileDraftIds(rawSession, inMemorySession) {
  if (!rawSession || typeof rawSession !== 'object') return rawSession
  const rawEntries = Array.isArray(rawSession.entries) ? rawSession.entries : []
  if (!rawEntries.some((entry) => !textOrNull(entry?.id))) return rawSession

  // Canonical content signature of a RAW entry. normalizeCurrentSession
  // canonicalizes metrics (e.g. a strength set gains unit:"kg", weights → SI), so
  // a raw entry must be canonicalized the SAME way before signing or it would
  // never match the already-normalized in-memory entry. We normalize each raw
  // entry ALONE (a one-element session) rather than the whole read: normalize
  // SORTS entries by ts (normalizeStoredEntries), so signing positionally against
  // a normalized-then-sorted array would attach ids to the WRONG content when the
  // raw entries are out of ts order. A one-element array cannot be reordered, so
  // per-entry normalization is sort-independent.
  const sigOf = (rawEntry) => {
    const norm = normalizeCurrentSession({ ...rawSession, entries: [rawEntry] })
    return draftEntryContentSig(norm ? norm.entries[0] : rawEntry)
  }

  const memEntries = (inMemorySession && Array.isArray(inMemorySession.entries))
    ? inMemorySession.entries
    : []
  // Index in-memory ids by NORMALIZED content signature, preserving order, so an
  // id-less raw entry can claim the FIRST as-yet-unclaimed in-memory id of the
  // same content. Order within a bucket makes repeated-content reconcile
  // deterministic (first occurrence ↔ first in-memory id).
  const memBySig = new Map()
  for (const entry of memEntries) {
    const id = textOrNull(entry?.id)
    if (!id) continue
    const sig = draftEntryContentSig(entry)
    if (!memBySig.has(sig)) memBySig.set(sig, [])
    memBySig.get(sig).push(id)
  }
  const claimed = new Set()

  const entries = rawEntries.map((entry) => {
    const existingId = textOrNull(entry?.id)
    if (existingId) return entry
    // Content match against an unclaimed in-memory id (same exercise/metrics),
    // signed on this entry's own canonical content (sort-independent).
    const bucket = memBySig.get(sigOf(entry))
    const reuse = bucket && bucket.find((id) => !claimed.has(id))
    if (reuse) {
      claimed.add(reuse)
      return { ...entry, id: reuse }
    }
    // Genuinely new (no unclaimed same-content in-memory id): mint a fresh,
    // stable in-memory id. A later read reconciles this same content against the
    // now-in-memory id and reuses it; finish() persists it at the commit boundary.
    return { ...entry, id: uid() }
  })

  return { ...rawSession, entries }
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
export function exerciseSessionPoint(session, family) {
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
export function exerciseRecords(mine, points, family) {
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
export function exerciseSetRecords(mine) {
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

export function summarizeStrengthSets(sets) {
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

// ---------------------------------------------------------------------------
// Visible-tab poller — view wiring, but kept here (doc/win INJECTED, never read
// from globals) so the start/stop state machine is provable under node --test
// with fakes. Why it exists: storage.subscribe() only notifies writes made
// through the same runtime instance, and a session logged from the MAIN shell
// chat lands on the server from a different context entirely — without
// polling, the Session card stays blank until a manual refresh.
//
// Contract: calls `tick` immediately and every `intervalMs` while the document
// is visible; stops while hidden (no background battery/network burn); ticks
// once on window focus so a returning owner sees agent-logged sets at once.
// Returns the cleanup that unhooks both listeners and the interval. Callers
// make `tick` cheap-and-idempotent (the session load no-ops its setState when
// nothing changed), so duplicate ticks are harmless.
// ---------------------------------------------------------------------------
export function createVisiblePoller(tick, { doc, win, intervalMs = 5000 }) {
  let intervalId = null
  const start = () => {
    if (intervalId != null) return
    tick()
    intervalId = win.setInterval(tick, intervalMs)
  }
  const stop = () => {
    if (intervalId != null) {
      win.clearInterval(intervalId)
      intervalId = null
    }
  }
  const onVisibility = () => {
    if (doc.visibilityState === 'visible') start()
    else stop()
  }
  if (doc.visibilityState === 'visible') start()
  win.addEventListener('focus', tick)
  doc.addEventListener('visibilitychange', onVisibility)
  return () => {
    stop()
    win.removeEventListener('focus', tick)
    doc.removeEventListener('visibilitychange', onVisibility)
  }
}

// ---------------------------------------------------------------------------
// Serialized session-state controller — the ONE owner of all session state.
//
// WHY THIS EXISTS (the structural fix). Session state used to be governed by
// THREE independent concurrency primitives that coordinated through flags:
//   - a write chain for current_session.json writes,
//   - a single-flight gate for current_session.json reads,
//   - a separate queue for entries.json writes,
// with a load bailing out when a write was "in flight" and a load's id-stamp
// reaching ACROSS into the write chain. Reads and writes of the SAME file ran
// on DIFFERENT primitives. Every race a skeptic found lived in the SEAMS
// between them: a load that captured the draft just before finish() cleared it
// then wrote it back (load-vs-finish resurrection); an id-less file left on
// disk when a swallowed persist-back cleared the single-flight gate; an app
// switch sharing a stale in-flight load; two loads minting competing ids. You
// cannot patch a seam away — you remove the seams by removing the separate
// primitives. So this controller is the SINGLE serialized owner of:
//   - the in-memory current_session source of truth (`this.session`),
//   - every read / mint / merge / write of current_session.json,
//   - every write of entries.json,
//   - the Finish transition (commit-entries-then-clear-draft).
//
// INVARIANT: no two intents ever interleave. Every external trigger
// (mount-load, subscribe callback, poll tick, onEntriesMaybeChanged, quick-add,
// edit, delete, finish, retry) ENQUEUES an intent; intents run STRICTLY ONE AT
// A TIME on a single promise chain. Because finish runs as one indivisible
// intent on that chain, a load can never observe a half-finished transition,
// and a load's write can never land after finish cleared the draft: the load
// either ran entirely before finish (its write is then superseded by finish's
// clear) or entirely after (it reads the already-null file and writes nothing).
//
// PROCESS-TIME FRESHNESS: each intent re-reads the latest remote AT PROCESS
// TIME (not enqueue time), merges it against the single in-memory truth honoring
// the accumulated tombstone set + stable per-entry ids, persists, and updates
// React state. A stale enqueue-time snapshot is therefore never written.
//
// NON-DURABLE WRITES: a write whose result is not durable (an {error}/{ok:false}
// or a result that is neither synced nor queued) KEEPS the in-memory truth and
// re-throws. The controller does NOT advance `this.session` past a write it
// could not land, so a sibling re-read can never see an un-id-stamped file the
// controller believed it had stamped. ({queued:true} IS durable — the runtime's
// IndexedDB outbox replays it on reconnect — so it is treated as success.)
//
// SCOPE / KEYING: one controller instance per app instance (keyed by the
// store/appId the React layer threads in via useMemo). An app switch builds a
// FRESH controller with its own chain, in-memory truth, and tombstones, so a
// stale in-flight load from the previous app can never write into the new one.
//
// PURE + INJECTED: no React, no DOM, no window. `deps` injects the store,
// React state setters, durability check, error sink, and signal emitter, so the
// whole serialization is provable under `node --test` with fakes.
// ---------------------------------------------------------------------------
export function createSessionController(deps) {
  const {
    store,
    setSession,
    setEntries,
    requireDurable,
    onWriteError = () => {},
    signal = () => {},
    now = () => Date.now(),
  } = deps

  // The single in-memory source of truth for current_session.json. Only an
  // intent running on the chain reads or writes this — never a closure outside
  // the chain — so it is always the latest committed draft.
  let session = null
  // Absorbing-barrier tombstone set for entries.json. Once an id is deleted it
  // is never resurrected: every entries write applies the WHOLE set. Re-adding
  // the "same" workout mints a fresh uid, so a permanent tombstone of the OLD
  // id never blocks a genuine re-add. Never pruned against remote absence (a
  // just-deleted id is by definition absent from remote).
  const tombstones = new Set()
  // The serial chain. Every intent is `.then`-chained here, so two intents can
  // never interleave their read-modify-write. `.catch(()=>{})` on the tail keeps
  // one failed intent from wedging the chain; callers still see the rejection
  // through the promise the enqueue returns.
  let chain = Promise.resolve()
  let disposed = false

  function enqueue(work) {
    const run = chain.then(() => (disposed ? undefined : work()))
    chain = run.catch(() => {})
    return run
  }

  // Disposal is checked at enqueue time (before work starts) AND again after
  // every await inside an intent, because dispose() can fire while an intent is
  // parked on a store read/write. A disposed controller belongs to an app the
  // user switched away from: it must neither write the old app's draft back to
  // the (now-foreign) store nor push the old app's state into React, or it would
  // contaminate the new app. throwIfDisposed() aborts the in-flight intent the
  // instant it resumes onto a disposed controller; the abort is swallowed by the
  // chain's `.catch` and surfaced to the caller as a rejection.
  function throwIfDisposed() {
    if (disposed) throw new Error('controller disposed')
  }

  // ---- current_session.json: load / merge / in-memory id reconciliation ----
  // Re-read fresh remote, reconcile id-less entries against the in-memory truth,
  // and merge for React state only. Load must be a pure read: whole-file storage
  // is last-write-wins with no CAS, so writing the reconciled load snapshot back
  // can clobber an embedded-agent append that landed after this load's read.
  // Correctness does not require the load-time stamp on disk; reconcileDraftIds
  // is deterministic by authored content, independent readers converge in memory,
  // and finish() is the authoritative point that persists reconciled ids before
  // committing entries.json.
  //
  // Residual limitation: Even with the load-time write removed/guarded, the
  // genuine cross-context race remains: finish() (or any whole-file write) vs a
  // concurrent embedded-agent append under whole-file LWW with no CAS can still
  // lose data in a TOCTOU window. Closing that fully requires a platform-level
  // compare-and-swap / conditional-write storage primitive.
  async function processLoad() {
    const loaded = await store.get('current_session.json')
    throwIfDisposed() // app switched away while parked on the read — abort
    // RECONCILE id-less entries against the in-memory truth BEFORE normalizing or
    // merging. This is the root-cause fix: an id-less entry reuses the id of its
    // authored-content match in `session`, so two reads of the same id-less disk
    // state converge on the SAME ids. Without this, normalize would mint a FRESH
    // random id per read and mergeCurrentSessions (keyed on id) would union the
    // two reads into a DUPLICATE.
    const reconciled = reconcileDraftIds(loaded, session)
    const remote = normalizeCurrentSession(reconciled, now())
    if (remote == null) {
      // Authoritative clear (finished/cleared anywhere). Replace in-memory
      // truth and React state with null — never merge a stale local draft back.
      if (session !== null) { session = null; setSession(null) }
      return null
    }
    const merged = mergeCurrentSessions(session, remote, { prefer: 'remote', now: now() })
    // Do not stamp this load result back to current_session.json. A load snapshot
    // may be stale relative to an embedded-agent append; writing it would be a
    // whole-file LWW overwrite. The reconciled ids live in memory for React keys
    // and draft transforms, and finish() persists them at the commit boundary.
    // No-op churn guard: the visible-tab poll calls this every few seconds;
    // replacing state with a deep-equal object every tick would re-render the
    // whole Session view for nothing. Compare against the in-memory truth.
    if (stableStringify(session) === stableStringify(merged)) return session
    session = merged
    setSession(merged)
    return merged
  }

  // ---- current_session.json: arbitrary transform (quick-add / delete / clear)
  // The transform receives the FRESH-at-process-time merge of the in-memory
  // truth with the latest remote (so a co-writer agent's entry the caller never
  // saw still survives) and returns the next draft (or null to clear). Runs on
  // the chain, so two quick-adds — or a quick-add racing finish — are strictly
  // ordered and can never lose an entry to an interleaved read-modify-write.
  async function processSessionTransform(transform) {
    const loaded = await store.get('current_session.json')
    throwIfDisposed() // app switched away while parked on the read — abort
    // Reconcile a co-writer's id-less rewrite against the in-memory truth before
    // merging, so a quick-add/delete never unions a re-minted duplicate of an
    // entry already in `session` (same root-cause fix as processLoad).
    const fresh = normalizeCurrentSession(reconcileDraftIds(loaded, session), now())
    const base = mergeCurrentSessions(session, fresh, { prefer: 'local', now: now() })
    const next = await transform(base, fresh)
    throwIfDisposed() // transform may be async; abort before writing if disposed
    const result = await store.set('current_session.json', next)
    throwIfDisposed() // app switched away while parked on the write — abort
    requireDurable(result, 'current_session.json')
    session = next
    setSession(next)
    return next
  }

  // ---- entries.json: serialized write (edit / delete / migration / boot) ---
  // Folds this intent's deletions into the permanent tombstone set, re-reads the
  // freshest remote, applies the WHOLE tombstone set then the upserts, writes,
  // and updates React state. On the chain, so a history edit/delete can never
  // race finish's commit and resurrect or revert a row.
  async function processEntriesWrite(intent) {
    for (const id of intent.deletedIds || []) tombstones.add(id)
    const remoteEntries = await store.get('entries.json')
    throwIfDisposed() // app switched away while parked on the read — abort
    const mergedEntries = applyEntriesWriteMutation(remoteEntries, {
      upsertEntries: intent.upsertEntries || [],
      deletedIds: [...tombstones],
    })
    const result = await store.set('entries.json', mergedEntries)
    throwIfDisposed() // app switched away while parked on the write — abort
    requireDurable(result, 'entries.json')
    setEntries(mergedEntries)
    return mergedEntries
  }

  // ---- Finish: STAMP the draft's ids to disk, commit to entries.json, THEN
  //      clear the draft ----------------------------------------------------
  // One indivisible intent. It re-reads + reconciles + merges the freshest draft,
  // commits its ready entries to entries.json DURABLY (same tombstone-honoring
  // path as every other entries write), then clears current_session.json. Because
  // it is a single chain step, no load/quick-add can interleave: the
  // load-vs-finish resurrection is impossible by construction.
  //
  // CROSS-RETRY IDEMPOTENCY. The committed ids must be RECOVERABLE so a retried
  // Finish (even from a FRESH controller whose `session` started null) re-derives
  // the SAME ids and mergeEntriesForSave dedups instead of double-writing. A
  // freshly-reconciled id-less draft has ids that exist ONLY in `committed` and
  // `session` — not yet on disk. If the clear then fails/aborts, the on-disk
  // draft is still id-less, and a later Finish would mint DIFFERENT ids for the
  // same workout → a duplicate that survives in entries.json (distinct ids don't
  // dedup). So we PERSIST the id-stamped merged draft back to the file BEFORE
  // committing whenever the read was id-less. Then the recoverable on-disk draft
  // carries the same stable ids entriesFromCurrentSession will re-commit, and the
  // retry dedups. The persist-back is durability-gated like every other write.
  async function processFinish() {
    const loaded = await store.get('current_session.json')
    throwIfDisposed() // app switched away while parked on the read — abort
    // Reconcile an id-less co-writer rewrite against the in-memory truth before
    // committing, so Finish commits ONE row per entry (not a re-minted dup) and
    // the committed ids are the same stable ids a retry would re-derive.
    const fresh = normalizeCurrentSession(reconcileDraftIds(loaded, session), now())
    const merged = mergeCurrentSessions(session, fresh, { prefer: 'local', now: now() })
    const committed = entriesFromCurrentSession(merged)
    if (committed.length === 0) {
      // Nothing ready to commit (the draft is empty/unready). Leave the draft.
      session = merged
      setSession(merged)
      return { committed: [], entries: null }
    }
    // Stamp the reconciled ids to disk FIRST when the read was id-less, so the
    // recoverable draft carries the ids we are about to commit. A retry then
    // re-reads an id-BEARING draft and re-commits the SAME ids (dedup), even from
    // a fresh controller. Durability-gated: a non-durable stamp aborts before any
    // commit, leaving the in-memory truth and on-disk draft unchanged.
    if (currentSessionNeedsIdAssignment(loaded)) {
      const stampResult = await store.set('current_session.json', merged)
      throwIfDisposed()
      requireDurable(stampResult, 'current_session.json')
    }
    // Commit to the append-only log DURABLY.
    const nextEntries = await processEntriesWrite({ upsertEntries: committed })
    throwIfDisposed() // app switched away during the commit — abort before clear
    // Only now clear the draft — entries.json is durable, so the workout cannot
    // be lost even if the clear write fails (the draft stays recoverable, the
    // re-commit dedups on the stable ids).
    const clearResult = await store.set('current_session.json', null)
    throwIfDisposed() // app switched away while parked on the clear — abort
    requireDurable(clearResult, 'current_session.json')
    session = null
    setSession(null)
    return { committed, entries: nextEntries }
  }

  // ── Public intent API. Each method ENQUEUES; the controller processes them
  // strictly serially. Every method returns a promise the caller can await /
  // catch, so the React layer can drive retry + signals without ever touching
  // the in-memory truth directly.
  return {
    // Reload current_session.json (mount, subscribe, poll, onEntriesMaybeChanged).
    load() {
      return enqueue(processLoad).catch((err) => {
        onWriteError(err, 'session_load')
        throw err
      })
    },
    // Run a transform over the freshest draft (quick-add, delete-draft, clear).
    sessionWrite(transform) {
      return enqueue(() => processSessionTransform(transform))
    },
    // Write entries.json (history edit/delete, migration, boot normalization).
    entriesWrite(intent = {}) {
      return enqueue(() => processEntriesWrite(intent))
    },
    // Finish: commit the draft to history then clear it, as one serial step.
    finish() {
      return enqueue(processFinish)
    },
    // Seed the in-memory truth + React state without a write (boot path: the
    // initial entries load is read-only and must not go through the writer).
    setEntriesInitial(entries) {
      setEntries(entries)
    },
    // Read-only accessors for the React layer (e.g. signal payloads). These read
    // the latest committed truth; they never mutate it.
    getSession() { return session },
    hasTombstone(id) { return tombstones.has(id) },
    // Dispose: an app switch builds a fresh controller; mark this one inert so a
    // late-resolving enqueued intent from the old app cannot write into the new.
    dispose() { disposed = true },
  }
}
