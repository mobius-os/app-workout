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
