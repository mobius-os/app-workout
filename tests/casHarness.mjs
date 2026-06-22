// Headless harness for the Workout migration onto useDocument(mode:'cas').
//
// It drives the REAL platform hook — createUseDocument from the mobius runtime —
// against a CAS-aware mock store that implements true If-Match/412 compare-and-
// swap. That is the whole point of the cross-context zero-loss acceptance gate:
// the store emits a version token on every read/write and REJECTS a write whose
// If-Match no longer matches (a concurrent writer bumped it), so the hook's
// 412 reread-remerge loop is genuinely exercised — not stubbed.
//
// The two docs the Workout app builds (entries.json, current_session.json) are
// rendered here with the SAME merge/identity params the app passes, then handed
// to the REAL createSessionController extracted from index.jsx's inlined block.
// So these tests run the exact code Mobius installs.

import { readFile } from 'node:fs/promises'

// Resolve the platform runtime (the source of createUseDocument). These tests
// are host-pinned exactly like the rest of the suite (npm test sets an absolute
// NODE_PATH to mobius/frontend/node_modules), so an absolute runtime path is
// consistent. Try the data-layer worktree the migration targets first, then the
// main checkout, so the harness works from either tree.
const RUNTIME_CANDIDATES = [
  'file:///home/hmzmrzx/projects/mobius/.claude/worktrees/data-layer/frontend/public/mobius-runtime.js',
  'file:///home/hmzmrzx/projects/mobius/frontend/public/mobius-runtime.js',
]
async function importRuntime() {
  let lastErr
  for (const url of RUNTIME_CANDIDATES) {
    try { return await import(url) } catch (e) { lastErr = e }
  }
  throw lastErr
}
const { createUseDocument, DurableWriteError } = await importRuntime()

export { DurableWriteError }

export const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)))
export const tick = () => new Promise((r) => setTimeout(r, 0))
export function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

// ── A CAS store with real If-Match/412 semantics + a cross-context agent writer.
// Versions are a monotonic counter stamped per path. _getWithVersion returns the
// current {value, version}; durableWrite enforces If-Match (mismatch → a
// conflict DurableWriteError, exactly what makeStorage's send() raises on 412),
// and notifies subscribers so the hook's subscribe-effect repaints.
export function makeCasStore(initial = {}) {
  const files = new Map() // path -> { value, version }
  let counter = 0
  let online = true
  const subs = new Map() // path -> Set<cb>
  const outbox = []       // offline-queued writes (path, value) FIFO
  const log = []

  for (const [path, value] of Object.entries(initial)) {
    counter += 1
    files.set(path, { value: clone(value), version: `v${counter}` })
  }

  function notify(path) {
    const set = subs.get(path)
    if (!set) return
    const rec = files.get(path)
    const value = rec ? clone(rec.value) : null
    for (const cb of [...set]) { try { cb(value) } catch {} }
  }

  function bump(path, value) {
    counter += 1
    files.set(path, { value: clone(value), version: `v${counter}` })
    return `v${counter}`
  }

  const store = {
    log,
    get online() { return online },
    setOnline(v) { online = v },

    async _getWithVersion(path /* , kind */) {
      log.push({ op: 'get', path })
      const rec = files.get(path)
      return rec ? { value: clone(rec.value), version: rec.version } : { value: null, version: null }
    },

    async get(path) {
      const rec = files.get(path)
      return rec ? clone(rec.value) : null
    },

    async durableWrite(path, value, opts = {}) {
      log.push({ op: 'set', path, ifMatch: opts.ifMatch || null })
      if (!online) {
        // The IndexedDB outbox accepts the write and replays on reconnect — a
        // {queued} result is DURABLE (do NOT fail it).
        outbox.push({ path, value: clone(value) })
        return { durability: 'queued', path, version: null }
      }
      const rec = files.get(path)
      const current = rec ? rec.version : null
      // If-Match enforcement: a stale token (a concurrent writer bumped the
      // version) is a 412 conflict the hook retries. If-None-Match:* requires
      // the path be absent.
      if (opts.ifMatch && opts.ifMatch !== current) {
        throw new DurableWriteError(`${path} conflict`, { code: 'conflict', status: 412, path, retryable: true })
      }
      if (opts.ifNoneMatch && rec) {
        throw new DurableWriteError(`${path} exists`, { code: 'conflict', status: 412, path, retryable: true })
      }
      const version = bump(path, value)
      notify(path)
      return { durability: 'synced', path, version }
    },

    subscribe(path, cb) {
      let set = subs.get(path)
      if (!set) { set = new Set(); subs.set(path, set) }
      set.add(cb)
      // Fire the initial value (the hook's subscribe-effect repaints on it).
      const rec = files.get(path)
      try { cb(rec ? clone(rec.value) : null) } catch {}
      return () => { set.delete(cb) }
    },

    // A cross-context writer (the embedded agent / main-shell chat) that bypasses
    // this client's docs entirely and bumps the version — the race the CAS gate
    // must survive WITHOUT losing the append.
    agentWrite(path, value) {
      log.push({ op: 'agentWrite', path })
      bump(path, value)
      notify(path)
    },

    reconnectAndReplay() {
      online = true
      for (const op of outbox) bump(op.path, op.value)
      outbox.length = 0
    },

    serverValue(path) { const r = files.get(path); return r ? clone(r.value) : undefined },
    serverHas(path) { return files.has(path) },
    pendingCount() { return outbox.length },
  }
  return store
}

// ── A React shim that drives the hook and recomputes on every setState, so a
// doc handle's `value`/`status` always reflect the latest slot. Mirrors the
// platform's renderUseDocument shim (mobiusRuntimeStore.test.js) but exposes a
// live `value` getter so the controller can read currentDoc.value mid-flight.
export function renderDoc(store, path, opts) {
  const stateSlots = []
  const refSlots = []
  const effects = []
  let stateIndex = 0
  let refIndex = 0
  const React = {
    useState(init) {
      const i = stateIndex++
      if (!(i in stateSlots)) stateSlots[i] = typeof init === 'function' ? init() : init
      const setState = (next) => { stateSlots[i] = typeof next === 'function' ? next(stateSlots[i]) : next }
      return [stateSlots[i], setState]
    },
    useRef(init) {
      const i = refIndex++
      if (!(i in refSlots)) refSlots[i] = { current: init }
      return refSlots[i]
    },
    useCallback(fn) { return fn },
    useEffect(fn) { effects.push(fn) },
  }
  const useDocument = createUseDocument(store, React)
  const handle = useDocument(path, opts)
  const cleanups = effects.map((fn) => fn()).filter(Boolean)
  return {
    get value() { return stateSlots[0].value },
    get status() { return stateSlots[0].status },
    get lastError() { return stateSlots[0].lastError },
    update: handle.update,
    set: handle.set,
    refresh: handle.refresh,
    cleanup: () => cleanups.forEach((fn) => fn()),
  }
}
