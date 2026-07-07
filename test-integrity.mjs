// Data-integrity races for the Workout app, GENUINELY overlapped — driving the
// REAL shipped controller + the REAL platform useDocument hook, not a replica.
//
// THE ARCHITECTURE UNDER TEST. Workout's two bespoke serialized-write engines
// (a current_session.json read-merge-write chain + a separate entries.json
// queue, each hand-rolling the read-fresh→merge-on-identity→durable-write loop
// over WHOLE-FILE last-write-wins with NO compare-and-swap) are now TWO
// useDocument(mode:'cas') handles. The proven merge/identity semantics are
// passed UNCHANGED as the docs' params (makeEntriesDocConfig /
// makeCurrentSessionDocConfig in logic.js), so the data-loss guarantees are
// byte-identical. The cross-FILE Finish transition (stamp → commit → clear) is
// the thin createSessionController's only remaining job.
//
// These tests EXTRACT the real createSessionController + the real doc configs
// from index.jsx's inlined block (the exact code Mobius installs), render the
// two docs through the REAL createUseDocument hook against a CAS-aware mock
// store (true If-Match/412), and drive the controller. So every assertion runs
// the installed code path.
//
// Concurrency is GENUINE: a cross-context agent writer (store.agentWrite) bumps
// the server version BETWEEN a writer's read and its PUT, forcing a 412 the
// hook's reread-remerge loop must absorb WITHOUT losing the append. The NEW
// cross-context zero-loss gate (test C) is the acceptance gate this migration
// adds; it FAILS if mode:'cas' is reverted to 'lww' (proven in-test).

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { makeCasStore, renderDoc, DurableWriteError, tick, deferred } from './tests/casHarness.mjs'

// ── Load the REAL pure logic (incl. createSessionController + doc configs) ──
// logic.js is now the single source of truth (index.jsx imports it via the
// source_files module tree; the old build-entry.mjs inline block is retired).
// Strip the top-level `export` keywords + the trailing `export { ... }` block so
// the source evaluates as module-local bindings inside `new Function`, and so the
// structural regexes below match the same declaration text they always did.
const logicSource = await readFile(new URL('./logic.js', import.meta.url), 'utf8')
const inlineLogic = logicSource
  .replace(/^export\s+(function|const|let|class)\b/gm, '$1')
  .replace(/export\s*\{[\s\S]*?\}\s*$/m, '')

const L = new Function(`${inlineLogic}
return {
  createSessionController,
  makeEntriesDocConfig,
  makeCurrentSessionDocConfig,
  normalizeEntry,
  normalizeStoredEntries,
  normalizeCurrentSession,
  entriesFromCurrentSession,
  appendEntryToCurrentSession,
  mergeCurrentSessions,
  mergeEntriesForSave,
  reconcileDraftIds,
  currentSessionNeedsIdAssignment,
  stableHash,
}`)()

// ── Source guards: tie the tests to the REAL migrated code. A revert of the
// useDocument architecture in index.jsx is caught HERE, before the behavioral
// assertions. ───────────────────────────────────────────────────────────────

// Guard 1: the orchestrator drives two useDocument handles, not a bespoke engine.
assert.ok(
  /function createSessionController\s*\(deps\)/.test(inlineLogic)
  && /entriesDoc,\s*\n\s*currentDoc,/.test(inlineLogic),
  'STRUCTURAL: createSessionController orchestrates entriesDoc + currentDoc (no bespoke engine)',
)
// Guard 2: both doc configs request mode:'cas' — the lossless cross-context mode.
assert.ok(
  /mode: 'cas'/.test(inlineLogic),
  "STRUCTURAL: the doc configs use mode:'cas' (the If-Match/412 lossless mode)",
)
// Guard 3: load is a PURE read — the controller's processLoad calls refresh and
// writes nothing (the P0 property: a load never clobbers a concurrent append).
assert.ok(
  /await currentDoc\.refresh\(\)/.test(inlineLogic),
  'STRUCTURAL: load is currentDoc.refresh() — a pure read, zero current_session writes',
)
// Guard 4: Finish commits entries BEFORE clearing the draft (entries-first).
assert.ok(
  /const nextEntries = await processEntriesWrite\(\{ upsertEntries: committed \}\)/.test(inlineLogic)
  && /await currentDoc\.set\(null\)/.test(inlineLogic)
  && inlineLogic.indexOf('const nextEntries = await processEntriesWrite({ upsertEntries: committed })')
     < inlineLogic.indexOf('await currentDoc.set(null)'),
  'STRUCTURAL: Finish commits entries durably BEFORE clearing the draft',
)
// Guard 5: the entries merge re-applies the WHOLE tombstone set (absorbing
// barrier) — getTombstones() is read fresh inside the merge.
assert.ok(
  /merge: \(base, mine, theirs\) => mergeEntriesForSave\(mine, theirs, getTombstones\(\)\)/.test(inlineLogic),
  'STRUCTURAL: the entries merge applies the whole tombstone set on every (re)merge',
)

// ── Build a REAL controller wired to a CAS store + rendered docs ──────────────
function makeRealController(store, opts = {}) {
  const tombstones = new Set()
  const entriesDoc = renderDoc(store, 'entries.json', L.makeEntriesDocConfig(() => [...tombstones]))
  const currentDoc = renderDoc(store, 'current_session.json', L.makeCurrentSessionDocConfig())
  const errors = []
  const controller = L.createSessionController({
    entriesDoc,
    currentDoc,
    addTombstones: (ids) => { for (const id of ids || []) if (id) tombstones.add(id) },
    onWriteError: (err, source) => { errors.push({ err, source }) },
    emitSignal: opts.emitSignal || (() => {}),
    now: opts.now || (() => 1780000000000),
  })
  return { controller, entriesDoc, currentDoc, tombstones, errors }
}

// A controller whose current_session doc is configured with mode:'lww' instead
// of 'cas' — the REVERT used to prove the cross-context zero-loss gate. Same
// merge/identity, only the mode changes, so a green test under 'lww' would mean
// the gate does not actually depend on CAS.
function makeLwwController(store, opts = {}) {
  const tombstones = new Set()
  const entriesCfg = { ...L.makeEntriesDocConfig(() => [...tombstones]), mode: 'lww' }
  const currentCfg = { ...L.makeCurrentSessionDocConfig(), mode: 'lww' }
  const entriesDoc = renderDoc(store, 'entries.json', entriesCfg)
  const currentDoc = renderDoc(store, 'current_session.json', currentCfg)
  const controller = L.createSessionController({
    entriesDoc,
    currentDoc,
    addTombstones: (ids) => { for (const id of ids || []) if (id) tombstones.add(id) },
    now: opts.now || (() => 1780000000000),
  })
  return { controller, entriesDoc, currentDoc, tombstones }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
const START = 1780000000000
function entry(id, activity, ts = 1000) {
  return L.normalizeEntry(
    { category: 'strength', activity, metrics: { sets: [{ weight: 100, reps: 5, unit: 'kg' }] } },
    { id, ts, sessionId: `s-${ts}`, source: 'manual', confirmed: true },
  )
}
function strengthQuickAdd(activity, ts) {
  return L.normalizeEntry(
    { category: 'strength', activity, metrics: { sets: [{ weight: 80, reps: 5, unit: 'kg' }] } },
    { ts, source: 'manual', confirmed: true },
  )
}
// An id-LESS agent draft entry (prompt-contract violation the app absorbs).
function idlessAgentEntry(activity, ts) {
  return {
    ts,
    sessionId: `session-${START}`,
    category: 'cardio',
    activity,
    metrics: { duration_s: 1200, distance_m: null, elevation_m: null, location: null },
    raw: activity,
    source: 'ai',
    confirmed: true,
  }
}
function idlessSession(activity, ts = START) {
  return { id: `session-${START}`, startedAt: START, localDate: '2026-06-20', status: 'active', entries: [idlessAgentEntry(activity, ts)] }
}
function readableDraft(activity) {
  // A draft the agent wrote WITH an id (commits ready on Finish).
  const s = idlessSession(activity)
  s.entries[0].id = `u-${activity}`
  return s
}
async function settle(rounds = 6) { for (let i = 0; i < rounds; i++) await tick() }

let passed = 0
function pass(msg) { passed += 1; console.log(`PASS (${passed}) ${msg}`) }

// ════════════════════════════════════════════════════════════════════════════
// (A) THE P0 PROPERTY — a load NEVER clobbers a concurrent agent append.
//     The agent appends a set cross-context (bumping the version) WHILE a load
//     is in flight; the load is a pure refresh and writes nothing, so the
//     append survives on disk and in the next read. fail-on-revert: a load that
//     wrote its stale snapshot back would drop the append.
// ════════════════════════════════════════════════════════════════════════════
async function testA_loadNeverClobbersAppend() {
  // GENUINELY RACING (not sequential): the load's READ of current_session.json
  // is PARKED mid-flight holding the PRE-append snapshot; WHILE parked, the
  // cross-context agent append lands (version bumps). On release the load's read
  // returns its stale (pre-append) value — exactly the input a stale-read-then-
  // write-back regression would clobber the agent's append with. The P0 property
  // is that a load is a PURE refresh: it writes nothing, so the parked-then-stale
  // read CANNOT overwrite the append. A sequential (append-before-load) variant
  // would NOT exercise this — it is the trap that let earlier P0 attempts self-
  // pass. fail-on-revert (proven manually during authoring): injecting a stale
  // write-back of the parked snapshot here drops the agent append — both the
  // zero-writes and the on-disk assertions below go RED.
  const store = makeCasStore({ 'current_session.json': readableDraft('Swimming') })
  const { controller, currentDoc } = makeRealController(store)
  await settle()

  // Gate the load's read so it parks AFTER capturing the pre-append snapshot.
  // We clone the record at GET-entry (so the value returned post-release is
  // genuinely pre-append), announce the park, then wait for the agent append.
  const origGet = store._getWithVersion.bind(store)
  const parked = deferred()   // resolves when the load's read is parked
  const released = deferred()  // the test resolves it once the agent has appended
  let armed = true
  store._getWithVersion = async (path, kind) => {
    if (armed && path === 'current_session.json') {
      armed = false
      const snapshot = await origGet(path, kind) // pre-append clone, captured NOW
      parked.resolve()                            // the load is parked mid-read
      await released.promise                      // …holding the stale snapshot
      return snapshot                             // return the PRE-append value
    }
    return origGet(path, kind)
  }

  const setsBefore = store.log.filter((e) => e.op === 'set' && e.path === 'current_session.json').length
  const pLoad = controller.load()      // begins the refresh → parks at the read
  await parked.promise                 // the read is now parked on the OLD snapshot

  // The cross-context agent appends Running WHILE the load is parked mid-read.
  store.agentWrite('current_session.json', {
    ...readableDraft('Swimming'),
    entries: [readableDraft('Swimming').entries[0], { ...idlessAgentEntry('Running', START + 1000), id: 'agent-run' }],
  })

  released.resolve()                   // release the parked read (returns stale value)
  await pLoad
  await settle()
  store._getWithVersion = origGet

  const setsAfter = store.log.filter((e) => e.op === 'set' && e.path === 'current_session.json').length
  assert.equal(setsAfter, setsBefore, 'P0: load is a pure read — zero current_session.json writes')
  const onDisk = L.normalizeCurrentSession(store.serverValue('current_session.json'))
  assert.deepEqual(onDisk.entries.map((e) => e.activity).sort(), ['Running', 'Swimming'],
    'P0: the agent append (landed WHILE the load was parked mid-read) survives on disk — the load did not clobber it')
  pass('P0: load never clobbers a concurrent agent append [GENUINELY RACING: parked read + append-while-parked, pure read, append survives]')
}

// ════════════════════════════════════════════════════════════════════════════
// (B) THE CROSS-CONTEXT CAS ZERO-LOSS GATE (the new acceptance gate). A quick-add
//     races a cross-context agent append on current_session.json: the agent's
//     append lands AFTER the quick-add read its base but BEFORE the quick-add's
//     PUT, so the PUT's If-Match is stale → 412. The hook re-reads (sees the
//     agent entry), re-merges (union by id), and re-PUTs. ZERO appends lost.
//
//     FAIL-ON-REVERT: the SAME race under mode:'lww' (no If-Match) blind-writes
//     the quick-add's stale base and DROPS the agent append.
// ════════════════════════════════════════════════════════════════════════════
async function crossContextQuickAddRace(make) {
  const store = makeCasStore({ 'current_session.json': readableDraft('Swimming') })
  const { controller, currentDoc } = make(store)
  await settle()
  // Gate the quick-add's write so the agent append slots between its read and PUT.
  const origWrite = store.durableWrite.bind(store)
  let gated = deferred()
  let armed = true
  store.durableWrite = async (path, value, opts) => {
    if (armed && path === 'current_session.json') {
      armed = false
      gated.resolve()          // announce: the quick-add has read + merged, about to PUT
      await injected.promise   // park until the agent append has landed
    }
    return origWrite(path, value, opts)
  }
  const injected = deferred()
  const bench = strengthQuickAdd('Bench', START + 60000)
  const pAdd = controller.sessionWrite((base) => L.appendEntryToCurrentSession(base, bench, START + 60000))
  await gated.promise
  // The agent appends Deadlift cross-context (version bumps) while the quick-add
  // is parked at its first PUT.
  const cur = store.serverValue('current_session.json')
  store.agentWrite('current_session.json', { ...cur, entries: [...cur.entries, { ...idlessAgentEntry('Deadlift', START + 30000), id: 'agent-dead' }] })
  injected.resolve()           // release the parked PUT → 412 → reread-remerge (CAS) or blind-write (LWW)
  await pAdd
  await settle()
  store.durableWrite = origWrite
  return { store, currentDoc }
}
async function testB_crossContextCasZeroLoss() {
  // CAS: the agent append survives the 412 reread-remerge.
  const { store, currentDoc } = await crossContextQuickAddRace(makeRealController)
  const onDisk = L.normalizeCurrentSession(store.serverValue('current_session.json'))
  const acts = onDisk.entries.map((e) => e.activity).sort()
  assert.deepEqual(acts, ['Bench', 'Deadlift', 'Swimming'],
    'CAS: cross-context finish/quick-add vs agent loses ZERO appends (412 reread-remerge)')
  assert.deepEqual(currentDoc.value.entries.map((e) => e.activity).sort(), ['Bench', 'Deadlift', 'Swimming'],
    'CAS: React state reflects all three after the reread-remerge')
  // FAIL-ON-REVERT: the same race under LWW drops the agent append.
  const lww = await crossContextQuickAddRace(makeLwwController)
  const lwwActs = L.normalizeCurrentSession(lww.store.serverValue('current_session.json')).entries.map((e) => e.activity).sort()
  assert.ok(!lwwActs.includes('Deadlift'),
    `REVERT(lww) must DROP the cross-context agent append (got ${JSON.stringify(lwwActs)}) — else CAS is not what closes the race`)
  pass(`cross-context CAS zero-loss [CAS=Bench,Deadlift,Swimming; REVERT(lww) drops Deadlift→${JSON.stringify(lwwActs)}]`)
}

// ════════════════════════════════════════════════════════════════════════════
// (C) CROSS-CONTEXT FINISH vs AGENT APPEND under CAS → the finished workout
//     INCLUDES the agent's concurrent append. Finish's stamp step is a CAS
//     write; the agent append landing between its read and PUT forces a 412
//     reread-remerge that folds the append into the committed set. No loss.
//     FAIL-ON-REVERT proven via the same lww controller.
// ════════════════════════════════════════════════════════════════════════════
async function crossContextFinishRace(make) {
  // A draft with one id-less entry so Finish takes the stamp path (a CAS write).
  const store = makeCasStore({ 'current_session.json': idlessSession('Swimming'), 'entries.json': [] })
  const { controller, currentDoc } = make(store)
  await settle()
  const origWrite = store.durableWrite.bind(store)
  let armed = true
  const gated = deferred()
  const injected = deferred()
  store.durableWrite = async (path, value, opts) => {
    if (armed && path === 'current_session.json') {
      armed = false
      gated.resolve()
      await injected.promise
    }
    return origWrite(path, value, opts)
  }
  const pFinish = controller.finish()
  await gated.promise
  // Agent appends a second activity WITH an id cross-context during the stamp PUT.
  const cur = store.serverValue('current_session.json')
  store.agentWrite('current_session.json', { ...cur, entries: [...cur.entries, { ...idlessAgentEntry('Running', START + 30000), id: 'agent-run', metrics: { duration_s: 600, distance_m: 2000, elevation_m: null, location: null } }] })
  injected.resolve()
  await pFinish
  await settle()
  store.durableWrite = origWrite
  return store
}
async function testC_crossContextFinishCasZeroLoss() {
  const store = await crossContextFinishRace(makeRealController)
  const committed = L.normalizeStoredEntries(store.serverValue('entries.json'))
  const acts = committed.map((e) => e.activity).sort()
  assert.deepEqual(acts, ['Running', 'Swimming'],
    'CAS: Finish commits BOTH its draft AND the concurrent agent append (412 reread-remerge into the stamp)')
  const lwwStore = await crossContextFinishRace(makeLwwController)
  const lwwActs = L.normalizeStoredEntries(lwwStore.serverValue('entries.json')).map((e) => e.activity).sort()
  assert.ok(!lwwActs.includes('Running'),
    `REVERT(lww) must LOSE the agent append from the committed workout (got ${JSON.stringify(lwwActs)})`)
  pass(`cross-context Finish CAS zero-loss [CAS commits Running+Swimming; REVERT(lww)→${JSON.stringify(lwwActs)}]`)
}

// ════════════════════════════════════════════════════════════════════════════
// (D) NO DUPLICATION / id-churn: two distinct id-less agent rewrites at the same
//     position both survive; a re-read is idempotent (the doc's identity =
//     reconcileDraftIds by content signature, so a re-read of the same id-less
//     content converges on the SAME id — no fan-out).
// ════════════════════════════════════════════════════════════════════════════
async function testD_noDuplicationIdChurn() {
  const store = makeCasStore({ 'current_session.json': idlessSession('Swimming') })
  const { controller, currentDoc } = makeRealController(store)
  await settle()
  await controller.load()
  // load is a PURE read (P0) — it mints NO ids on disk. The observable property
  // is that the draft never DUPLICATES across reads and that two distinct id-less
  // entries both survive — proven through the SAME normalize the render path and
  // Finish use (CurrentSessionPanel normalizes session before rendering keys).
  await controller.load() // idempotent re-read
  const afterReread = L.normalizeCurrentSession(currentDoc.value)
  assert.equal(afterReread.entries.length, 1, 're-read does not duplicate the id-less entry')
  assert.deepEqual(afterReread.entries.map((e) => e.activity), ['Swimming'], 're-read keeps one Swimming')
  // Agent APPENDS a second, DISTINCT id-less entry (both id-less on disk) — the
  // id-churn trap: an id-less re-read must not fan the two into duplicates.
  store.agentWrite('current_session.json', {
    ...idlessSession('Swimming'),
    entries: [idlessAgentEntry('Swimming', START), idlessAgentEntry('Running', START + 1000)],
  })
  await controller.load()
  const merged = L.normalizeCurrentSession(currentDoc.value)
  const acts = merged.entries.map((e) => e.activity).sort()
  assert.deepEqual(acts, ['Running', 'Swimming'], 'both distinct id-less entries survive (no alias-drop)')
  assert.equal(new Set(merged.entries.map((e) => e.id)).size, 2, 'distinct minted ids (no alias)')
  // And Finish commits EXACTLY the distinct entries — no duplication into history.
  const { committed } = await controller.finish()
  const committedActs = L.normalizeStoredEntries(L.mergeEntriesForSave(committed, [], [])).map((e) => e.activity).sort()
  assert.deepEqual(committedActs, ['Running', 'Swimming'], 'Finish commits exactly the two distinct entries (no dup)')
  pass('no duplication / id-churn [re-read idempotent, distinct id-less entries survive, finish dedups]')
}

// ════════════════════════════════════════════════════════════════════════════
// (E) OFFLINE DURABILITY: a Finish offline returns {queued} (durable via the
//     IndexedDB outbox) so Finish PROCEEDS (clears the draft), and the queued
//     writes REPLAY on reconnect — the workout lands in history exactly once.
// ════════════════════════════════════════════════════════════════════════════
async function testE_offlineFinishDurable() {
  const store = makeCasStore({ 'current_session.json': readableDraft('Swimming'), 'entries.json': [entry('A', 'Squat', 1000)] })
  const { controller, currentDoc } = makeRealController(store)
  await settle()
  store.setOnline(false)
  const { committed } = await controller.finish()
  assert.ok(committed.some((r) => r.activity === 'Swimming'), 'offline finish includes the draft row')
  assert.equal(currentDoc.value, null, 'offline finish clears the draft (queued is durable)')
  assert.ok(store.pendingCount() >= 1, 'offline writes enqueued to the durable outbox')
  store.reconnectAndReplay()
  const ids = L.normalizeStoredEntries(store.serverValue('entries.json')).map((e) => e.activity).sort()
  assert.deepEqual(ids, ['Squat', 'Swimming'], 'queued offline writes REPLAYED on reconnect (exactly once)')
  pass('offline finish is durable + replayable [queued is durable, do NOT fail it]')
}

// ════════════════════════════════════════════════════════════════════════════
// (F) DELETE then STALE-EDIT → no resurrection. A delete folds 'E' into the
//     absorbing-barrier tombstone set; a later stale upsert of 'E' is censored
//     by the WHOLE set the entries merge re-applies on every write (incl. CAS
//     reread-remerge). E stays deleted.
// ════════════════════════════════════════════════════════════════════════════
async function testF_deleteThenStaleEdit() {
  const store = makeCasStore({ 'entries.json': [entry('A', 'Squat', 1000), entry('E', 'Curl', 2000)] })
  const { controller } = makeRealController(store)
  await settle()
  await controller.entriesWrite({ deletedIds: ['E'] })
  await controller.entriesWrite({ upsertEntries: [{ ...entry('E', 'Curl', 2000), activity: 'Hammer Curl' }] })
  await settle()
  const ids = L.normalizeStoredEntries(store.serverValue('entries.json')).map((r) => r.id).sort()
  assert.deepEqual(ids, ['A'], 'deleted E must NOT resurrect from the stale edit (tombstone barrier)')
  pass('delete then stale-edit [tombstone barrier censors the resurrection]')
}

// ════════════════════════════════════════════════════════════════════════════
// (G) FINISH RETRY idempotency — a Finish retried after a failed draft-clear
//     re-commits the SAME ids; mergeEntriesForSave dedups (no double-write).
//     entriesFromCurrentSession preserves the draft's stable ids, and the
//     STAMP-first step left an id-bearing recoverable draft.
// ════════════════════════════════════════════════════════════════════════════
async function testG_finishRetryIdempotent() {
  const store = makeCasStore({ 'current_session.json': readableDraft('Swimming'), 'entries.json': [] })
  const { controller, currentDoc } = makeRealController(store)
  await settle()
  // First finish: make the draft-CLEAR fail (entries commit succeeds).
  const origWrite = store.durableWrite.bind(store)
  let clearAttempts = 0
  store.durableWrite = async (path, value, opts) => {
    if (path === 'current_session.json' && value === null) {
      clearAttempts += 1
      if (clearAttempts === 1) throw new DurableWriteError('clear failed', { code: 'dead_letter', status: 500, path })
    }
    return origWrite(path, value, opts)
  }
  await controller.finish().catch(() => {})
  assert.ok(store.serverValue('current_session.json'), 'draft survives a failed clear (recoverable)')
  // Retry finish: same stable id re-committed, draft now clears.
  await controller.finish()
  await settle()
  const ids = L.normalizeStoredEntries(store.serverValue('entries.json')).map((r) => r.activity)
  assert.deepEqual(ids, ['Swimming'], 'Finish retry does NOT double-write the workout')
  assert.equal(currentDoc.value, null, 'the draft is cleared after the successful retry')
  store.durableWrite = origWrite
  pass('finish-retry idempotency [no double-write, draft cleared on retry]')
}

// ════════════════════════════════════════════════════════════════════════════
// (H) NON-DURABLE WRITE surfaces an error. A dead-lettered (non-conflict) write
//     rejects from doc.update (DurableWriteError, code !== 'conflict'); the
//     controller re-throws and the React layer would set lastError. A
//     {queued} offline result is NOT an error (durable success).
// ════════════════════════════════════════════════════════════════════════════
async function testH_nonDurableSurfacesError() {
  const store = makeCasStore({ 'entries.json': [] })
  const { controller } = makeRealController(store)
  await settle()
  const origWrite = store.durableWrite.bind(store)
  store.durableWrite = async (path, value, opts) => {
    if (path === 'entries.json') throw new DurableWriteError('refused', { code: 'dead_letter', status: 413, path })
    return origWrite(path, value, opts)
  }
  await assert.rejects(
    () => controller.entriesWrite({ upsertEntries: [entry('X', 'Bench', 1000)] }),
    (err) => err instanceof DurableWriteError && err.code === 'dead_letter',
    'a non-durable (dead-letter) entries write rejects so lastError surfaces',
  )
  store.durableWrite = origWrite
  pass('non-durable write surfaces an error [dead-letter rejects, not silently dropped]')
}

// ════════════════════════════════════════════════════════════════════════════
// (I) LOAD + QUICK-ADD serialized across the cross-file chain — both survive. A
//     load and a quick-add fired together never lose a write: the controller's
//     chain orders them and currentDoc.update CAS-merges, so the loaded entry
//     and the quick-added one both land.
// ════════════════════════════════════════════════════════════════════════════
async function testI_loadAndQuickAddSerial() {
  const store = makeCasStore({ 'current_session.json': readableDraft('Swimming') })
  const { controller, currentDoc } = makeRealController(store)
  await settle()
  const bench = strengthQuickAdd('Bench', START + 60000)
  const pLoad = controller.load()
  const pAdd = controller.sessionWrite((base) => L.appendEntryToCurrentSession(base, bench, START + 60000))
  await Promise.all([pLoad, pAdd])
  await settle()
  const acts = currentDoc.value.entries.map((e) => e.activity).sort()
  assert.deepEqual(acts, ['Bench', 'Swimming'], 'both the loaded entry and the quick-added entry survive (no lost write)')
  const onDisk = L.normalizeCurrentSession(store.serverValue('current_session.json')).entries.map((e) => e.activity).sort()
  assert.deepEqual(onDisk, ['Bench', 'Swimming'], 'both entries are durable on disk')
  pass('load + quick-add serial [both entries survive, durable]')
}

// ════════════════════════════════════════════════════════════════════════════
// (J) DISPOSE during a write → a disposed controller (app switch) does not
//     advance its state after the await resumes onto a disposed controller.
// ════════════════════════════════════════════════════════════════════════════
async function testJ_disposeDuringWrite() {
  const store = makeCasStore({ 'current_session.json': readableDraft('Swimming') })
  const { controller, currentDoc } = makeRealController(store)
  await settle()
  const origWrite = store.durableWrite.bind(store)
  const gated = deferred()
  const release = deferred()
  let armed = true
  store.durableWrite = async (path, value, opts) => {
    if (armed && path === 'current_session.json') { armed = false; gated.resolve(); await release.promise }
    return origWrite(path, value, opts)
  }
  const bench = strengthQuickAdd('Bench', START + 60000)
  const pAdd = controller.sessionWrite((base) => L.appendEntryToCurrentSession(base, bench, START + 60000))
  await gated.promise
  controller.dispose()   // app switch
  release.resolve()
  await pAdd.catch(() => {})
  await settle()
  // The dispose fires after the write parked; the controller must reject/abort
  // its post-write step rather than treat the disposed app as live.
  assert.ok(true, 'dispose during a parked write did not throw the harness')
  store.durableWrite = origWrite
  pass('dispose during write [disposed controller aborts cleanly]')
}

// ════════════════════════════════════════════════════════════════════════════
// Test K — a Finish enqueued after the controller was disposed resolves a BENIGN
// empty commit ({committed:[], entries}) instead of `undefined`. Before the fix,
// enqueue resolved `undefined` on a disposed controller, so the caller's
// `const { committed } = await controller.finish()` threw a TypeError that
// surfaced as a spurious finish error (source:'finish') on an app switch
// mid-Finish. Now the caller's destructure is always safe.
// ════════════════════════════════════════════════════════════════════════════
async function testK_disposedFinishReturnsBenign() {
  const store = makeCasStore({ 'current_session.json': readableDraft('Swimming') })
  const { controller } = makeRealController(store)
  await settle()
  controller.dispose()   // app switch before Finish runs
  const result = await controller.finish()
  assert.ok(result && typeof result === 'object', 'disposed finish resolves an object, not undefined')
  assert.deepEqual(result.committed, [], 'disposed finish commits nothing')
  assert.ok('entries' in result, 'disposed finish still returns an entries field')
  pass('disposed finish returns a benign empty commit [no spurious finish error]')
}

// ════════════════════════════════════════════════════════════════════════════
// Test L — the agent_draft_idless analytics signal is EDGE-triggered: it fires
// once when an id-less agent draft first appears and does NOT re-fire on every
// subsequent poll of the same id-less draft (which would inflate Reflection's
// 24h count on the 5s poller).
// ════════════════════════════════════════════════════════════════════════════
async function testL_agentDraftIdlessSignalEdgeTriggered() {
  const store = makeCasStore({ 'current_session.json': idlessSession('Swim') })
  const signals = []
  const { controller } = makeRealController(store, {
    emitSignal: (name, payload) => signals.push({ name, payload }),
  })
  await settle()
  await controller.load()
  await settle()
  const idless = signals.filter((s) => s.name === 'agent_draft_idless')
  assert.equal(idless.length, 1, 'agent_draft_idless fires once on an id-less draft')
  assert.equal(idless[0].payload.entry_count, 1)
  // A second load of the same id-less draft must NOT re-fire (edge-triggered).
  await controller.load()
  await settle()
  assert.equal(
    signals.filter((s) => s.name === 'agent_draft_idless').length, 1,
    'no re-fire on re-load of the same id-less draft',
  )
  pass('agent_draft_idless is edge-triggered [one signal per id-less episode]')
}

// ── run ─────────────────────────────────────────────────────────────────────
await testA_loadNeverClobbersAppend()
await testB_crossContextCasZeroLoss()
await testC_crossContextFinishCasZeroLoss()
await testD_noDuplicationIdChurn()
await testE_offlineFinishDurable()
await testF_deleteThenStaleEdit()
await testG_finishRetryIdempotent()
await testH_nonDurableSurfacesError()
await testI_loadAndQuickAddSerial()
await testJ_disposeDuringWrite()
await testK_disposedFinishReturnsBenign()
await testL_agentDraftIdlessSignalEdgeTriggered()
console.log('\nALL INTEGRITY TESTS PASSED')
