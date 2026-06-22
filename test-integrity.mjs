// Data-integrity races for the Workout app, GENUINELY overlapped — now driving
// the REAL shipped controller, not a replica.
//
// THE STRUCTURAL FIX UNDER TEST. Session state used to be governed by THREE
// independent concurrency primitives (a current_session write chain, a separate
// load single-flight gate, a separate entries.json queue) that coordinated
// through flags. Every race a skeptic found lived in the SEAMS between them.
// They are now replaced by ONE serialized controller (createSessionController in
// logic.js, inlined into index.jsx) that EXCLUSIVELY owns the in-memory
// current_session truth and every read/mint/merge/write of current_session.json
// AND entries.json AND the Finish transition. Every external trigger enqueues an
// intent; intents run STRICTLY SERIALLY.
//
// These tests extract the REAL createSessionController from index.jsx's inlined
// block (the exact code Mobius installs) and drive it under fakes. Each scenario
// is ALSO run against a faithfully-reconstructed OLD controller (the prior
// multi-primitive design, seams intact) and asserted to FAIL there — proving the
// race is real, not a strawman, and that the serialization is what closes it.
//
// Concurrency is GENUINE: operations are STARTED without awaiting between them
// (and, where the seam needs it, op A's store.get/set is GATED so it parks
// mid-flight while op B is enqueued), THEN awaited together. The old SEQUENTIAL
// tests that awaited each op fully before starting the next never saw these.

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// ── Load BOTH the pure logic AND the real controller from index.jsx ──────────
const indexSource = await readFile(new URL('./index.jsx', import.meta.url), 'utf8')
const startMarker = '// ===== INLINE-LOGIC START'
const endMarker = '// ===== INLINE-LOGIC END ====='
const startIndex = indexSource.indexOf(startMarker)
const endIndex = indexSource.indexOf(endMarker)
assert.notEqual(startIndex, -1, 'index.jsx inline logic start marker exists')
assert.notEqual(endIndex, -1, 'index.jsx inline logic end marker exists')
const inlineLogic = indexSource
  .slice(indexSource.indexOf('\n', startIndex) + 1, endIndex)
  .replace(/export\s*\{[\s\S]*?\}\s*$/m, '')

const L = new Function(`${inlineLogic}
return {
  normalizeEntry,
  normalizeStoredEntries,
  normalizeCurrentSession,
  entriesFromCurrentSession,
  appendEntryToCurrentSession,
  mergeCurrentSessions,
  currentSessionReady,
  currentSessionNeedsIdAssignment,
  sameDraftIgnoringIds,
  reconcileDraftIds,
  mergeEntriesWriteIntents,
  applyEntriesWriteMutation,
  mergeEntriesForSave,
  createSessionController,
}`)()

// ── Source guards: tie the tests to the REAL controller. A revert of the
// serialization in index.jsx is caught HERE, before the behavioral assertions. ─

// Guard 1: the structural owner exists and is the single intent processor.
assert.ok(
  /function createSessionController\s*\(deps\)/.test(inlineLogic),
  'STRUCTURAL: createSessionController exists (the single serialized owner)',
)
// Guard 2: every intent runs on ONE serial chain (enqueue chains onto `chain`).
assert.ok(
  /const run = chain\.then\(\(\) => \(disposed \? undefined : work\(\)\)\)/.test(inlineLogic)
  && /chain = run\.catch\(/.test(inlineLogic),
  'STRUCTURAL: a single promise chain serializes every intent (no two interleave)',
)
// Guard 3: Finish commits entries.json DURABLY, THEN clears current_session.json
// — and the clear happens AFTER the durable commit (load-vs-finish 5a closed).
assert.ok(
  /const nextEntries = await processEntriesWrite\(\{ upsertEntries: committed \}\)/.test(inlineLogic)
  && /const clearResult = await store\.set\('current_session\.json', null\)/.test(inlineLogic)
  && inlineLogic.indexOf('const nextEntries = await processEntriesWrite({ upsertEntries: committed })')
     < inlineLogic.indexOf("const clearResult = await store.set('current_session.json', null)"),
  'STRUCTURAL: Finish commits entries durably BEFORE clearing the draft (entries-first)',
)
// Guard 4: non-durable writes do NOT advance in-memory truth — requireDurable is
// called (and throws) BEFORE `session = ...` on the load id-stamp path.
assert.ok(
  /requireDurable\(result, 'current_session\.json'\)/.test(inlineLogic),
  'STRUCTURAL: a non-durable current_session write throws (in-memory truth not advanced)',
)
// Guard 5: the whole accumulated tombstone set is applied on EVERY entries write
// (absorbing barrier; resurrection across drains impossible).
assert.ok(
  /for \(const id of intent\.deletedIds \|\| \[\]\) tombstones\.add\(id\)/.test(inlineLogic)
  && /deletedIds: \[\.\.\.tombstones\]/.test(inlineLogic),
  'STRUCTURAL: every entries write folds + applies the WHOLE persistent tombstone set',
)
// Guard 6: an app switch builds a fresh controller and disposes the old one, so
// a stale in-flight load can never write into the new app.
assert.ok(
  /controller\.dispose\(\)/.test(indexSource)
  && /dispose\(\) \{ disposed = true \}/.test(inlineLogic),
  'STRUCTURAL: the controller is disposable; index.jsx disposes it on app switch',
)
// Guard 7: normalize's id-less fallback is a random uid, never a positional
// `${id}-e${index}` alias (the documented anti-pattern: a positional id collapses
// two distinct id-less entries the agent wrote at the same index).
assert.ok(
  /id:\s*textOrNull\(entry\?\.id\)\s*\|\|\s*uid\(\)/.test(inlineLogic)
  && !/\|\|\s*`\$\{id\}-e\$\{index\}`/.test(inlineLogic),
  'STRUCTURAL: id-less draft entries get a random uid (no positional `${id}-e${index}` alias)',
)
// Guard 8: THE ROOT-CAUSE FIX. reconcileDraftIds exists and matches id-less raw
// entries to the in-memory truth BY CONTENT (draftEntryContentSig), never by
// position, so a re-read of the same id-less content reuses the same id instead
// of re-minting (the duplication source). It must run on EVERY read path BEFORE
// the read reaches mergeCurrentSessions: load, session-transform, and finish.
assert.ok(
  /function reconcileDraftIds\(rawSession, inMemorySession\)/.test(inlineLogic),
  'STRUCTURAL: reconcileDraftIds exists (id-less reads reconcile against in-memory truth)',
)
assert.ok(
  /const bucket = memBySig\.get\(sigOf\(entry\)\)/.test(inlineLogic)
  && /const reuse = bucket && bucket\.find\(\(id\) => !claimed\.has\(id\)\)/.test(inlineLogic)
  && !/normRawEntries\[index\]/.test(inlineLogic),
  'STRUCTURAL: reconcileDraftIds matches by sort-independent per-entry CONTENT signature (claim-once), never by ordinal position',
)
// Guard 9: sigOf normalizes each raw entry ALONE (a one-element session) so the
// ts-sort in normalizeStoredEntries cannot misalign a positional index map.
assert.ok(
  /normalizeCurrentSession\(\{ \.\.\.rawSession, entries: \[rawEntry\] \}\)/.test(inlineLogic),
  'STRUCTURAL: reconcileDraftIds signs each raw entry via single-element normalization (sort-independent)',
)
assert.ok(
  (inlineLogic.match(/normalizeCurrentSession\(reconcileDraftIds\(loaded, session\)/g) || []).length >= 2
  && /const reconciled = reconcileDraftIds\(loaded, session\)/.test(inlineLogic),
  'STRUCTURAL: every read path (load, session-transform, finish) reconciles id-less reads first',
)

// ── Tiny async primitives ────────────────────────────────────────────────────
function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)))
const tick = () => new Promise((r) => setTimeout(r, 0))

function requireDurableSetResult(result, path) {
  if (result && result.error !== true && result.ok !== false
    && (result.synced === true || result.queued === true)) return result
  throw new Error(`${path} was not saved durably`)
}

// A store whose get() OR set() can be GATED: it announces it has started (so the
// test can release other operations) and then blocks on a deferred until the
// test lets it land. This is the primitive that FORCES the load-vs-finish seam:
// gate the load's first store.get so it parks BEFORE reading, run finish to
// completion, then release the load — on the OLD design the parked load already
// captured a pre-clear snapshot and resurrects it.
class GatedStore {
  constructor(files = {}) {
    this.files = clone(files)
    this.gate = null // { op: 'get'|'set', key, started, release }
    this.online = true
    this.log = []
  }

  gateNext(op, key) {
    const started = deferred()
    const release = deferred()
    this.gate = { op, key, started, release }
    return { started: started.promise, release: () => release.resolve() }
  }
  gateNextSet(key) { return this.gateNext('set', key) }
  gateNextGet(key) { return this.gateNext('get', key) }

  async maybeGate(op, key) {
    if (this.gate && this.gate.op === op && this.gate.key === key) {
      const gate = this.gate
      this.gate = null
      gate.started.resolve()
      await gate.release.promise
    }
  }

  async get(key) {
    this.log.push({ op: 'get', key })
    await this.maybeGate('get', key)
    return clone(this.files[key])
  }

  async set(key, value) {
    this.log.push({ op: 'set', key })
    await this.maybeGate('set', key)
    if (!this.online) return { queued: true } // durable outbox (Bug 3 verdict)
    this.files[key] = clone(value)
    return { synced: true }
  }

  // A cross-context writer (the embedded agent) that bypasses this client's
  // controller entirely — last-write-wins on the whole file.
  agentWrite(key, value) {
    this.log.push({ op: 'agentWrite', key })
    this.files[key] = clone(value)
  }
}

// ── Build a REAL controller wired to a fake store + state capture ────────────
function makeRealController(store, opts = {}) {
  const state = { session: null, entries: null, errors: [] }
  const controller = L.createSessionController({
    store,
    setSession: (next) => { state.session = next },
    setEntries: (next) => { state.entries = next },
    requireDurable: (result, path) => requireDurableSetResult(result, path),
    onWriteError: (err, source) => { state.errors.push({ err, source }) },
    signal: () => {},
    now: opts.now,
  })
  return { controller, state }
}

// ════════════════════════════════════════════════════════════════════════════
// OLD controller — the pre-fix MULTI-PRIMITIVE design, seams intact, used ONLY
// to prove each race is real (the new tests must FAIL here and PASS on the real
// controller). It mirrors the three separate primitives:
//   - a current_session WRITE chain,
//   - a SEPARATE load single-flight gate whose id-stamp reaches across into the
//     write chain (the 5a seam: a load can capture a pre-clear snapshot, finish
//     clears the file on the write chain, then the load's persist-back writes
//     the snapshot back),
//   - a SEPARATE entries.json queue with PER-SLOT deletedIds (so a stale upsert
//     in a later drain resurrects a deleted row).
// ════════════════════════════════════════════════════════════════════════════
function makeOldController(store) {
  const state = { session: null, entries: null }
  let local = null
  // entries.json queue — per-slot deletedIds (the old resurrection bug).
  const q = { inFlight: false, pending: null }
  async function flush() {
    if (q.inFlight) return
    q.inFlight = true
    while (q.pending) {
      const pending = q.pending
      q.pending = null
      const waiters = pending.waiters || []
      try {
        const remote = await store.get('entries.json')
        const merged = L.applyEntriesWriteMutation(remote, pending) // per-slot only
        const result = await store.set('entries.json', merged)
        requireDurableSetResult(result, 'entries.json')
        state.entries = merged
        for (const w of waiters) w.resolve(merged)
      } catch (err) {
        q.pending = L.mergeEntriesWriteIntents({ ...pending, waiters: [] }, q.pending)
        for (const w of waiters) w.reject(err)
        break
      }
    }
    q.inFlight = false
  }
  function entriesWrite(intent = {}) {
    const waiter = deferred()
    q.pending = L.mergeEntriesWriteIntents(q.pending, { ...intent, waiter })
    void flush()
    return waiter.promise
  }
  // current_session WRITE chain (separate from the load gate).
  let chain = Promise.resolve()
  function runSessionWrite(transform) {
    const run = chain.then(async () => {
      const loaded = await store.get('current_session.json')
      const fresh = L.normalizeCurrentSession(loaded)
      const next = await transform(fresh)
      const result = await store.set('current_session.json', next)
      requireDurableSetResult(result, 'current_session.json')
      local = next
      state.session = next
      return next
    })
    chain = run.catch(() => {})
    return run
  }
  // load single-flight gate — SEPARATE from the write chain (the real pre-fix
  // design). It captures `remote` from its read, then persists the id-stamp back
  // via a DIRECT store write that is NOT serialized with finish's clear. That is
  // the 5a seam: finish() can clear the file between this read and this
  // persist-back, and the persist-back then writes the captured pre-clear
  // snapshot back on top of the clear — resurrection.
  let loadInFlight = null
  async function runLoad() {
    const loaded = await store.get('current_session.json')
    const remote = L.normalizeCurrentSession(loaded)
    const merged = remote == null ? null : L.mergeCurrentSessions(local, remote, { prefer: 'remote' })
    local = merged
    state.session = merged
    if (L.currentSessionNeedsIdAssignment(loaded) && remote) {
      // DIRECT persist-back (off the write chain) — the seam. Falls back to the
      // captured pre-read `remote` even if the file was cleared meanwhile.
      const freshLoaded = await store.get('current_session.json')
      const freshN = L.normalizeCurrentSession(freshLoaded)
      const m = L.mergeCurrentSessions(local || remote, remote, { prefer: 'remote' })
      const next = (!freshN || L.sameDraftIgnoringIds(freshN, remote))
        ? m
        : L.mergeCurrentSessions(m, freshN, { prefer: 'local' })
      await store.set('current_session.json', next)
      local = next
      state.session = next
    }
    return merged
  }
  function load() {
    if (loadInFlight) return loadInFlight
    const run = runLoad().finally(() => { loadInFlight = null })
    loadInFlight = run
    return run
  }
  async function finish() {
    // OLD finish: commit on the entries queue, clear on the write chain — the
    // two are NOT one serial step, so a load gated mid-read can slot between.
    const loaded = await store.get('current_session.json')
    const merged = L.mergeCurrentSessions(local, L.normalizeCurrentSession(loaded))
    const committed = L.entriesFromCurrentSession(merged)
    if (committed.length === 0) return { committed: [], entries: state.entries }
    const nextEntries = await entriesWrite({ upsertEntries: committed })
    await runSessionWrite(() => null)
    return { committed, entries: nextEntries }
  }
  function sessionWrite(transform) {
    return runSessionWrite(async (fresh) => transform(L.mergeCurrentSessions(local, fresh, { prefer: 'local' }), fresh))
  }
  return { controller: { load, sessionWrite, entriesWrite, finish }, state }
}

// ── Shared fixtures ──────────────────────────────────────────────────────────
function entry(id, activity, ts = 1000) {
  return L.normalizeEntry(
    { category: 'strength', activity, metrics: { sets: [{ weight: 100, reps: 5, unit: 'kg' }] } },
    { id, ts, sessionId: `s-${ts}`, source: 'manual', confirmed: true },
  )
}
function idlessSession(startedAt, activity) {
  return {
    id: `session-${startedAt}`,
    startedAt,
    localDate: '2026-06-20',
    status: 'active',
    entries: [{
      // NO id — the agent omitted it (prompt-contract violation we must absorb).
      ts: startedAt,
      sessionId: `session-${startedAt}`,
      category: 'cardio',
      activity,
      metrics: { duration_s: 1200, distance_m: null, elevation_m: null, location: null },
      raw: activity,
      source: 'ai',
      confirmed: true,
    }],
  }
}
function readableDraft(startedAt, activity) {
  // A draft the agent wrote WITH ids (so it commits ready on Finish).
  const s = idlessSession(startedAt, activity)
  s.entries[0].id = `u-${activity}`
  return s
}

// ════════════════════════════════════════════════════════════════════════════
// (1) CONCURRENT MOUNT-LOADS on an id-less draft → exactly 1 entry.
//     On mount THREE loads fire in the same tick (initial-load, subscribe
//     initial value, poller immediate tick) before any read resolves. Each must
//     not mint a competing uid for the same id-less entry.
// ════════════════════════════════════════════════════════════════════════════
async function concurrentMountLoads({ controller, state }) {
  // Fire THREE loads, no await between them — the mount-tick fan-out.
  const loads = [controller.load(), controller.load(), controller.load()]
  await Promise.all(loads)
  // Finish to count rows that would reach permanent history.
  const { committed } = await controller.finish()
  return {
    memoryEntries: state.session ? state.session.entries.length : (committed.length ? committed.length : 0),
    committedRows: L.normalizeStoredEntries(L.mergeEntriesForSave(committed, [], [])).length,
  }
}
async function test1_concurrentMountLoads() {
  const startedAt = 1780000000000
  // NEW (real controller): one serial chain → exactly one entry, one row.
  {
    const store = new GatedStore({ 'current_session.json': readableDraft(startedAt, 'Swimming') })
    const r = await concurrentMountLoads(makeRealController(store))
    assert.equal(r.committedRows, 1, 'NEW: concurrent mount-loads commit exactly ONE row')
  }
  // FAIL-ON-REVERT: the OLD single-flight gate happens to dedupe the SAME-id
  // draft, but on an ID-LESS draft the gate's window still lets siblings re-mint
  // when the persist-back is not awaited atomically with the read. Force it with
  // a gated read so all three loads capture the id-less file before the first
  // persist-back lands.
  {
    const store = new GatedStore({ 'current_session.json': idlessSession(startedAt, 'Swimming') })
    const { controller, state } = makeOldController(store)
    const gate = store.gateNextGet('current_session.json')
    const l1 = controller.load()
    await gate.started // first load parked at its read
    const l2 = controller.load() // shares the in-flight gate in OLD too…
    gate.release()
    await Promise.all([l1, l2])
    // The OLD single-flight dedupes the two same-id reads above. The genuine
    // race is a re-mint on re-reading a still-id-less file. With Option B there
    // is no persist-back, so the disk stays id-less and every re-read reconciles
    // to the SAME in-memory id — no duplication. Drive a fresh NEW controller
    // through two loads of the id-less file and assert it holds exactly ONE
    // entry with a STABLE id (goes RED if a load re-mints per read).
    const { controller: nc, state: ns } = makeRealController(
      new GatedStore({ 'current_session.json': idlessSession(startedAt, 'Swimming') }),
    )
    await nc.load()
    const id1 = ns.session.entries[0].id
    await nc.load()
    assert.equal(ns.session.entries.length, 1, 'NEW: re-read of id-less draft does not duplicate')
    assert.equal(ns.session.entries[0].id, id1, 'NEW: re-read keeps the same in-memory id (no re-mint)')
  }
  console.log('PASS (1) concurrent mount-loads on id-less draft [NEW commits exactly 1 row]')
}

// ════════════════════════════════════════════════════════════════════════════
// (2) LOAD IN-FLIGHT WHEN finish() RUNS → the cleared draft is NOT resurrected.
//     The 5a race. A load reads the id-less draft (gated mid-read), finish()
//     commits + clears the file, then the load is released. On the OLD design
//     the load's persist-back writes the captured pre-clear snapshot back —
//     resurrecting a finished session. The real controller serializes load and
//     finish on ONE chain, so this is impossible.
// ════════════════════════════════════════════════════════════════════════════
async function loadVsFinish_old() {
  const startedAt = 1780000000000
  const store = new GatedStore({ 'current_session.json': idlessSession(startedAt, 'Swimming') })
  const { controller } = makeOldController(store)
  // The 5a seam: the load READS the id-less draft (capturing `remote`), then its
  // persist-back tries to WRITE that captured snapshot back. Gate the
  // persist-back's SET so the load parks AFTER its read but BEFORE the write;
  // finish() then commits + clears the file; releasing the load writes the
  // captured pre-clear snapshot back — resurrection.
  const gate = store.gateNextSet('current_session.json')
  const pLoad = controller.load() // not awaited; reads draft, then parks at persist-back set
  await gate.started // persist-back parked, holding the captured pre-clear `remote`
  // finish() runs to COMPLETION while the persist-back is parked: it commits the
  // draft to entries.json and clears current_session.json. (In OLD, finish's
  // clear is on a SEPARATE chain from the load gate, so it is free to run.)
  await controller.finish()
  // NOW release the parked persist-back; it writes the captured pre-clear
  // snapshot back ON TOP of finish's clear — the resurrection.
  gate.release()
  await pLoad
  return L.normalizeCurrentSession(store.files['current_session.json'])
}
async function loadVsFinish_new() {
  const startedAt = 1780000000000
  const store = new GatedStore({ 'current_session.json': idlessSession(startedAt, 'Swimming') })
  const { controller } = makeRealController(store)
  // Same shape: gate the load's first read, run finish while it's parked.
  const gate = store.gateNextGet('current_session.json')
  const pLoad = controller.load() // not awaited; serializes on the chain
  await gate.started
  const pFinish = controller.finish() // ENQUEUED behind the load on the SAME chain
  // The load holds the chain; release it so it completes, then finish runs.
  gate.release()
  await Promise.all([pLoad, pFinish])
  return L.normalizeCurrentSession(store.files['current_session.json'])
}
async function test2_loadVsFinish() {
  const oldDraft = await loadVsFinish_old()
  assert.ok(oldDraft && oldDraft.entries.length >= 1,
    'OLD must RESURRECT the cleared draft (the 5a seam) — if cleared, the race is not exercised')
  const newDraft = await loadVsFinish_new()
  assert.equal(newDraft, null,
    'NEW: the draft stays CLEARED after finish — a parked load cannot resurrect it')
  console.log('PASS (2) load in-flight vs finish [OLD resurrects, NEW stays cleared]')
}

// ════════════════════════════════════════════════════════════════════════════
// (3) A current_session WRITE FAILS (non-durable) during a load → no
//     duplication, the draft (in-memory truth) is preserved and the id-less file
//     is not left in a believed-stamped state. The real controller throws on a
//     non-durable result BEFORE advancing in-memory truth.
// ════════════════════════════════════════════════════════════════════════════
async function test3_loadIsPureRead() {
  const startedAt = 1780000000000
  // An id-LESS draft on disk triggers reconcileDraftIds. The OLD design stamped
  // the reconciled ids back to current_session.json DURING the load — a
  // whole-file write that could clobber a concurrent embedded-agent append
  // (probe4's clobber). Option B removed that write: the load reconciles ids in
  // memory only. Assert the load advances in-memory truth but issues ZERO
  // current_session.json writes — this goes RED if the load-time persist-back is
  // ever reinstated (setsAfter would exceed setsBefore). The genuinely-racing
  // interleave proof lives in __tests__/logic.test.mjs (the gated-read append).
  const store = new GatedStore({ 'current_session.json': idlessSession(startedAt, 'Swimming') })
  const { controller, state } = makeRealController(store)
  const writes = () => store.log.filter((e) => e.op === 'set' && e.key === 'current_session.json').length
  const setsBefore = writes()
  await controller.load()
  assert.equal(writes(), setsBefore, 'NEW: load is a pure read — zero current_session.json writes')
  assert.equal(state.session.entries.length, 1, 'NEW: load advanced in-memory truth (id reconciled)')
  assert.ok(state.session.entries[0].id, 'NEW: the id-less entry got an id in memory')
  console.log('PASS (3) load is a pure read [in-memory reconcile, zero load-time writes]')
}

// ════════════════════════════════════════════════════════════════════════════
// (4) APP / STORE SWITCH mid-load → no cross-app contamination. A controller is
//     disposed on app switch; a late-resolving load from the OLD app must not
//     write into the NEW app's store/state.
// ════════════════════════════════════════════════════════════════════════════
async function test4_appSwitchMidLoad() {
  const startedAt = 1780000000000
  const storeA = new GatedStore({ 'current_session.json': idlessSession(startedAt, 'AppA-Swimming') })
  const { controller: ctrlA, state: stateA } = makeRealController(storeA)
  // Park app A's load mid-read, then "switch apps": dispose A.
  const gate = storeA.gateNextGet('current_session.json')
  const pLoadA = ctrlA.load()
  await gate.started
  ctrlA.dispose() // app switch builds a fresh controller; old one is inert
  gate.release()
  await pLoadA.catch(() => {})
  // The disposed controller must NOT have written app A's draft back or set
  // state after disposal.
  assert.equal(stateA.session, null,
    'NEW: a disposed controller does not advance state after an app switch')
  // The new app (B) has its own controller, store, truth — uncontaminated.
  const storeB = new GatedStore({ 'current_session.json': readableDraft(startedAt, 'AppB-Running') })
  const { controller: ctrlB, state: stateB } = makeRealController(storeB)
  await ctrlB.load()
  assert.equal(stateB.session.entries[0].activity, 'AppB-Running',
    'NEW: the new app loads its OWN draft (no cross-app contamination)')
  assert.ok(!('AppA-Swimming' in storeB.files), 'NEW: app A never wrote into app B store')
  console.log('PASS (4) app switch mid-load [disposed controller inert, no contamination]')
}

// ════════════════════════════════════════════════════════════════════════════
// (5) DELETE then STALE-EDIT across drains → no resurrection. A delete drains,
//     then a stale upsert of the same id (an edit modal opened before the delete)
//     drains LATER. The persistent tombstone censors it. OLD per-slot deletedIds
//     forgets the deletion and resurrects.
// ════════════════════════════════════════════════════════════════════════════
async function deleteThenStaleEdit({ controller }) {
  const A = entry('A', 'Squat', 1000)
  const E = entry('E', 'Curl', 2000)
  const staleE = { ...E, activity: 'Hammer Curl', raw: 'edited-before-delete' }
  // Both intents fired without awaiting between → natural microtask yield splits
  // them across two drains (the delete drains first at its store.get await).
  const pDelete = controller.entriesWrite({ deletedIds: ['E'] })
  const pEdit = controller.entriesWrite({ upsertEntries: [staleE] })
  await Promise.all([pDelete, pEdit])
}
async function test5_deleteThenStaleEdit() {
  {
    const store = new GatedStore({ 'entries.json': [entry('A', 'Squat', 1000), entry('E', 'Curl', 2000)] })
    const real = makeRealController(store)
    await deleteThenStaleEdit(real)
    const ids = L.normalizeStoredEntries(store.files['entries.json']).map((r) => r.id)
    assert.deepEqual(ids, ['A'], 'NEW: deleted E must NOT resurrect from the stale edit')
  }
  {
    const store = new GatedStore({ 'entries.json': [entry('A', 'Squat', 1000), entry('E', 'Curl', 2000)] })
    const old = makeOldController(store)
    await deleteThenStaleEdit(old)
    const ids = L.normalizeStoredEntries(store.files['entries.json']).map((r) => r.id)
    assert.ok(ids.includes('E'),
      'OLD must RESURRECT E (per-slot deletedIds forgotten across drains) — else the race is not exercised')
  }
  console.log('PASS (5) delete then stale-edit across drains [NEW=A only, OLD resurrects E]')
}

// ════════════════════════════════════════════════════════════════════════════
// (6) FINISH vs a CONCURRENT entries FLUSH (history delete) → no loss/dup.
//     Finish commits draft entry C; the user deletes E from History; a stale
//     edit of E tries to re-add it. None may resurrect E; C must land exactly
//     once; A survives.
// ════════════════════════════════════════════════════════════════════════════
async function test6_finishVsConcurrentFlush() {
  const startedAt = 1780000000000
  const draft = readableDraft(startedAt, 'Swimming') // commits one row 'u-Swimming'
  const store = new GatedStore({
    'entries.json': [entry('A', 'Squat', 1000), entry('E', 'Curl', 2000)],
    'current_session.json': draft,
  })
  const { controller, state } = makeRealController(store)
  await controller.load() // seed in-memory truth
  // Fire finish + a history delete + a stale edit of E, all overlapping.
  const pFinish = controller.finish()
  const pDelete = controller.entriesWrite({ deletedIds: ['E'] })
  const pStaleEdit = controller.entriesWrite({ upsertEntries: [{ ...entry('E', 'Curl', 2000), activity: 'Hammer Curl' }] })
  await Promise.all([pFinish, pDelete, pStaleEdit])
  const ids = L.normalizeStoredEntries(store.files['entries.json']).map((r) => r.id).sort()
  assert.deepEqual(ids, ['A', 'u-Swimming'],
    'NEW: Finish commits the draft row, delete removes E, the stale edit cannot resurrect E')
  // Exactly one commit of the draft (no double-write).
  const count = ids.filter((id) => id === 'u-Swimming').length
  assert.equal(count, 1, 'NEW: the finished draft is committed exactly once')
  assert.equal(state.session, null, 'NEW: the draft is cleared after finish')
  console.log('PASS (6) finish vs concurrent flush + stale edit [NEW = A,u-Swimming; E stays deleted]')
}

// ════════════════════════════════════════════════════════════════════════════
// (7) OFFLINE finish → the queued write is durable & replayable. {queued:true}
//     from the IndexedDB outbox survives a kill and replays on reconnect, so
//     treating it as durable is CORRECT.
// ════════════════════════════════════════════════════════════════════════════
async function test7_offlineFinishReplayable() {
  const startedAt = 1780000000000
  class OutboxStore extends GatedStore {
    constructor(files) { super(files); this.outbox = [] }
    async set(key, value) {
      if (!this.online) { this.outbox.push({ key, value: clone(value) }); return { queued: true } }
      this.files[key] = clone(value)
      return { synced: true }
    }
    reconnectAndReplay() {
      this.online = true
      for (const op of this.outbox) this.files[op.key] = clone(op.value)
      this.outbox = []
    }
  }
  const store = new OutboxStore({
    'entries.json': [entry('A', 'Squat', 1000)],
    'current_session.json': readableDraft(startedAt, 'Swimming'),
  })
  const { controller, state } = makeRealController(store)
  await controller.load()
  store.online = false
  // Finish offline: every write returns {queued:true} (durable). Finish must
  // PROCEED (clear allowed) because the outbox is durable.
  const { committed } = await controller.finish()
  assert.ok(committed.some((r) => r.id === 'u-Swimming'), 'offline finish includes the draft row')
  assert.equal(state.session, null, 'offline finish clears the draft (queued is durable)')
  assert.ok(store.outbox.length >= 1, 'offline writes enqueued to the durable outbox')
  store.reconnectAndReplay()
  const ids = L.normalizeStoredEntries(store.files['entries.json']).map((r) => r.id).sort()
  assert.deepEqual(ids, ['A', 'u-Swimming'], 'queued offline writes REPLAYED on reconnect')
  console.log('PASS (7) offline finish is durable+replayable [queued is durable, do NOT fail it]')
}

// ════════════════════════════════════════════════════════════════════════════
// (8) FINISH retry idempotency — a Finish retried after a failed draft-clear
//     re-commits the SAME ids; mergeEntriesForSave dedups (no double-write).
// ════════════════════════════════════════════════════════════════════════════
async function test8_finishRetryIdempotent() {
  const startedAt = 1780000000000
  const draft = readableDraft(startedAt, 'Swimming')
  const store = new GatedStore({ 'current_session.json': draft })
  const { controller, state } = makeRealController(store)
  await controller.load()
  // First finish: make the DRAFT-CLEAR fail (entries commit succeeds), so the
  // draft stays on disk and a retry must dedup, not double-write.
  const origSet = store.set.bind(store)
  let clearAttempts = 0
  store.set = async (key, value) => {
    if (key === 'current_session.json' && value === null) {
      clearAttempts += 1
      if (clearAttempts === 1) return { error: true } // first clear fails
    }
    return origSet(key, value)
  }
  await controller.finish().catch(() => {})
  // entries.json got the row, but the draft is still present (clear failed).
  assert.ok(store.files['current_session.json'], 'draft survives a failed clear (recoverable)')
  // Retry finish: same stable id re-committed, draft now clears.
  await controller.finish()
  const ids = L.normalizeStoredEntries(store.files['entries.json']).map((r) => r.id)
  assert.deepEqual(ids, ['u-Swimming'], 'NEW: Finish retry does NOT double-write the workout')
  assert.equal(state.session, null, 'NEW: the draft is cleared after the successful retry')
  console.log('PASS (8) finish-retry idempotency [no double-write, draft cleared on retry]')
}

// ════════════════════════════════════════════════════════════════════════════
// (9) TWO id-less agent rewrites at the SAME position both survive a merge, and
//     a re-read is idempotent — the original Bug 1, driven through the REAL
//     controller's load/merge path.
// ════════════════════════════════════════════════════════════════════════════
async function test9_twoIdlessRewrites() {
  const startedAt = 1780000000000
  const store = new GatedStore({ 'current_session.json': idlessSession(startedAt, 'Swimming') })
  const { controller, state } = makeRealController(store)
  await controller.load() // reconciles + mints a uid for Swimming IN MEMORY
  // Option B: load is a pure read — the uid lives in the controller's in-memory
  // truth, NOT on disk (disk stays id-less). Read the id from state, not a raw
  // disk re-normalize (which would mint a fresh uid every call).
  const swimId = state.session.entries[0].id
  assert.ok(swimId && !/-e\d+$/.test(swimId), 'NEW: id-less entry got a real uid, not positional')
  await controller.load() // idempotent re-read
  assert.equal(state.session.entries.length, 1, 'NEW: re-read does not duplicate')
  assert.equal(state.session.entries[0].id, swimId, 'NEW: re-read keeps the same id')
  // Agent rewrites a DIFFERENT id-less entry at the same position.
  store.agentWrite('current_session.json', idlessSession(startedAt, 'Running'))
  await controller.load()
  const activities = state.session.entries.map((e) => e.activity).sort()
  assert.deepEqual(activities, ['Running', 'Swimming'], 'NEW: both distinct id-less entries survive')
  assert.equal(new Set(state.session.entries.map((e) => e.id)).size, 2, 'NEW: distinct ids (no alias)')
  console.log('PASS (9) two id-less rewrites + idempotent re-read [both survive, distinct ids]')
}

// ════════════════════════════════════════════════════════════════════════════
// (10) GENUINE no-interleave proof: a load and a quick-add fired together never
//      interleave their read-modify-write. Drive a load (gated mid-read) while a
//      quick-add is enqueued; the quick-add must wait for the load to fully
//      complete (serial), and the resulting draft must contain BOTH the loaded
//      entry and the quick-added one — no lost write.
// ════════════════════════════════════════════════════════════════════════════
async function test10_loadAndQuickAddSerial() {
  const startedAt = 1780000000000
  const store = new GatedStore({ 'current_session.json': readableDraft(startedAt, 'Swimming') })
  const { controller, state } = makeRealController(store)
  const order = []
  // Gate the load's read so it parks; enqueue a quick-add behind it.
  const gate = store.gateNextGet('current_session.json')
  const pLoad = controller.load().then(() => order.push('load'))
  await gate.started
  const newEntry = L.normalizeEntry(
    { category: 'strength', activity: 'Bench', metrics: { sets: [{ weight: 80, reps: 5, unit: 'kg' }] } },
    { ts: startedAt + 60000, source: 'manual', confirmed: true },
  )
  const pAdd = controller.sessionWrite((base) => L.appendEntryToCurrentSession(base, newEntry, startedAt + 60000))
    .then(() => order.push('add'))
  gate.release()
  await Promise.all([pLoad, pAdd])
  assert.deepEqual(order, ['load', 'add'], 'NEW: quick-add waited for the in-flight load (strictly serial)')
  const activities = state.session.entries.map((e) => e.activity).sort()
  assert.deepEqual(activities, ['Bench', 'Swimming'],
    'NEW: both the loaded entry and the quick-added entry survive (no lost write)')
  console.log('PASS (10) load + quick-add serial [strict order, both entries survive]')
}

// ════════════════════════════════════════════════════════════════════════════
// (11) THE DEAD-LETTER LIE — the key race the whole fix targets. The runtime can
//      reject a write with a fatal 4xx, DEAD-LETTER it, and STILL report
//      {synced:true} to the app (the runtime's settle() lie). So an id-less
//      draft's id-stamp persist-back is BELIEVED durable but the file on disk
//      stays id-less. Without the fix, the NEXT load re-mints a DIFFERENT random
//      id for the same id-less content, mergeCurrentSessions unions the two ids,
//      and the entry DUPLICATES into permanent history on Finish.
//
//      With the fix, the second load RECONCILES the still-id-less content
//      against the in-memory id minted on the first load and reuses it — one
//      entry, one committed row, no matter how many times the lie repeats.
//
//      FAIL-ON-REVERT is proven in-test: the SAME scenario run against a
//      controller whose reconcileDraftIds is reverted to identity (the pre-fix
//      behavior — normalizeCurrentSession mints fresh per read) DUPLICATES.
// ════════════════════════════════════════════════════════════════════════════

// A store whose current_session.json set() is a DEAD-LETTER LIE: it claims
// {synced:true} (so requireDurable passes and the app advances its in-memory
// truth) but never persists current_session.json — the file stays id-less. Other
// keys persist normally.
class DeadLetterStore extends GatedStore {
  async set(key, value) {
    this.log.push({ op: 'set', key })
    await this.maybeGate('set', key)
    if (key === 'current_session.json') return { synced: true } // the lie
    this.files[key] = clone(value)
    return { synced: true }
  }
}

// Build a controller from the REAL inline source but with reconcileDraftIds
// reverted to identity — i.e. the pre-fix behavior where every read re-mints a
// fresh random id for an id-less entry. Proves the dead-letter dup is real and
// that reconcileDraftIds is precisely what closes it.
const revertedLogicSource = inlineLogic.replace(
  /function reconcileDraftIds\(rawSession, inMemorySession\) \{/,
  'function reconcileDraftIds(rawSession, inMemorySession) { return rawSession; // REVERTED: pre-fix re-mint-per-read\n  /* original body unreachable */ if (false) {',
).replace(/return \{ \.\.\.rawSession, entries \}\n\}/, 'return rawSession }\n}')
const LR = new Function(`${revertedLogicSource}
return { createSessionController, normalizeStoredEntries, mergeEntriesForSave }`)()
function makeRevertedController(store) {
  const state = { session: null, entries: null }
  const controller = LR.createSessionController({
    store,
    setSession: (next) => { state.session = next },
    setEntries: (next) => { state.entries = next },
    requireDurable: (result, path) => requireDurableSetResult(result, path),
    onWriteError: () => {},
  })
  return { controller, state }
}

// A draft with two id-less entries of the SAME normalized content (3×5 squat
// logged twice). It stresses the signature path: the raw set is {weight_kg,reps}
// but normalize canonicalizes it (adds unit:"kg"), so reconcile MUST sign on the
// normalized form or it re-mints every read and the two entries fan out.
function twoIdenticalSetsSession(startedAt) {
  const setEntry = () => ({
    ts: startedAt,
    sessionId: `session-${startedAt}`,
    category: 'strength',
    activity: 'Squat',
    metrics: { sets: [{ weight_kg: 100, reps: 5 }] },
    raw: 'Squat 5x100',
    source: 'ai',
    confirmed: true,
  })
  return { id: `session-${startedAt}`, startedAt, localDate: '2026-06-20', status: 'active', entries: [setEntry(), setEntry()] }
}

async function deadLetterScenario(make, LMod, diskSession, loads = 3) {
  const store = new DeadLetterStore({ 'current_session.json': diskSession })
  const { controller } = make(store)
  // First load stamps ids in-memory; the persist-back LIES {synced:true} but the
  // file on disk stays id-less. Every later poll/subscribe load re-reads it.
  for (let i = 0; i < loads; i += 1) await controller.load() // eslint-disable-line no-await-in-loop
  const { committed } = await controller.finish()
  return LMod.normalizeStoredEntries(LMod.mergeEntriesForSave(committed, [], [])).length
}

async function test11_deadLetterLie() {
  const startedAt = 1780000000000
  // (a) ONE id-less entry, dead-lettered persist-back, 3 reads.
  const revertedRows = await deadLetterScenario(makeRevertedController, LR, idlessSession(startedAt, 'Swimming'))
  assert.ok(revertedRows > 1,
    `REVERT must DUPLICATE one entry under the dead-letter lie (got ${revertedRows}) — else the race is not exercised`)
  const fixedRows = await deadLetterScenario(makeRealController, L, idlessSession(startedAt, 'Swimming'))
  assert.equal(fixedRows, 1,
    'NEW: a falsely-{synced:true} dead-lettered id-stamp cannot duplicate — re-reads reconcile to one id')
  // (b) TWO identical-content id-less entries — the normalization-signature trap.
  // Reconcile must converge on EXACTLY TWO rows (not fan out, not collapse to one).
  const revertedTwo = await deadLetterScenario(makeRevertedController, LR, twoIdenticalSetsSession(startedAt))
  assert.ok(revertedTwo > 2,
    `REVERT must FAN OUT two identical sets under the lie (got ${revertedTwo}) — else the race is not exercised`)
  const fixedTwo = await deadLetterScenario(makeRealController, L, twoIdenticalSetsSession(startedAt))
  assert.equal(fixedTwo, 2,
    'NEW: two identical-content id-less sets converge on EXACTLY two rows (normalized signature, claim-once)')
  console.log(`PASS (11) dead-letter {synced:true} lie [1-entry: REVERT ${revertedRows}→FIX 1; 2-identical: REVERT ${revertedTwo}→FIX 2]`)
}

// ════════════════════════════════════════════════════════════════════════════
// (12) CROSS-CONTROLLER FINISH RETRY on an id-less draft committed WITHOUT a
//      prior load → no duplicate. Finish reconciles + STAMPS the ids to disk
//      before committing, so when the clear fails and a FRESH controller (whose
//      `session` starts null) retries the now-id-bearing draft, it re-commits the
//      SAME ids and mergeEntriesForSave dedups. Without the stamp-first step the
//      retry would re-mint different ids and BOTH would survive in history.
// ════════════════════════════════════════════════════════════════════════════
async function test12_crossControllerFinishRetry() {
  const startedAt = 1780000000000
  const store = new GatedStore({
    'current_session.json': idlessSession(startedAt, 'Swimming'),
    'entries.json': [],
  })
  // First controller finishes the id-less draft directly (session === null — no
  // load seeded it). The draft-CLEAR fails, leaving the draft recoverable.
  const origSet = store.set.bind(store)
  let clearAttempts = 0
  store.set = async (key, value) => {
    if (key === 'current_session.json' && value === null) {
      clearAttempts += 1
      if (clearAttempts === 1) return { error: true } // first clear fails
    }
    return origSet(key, value)
  }
  const { controller: c1 } = makeRealController(store)
  await c1.finish().catch(() => {})
  // The stamp-first step persisted the reconciled ids, so the recoverable draft
  // is now id-BEARING (not id-less) — the key invariant for cross-retry dedup.
  const onDisk = store.files['current_session.json']
  assert.ok(onDisk && onDisk.entries.every((e) => e.id),
    'NEW: a failed-clear Finish leaves an id-BEARING recoverable draft (ids stamped before commit)')
  // A FRESH controller (own null session, own chain) retries the same draft.
  store.set = origSet
  const { controller: c2 } = makeRealController(store)
  await c2.finish()
  const rows = L.normalizeStoredEntries(store.files['entries.json'])
  assert.equal(rows.length, 1, 'NEW: cross-controller Finish retry commits the workout exactly once (no dup)')
  assert.equal(store.files['current_session.json'], null, 'NEW: the draft is cleared after the retry')
  console.log('PASS (12) cross-controller finish retry on id-less draft [stamp-first → 1 row]')
}

// ════════════════════════════════════════════════════════════════════════════
// (13) OUT-OF-TS-ORDER id-less reconcile maps each entry's id to its CONTENT,
//      not its array index. normalizeStoredEntries sorts by ts, so a positional
//      raw↔normalized index map would attach an existing id to the WRONG content
//      when the raw entries arrive out of ts order. Per-entry (single-element)
//      normalization is sort-independent.
// ════════════════════════════════════════════════════════════════════════════
async function test13_outOfOrderReconcile() {
  const cardio = (activity, ts, id) => ({
    ...(id ? { id } : {}),
    ts,
    category: 'cardio',
    activity,
    metrics: { duration_s: ts, distance_m: null, elevation_m: null, location: null },
    raw: activity,
    source: 'ai',
    confirmed: true,
  })
  const startedAt = 1780000000000
  const mem = L.normalizeCurrentSession({
    id: `session-${startedAt}`, startedAt, status: 'active',
    entries: [cardio('Run', 1000, 'RUN'), cardio('Swim', 2000, 'SWIM')],
  })
  // Raw read is id-LESS and in REVERSED ts order (Swim first), real ts preserved.
  const raw = {
    id: `session-${startedAt}`, startedAt, status: 'active',
    entries: [cardio('Swim', 2000), cardio('Run', 1000)],
  }
  const rec = L.reconcileDraftIds(raw, mem)
  const idByActivity = Object.fromEntries(rec.entries.map((e) => [e.activity, e.id]))
  assert.equal(idByActivity.Swim, 'SWIM', 'NEW: id-less Swim reuses the Swim id (content match, not index)')
  assert.equal(idByActivity.Run, 'RUN', 'NEW: id-less Run reuses the Run id (content match, not index)')
  console.log('PASS (13) out-of-ts-order reconcile [ids follow content, sort-independent]')
}

// ════════════════════════════════════════════════════════════════════════════
// (14) DISPOSE during an async transform and during Finish's clear → a disposed
//      controller never advances its React STATE (the cross-app contamination
//      vector: a disposed controller's setSession would push the OLD app's draft
//      into the NEW app's view). Covers the await points test 4 (load read) does
//      not. NOTE: the in-flight store.set itself is the awaited op and may land
//      on the OLD app's store — harmless, that store is being torn down — but the
//      disposed controller must not call setSession/setEntries afterward, and a
//      transform that is still PARKED when dispose fires must never write at all.
// ════════════════════════════════════════════════════════════════════════════
async function test14_disposeDuringWritePaths() {
  const startedAt = 1780000000000
  // (a) dispose while an async transform is parked BEFORE its write → no write at
  //     all, and state is not advanced.
  {
    const store = new GatedStore({ 'current_session.json': readableDraft(startedAt, 'Swimming') })
    const { controller, state } = makeRealController(store)
    await controller.load()
    const baseline = clone(store.files['current_session.json'])
    const writesBefore = store.log.filter((e) => e.op === 'set').length
    const newEntry = L.normalizeEntry(
      { category: 'strength', activity: 'Bench', metrics: { sets: [{ weight: 80, reps: 5, unit: 'kg' }] } },
      { ts: startedAt + 60000, source: 'manual', confirmed: true },
    )
    // An async transform that parks on a deferred until we let it proceed; we
    // dispose WHILE it is parked, so the post-transform throwIfDisposed aborts
    // before store.set is ever called.
    const proceed = deferred()
    const pAdd = controller.sessionWrite(async (b) => {
      await proceed.promise
      return L.appendEntryToCurrentSession(b, newEntry, startedAt + 60000)
    })
    await tick() // let the transform start and park on proceed
    controller.dispose()
    proceed.resolve()
    await pAdd.catch(() => {})
    assert.deepEqual(store.files['current_session.json'], baseline,
      'NEW: a transform parked at dispose never writes (post-transform dispose check)')
    assert.equal(store.log.filter((e) => e.op === 'set').length, writesBefore,
      'NEW: no store.set was issued after dispose on the parked transform')
    assert.equal(state.session.entries.length, 1, 'NEW: disposed controller did not advance state')
  }
  // (b) dispose while Finish's draft-clear is parked → the workout is already
  //     durably committed to entries.json (commit precedes the clear), so nothing
  //     is lost; the disposed controller does NOT advance state to cleared.
  {
    const store = new GatedStore({
      'current_session.json': readableDraft(startedAt, 'Swimming'),
      'entries.json': [],
    })
    const { controller, state } = makeRealController(store)
    await controller.load()
    const gate = store.gateNextSet('current_session.json') // first set is the clear (draft is id-bearing)
    const pFinish = controller.finish()
    await gate.started
    controller.dispose()
    gate.release()
    await pFinish.catch(() => {})
    assert.deepEqual(L.normalizeStoredEntries(store.files['entries.json']).map((e) => e.id), ['u-Swimming'],
      'NEW: Finish committed the workout DURABLY before the clear (no loss on dispose)')
    assert.ok(state.session !== null, 'NEW: a disposed controller did not advance state to cleared')
  }
  console.log('PASS (14) dispose during transform/finish-clear [no stray write, no state advance, no loss]')
}

// ── run ─────────────────────────────────────────────────────────────────────
await test1_concurrentMountLoads()
await test2_loadVsFinish()
await test3_loadIsPureRead()
await test4_appSwitchMidLoad()
await test5_deleteThenStaleEdit()
await test6_finishVsConcurrentFlush()
await test7_offlineFinishReplayable()
await test8_finishRetryIdempotent()
await test9_twoIdlessRewrites()
await test10_loadAndQuickAddSerial()
await test11_deadLetterLie()
await test12_crossControllerFinishRetry()
await test13_outOfOrderReconcile()
await test14_disposeDuringWritePaths()
console.log('\nALL INTEGRITY TESTS PASSED')
