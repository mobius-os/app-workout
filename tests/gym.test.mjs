import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const esbuild = '/home/hmzmrzx/projects/mobius/frontend/node_modules/.bin/esbuild'
const nodePath = '/home/hmzmrzx/projects/mobius/frontend/node_modules'
mkdirSync(new URL('./.build/', import.meta.url), { recursive: true })
execFileSync(esbuild, [
  '--bundle',
  '--format=esm',
  '--jsx=automatic',
  '--platform=node',
  'index.jsx',
  '--outfile=tests/.build/index.mjs',
], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, NODE_PATH: nodePath },
  stdio: 'pipe',
})

const {
  normalizeEntry,
  normalizeStoredEntries,
  groupSessions,
  summarizeMetrics,
} = await import('./.build/index.mjs')

test('normalizeEntry guards timestamps and maps strength metrics to stored SI shape', () => {
  const before = Date.now()
  const entry = normalizeEntry({
    category: 'strength',
    activity: ' Bench ',
    icon: 'ignored',
    metrics: {
      sets: [
        { weight: 80, reps: 5.2, unit: 'kg' },
        { weight: 225, reps: 3, unit: 'lb' },
        { weight: -10, reps: -2, unit: 'kg' },
      ],
    },
  }, { ts: Number.NaN, id: 'fixed' })
  const after = Date.now()

  assert.equal(entry.id, 'fixed')
  assert.ok(entry.ts >= before && entry.ts <= after)
  assert.equal(entry.category, 'strength')
  assert.equal(entry.activity, 'Bench')
  assert.equal(entry.icon, 'barbell')
  assert.deepEqual(entry.metrics.sets[0], { weight_kg: 80, reps: 5, unit: 'kg' })
  assert.ok(Math.abs(entry.metrics.sets[1].weight_kg - 102.06) < 0.01)
  assert.deepEqual(entry.metrics.sets[2], { weight_kg: 0, reps: 0, unit: 'kg' })
})

test('normalizeEntry maps cardio and other metric shapes without trusting malformed categories', () => {
  const run = normalizeEntry({
    category: 'running',
    activity: 'Run',
    metrics: {
      duration: { value: 25, unit: 'min' },
      distance: { value: 5, unit: 'km' },
      elevation: { value: 200, unit: 'm' },
      location: 'Track',
    },
  }, { ts: 1_700_000_000_000 })
  assert.deepEqual(run.metrics, {
    duration_s: 1500,
    distance_m: 5000,
    elevation_m: 200,
    location: 'Track',
  })

  const other = normalizeEntry({
    category: 'mystery',
    activity: '',
    metrics: {
      duration: { value: 1.5, unit: 'h' },
      location: 'Studio',
      note: 'mobility',
    },
  }, { ts: 1_700_000_000_000 })
  assert.equal(other.category, 'other')
  assert.equal(other.activity, 'Other')
  assert.deepEqual(other.metrics, {
    duration_s: 5400,
    location: 'Studio',
    note: 'mobility',
  })
})

test('normalizeStoredEntries rejects sparse malformed rows and normalizes all three shapes', () => {
  const entries = normalizeStoredEntries([
    null,
    { ts: Infinity, category: 'running' },
    {
      id: '',
      ts: 300,
      category: 'strength',
      activity: '',
      metrics: { sets: [{ weight: 100, reps: 5, unit: 'kg' }, { weight_kg: -1, reps: 0 }] },
    },
    {
      id: 'cardio',
      ts: 100,
      category: 'cycling',
      metrics: { duration_s: '1800', distance_m: '10000', elevation_m: -10, location: '  Road  ' },
    },
    {
      id: 'other',
      ts: 200,
      category: 'yoga',
      metrics: { duration_s: '3600', location: '  Home  ', note: '  easy  ' },
      confirmed: false,
    },
  ])

  assert.equal(entries.length, 3)
  assert.deepEqual(entries.map((entry) => entry.id), ['cardio', 'other', entries[2].id])
  assert.deepEqual(entries[0].metrics, {
    duration_s: 1800,
    distance_m: 10000,
    elevation_m: null,
    location: 'Road',
  })
  assert.deepEqual(entries[1].metrics, {
    duration_s: 3600,
    location: 'Home',
    note: 'easy',
  })
  assert.equal(entries[1].confirmed, false)
  assert.deepEqual(entries[2].metrics.sets, [{ weight_kg: 100, reps: 5, unit: 'kg' }])
})

test('groupSessions uses forward-contiguous gap boundaries and rejects non-finite timestamps', () => {
  const base = 1_700_000_000_000
  const gap = 60_000
  const entries = [
    { id: 'later', ts: base + gap * 2, sessionId: 's-2', category: 'running' },
    { id: 'bad', ts: Number.NaN, sessionId: 'bad', category: 'running' },
    { id: 'start', ts: base, sessionId: 's-1', category: 'strength' },
    { id: 'boundary', ts: base + gap, sessionId: 's-1', category: 'cardio' },
    { id: 'explicit-split', ts: base + gap + 1, sessionId: 'manual', category: 'other' },
  ]

  const sessions = groupSessions(entries, gap)
  assert.equal(sessions.length, 3)
  assert.deepEqual(sessions[0].entries.map((entry) => entry.id), ['start', 'boundary'])
  assert.deepEqual(sessions[1].entries.map((entry) => entry.id), ['explicit-split'])
  assert.deepEqual(sessions[2].entries.map((entry) => entry.id), ['later'])
  assert.deepEqual(sessions[0].categories, ['strength', 'cardio'])
})

test('summarizeMetrics formats strength, cardio, and other entries', () => {
  assert.equal(summarizeMetrics({
    category: 'strength',
    metrics: { sets: [
      { weight_kg: 80, reps: 5, unit: 'kg' },
      { weight_kg: 80, reps: 5, unit: 'kg' },
      { weight_kg: 80, reps: 5, unit: 'kg' },
    ] },
  }), '3×5 @ 80kg')

  assert.equal(summarizeMetrics({
    category: 'running',
    metrics: { distance_m: 5000, duration_s: 1500 },
  }), '5.0km · 5:00/km · 25m')

  assert.equal(summarizeMetrics({
    category: 'yoga',
    metrics: { duration_s: 3600, location: 'Studio' },
  }), '1h · Studio')
})
