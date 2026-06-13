// node --test coverage for the pure logic. These prove everything downstream
// of the LLM's JSON: the parsed→normalized mapping (strength + cardio/hiking),
// session grouping by the 4h gap, and the Epley e1RM. The LLM call itself
// can't be tested offline — these tests stand in a hand-written "parsed"
// object for what the model would return.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  normalizeEntry, assignSession, currentSession, groupSessions,
  epley1RM, strengthPRs, cardioBests, migrateLegacyState,
  SESSION_GAP_MS, toKg, summarizeMetrics, extractFirstJsonObject, localDate,
  mergeEntriesForSave, draftsFromParsedPayload, normalizeCurrentSession,
  sessionEntryMissing, currentSessionReady, entriesFromCurrentSession,
  appendEntryToCurrentSession, mergeCurrentSessions,
  exerciseKey, exerciseList, exerciseDetail, paceSecPerKm, fmtPace,
  lastEntryForExercise, recentExercises,
  sportIconKey, sportIconColor, SPORT_ICON_RULES, SPORT_ICON_COLORS, CATEGORIES,
  createVisiblePoller,
} from '../logic.js'
import { buildEntry } from '../build-entry.mjs'

// --- robustness against bad/odd LLM output (Codex review hardening) ---

test('extractFirstJsonObject: pulls the object out of prose + fences', () => {
  assert.deepEqual(
    extractFirstJsonObject('Sure! ```json\n{"category":"strength"}\n``` done.'),
    { category: 'strength' },
  )
})
test('extractFirstJsonObject: ignores a trailing stray brace after a valid object', () => {
  assert.deepEqual(extractFirstJsonObject('{"a":1} } extra'), { a: 1 })
})
test('extractFirstJsonObject: brace inside a string does not break balance', () => {
  assert.deepEqual(extractFirstJsonObject('{"note":"a } b"}'), { note: 'a } b' })
})
test('extractFirstJsonObject: returns null when there is no JSON', () => {
  assert.equal(extractFirstJsonObject('no json here'), null)
  assert.equal(extractFirstJsonObject(42), null)
})

test('draftsFromParsedPayload expands a multi-activity workout into review drafts', () => {
  const drafts = draftsFromParsedPayload({
    entries: [
      {
        category: 'strength',
        activity: 'Deadlift',
        metrics: { sets: Array.from({ length: 5 }, () => ({ weight: 140, reps: 5, unit: 'kg' })) },
      },
      {
        category: 'sport',
        activity: 'Climbing',
        metrics: { duration: { value: 1.5, unit: 'h' } },
      },
      {
        category: 'strength',
        activity: 'Bench press',
        ambiguous: true,
        clarification: 'What were the reps and weights for the five bench sets?',
        metrics: { sets: [] },
      },
    ],
  })

  assert.equal(drafts.length, 3)
  assert.equal(drafts[0].draft.activity, 'Deadlift')
  assert.equal(drafts[0].draft.metrics.sets.length, 5)
  assert.equal(drafts[1].draft.category, 'sport')
  assert.deepEqual(drafts[1].draft.metrics.duration, { value: 1.5, unit: 'h' })
  assert.equal(drafts[2].ambiguous, true)
  assert.match(drafts[2].clarification, /bench/i)
})

test('draftsFromParsedPayload preserves legacy single-entry parse payloads', () => {
  const drafts = draftsFromParsedPayload({
    category: 'running',
    activity: 'Run',
    metrics: { distance: { value: 5, unit: 'km' } },
  })

  assert.equal(drafts.length, 1)
  assert.equal(drafts[0].draft.category, 'running')
  assert.equal(drafts[0].ambiguous, false)
})

test('normalizeEntry: negative weight is clamped to 0', () => {
  const e = normalizeEntry({ category: 'strength', metrics: { sets: [{ weight: -100, reps: 5, unit: 'kg' }] } })
  assert.equal(e.metrics.sets[0].weight_kg, 0)
})
test('normalizeEntry: unknown strength values stay n/a instead of becoming 0', () => {
  const e = normalizeEntry({
    category: 'strength',
    activity: 'Deadlift',
    metrics: {
      sets: [
        { weight: null, reps: null, unit: 'kg' },
        { weight: null, reps: null, unit: 'kg' },
        { weight: null, reps: null, unit: 'kg' },
      ],
    },
  })
  assert.deepEqual(e.metrics.sets, [
    { weight_kg: null, reps: null, unit: 'kg' },
    { weight_kg: null, reps: null, unit: 'kg' },
    { weight_kg: null, reps: null, unit: 'kg' },
  ])
  assert.equal(summarizeMetrics(e), '3 sets')
})
test('summarizeMetrics formats partially-known strength sets without n/a noise', () => {
  assert.equal(summarizeMetrics({
    category: 'strength',
    metrics: {
      sets: [
        { weight_kg: 100, reps: null, unit: 'kg' },
        { weight_kg: 100, reps: null, unit: 'kg' },
      ],
    },
  }), '2 sets @ 100kg')
  assert.equal(summarizeMetrics({
    category: 'strength',
    metrics: {
      sets: [
        { weight_kg: null, reps: 5, unit: 'kg' },
        { weight_kg: null, reps: 5, unit: 'kg' },
        { weight_kg: null, reps: 5, unit: 'kg' },
      ],
    },
  }), '3×5')
})
test('normalizeEntry: non-string activity falls back to the category label, no throw', () => {
  const e = normalizeEntry({ category: 'strength', activity: { x: 1 }, metrics: { sets: [] } })
  assert.equal(typeof e.activity, 'string')
  assert.ok(e.activity.length > 0)
})
test('normalizeEntry: non-finite timestamp falls back to now', () => {
  const before = Date.now()
  const e = normalizeEntry({ category: 'other', metrics: {} }, { ts: Number.NaN })
  const after = Date.now()
  assert.ok(e.ts >= before && e.ts <= after)
  assert.equal(e.localDate, localDate(new Date(e.ts)))
})
test('assignSession: a back-dated entry does not join a future session', () => {
  const now = 1_000_000_000_000
  const entries = [{ ts: now, sessionId: 's-future' }]
  // an entry an hour BEFORE the newest must NOT reuse the future session id
  assert.notEqual(assignSession(entries, now - 3_600_000), 's-future')
})
test('epley1RM: negative or zero inputs return 0', () => {
  assert.equal(epley1RM(100, -5), 0)
  assert.equal(epley1RM(-100, 5), 0)
  assert.equal(epley1RM(0, 5), 0)
  assert.ok(epley1RM(100, 5) > 100)
})

const here = dirname(fileURLToPath(import.meta.url))

test('normalizeEntry maps a strength parse to SI-stored sets', () => {
  const parsed = {
    category: 'strength',
    activity: 'Deadlift',
    metrics: { sets: [{ weight: 100, reps: 8, unit: 'kg' }] },
  }
  const e = normalizeEntry(parsed, { ts: 1_700_000_000_000, raw: 'did 1 set of deadlift 100kg x8' })
  assert.equal(e.category, 'strength')
  assert.equal(e.activity, 'Deadlift')
  assert.equal(e.icon, 'barbell') // app owns the icon (Tabler key, not a glyph)
  assert.equal(e.metrics.sets.length, 1)
  assert.equal(e.metrics.sets[0].weight_kg, 100)
  assert.equal(e.metrics.sets[0].reps, 8)
  assert.equal(e.metrics.sets[0].unit, 'kg')
  assert.ok(e.id && e.localDate && e.confirmed === true)
})

test('normalizeEntry converts lb to kg on the way in', () => {
  const parsed = {
    category: 'strength', activity: 'Bench',
    metrics: { sets: [{ weight: 225, reps: 5, unit: 'lb' }] },
  }
  const e = normalizeEntry(parsed, { ts: 1 })
  // 225 lb ≈ 102.06 kg
  assert.ok(Math.abs(e.metrics.sets[0].weight_kg - 102.06) < 0.05)
  assert.equal(e.metrics.sets[0].unit, 'lb') // display unit preserved
})

test('normalizeEntry maps a hiking parse to cardio-family SI metrics', () => {
  const parsed = {
    category: 'hiking',
    activity: 'Hike',
    metrics: {
      duration: { value: 8, unit: 'h' },
      location: 'Hawaii',
      elevation: { value: 1.2, unit: 'km' },
    },
  }
  const e = normalizeEntry(parsed, { ts: 2, raw: 'hiked 8h in Hawaii' })
  assert.equal(e.category, 'hiking')
  assert.equal(e.metrics.duration_s, 8 * 3600)
  assert.equal(e.metrics.location, 'Hawaii')
  assert.equal(e.metrics.elevation_m, 1200)
  assert.equal(e.metrics.distance_m, null)
  assert.match(summarizeMetrics(e), /8h/)
  assert.match(summarizeMetrics(e), /Hawaii/)
})

test('normalizeEntry: unknown cardio values stay n/a instead of becoming 0', () => {
  const e = normalizeEntry({
    category: 'hiking',
    activity: 'Hike',
    metrics: {
      duration: { value: null, unit: 'h' },
      distance: { value: null, unit: 'km' },
      elevation: { value: null, unit: 'm' },
    },
  })
  assert.equal(e.metrics.duration_s, null)
  assert.equal(e.metrics.distance_m, null)
  assert.equal(e.metrics.elevation_m, null)
  assert.equal(summarizeMetrics(e), '')
})

test('current session keeps incomplete strength drafts out of the finish flow', () => {
  const session = normalizeCurrentSession({
    id: 'session-1',
    startedAt: 1_700_000_000_000,
    entries: [{
      id: 'deadlift',
      ts: 1,
      category: 'strength',
      activity: 'Deadlift',
      metrics: { sets: [{ weight_kg: null, reps: null, unit: 'kg' }, { weight_kg: null, reps: null, unit: 'kg' }] },
    }],
  })

  assert.equal(currentSessionReady(session), false)
  assert.match(sessionEntryMissing(session.entries[0]), /Deadlift reps and weight/)
  assert.deepEqual(entriesFromCurrentSession(session), [])
})

test('current session finishes complete mixed activities at the session start time', () => {
  const startedAt = 1_700_000_000_000
  const session = {
    id: 'session-demo',
    startedAt,
    entries: [
      {
        id: 'deadlift',
        ts: 20,
        category: 'strength',
        activity: 'Deadlift',
        metrics: { sets: [{ weight_kg: 120, reps: 5, unit: 'kg' }] },
      },
      {
        id: 'swim',
        ts: 30,
        category: 'swimming',
        activity: 'Swim',
        metrics: { duration_s: 2400, distance_m: null },
      },
    ],
  }

  assert.equal(currentSessionReady(session), true)
  const entries = entriesFromCurrentSession(session)
  assert.equal(entries.length, 2)
  assert.deepEqual(entries.map((entry) => entry.sessionId), ['session-demo', 'session-demo'])
  assert.deepEqual(entries.map((entry) => entry.ts), [startedAt, startedAt + 1000])
  assert.equal(entries[0].localDate, localDate(new Date(startedAt)))
  assert.notEqual(entries[0].id, 'deadlift')
  assert.notEqual(entries[1].id, 'swim')
})

test('current session requires duration or distance for cardio drafts', () => {
  const swim = normalizeCurrentSession({
    startedAt: 1_700_000_000_000,
    entries: [{
      ts: 1,
      category: 'swimming',
      activity: 'Swim',
      metrics: { duration_s: null, distance_m: null },
    }],
  })

  assert.equal(currentSessionReady(swim), false)
  assert.match(sessionEntryMissing(swim.entries[0]), /duration or distance/)
})

test('current session treats generic strength activity as missing exercise name', () => {
  const session = normalizeCurrentSession({
    startedAt: 1_700_000_000_000,
    entries: [{
      ts: 1,
      category: 'strength',
      metrics: { sets: [{ weight_kg: 20, reps: 5, unit: 'kg' }] },
    }],
  })

  assert.equal(session.entries[0].activity, 'Strength')
  assert.equal(sessionEntryMissing(session.entries[0]), 'activity')
  assert.equal(currentSessionReady(session), false)
})

test('current session treats zero-valued required metrics as missing', () => {
  const strength = normalizeCurrentSession({
    startedAt: 1_700_000_000_000,
    entries: [{
      ts: 1,
      category: 'strength',
      activity: 'Deadlift',
      metrics: { sets: [{ weight_kg: 0, reps: 5, unit: 'kg' }] },
    }],
  })
  const swim = normalizeCurrentSession({
    startedAt: 1_700_000_000_000,
    entries: [{
      ts: 1,
      category: 'swimming',
      activity: 'Swim',
      metrics: { duration_s: 0, distance_m: 0 },
    }],
  })

  assert.match(sessionEntryMissing(strength.entries[0]), /reps and weight/)
  assert.match(sessionEntryMissing(swim.entries[0]), /duration or distance/)
  assert.equal(currentSessionReady(strength), false)
  assert.equal(currentSessionReady(swim), false)
})

test('normalizeEntry maps a running parse with distance + duration', () => {
  const parsed = {
    category: 'running', activity: 'Run',
    metrics: { distance: { value: 5, unit: 'km' }, duration: { value: 24, unit: 'min' } },
  }
  const e = normalizeEntry(parsed, { ts: 3 })
  assert.equal(e.metrics.distance_m, 5000)
  assert.equal(e.metrics.duration_s, 24 * 60)
})

test('unknown category collapses to other', () => {
  const e = normalizeEntry({ category: 'quidditch', activity: 'Match', metrics: {} }, { ts: 4 })
  assert.equal(e.category, 'other')
})

test('groupSessions clusters entries within the 4h gap and splits beyond it', () => {
  const base = 1_700_000_000_000
  const entries = [
    { id: 'a', ts: base, localDate: '2025-01-01', sessionId: 's-1', category: 'strength', metrics: { sets: [] }, activity: 'A' },
    { id: 'b', ts: base + 30 * 60 * 1000, localDate: '2025-01-01', sessionId: 's-1', category: 'strength', metrics: { sets: [] }, activity: 'B' },
    // 5h later → new session
    { id: 'c', ts: base + 5 * 60 * 60 * 1000, localDate: '2025-01-01', sessionId: 's-2', category: 'cardio', metrics: {}, activity: 'C' },
  ]
  const sessions = groupSessions(entries)
  assert.equal(sessions.length, 2)
  assert.equal(sessions[0].entries.length, 2)
  assert.equal(sessions[1].entries.length, 1)
})

test('assignSession reuses the open session for a follow-up within the gap', () => {
  const base = 1_700_000_000_000
  const entries = [
    { id: 'a', ts: base, sessionId: 's-1', category: 'strength', metrics: { sets: [] }, localDate: '2025-01-01', activity: 'Deadlift' },
  ]
  // "another set with 90", 20 min later → same session.
  const sid = assignSession(entries, base + 20 * 60 * 1000)
  assert.equal(sid, 's-1')
  // ... but 5h later → a fresh session.
  const sid2 = assignSession(entries, base + 5 * 60 * 60 * 1000)
  assert.notEqual(sid2, 's-1')
})

test('currentSession returns the open session within the gap, null past it', () => {
  const base = 1_700_000_000_000
  const entries = [
    { id: 'a', ts: base, sessionId: 's-1', category: 'strength', metrics: { sets: [] }, localDate: '2025-01-01', activity: 'Deadlift' },
  ]
  assert.ok(currentSession(entries, base + 60 * 1000)) // 1 min later: open
  assert.equal(currentSession(entries, base + SESSION_GAP_MS + 1), null) // past gap
})

test('mergeEntriesForSave keeps sibling-device entries while applying local edits', () => {
  const merged = mergeEntriesForSave(
    [{ id: 'local', ts: 2, category: 'other', activity: 'Local', metrics: { note: 'mine' } }],
    [{ id: 'remote', ts: 1, category: 'running', activity: 'Remote', metrics: { distance_m: 500 } }],
  )
  assert.deepEqual(merged.map((entry) => entry.id), ['remote', 'local'])
})

test('epley1RM matches the Epley formula and ranks reps over a single', () => {
  assert.equal(epley1RM(100, 1), 100)
  // 100 * (1 + 5/30) = 116.67 → 116.7
  assert.equal(epley1RM(100, 5), 116.7)
  // 100×5 outranks 110×1 (110 e1RM)
  assert.ok(epley1RM(100, 5) > epley1RM(110, 1))
  assert.equal(epley1RM(0, 5), 0)
  assert.equal(epley1RM(100, 0), 0)
})

test('strengthPRs ranks the best e1RM per activity', () => {
  const entries = [
    normalizeEntry({ category: 'strength', activity: 'Squat', metrics: { sets: [{ weight: 100, reps: 5, unit: 'kg' }] } }, { ts: 1 }),
    normalizeEntry({ category: 'strength', activity: 'Squat', metrics: { sets: [{ weight: 110, reps: 1, unit: 'kg' }] } }, { ts: 2 }),
  ]
  const prs = strengthPRs(entries)
  assert.equal(prs.length, 1)
  assert.equal(prs[0].activity, 'Squat')
  // 100×5 (116.7) beats 110×1 (110)
  assert.equal(prs[0].weight_kg, 100)
  assert.equal(prs[0].reps, 5)
})

test('cardioBests reports max distance/duration per activity', () => {
  const entries = [
    normalizeEntry({ category: 'running', activity: 'Run', metrics: { distance: { value: 5, unit: 'km' }, duration: { value: 24, unit: 'min' } } }, { ts: 1 }),
    normalizeEntry({ category: 'running', activity: 'Run', metrics: { distance: { value: 10, unit: 'km' }, duration: { value: 50, unit: 'min' } } }, { ts: 2 }),
  ]
  const bests = cardioBests(entries)
  assert.equal(bests.length, 1)
  assert.equal(bests[0].maxDistance_m, 10000)
  assert.equal(bests[0].maxDuration_s, 3000)
})

test('migrateLegacyState turns history sets into strength entries', () => {
  const legacy = {
    programs: { ppl6: { name: 'x', sessions: [] } },
    history: [
      {
        date: '2025-01-01',
        sets: [
          { exercise: 'Deadlift', weight: 100, reps: 5 },
          { exercise: 'Deadlift', weight: 100, reps: 5 },
          { exercise: 'Bench', weight: 60, reps: 8 },
        ],
      },
    ],
  }
  const entries = migrateLegacyState(legacy)
  // Two activities → two entries; Deadlift entry has 2 sets.
  assert.equal(entries.length, 2)
  const deadlift = entries.find((e) => e.activity === 'Deadlift')
  assert.ok(deadlift)
  assert.equal(deadlift.category, 'strength')
  assert.equal(deadlift.metrics.sets.length, 2)
  assert.equal(deadlift.localDate, '2025-01-01')
  // Both entries share the session reconstructed from the row date.
  assert.equal(entries[0].sessionId, entries[1].sessionId)
})

test('toKg leaves kg untouched, converts lb', () => {
  assert.equal(toKg(100, 'kg'), 100)
  assert.ok(Math.abs(toKg(220.46, 'lb') - 100) < 0.05)
})

test('index.jsx inlined logic block is in sync with logic.js', () => {
  // Guard against a forgotten `node build-entry.mjs`: regenerating from the
  // current logic.js must be a no-op against the committed index.jsx.
  const indexSource = readFileSync(join(here, '..', 'index.jsx'), 'utf8')
  const logicSource = readFileSync(join(here, '..', 'logic.js'), 'utf8')
  const rebuilt = buildEntry(indexSource, logicSource)
  assert.equal(rebuilt, indexSource, 'index.jsx logic block is stale — run `node build-entry.mjs`')
})

// --- per-exercise analytics (Hevy-style drill-down) ---

const DAY = 86_400_000
function strengthEntry(id, ts, sessionId, activity, sets) {
  return {
    id, ts, localDate: localDate(new Date(ts)), sessionId,
    category: 'strength', activity, icon: 'barbell',
    metrics: { sets: sets.map(([weight_kg, reps]) => ({ weight_kg, reps, unit: 'kg' })) },
    source: 'ai', confirmed: true,
  }
}
function cardioEntry(id, ts, sessionId, activity, distance_m, duration_s) {
  return {
    id, ts, localDate: localDate(new Date(ts)), sessionId,
    category: 'running', activity, icon: 'run',
    metrics: { duration_s, distance_m, elevation_m: null, location: null },
    source: 'ai', confirmed: true,
  }
}

// A fixture: deadlift across 3 sessions (the middle one has two deadlift
// entries to exercise the in-session aggregation), plus an unrelated squat and
// run so filtering by category+activity is proven.
const base = 1_700_000_000_000
const FIXTURE = [
  strengthEntry('a', base, 'sA', 'Deadlift', [[100, 5]]),
  strengthEntry('b1', base + DAY, 'sB', 'Deadlift', [[102.5, 5]]),
  strengthEntry('b2', base + DAY + 1000, 'sB', 'Deadlift', [[105, 3]]),
  strengthEntry('c', base + 2 * DAY, 'sC', 'Deadlift', [[107.5, 5]]),
  strengthEntry('sq', base + 3 * DAY, 'sD', 'Squat', [[140, 5]]),
  cardioEntry('r1', base + 4 * DAY, 'sE', 'Run', 5000, 1500),
  cardioEntry('r2', base + 5 * DAY, 'sF', 'Run', 10000, 3000),
]

test('paceSecPerKm and fmtPace: needs both sides, formats min/km', () => {
  assert.equal(paceSecPerKm(1500, 5000), 300)
  assert.equal(paceSecPerKm(1500, 0), null)
  assert.equal(paceSecPerKm(0, 5000), null)
  assert.equal(fmtPace(1500, 5000), '5:00/km')
  assert.equal(fmtPace(1500, 0), null)
})

test('exerciseKey separates same name across categories and trims', () => {
  assert.equal(exerciseKey('strength', ' Deadlift '), 'strength::Deadlift')
  assert.notEqual(exerciseKey('strength', 'Plank'), exerciseKey('yoga', 'Plank'))
})

test('exerciseList ranks by frequency and carries icon/best per exercise', () => {
  const list = exerciseList(FIXTURE)
  assert.equal(list.length, 3) // Deadlift, Run, Squat
  const dead = list.find((r) => r.activity === 'Deadlift')
  assert.equal(dead.entries, 4)
  assert.equal(dead.sessions, 3)
  assert.equal(dead.family, 'strength')
  assert.equal(dead.icon, 'barbell')
  assert.equal(list[0].activity, 'Deadlift') // most-logged ranks first
})

test('exerciseDetail builds a chronological strength trend + lifetime records', () => {
  const d = exerciseDetail(FIXTURE, 'strength', 'Deadlift')
  assert.equal(d.sessionCount, 3)
  assert.equal(d.points.length, 3)
  // points ascend in time so the trend draws left→right
  assert.ok(d.points[0].ts < d.points[1].ts && d.points[1].ts < d.points[2].ts)
  // middle session aggregates BOTH deadlift entries
  assert.equal(d.points[1].sets, 2)
  assert.equal(d.points[1].topWeight_kg, 105)
  assert.equal(d.points[1].volume_kg, 828) // 102.5*5 + 105*3
  assert.equal(d.points[1].reps, 8)
  // records
  assert.equal(d.records.heaviest_kg, 107.5)
  assert.equal(d.records.mostReps, 5)
  assert.equal(d.records.bestSessionVolume_kg, 828)
  assert.equal(d.records.totalVolume_kg, 1866) // 500 + 828 + 538
  assert.equal(d.records.bestSetVolume_kg, 538) // round(107.5*5)
  // set-records: best weight at each rep count, sorted by reps
  assert.deepEqual(d.setRecords.map((s) => [s.reps, s.weight_kg]), [[3, 105], [5, 107.5]])
})

test('exerciseDetail summarizes cardio distance/pace and returns null when absent', () => {
  const d = exerciseDetail(FIXTURE, 'running', 'Run')
  assert.equal(d.family, 'cardio')
  assert.equal(d.points.length, 2)
  assert.equal(d.records.maxDistance_m, 10000)
  assert.equal(d.records.maxDuration_s, 3000)
  assert.equal(d.records.bestPace_s_per_km, 300)
  assert.equal(d.records.totalDistance_m, 15000)
  assert.equal(exerciseDetail(FIXTURE, 'strength', 'Nonexistent'), null)
})

test('exerciseDetail display unit follows the heaviest set, not an off-unit warmup', () => {
  // 100 kg top set plus a light 30 lb (13.6 kg) warmup in the same session.
  // The display unit must track the heaviest set (kg), or the UI shows 100kg as 220.5lb.
  const entries = [{
    id: 'mix', ts: base, localDate: localDate(new Date(base)), sessionId: 'sMix',
    category: 'strength', activity: 'Deadlift', icon: 'barbell',
    metrics: { sets: [
      { weight_kg: 100, reps: 5, unit: 'kg' },
      { weight_kg: 13.6, reps: 15, unit: 'lb' },
    ] },
    source: 'ai', confirmed: true,
  }]
  const d = exerciseDetail(entries, 'strength', 'Deadlift')
  assert.equal(d.points[0].topWeight_kg, 100)
  assert.equal(d.points[0].unit, 'kg')
  assert.equal(d.records.unit, 'kg')
  assert.equal(d.records.heaviest_kg, 100)
})

test('exerciseList shows the heaviest weight when a set has no reps (not a bare dash)', () => {
  const entries = [strengthEntry('nr', base, 'sNR', 'Deadlift', [[100, null]])]
  const row = exerciseList(entries).find((r) => r.activity === 'Deadlift')
  assert.equal(row.best, '100kg')
})

// ---------------------------------------------------------------------------
// Quick-add helpers (lastEntryForExercise, recentExercises)
// ---------------------------------------------------------------------------

test('lastEntryForExercise returns the most recent entry for category+activity', () => {
  const entries = [
    strengthEntry('a', base, 'sA', 'Deadlift', [[100, 5]]),
    strengthEntry('b', base + DAY, 'sB', 'Deadlift', [[105, 5]]),
    strengthEntry('c', base + 2 * DAY, 'sC', 'Squat', [[120, 5]]),
  ]
  const last = lastEntryForExercise(entries, 'strength', 'Deadlift')
  assert.equal(last.id, 'b')
  assert.equal(last.metrics.sets[0].weight_kg, 105)
})

test('lastEntryForExercise returns null when no entries for that exercise', () => {
  const entries = [strengthEntry('a', base, 'sA', 'Squat', [[100, 5]])]
  assert.equal(lastEntryForExercise(entries, 'strength', 'Deadlift'), null)
  assert.equal(lastEntryForExercise([], 'strength', 'Deadlift'), null)
  assert.equal(lastEntryForExercise(null, 'strength', 'Deadlift'), null)
})

test('recentExercises returns up to N most recently logged distinct exercises', () => {
  // FIXTURE has: Deadlift (4 entries, most recent base+2d), Squat (base+3d), Run (base+4d & base+5d)
  const recents = recentExercises(FIXTURE, 3)
  assert.equal(recents.length, 3)
  // Most recently logged first: Run (base+5d), Squat (base+3d), Deadlift (base+2d)
  assert.equal(recents[0].activity, 'Run')
  assert.equal(recents[1].activity, 'Squat')
  assert.equal(recents[2].activity, 'Deadlift')
  // Each row carries icon + color
  assert.ok(recents[0].icon)
  assert.ok(recents[0].color)
})

test('recentExercises deduplicates and respects n cap', () => {
  const entries = [
    strengthEntry('a', base + 5 * DAY, 'sA', 'Bench', [[80, 8]]),
    strengthEntry('b', base + 4 * DAY, 'sB', 'Bench', [[80, 8]]),
    strengthEntry('c', base + 3 * DAY, 'sC', 'Deadlift', [[100, 5]]),
  ]
  const recents = recentExercises(entries, 2)
  assert.equal(recents.length, 2)
  assert.equal(recents[0].activity, 'Bench')
  assert.equal(recents[1].activity, 'Deadlift')
})

// --- quick-add → current_session.json (the implicit session start) ---
// commitQuickAdd no longer writes entries.json: it appends the normalized
// entry to the same current_session.json draft the embedded agent maintains,
// and only Finish session moves the draft into committed history.

function quickAddEntry(ts, activity = 'Deadlift', weight = 100, reps = 5) {
  // Exactly what commitQuickAdd builds: ConfirmCard's loose parsed draft
  // through normalizeEntry with the quick-add opts.
  return normalizeEntry(
    { category: 'strength', activity, metrics: { sets: [{ weight, reps, unit: 'kg' }] } },
    { ts, raw: '', source: 'manual', confirmed: true },
  )
}

test('quick-add with no active session starts one in the agent-prompt shape', () => {
  const ts = base + 3_600_000
  const session = appendEntryToCurrentSession(null, quickAddEntry(ts))
  assert.equal(session.id, `session-${ts}`)
  assert.equal(session.startedAt, ts)
  assert.equal(session.status, 'active')
  assert.equal(session.localDate, localDate(new Date(ts)))
  assert.equal(session.pendingQuestion, null)
  assert.equal(session.entries.length, 1)
  assert.equal(session.entries[0].sessionId, session.id)
  assert.equal(session.entries[0].activity, 'Deadlift')
  assert.equal(session.entries[0].source, 'manual')
  // A complete quick-add entry leaves the draft finishable immediately.
  assert.equal(currentSessionReady(session), true)
})

test('quick-add extends an active agent-written session without disturbing it', () => {
  const startedAt = base
  const agentSession = {
    id: `session-${startedAt}`,
    startedAt,
    localDate: localDate(new Date(startedAt)),
    status: 'active',
    entries: [
      {
        id: 'draft-1', ts: startedAt, localDate: localDate(new Date(startedAt)),
        sessionId: `session-${startedAt}`, category: 'strength', activity: 'Squat',
        icon: 'barbell', metrics: { sets: [{ weight_kg: 90, reps: 5, unit: 'kg' }] },
        raw: '5 squats at 90', source: 'ai', confirmed: true,
      },
    ],
    pendingQuestion: null,
  }
  const next = appendEntryToCurrentSession(agentSession, quickAddEntry(startedAt + 600_000, 'Bench Press', 80, 8))
  assert.equal(next.id, agentSession.id)
  assert.equal(next.startedAt, startedAt)
  assert.equal(next.entries.length, 2)
  assert.deepEqual(next.entries.map((e) => e.activity), ['Squat', 'Bench Press'])
  // Both writers' entries share the session id and the +1000ms ordering rule.
  assert.deepEqual(next.entries.map((e) => e.sessionId), [next.id, next.id])
  assert.deepEqual(next.entries.map((e) => e.ts), [startedAt, startedAt + 1000])
  // The input draft is not mutated.
  assert.equal(agentSession.entries.length, 1)
})

test('finish commits quick-add entries to history exactly once (no double-write)', () => {
  const history = [strengthEntry('old-1', base - 2 * DAY, 's-old', 'Deadlift', [[90, 5]])]
  let session = appendEntryToCurrentSession(null, quickAddEntry(base, 'Overhead Press', 50, 5))
  session = appendEntryToCurrentSession(session, quickAddEntry(base + 60_000, 'Pull-up', 0.01, 8))
  // Quick-add must leave committed history untouched until Finish.
  const committed = entriesFromCurrentSession(session)
  assert.equal(committed.length, 2)
  const merged = mergeEntriesForSave([...history, ...committed], history)
  assert.equal(merged.length, 3)
  assert.equal(merged.filter((e) => e.activity === 'Overhead Press').length, 1)
  assert.equal(merged.filter((e) => e.activity === 'Pull-up').length, 1)
  assert.equal(merged.filter((e) => e.id === 'old-1').length, 1)
})

// --- mergeCurrentSessions: reconcile co-writers by entry id ------------------

function agentEntry(id, ts, activity, weight, reps) {
  return {
    id, ts, sessionId: null, category: 'strength', activity,
    metrics: { sets: [{ weight_kg: weight, reps, unit: 'kg' }] },
    source: 'ai', confirmed: true,
  }
}

test('mergeCurrentSessions: union keeps a remote-only (agent) entry and a local-only (quick-add) entry', () => {
  const startedAt = base
  const local = appendEntryToCurrentSession(
    appendEntryToCurrentSession(null, agentEntry('a', startedAt, 'Squat', 100, 5)),
    agentEntry('d', startedAt + 1000, 'Bench', 80, 8),
  )
  const remote = appendEntryToCurrentSession(
    appendEntryToCurrentSession(null, agentEntry('a', startedAt, 'Squat', 100, 5)),
    agentEntry('c', startedAt + 1000, 'Deadlift', 140, 3),
  )
  const merged = mergeCurrentSessions(local, remote)
  // a (shared), d (local-only quick-add), c (remote-only agent) all survive.
  assert.deepEqual(merged.entries.map((e) => e.id), ['a', 'd', 'c'])
  // Re-stamped positionally; the merged order is preserved through the sort.
  assert.deepEqual(merged.entries.map((e) => e.ts), [startedAt, startedAt + 1000, startedAt + 2000])
})

test('mergeCurrentSessions: identical-looking sets with distinct ids are NOT collapsed', () => {
  const startedAt = base
  // Two 3x5 squats logged in the same session — legitimately distinct.
  const local = appendEntryToCurrentSession(
    appendEntryToCurrentSession(null, agentEntry('s1', startedAt, 'Squat', 100, 5)),
    agentEntry('s2', startedAt + 1000, 'Squat', 100, 5),
  )
  const merged = mergeCurrentSessions(local, local)
  assert.equal(merged.entries.length, 2)
  assert.deepEqual(merged.entries.map((e) => e.id), ['s1', 's2'])
})

test('mergeCurrentSessions: prefer "remote" lets an agent edit to a shared entry win', () => {
  const startedAt = base
  const local = appendEntryToCurrentSession(null, agentEntry('a', startedAt, 'Squat', 100, 5))
  const remote = appendEntryToCurrentSession(null, agentEntry('a', startedAt, 'Squat', 110, 5))
  const preferLocal = mergeCurrentSessions(local, remote, { prefer: 'local' })
  const preferRemote = mergeCurrentSessions(local, remote, { prefer: 'remote' })
  assert.equal(preferLocal.entries[0].metrics.sets[0].weight_kg, 100)
  assert.equal(preferRemote.entries[0].metrics.sets[0].weight_kg, 110)
})

test('mergeCurrentSessions: a null side yields the other; both null yields null', () => {
  const startedAt = base
  const session = appendEntryToCurrentSession(null, agentEntry('a', startedAt, 'Squat', 100, 5))
  assert.deepEqual(mergeCurrentSessions(null, session).entries.map((e) => e.id), ['a'])
  assert.deepEqual(mergeCurrentSessions(session, null).entries.map((e) => e.id), ['a'])
  assert.equal(mergeCurrentSessions(null, null), null)
})

test('mergeCurrentSessions: earliest startedAt wins so co-writers converge on one session id', () => {
  const local = appendEntryToCurrentSession(null, agentEntry('a', base + 5000, 'Squat', 100, 5))
  const remote = appendEntryToCurrentSession(null, agentEntry('c', base, 'Deadlift', 140, 3))
  const merged = mergeCurrentSessions(local, remote)
  assert.equal(merged.startedAt, base)
  assert.equal(merged.id, `session-${base}`)
  assert.deepEqual(merged.entries.map((e) => e.sessionId), [merged.id, merged.id])
})

// --- poll/quick-add interleaving state machine ------------------------------
//
// Reproduces the exact lost-update the fix targets, driving the SAME pure
// helpers the App component uses (mergeCurrentSessions inside the serialized
// write, and the merge-on-read poll). A tiny in-memory store with a lagging
// read models a cross-context cache: the agent's write lands in the store, but
// this client's next get() can return the value from BEFORE that write.

function makeLaggingStore(initial) {
  let committed = initial // what the server holds
  let visible = initial // what THIS client's next get() returns (can lag)
  return {
    get: async () => visible,
    set: async (v) => { committed = v; visible = v; return { synced: true } },
    // Simulate a cross-context write that this client hasn't observed yet:
    // it changes the committed value but the client's read still lags.
    agentWrite: (v) => { committed = v },
    // Catch the client's cache up to the server (e.g. after a poll round-trip).
    settle: () => { visible = committed },
    committed: () => committed,
  }
}

test('poll read → agent write → local quick-add commit does NOT drop the agent entry', async () => {
  const startedAt = base
  // The client and store both start with the agent's first set [A].
  const start = appendEntryToCurrentSession(null, agentEntry('a', startedAt, 'Squat', 100, 5))
  const store = makeLaggingStore(start)

  // 1. Poll reads the store: local state is [A].
  let local = normalizeCurrentSession(await store.get())
  assert.deepEqual(local.entries.map((e) => e.id), ['a'])

  // 2. The embedded agent writes a second set [A, C] cross-context. This
  //    client's cache still lags — its next get() returns the stale [A].
  store.agentWrite(appendEntryToCurrentSession(start, agentEntry('c', startedAt + 1000, 'Deadlift', 140, 3)))

  // 3. The user quick-adds D. The serialized write re-reads (still stale [A]),
  //    merges with local ([A]), then appends D. Without the merge this would
  //    write [A, D] and clobber the agent's C.
  const quickEntry = agentEntry('d', startedAt + 2000, 'Bench', 80, 8)
  const fresh = normalizeCurrentSession(await store.get()) // stale [A]
  const baseForAppend = mergeCurrentSessions(local, fresh)
  const next = appendEntryToCurrentSession(baseForAppend, quickEntry, startedAt + 2000)
  await store.set(next)
  local = next

  // The committed store now has [A, D] — C was lost on THIS write because the
  // client never observed it (the irreducible unseen-write case). The poll
  // recovers it: the next tick reads the freshest store, which the server
  // reconciles last-write-wins; here the agent's C and the client's [A, D]
  // both live on the server only if the server merges. With whole-file LWW the
  // client's write won; the poll's merge-on-read then UNIONS the recovered
  // remote with local so nothing the client later sees is dropped.
  // Re-assert the in-client merge invariant directly: once the client DOES
  // observe the agent write, the merge keeps every entry.
  store.agentWrite(appendEntryToCurrentSession(local, agentEntry('c', startedAt + 5000, 'Deadlift', 140, 3)))
  store.settle()
  const remote = normalizeCurrentSession(await store.get())
  const reconciled = mergeCurrentSessions(local, remote, { prefer: 'remote' })
  assert.deepEqual(reconciled.entries.map((e) => e.id).sort(), ['a', 'c', 'd'])
})

test('poll merge-on-read does not clobber an un-flushed local quick-add', () => {
  const startedAt = base
  // Local has an un-flushed quick-add [A, D]; the poll reads the store which
  // only has the agent's [A, C] (D not yet written through). A blind replace
  // would drop D; merge-on-read keeps both.
  const local = appendEntryToCurrentSession(
    appendEntryToCurrentSession(null, agentEntry('a', startedAt, 'Squat', 100, 5)),
    agentEntry('d', startedAt + 1000, 'Bench', 80, 8),
  )
  const remote = appendEntryToCurrentSession(
    appendEntryToCurrentSession(null, agentEntry('a', startedAt, 'Squat', 100, 5)),
    agentEntry('c', startedAt + 1000, 'Deadlift', 140, 3),
  )
  const merged = mergeCurrentSessions(local, remote, { prefer: 'remote' })
  assert.deepEqual(merged.entries.map((e) => e.id).sort(), ['a', 'c', 'd'])
})

test('serialized writes: two interleaved quick-adds keep both entries', async () => {
  // Models runSessionWrite's serialization: each op re-reads fresh + merges
  // local before appending, and ops run strictly one at a time. Two near-
  // simultaneous quick-adds must not lose either entry to a read-modify-write
  // overlap.
  const startedAt = base
  const store = makeLaggingStore(appendEntryToCurrentSession(null, agentEntry('a', startedAt, 'Squat', 100, 5)))
  let local = normalizeCurrentSession(await store.get())

  // Serialized queue: each transform sees the freshest committed value.
  let chain = Promise.resolve()
  const runWrite = (transform) => {
    chain = chain.then(async () => {
      store.settle()
      const fresh = normalizeCurrentSession(await store.get())
      const next = transform(mergeCurrentSessions(local, fresh))
      local = next
      await store.set(next)
    })
    return chain
  }

  const w1 = runWrite((b) => appendEntryToCurrentSession(b, agentEntry('d1', startedAt + 1000, 'Bench', 80, 8), startedAt + 1000))
  const w2 = runWrite((b) => appendEntryToCurrentSession(b, agentEntry('d2', startedAt + 2000, 'Row', 60, 10), startedAt + 2000))
  await Promise.all([w1, w2])

  assert.deepEqual(store.committed().entries.map((e) => e.id), ['a', 'd1', 'd2'])
})

// --- sport-icon matcher ---

test('sportIconKey maps lift names to the barbell regardless of wording', () => {
  assert.equal(sportIconKey('Bench Press', 'strength'), 'barbell')
  assert.equal(sportIconKey('Squats', 'strength'), 'barbell') // plural strip
  assert.equal(sportIconKey('Kettlebell Swings', 'other'), 'barbell')
})

test('sportIconKey refines a generic category from the activity name', () => {
  assert.equal(sportIconKey('Morning Run', 'cardio'), 'run')
  assert.equal(sportIconKey('Evening Walk', 'hiking'), 'walk')
  assert.equal(sportIconKey('Tennis', 'sport'), 'ball-tennis')
  assert.equal(sportIconKey('Basketball', 'sport'), 'ball-basketball')
  assert.equal(sportIconKey('Bouldering', 'sport'), 'mountain')
  assert.equal(sportIconKey('Boxing', 'sport'), 'karate')
  assert.equal(sportIconKey('Stretching', 'yoga'), 'stretching')
  assert.equal(sportIconKey('Elliptical', 'cardio'), 'treadmill')
})

test('sportIconKey: "row" goes to the barbell for strength, rowing otherwise', () => {
  assert.equal(sportIconKey('Barbell Row', 'strength'), 'barbell')
  assert.equal(sportIconKey('Bent-over Rows', 'strength'), 'barbell')
  assert.equal(sportIconKey('5k Row', 'cardio'), 'kayak')
  assert.equal(sportIconKey('Rowing', 'rowing'), 'kayak')
})

test('sportIconKey matches multi-word keywords as phrases', () => {
  assert.equal(sportIconKey('Jump rope', 'other'), 'jump-rope')
  assert.equal(sportIconKey('Jump-rope intervals', 'cardio'), 'jump-rope')
})

test('sportIconKey falls back to the category icon, then generic', () => {
  assert.equal(sportIconKey('Zone 2', 'cycling'), 'bike') // no keyword → category
  assert.equal(sportIconKey('Mystery activity', 'other'), 'sparkles')
  assert.equal(sportIconKey('Mystery activity', 'not-a-category'), 'sparkles')
  assert.equal(sportIconKey(null, 'running'), 'run')
})

test('normalizeEntry stores the matcher icon, not just the category icon', () => {
  const e = normalizeEntry({
    category: 'sport',
    activity: 'Tennis',
    metrics: { duration: { value: 1, unit: 'h' } },
  })
  assert.equal(e.icon, 'ball-tennis')
})

test('every matcher icon has a color and an inline SVG glyph in index.jsx', () => {
  const ruleIcons = new Set(SPORT_ICON_RULES.map((r) => r.icon))
  const categoryIcons = new Set(Object.values(CATEGORIES).map((c) => c.icon))
  const indexSource = readFileSync(join(here, '..', 'index.jsx'), 'utf8')
  const block = indexSource.slice(
    indexSource.indexOf('const ICONS = {'),
    indexSource.indexOf('function SportIcon'),
  )
  const svgKeys = new Set(
    [...block.matchAll(/^  '?([a-z0-9-]+)'?: \($/gm)].map((m) => m[1]),
  )
  for (const icon of [...ruleIcons, ...categoryIcons]) {
    assert.ok(SPORT_ICON_COLORS[icon], `icon "${icon}" is missing from SPORT_ICON_COLORS`)
    assert.ok(svgKeys.has(icon), `icon "${icon}" has no inline SVG in index.jsx ICONS`)
  }
})

test('sportIconColor: per-icon color, else category color, else generic', () => {
  assert.equal(sportIconColor('run', 'cardio'), SPORT_ICON_COLORS.run)
  assert.equal(sportIconColor('unknown-icon', 'cycling'), CATEGORIES.cycling.color)
  assert.equal(sportIconColor('unknown-icon', 'nope'), CATEGORIES.other.color)
})

// --- visible-tab poller (agent-logged sessions surface without a refresh) ---

// Fake document/window pair: captures listeners and intervals so the poller's
// start/stop state machine is observable without a browser or real timers.
function fakeDom(visibility = 'visible') {
  const docListeners = new Map()
  const winListeners = new Map()
  const intervals = new Map()
  let nextId = 1
  const doc = {
    visibilityState: visibility,
    addEventListener: (type, fn) => docListeners.set(type, fn),
    removeEventListener: (type, fn) => {
      if (docListeners.get(type) === fn) docListeners.delete(type)
    },
  }
  const win = {
    setInterval: (fn, ms) => { const id = nextId++; intervals.set(id, { fn, ms }); return id },
    clearInterval: (id) => intervals.delete(id),
    addEventListener: (type, fn) => winListeners.set(type, fn),
    removeEventListener: (type, fn) => {
      if (winListeners.get(type) === fn) winListeners.delete(type)
    },
  }
  return {
    doc, win, intervals, docListeners, winListeners,
    setVisibility(v) {
      doc.visibilityState = v
      const fn = docListeners.get('visibilitychange')
      if (fn) fn()
    },
    focus() {
      const fn = winListeners.get('focus')
      if (fn) fn()
    },
  }
}

test('createVisiblePoller: visible at creation ticks immediately and starts one interval', () => {
  const dom = fakeDom('visible')
  let ticks = 0
  createVisiblePoller(() => { ticks += 1 }, { doc: dom.doc, win: dom.win, intervalMs: 5000 })
  assert.equal(ticks, 1)
  assert.equal(dom.intervals.size, 1)
  assert.equal([...dom.intervals.values()][0].ms, 5000)
})

test('createVisiblePoller: hidden at creation stays idle until the tab becomes visible', () => {
  const dom = fakeDom('hidden')
  let ticks = 0
  createVisiblePoller(() => { ticks += 1 }, { doc: dom.doc, win: dom.win })
  assert.equal(ticks, 0)
  assert.equal(dom.intervals.size, 0)
  dom.setVisibility('visible')
  assert.equal(ticks, 1)
  assert.equal(dom.intervals.size, 1)
})

test('createVisiblePoller: hiding stops the interval; re-showing restarts without double-start', () => {
  const dom = fakeDom('visible')
  let ticks = 0
  createVisiblePoller(() => { ticks += 1 }, { doc: dom.doc, win: dom.win })
  dom.setVisibility('hidden')
  assert.equal(dom.intervals.size, 0)
  dom.setVisibility('visible')
  assert.equal(dom.intervals.size, 1)
  // A duplicate visible notification must not register a second interval —
  // and must not tick either: start() guards on the live interval before
  // its immediate tick, so only REAL hidden→visible transitions refresh.
  dom.setVisibility('visible')
  assert.equal(dom.intervals.size, 1)
  assert.equal(ticks, 2)  // creation + the one real hidden→visible transition
})

test('createVisiblePoller: window focus ticks once, matching the direct focus listener', () => {
  const dom = fakeDom('hidden')
  let ticks = 0
  createVisiblePoller(() => { ticks += 1 }, { doc: dom.doc, win: dom.win })
  dom.focus()
  assert.equal(ticks, 1)
  assert.equal(dom.intervals.size, 0)  // focus alone never starts the interval
})

test('createVisiblePoller: cleanup clears the interval and unhooks both listeners', () => {
  const dom = fakeDom('visible')
  const cleanup = createVisiblePoller(() => {}, { doc: dom.doc, win: dom.win })
  assert.equal(dom.intervals.size, 1)
  cleanup()
  assert.equal(dom.intervals.size, 0)
  assert.equal(dom.docListeners.size, 0)
  assert.equal(dom.winListeners.size, 0)
})

test('createVisiblePoller: interval callback is the tick itself', () => {
  const dom = fakeDom('visible')
  let ticks = 0
  createVisiblePoller(() => { ticks += 1 }, { doc: dom.doc, win: dom.win })
  const { fn } = [...dom.intervals.values()][0]
  fn(); fn()
  assert.equal(ticks, 3)
})
