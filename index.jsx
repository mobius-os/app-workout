import React, {
  useState, useEffect, useCallback, useMemo, useRef,
} from 'react'
// Workout — thin shell. The pure, headless logic lives in logic.js (the unit-
// test target, listed in mobius.json source_files). UI components, the theme,
// the storage adapter, the embedded-agent prompt, and the display/analytics
// helpers live in their own modules and are imported below. This file keeps
// only the useDocument runtime binding and the App root that wires them.
import { CSS } from './theme.js'
import { makeStore } from './storage.js'
import {
  CHAT_PANE_MIN_PX,
  chatOpenKey, chatRatioKey, clampChatRatio, readChatOpen, readChatRatio,
} from './constants.js'
import { draftFromStoredEntry } from './format.js'
import {
  appendEntryToCurrentSession, assignSession, createSessionController,
  createVisiblePoller, currentSessionReady, entryBelongsToActiveDraft,
  groupSessions, lastEntryForExercise, localDate, makeCurrentSessionDocConfig,
  makeEntriesDocConfig, migrateLegacyState, normalizeCurrentSession,
  normalizeEntry, normalizeStoredEntries, reconcileDraftIds,
  sessionEntryMissing, strengthPRs,
} from './logic.js'
import { SportIcon } from './ui/SportIcon.jsx'
import { ChatBubbleIcon } from './ui/Icons.jsx'
import { useSyncStatus, SyncPill } from './ui/SyncPill.jsx'
import { ConfirmModal } from './ui/ConfirmModal.jsx'
import { ConfirmCard } from './ui/ConfirmCard.jsx'
import { AgentChatPanel } from './ui/AgentChatPanel.jsx'
import { QuickAddStrip } from './ui/QuickAddStrip.jsx'
import { CurrentSessionPanel } from './ui/CurrentSessionPanel.jsx'
import { InsightsTab } from './ui/InsightsTab.jsx'
import { AllTab } from './ui/AllTab.jsx'

// Bind useDocument ONCE to the app's own React, lazily, from the mobius runtime
// factory (window.mobius.createUseDocument(React)). The runtime is React-free
// and headless-testable, so the factory must be handed the React the app
// already imports — a self-binding window.mobius.useDocument would have no React
// to call hooks on. Lazy + memoized so importing this module for the pure-logic
// tests (no window.mobius) never throws; the error only fires if a render
// actually reaches useDocument without the runtime present.
let _useDocument = null
function getUseDocument() {
  if (_useDocument) return _useDocument
  const factory = (typeof window !== 'undefined') ? window.mobius?.createUseDocument : null
  if (typeof factory !== 'function') {
    throw new Error('useDocument needs the mobius runtime — window.mobius.createUseDocument(React) is unavailable')
  }
  _useDocument = factory(React)
  return _useDocument
}

function chatSessionFrom(session) {
  const normalized = normalizeCurrentSession(session)
  if (!normalized) return null
  return {
    id: normalized.id,
    startedAt: normalized.startedAt,
    localDate: normalized.localDate,
  }
}

// useDocument returns a BRAND-NEW handle object on every render (its return is a
// fresh { value, status, ... } literal). Feeding that ever-changing identity into
// a dependency array re-runs the memo/effect every render — and for the session
// controller that means it is RE-CREATED and its cleanup DISPOSES the prior one
// every render, which aborts the in-flight `load` with "controller disposed" so
// the session can never settle. This wraps a handle in a STABLE identity whose
// getters/methods always delegate to the latest render's handle: a dependent
// keeps one identity for the component's life, yet every read still sees fresh
// doc state. (Render-time reads keep using the raw handle directly.)
function useStableDocHandle(doc) {
  const ref = useRef(doc)
  ref.current = doc
  return useMemo(() => ({
    get value() { return ref.current.value },
    get status() { return ref.current.status },
    get lastError() { return ref.current.lastError },
    update: (fn) => ref.current.update(fn),
    set: (next) => ref.current.set(next),
    refresh: () => ref.current.refresh(),
  }), [])
}

export default function App({ appId, token }) {
  const store = useMemo(() => makeStore(appId, token), [appId, token])
  const [tab, setTab] = useState('session')
  const [bootStatus, setBootStatus] = useState('loading')
  const syncStatus = useSyncStatus(store)
  const bumpSync = syncStatus.bump

  // ── The two source-of-truth documents, each a useDocument handle (the mobius
  // runtime's serialized read-merge-write under If-Match/412 CAS). They REPLACE
  // the two bespoke serialized-write engines this app used to ship: the docs ARE
  // the React state (doc.value), and their update(fn) is the durable writer.
  //
  // The PROVEN merge/identity semantics are passed UNCHANGED as params, so the
  // data-loss guarantees are byte-identical to the hand-rolled engines:
  //   - entries.json: identity = the stable entry id; merge = mergeEntriesForSave
  //     with the WHOLE accumulated tombstone set (closed over below), so every
  //     write — local or a CAS reread-remerge — censors a deleted id against the
  //     fresh remote (the absorbing barrier).
  //   - current_session.json: a single object (not an array), so its merge is
  //     mergeCurrentSessions after reconcileDraftIds maps an id-less co-writer
  //     rewrite onto the in-memory ids by CONTENT signature — the id-churn that
  //     once duplicated workouts, now owned by the doc's reconciliation.
  // mode:'cas' is what CLOSES the cross-context finish-vs-agent residual: a
  // concurrent embedded-agent append the writer never saw is preserved through
  // the 412 reread-remerge loop, not lost to a whole-file last-write-wins.
  const useDocument = useMemo(() => getUseDocument(), [])

  // Absorbing-barrier tombstone set for entries.json: a deleted id never
  // resurrects. Closed over by the entries doc's merge so EVERY entries write
  // re-applies the WHOLE set against the fresh remote. A ref (not state): the
  // merge reads it synchronously inside update(); it must not need a re-render.
  const tombstonesRef = useRef(null)
  if (tombstonesRef.current === null) tombstonesRef.current = new Set()
  const tombstones = tombstonesRef.current

  // The doc configs are the PROVEN merge/identity semantics, packaged as pure
  // factories in logic.js (so index.jsx and the concurrency tests drive the SAME
  // params). The entries config reads the tombstone set FRESH on every merge, so
  // a CAS reread-remerge re-applies the whole absorbing barrier.
  const entriesConfig = useMemo(() => makeEntriesDocConfig(() => [...tombstones]), [tombstones])
  const currentConfig = useMemo(() => makeCurrentSessionDocConfig(), [])
  const entriesDoc = useDocument('entries.json', entriesConfig)
  const currentDoc = useDocument('current_session.json', currentConfig)

  // Stable identities for the two handles, for any hook whose dependency array
  // must not churn every render (the session controller and loadEntries below).
  // useDocument hands back a fresh object each render, so depending on the raw
  // handle would thrash those hooks; these proxies read through to live state.
  const entriesDocHandle = useStableDocHandle(entriesDoc)
  const currentDocHandle = useStableDocHandle(currentDoc)

  // React-facing aliases: the docs ARE the state. A null/empty doc value before
  // the first load reads as the old loading sentinel.
  const entries = entriesDoc.status === 'loading' ? null : entriesDoc.value
  const currentSession = currentDoc.value

  // Stamp id-less draft entries to STABLE ids ONCE per raw draft value, so the
  // ids the UI renders match the ids the draft transforms (delete/edit) filter
  // on. CurrentSessionPanel used to normalize for render and mint FRESH random
  // ids each render, while deleteDraftEntry/editSessionEntry compared them
  // against the raw id-less doc value — so the first tap on an agent-written
  // id-less draft no-opped and only "worked" on the second tap (after a write
  // had stamped ids). Passing this stamped session down, and reconciling each
  // write's fresh base against it below, makes the first tap land.
  const stampedSession = useMemo(() => normalizeCurrentSession(currentSession), [currentSession])
  const stampedSessionRef = useRef(stampedSession)
  stampedSessionRef.current = stampedSession

  // Feed the SyncPill from the docs' write status (durable resolve clears the
  // error; a rejected DurableWriteError sets it). Mirrors the old bumpSync(result).
  useEffect(() => {
    bumpSync(currentDoc.lastError ? { error: true } : { synced: true })
  }, [currentDoc.status, currentDoc.lastError])
  useEffect(() => {
    bumpSync(entriesDoc.lastError ? { error: true } : { synced: true })
  }, [entriesDoc.status, entriesDoc.lastError])

  // Retry hook for the SyncPill: the last failed intent re-enqueued on tap.
  const retryActionRef = useRef(null)
  // Re-entrancy guard for the Finish button only (so a double-tap can't enqueue
  // two finish intents). The controller would serialize them anyway, but the
  // button also drives a spinner + one-shot signals, so we gate the gesture.
  const finishInFlightRef = useRef(false)

  // ── The thin cross-FILE orchestrator (createSessionController in logic.js).
  // It no longer owns a write engine — each doc.update is the durable CAS writer.
  // Its remaining job is the part useDocument cannot: the cross-file Finish
  // transition (stamp → commit entries → clear draft) as ONE indivisible
  // sequence, and the tombstone barrier the entries merge enforces. One instance
  // per app instance (keyed by the docs), disposed on app switch so a
  // late-resolving step from the old app can't advance into the new one.
  const controller = useMemo(() => createSessionController({
    entriesDoc: entriesDocHandle,
    currentDoc: currentDocHandle,
    addTombstones: (ids) => { for (const id of ids || []) if (id) tombstones.add(id) },
    onWriteError: (err, source) => {
      // eslint-disable-next-line no-console
      console.error(`${source} failed`, err)
      bumpSync({ error: true })
      window.mobius?.signal?.('error', { message: err?.message || `${source} failed`, source })
    },
    onReadError: (err, source) => {
      // A refresh/poll READ failed — self-healing (the next tick retries), NOT a
      // save failure. Log it, but do NOT trip the write-error pill or emit a
      // per-tick error signal; the plain Offline pill covers the offline case.
      // eslint-disable-next-line no-console
      console.error(`${source} failed`, err)
    },
    // Reflection analytics emitter the controller uses for load-path signals
    // (agent_draft_idless). Guarded like every other app signal call.
    emitSignal: (name, payload) => window.mobius?.signal?.(name, payload),
  }), [entriesDocHandle, currentDocHandle, tombstones, bumpSync])
  // Dispose the previous controller on app switch / unmount so a stale enqueued
  // step from it can't advance into the new app.
  useEffect(() => () => controller.dispose(), [controller])

  const [finishing, setFinishing] = useState(false)
  // Brief "Session saved" confirmation after Finish. Auto-clears in 3s.
  const [sessionSaved, setSessionSaved] = useState(false)
  const sessionSavedTimerRef = useRef(null)
  const bodyRef = useRef(null)
  // Chat is HIDDEN by default; the header toggle opens it as the bottom pane of
  // a draggable split (ported from app-latex). chatRatio is the chat pane's
  // fraction of the body height; both persist per app.
  const [chatOpen, setChatOpen] = useState(() => readChatOpen(appId))
  const [chatRatio, setChatRatio] = useState(() => readChatRatio(appId))
  const [chatSession, setChatSession] = useState(null)

  useEffect(() => {
    if (!chatOpen) return
    const active = chatSessionFrom(stampedSession)
    if (!active) return
    setChatSession((prev) => (prev?.id === active.id ? prev : active))
  }, [chatOpen, stampedSession?.id, stampedSession?.localDate, stampedSession?.startedAt])

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
  const [clearSessionPending, setClearSessionPending] = useState(false)
  // A quick-add whose Date/Time falls outside the open draft's window: hold it
  // and prompt to clear the stale draft first (see commitQuickAdd). Shape:
  // { draft, ts, oldDate, newDate } | null.
  const [staleDraftPrompt, setStaleDraftPrompt] = useState(null)
  const navHandleRef = useRef(null)
  const staleDraftNavHandleRef = useRef(null)

  // DATA INVARIANT: under ANY interleaving of quick-add, History edit, History
  // delete, Finish, retry, poll, subscribe, and embedded-agent id-less co-write,
  // no entry is lost, resurrected, or duplicated. The single serialized
  // controller (above) enforces it — every entries.json mutation is enqueued as
  // an intent and processed strictly serially, re-reading fresh + applying the
  // whole tombstone set at process time.
  const enqueueEntriesWrite = useCallback((intent = {}) => controller.entriesWrite(intent), [controller])

  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    try { localStorage.setItem(chatOpenKey(appId), String(chatOpen)) } catch {}
  }, [appId, chatOpen])

  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    try { localStorage.setItem(chatRatioKey(appId), String(chatRatio)) } catch {}
  }, [appId, chatRatio])

  const loadEntries = useCallback(async (options = {}) => {
    // entries.json is the entries doc — refresh() re-reads the fresh remote and
    // reconciles it into entriesDoc.value (the React state). The doc's identity
    // (entry id) keeps stable ids across reads; its merge applies the tombstone
    // barrier, so a refresh never resurrects a just-deleted row.
    const loaded = await entriesDocHandle.refresh().catch(() => entriesDocHandle.value)
    const normalizedLoaded = normalizeStoredEntries(loaded)
    if (normalizedLoaded.length > 0) {
      if (options.setReady) setBootStatus('ready')
      // Persist a normalization-rewrite (a legacy/odd-shaped file) through the
      // durable writer so the canonical form lands on disk.
      if (Array.isArray(loaded) && JSON.stringify(loaded) !== JSON.stringify(normalizedLoaded)) {
        enqueueEntriesWrite({ upsertEntries: normalizedLoaded })
      }
      return normalizedLoaded
    }
    if (options.allowMigration) {
      const legacy = await store.get('state.json')
      if (legacy && Array.isArray(legacy.history) && legacy.history.length > 0) {
        const migrated = normalizeStoredEntries(migrateLegacyState(legacy))
        if (options.setReady) setBootStatus('ready')
        // Commit the migrated history through the durable writer (sets the doc).
        enqueueEntriesWrite({ upsertEntries: migrated })
        return migrated
      }
    }
    // A transient empty read is indistinguishable from a genuinely-empty store.
    // Only the initial boot (setReady) renders the real empty state; the doc's
    // optimistic value already preserves a non-empty list on a momentary empty
    // refresh (refresh keeps valueRef when the server read is null).
    if (options.setReady) setBootStatus('ready')
    return normalizeStoredEntries(entriesDocHandle.value)
  }, [enqueueEntriesWrite, entriesDocHandle, store])

  // Reload current_session.json through the controller. Every reload trigger —
  // initial mount, the subscribe callback, the poller tick, and
  // onEntriesMaybeChanged — calls THIS, which enqueues a pure-read `load`. The
  // controller refreshes currentDoc: it re-reads the fresh remote and reconciles
  // id-less entries against the optimistic value (the doc's identity), writing
  // NOTHING — so a concurrent agent append is never clobbered (the P0 property).
  // Because load runs on the controller's cross-file chain, it can never observe
  // a half-finished Finish transition.
  const loadCurrentSession = useCallback(() => controller.load(), [controller])

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
    }).catch(() => {})
    return () => { cancelled = true }
  }, [loadCurrentSession, loadEntries])

  // The embedded agent writes current_session.json mid-session from a chat
  // turn; without a subscription the card keeps its stale mount-time read and
  // the owner sees a blank panel after the agent logs a set. Re-load on every
  // external write so agent-written drafts surface live. The load is an enqueued
  // intent, so it serializes behind any in-flight write/finish.
  useEffect(() => {
    const unsub = store.subscribe('current_session.json', () => { controller.load() })
    return () => { if (typeof unsub === 'function') unsub() }
  }, [store, controller])

  // subscribe() above only fires for writes made through THIS client (or the
  // initial value). When a workout is logged from the MAIN shell chat, that
  // write lands on the server from a different context, so the runtime never
  // notifies this card — it stayed blank until a manual refresh. Poll the draft
  // while the tab is visible, and refresh immediately on focus / becoming
  // visible, so an agent-logged set surfaces within a few seconds with no
  // reload. The poll tick is an enqueued `load` intent: it serializes behind any
  // in-flight write/finish (so it can neither resurrect a just-cleared session
  // nor clobber an un-flushed quick-add) and the load no-ops its setState when
  // nothing changed.
  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return undefined
    return createVisiblePoller(() => controller.load(), { doc: document, win: window })
  }, [controller])

  // Append-only write through the durable CAS writer. entriesWrite folds the
  // deletions into the tombstone barrier and runs entriesDoc.update, which sets
  // the optimistic value (read-your-writes), merges the fresh remote on stable
  // id under CAS, and resolves durable / rejects on a non-durable write. On
  // failure it re-throws; the caller wires the retry. (nextEntries is ignored —
  // the doc derives the authoritative value from the upserts + fresh remote +
  // tombstones, so no separate optimistic setState is needed.)
  const persist = useCallback((nextEntries, options = {}) => {
    const intent = { upsertEntries: options.upsertEntries || [], deletedIds: options.deletedIds || [] }
    enqueueEntriesWrite(intent).catch((err) => {
      retryActionRef.current = () => enqueueEntriesWrite(intent)
      window.mobius?.signal?.('error', { message: err?.message || 'entries save failed', source: 'save' })
    })
  }, [enqueueEntriesWrite])

  const closeNestedNav = useCallback(() => {
    try { navHandleRef.current?.close?.() } catch {}
    navHandleRef.current = null
  }, [])

  const closeStaleDraftNav = useCallback(() => {
    try { staleDraftNavHandleRef.current?.close?.() } catch {}
    staleDraftNavHandleRef.current = null
  }, [])

  const closeStaleDraftPrompt = useCallback(() => {
    closeStaleDraftNav()
    setStaleDraftPrompt(null)
  }, [closeStaleDraftNav])

  const openStaleDraftPrompt = useCallback(async (prompt) => {
    closeStaleDraftNav()
    if (window.mobius?.nav?.open) {
      const handle = window.mobius.nav.open('workout-stale-draft', () => {
        staleDraftNavHandleRef.current = null
        setStaleDraftPrompt(null)
      })
      staleDraftNavHandleRef.current = handle
      await handle.ready?.catch(() => false)
      if (staleDraftNavHandleRef.current !== handle) return
    }
    setStaleDraftPrompt(prompt)
  }, [closeStaleDraftNav])

  // Quick-add writes the current-session draft, never entries.json directly.
  // The first saved entry implicitly starts a session (the CurrentSessionPanel
  // appearing with the entry IS the save feedback); entries reach committed
  // history exactly once, when Finish session commits the draft.
  const commitQuickAdd = useCallback(async (draft, ts, opts = {}) => {
    const entry = normalizeEntry(draft, {
      ts,
      raw: '',
      source: 'manual',
      confirmed: true,
    })
    // A quick-add whose chosen Date/Time falls OUTSIDE the open draft's window
    // can't just fork a fresh draft: current_session.json is one slot with a UNION
    // merge, which would re-combine the fork back into the stale draft under the
    // older start date — that IS the misdating bug. So block it here and prompt
    // the owner to clear the stale draft first (confirmStaleDraftReplace clears,
    // then re-logs with skipStaleCheck so the entry keeps its own date). Also emit
    // draft_stale_resumed {age_hours} so Reflection sees the UX-expiry case.
    if (!opts.skipStaleCheck) {
      const activeDraft = normalizeCurrentSession(controller.getSession())
      if (activeDraft && !entryBelongsToActiveDraft(activeDraft, ts)) {
        const ageHours = Math.max(0, Math.round((Date.now() - activeDraft.startedAt) / 3_600_000))
        window.mobius?.signal?.('draft_stale_resumed', { age_hours: ageHours })
        await openStaleDraftPrompt({
          draft,
          ts,
          oldDate: activeDraft.localDate,
          newDate: localDate(new Date(ts)),
        })
        return
      }
    }
    // Enqueue a session-transform intent. The controller re-reads the freshest
    // store value AT PROCESS TIME and merges it with its in-memory truth FIRST
    // (so an agent entry the read missed AND an earlier un-flushed quick-add
    // both survive), then this transform appends. Serial by construction: two
    // quick-adds — or a quick-add racing Finish — cannot interleave a
    // read-modify-write and drop an entry.
    try {
      await controller.sessionWrite((base) => appendEntryToCurrentSession(base, entry, ts))
    } catch (err) {
      retryActionRef.current = () => commitQuickAdd(draft, ts)
      window.mobius?.signal?.('error', {
        message: err?.message || 'current session save failed',
        source: 'quick_add',
      })
      return
    }
    closeNestedNav()
    setQuickAddDraft(null)
    setLastEntryForQuickAdd(null)
    setTab('session')
    retryActionRef.current = null
    // item_created {type, source}: the domain noun is the activity category, so
    // Reflection can compare manual workout categories against the canonical
    // vocabulary. source:'quick_add' marks the manual strip (vs the embedded
    // chat) so the owner can weigh whether the chat feature earns its complexity.
    window.mobius?.signal?.('item_created', { type: entry.category, source: 'quick_add' })
  }, [closeNestedNav, controller, openStaleDraftPrompt])

  // The stale-draft prompt confirmed: discard the open (stale) draft, then log the
  // held quick-add. Clearing FIRST is what lets the new entry keep its own date —
  // with the stale draft gone, the append starts a fresh session the UNION merge
  // won't re-combine. Both steps run serially on the controller chain (clear then
  // append), so no other local write interleaves between them.
  // Clear the stale draft, then log the held entry — as ONE atomic-intent unit.
  // The retry action re-runs THIS whole sequence, never just the append: if the
  // clear fails, retrying only the log with skipStaleCheck would append into the
  // still-present stale draft and re-stamp the entry under the old date (the very
  // corruption this flow exists to prevent).
  const clearThenLog = useCallback(async (pending) => {
    // Snapshot the stale draft's size before discarding it (same as the manual
    // clear path) so session_cleared carries the abandonment magnitude.
    const clearedCount = stampedSessionRef.current?.entries?.length ?? 0
    try {
      await controller.sessionWrite(() => null)
    } catch (err) {
      retryActionRef.current = () => clearThenLog(pending)
      window.mobius?.signal?.('error', {
        message: err?.message || 'current session save failed',
        source: 'session_clear',
      })
      return
    }
    // session_cleared: the stale draft was discarded to log a newer-dated entry —
    // the second abandonment path the launch drop-off metric must cover.
    window.mobius?.signal?.('session_cleared', { reason: 'stale_replace', entry_count: clearedCount })
    await commitQuickAdd(pending.draft, pending.ts, { skipStaleCheck: true })
  }, [controller, commitQuickAdd])

  const confirmStaleDraftReplace = useCallback(async () => {
    const pending = staleDraftPrompt
    closeStaleDraftPrompt()
    if (!pending) return
    await clearThenLog(pending)
  }, [staleDraftPrompt, closeStaleDraftPrompt, clearThenLog])

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
    persist(
      (entries || []).map((row) => (row.id === editingEntry.id ? entry : row)),
      { upsertEntries: [entry] },
    )
    setEditingEntry(null)
    setTab('history')
  }, [editingEntry, entries, persist])

  const deleteEntry = useCallback((id) => {
    persist((entries || []).filter((e) => e.id !== id), { deletedIds: [id] })
    window.mobius?.signal?.('item_deleted')
  }, [entries, persist])

  const deleteDraftEntry = useCallback(async (id) => {
    if (!id) return
    try {
      await controller.sessionWrite((base) => {
        if (!base) return null
        // Reconcile the fresh write base's id-less entries against the ids the UI
        // rendered (stampedSessionRef), so the tapped row's id matches a base
        // entry on the FIRST interaction. reconcileDraftIds is a no-op once every
        // entry already carries an id, so the normal (post-first-write) path is
        // unchanged.
        const reconciled = reconcileDraftIds(base, stampedSessionRef.current)
        const rawEntries = Array.isArray(reconciled.entries) ? reconciled.entries : []
        const nextEntries = rawEntries.filter((entry) => entry.id !== id)
        if (nextEntries.length === 0) return null
        return normalizeCurrentSession({ ...reconciled, entries: nextEntries }, reconciled.startedAt)
      })
      retryActionRef.current = null
    } catch (err) {
      retryActionRef.current = () => deleteDraftEntry(id)
      window.mobius?.signal?.('error', {
        message: err?.message || 'current session save failed',
        source: 'draft_delete',
      })
    }
  }, [controller])

  // In-place edit of a live-session entry's metrics (the worksheet). Rides the
  // SAME serialized sessionWrite path as delete-draft/quick-add: the transform
  // receives the freshest merged draft, replaces the matching entry by id with a
  // re-normalized copy (SI, from the worksheet's display-unit draft) preserving
  // id/ts/sessionId, and re-normalizes the whole session. No new write path, so
  // the CAS/merge/tombstone guarantees are untouched — a concurrent agent append
  // or quick-add still merges in on the same chain. metricsDraft is in the loose
  // display-unit "parsed" shape (same shape ConfirmCard builds); normalizeEntry
  // converts it to SI.
  const editSessionEntry = useCallback(async (entryId, metricsDraft) => {
    if (!entryId) return
    try {
      await controller.sessionWrite((base) => {
        if (!base) return base
        // Same first-tap reconciliation as deleteDraftEntry: stamp the base's
        // id-less entries with the rendered ids so entryId matches on the first
        // edit. No-op once entries already carry ids.
        const reconciled = reconcileDraftIds(base, stampedSessionRef.current)
        const rawEntries = Array.isArray(reconciled.entries) ? reconciled.entries : []
        const nextEntries = rawEntries.map((entry) => {
          if (entry.id !== entryId) return entry
          return normalizeEntry(
            { category: entry.category, activity: entry.activity, metrics: metricsDraft },
            {
              id: entry.id,
              ts: entry.ts,
              sessionId: entry.sessionId,
              raw: entry.raw || '',
              source: entry.source || 'manual',
              confirmed: entry.confirmed !== false,
            },
          )
        })
        return normalizeCurrentSession({ ...reconciled, entries: nextEntries }, reconciled.startedAt)
      })
      retryActionRef.current = null
      // item_updated {type:'draft_entry'}: a worksheet edit landed durably, so
      // Reflection can see the worksheet doing real completion work, not display.
      window.mobius?.signal?.('item_updated', { type: 'draft_entry' })
    } catch (err) {
      retryActionRef.current = () => editSessionEntry(entryId, metricsDraft)
      window.mobius?.signal?.('error', {
        message: err?.message || 'current session save failed',
        source: 'draft_edit',
      })
    }
  }, [controller])

  const clearCurrentSession = useCallback(async () => {
    // Snapshot the draft size BEFORE the clear so session_cleared reports how much
    // was abandoned (the drop-off magnitude), not the post-clear empty state.
    const clearedCount = stampedSessionRef.current?.entries?.length ?? 0
    try {
      await controller.sessionWrite(() => null)
      closeNestedNav()
      setChatOpen(false)
      setChatSession(null)
      retryActionRef.current = null
      // session_cleared: the user deliberately abandoned a live draft. Abandonment
      // is the biggest launch drop-off metric, and the app instruments finishes
      // and PRs but never this. reason separates it from the stale-draft replace.
      window.mobius?.signal?.('session_cleared', { reason: 'manual', entry_count: clearedCount })
    } catch (err) {
      retryActionRef.current = clearCurrentSession
      window.mobius?.signal?.('error', {
        message: err?.message || 'current session save failed',
        source: 'session_clear',
      })
    } finally {
      // Always drop the confirm modal, even on a failed clear, so a rejected
      // write can't leave the "Clear session?" dialog stuck open. The retry pill
      // (retryActionRef) is the recovery path on failure, not a wedged modal.
      setClearSessionPending(false)
    }
  }, [closeNestedNav, controller])

  const finishCurrentSession = useCallback(async () => {
    if (finishInFlightRef.current) return
    if (!currentSessionReady(currentSession)) {
      // finish_blocked {missing}: the user reached Finish but a required field is
      // still empty (an incomplete agent-written entry, or a gap the worksheet
      // hasn't filled). Reflection uses this to spot prompt/entry-completion gaps.
      const normalized = normalizeCurrentSession(currentSession)
      const missing = normalized && normalized.entries.length
        ? (normalized.entries.map(sessionEntryMissing).find(Boolean) || 'unknown')
        : 'empty'
      window.mobius?.signal?.('finish_blocked', { missing })
      return
    }
    // Snapshot for the post-commit signals BEFORE the controller clears state.
    const finishedSession = currentSession
    const prevEntries = entries || []
    finishInFlightRef.current = true
    setFinishing(true)
    try {
      // Finish is ONE indivisible intent on the controller's chain: it re-reads +
      // merges the freshest draft, commits its ready entries to entries.json
      // DURABLY (same tombstone-honoring writer as every other entries write, so
      // it can't race a history delete/edit and resurrect/revert a row), and only
      // THEN clears current_session.json. Because it runs serially with every
      // load/quick-add, the load-vs-finish resurrection is impossible: a load
      // either fully precedes finish (its write is superseded by finish's clear)
      // or fully follows it (it reads the cleared file and writes nothing).
      const { committed, entries: nextEntries } = await controller.finish()
      if (committed.length === 0) return
      retryActionRef.current = null

      // Show a brief "Session saved" confirmation on the Session tab.
      clearTimeout(sessionSavedTimerRef.current)
      setSessionSaved(true)
      sessionSavedTimerRef.current = setTimeout(() => setSessionSaved(false), 3000)

      // session_logged: one signal per user "Finish session" gesture.
      const durationMin = finishedSession
        ? Math.round((Date.now() - (finishedSession.startedAt || Date.now())) / 60000)
        : undefined
      window.mobius?.signal?.('session_logged', {
        exercise_count: committed.length,
        ...(durationMin != null && durationMin > 0 ? { duration_min: durationMin } : {}),
      })

      // pr_hit: emit once per strength exercise that sets a new e1RM.
      const prevPRs = strengthPRs(prevEntries)
      const prevMap = new Map(prevPRs.map((pr) => [pr.activity, pr.e1rm]))
      const nextPRs = strengthPRs(nextEntries || [])
      for (const pr of nextPRs) {
        const prev = prevMap.get(pr.activity)
        if (prev == null || pr.e1rm > prev) {
          window.mobius?.signal?.('pr_hit', { exercise: pr.activity })
        }
      }
    } catch (err) {
      retryActionRef.current = finishCurrentSession
      window.mobius?.signal?.('error', {
        message: err?.message || 'finish session failed',
        source: 'finish',
      })
    } finally {
      finishInFlightRef.current = false
      setFinishing(false)
    }
  }, [controller, currentSession, entries])

  const retryFailedSave = useCallback(() => {
    const retry = retryActionRef.current
    if (retry) {
      retry()
      return
    }
    syncStatus.refresh()
  }, [syncStatus])

  const ensureChatSession = useCallback(async () => {
    const active = chatSessionFrom(controller.getSession())
    if (active) {
      setChatSession(active)
      return active
    }
    const startedAt = Date.now()
    const draft = normalizeCurrentSession({
      id: `session-${startedAt}`,
      startedAt,
      status: 'active',
      entries: [],
    }, startedAt)
    try {
      await controller.sessionWrite((base) => normalizeCurrentSession(base) || draft)
      const next = chatSessionFrom(controller.getSession()) || chatSessionFrom(draft)
      setChatSession(next)
      return next
    } catch (err) {
      retryActionRef.current = ensureChatSession
      window.mobius?.signal?.('error', {
        message: err?.message || 'current session save failed',
        source: 'chat_session_start',
      })
      return null
    }
  }, [controller])

  const toggleChat = useCallback(async () => {
    if (chatOpen) {
      setChatOpen(false)
      if (!chatSessionFrom(controller.getSession())) setChatSession(null)
      return
    }
    const sessionForChat = await ensureChatSession()
    if (!sessionForChat) return
    // Turning on always spawns a 50/50 split — the divider in the middle —
    // regardless of where a previous drag left it.
    setChatRatio(0.5)
    setChatOpen(true)
    // chat_opened: fires on a closed→open transition so Reflection can tell
    // whether the embedded-agent feature is used or quick-add carries the app.
    window.mobius?.signal?.('chat_opened')
  }, [chatOpen, controller, ensureChatSession])

  useEffect(() => {
    if (!chatOpen) return
    if (chatSessionFrom(stampedSession) || chatSession) return
    ensureChatSession()
  }, [chatOpen, chatSession?.id, ensureChatSession, stampedSession?.id])

  const beginChatResize = useCallback((event) => {
    event.preventDefault()
    const body = bodyRef.current
    if (!body) return
    const total = body.getBoundingClientRect().height
    if (!total) return
    const startY = event.clientY
    const startRatioPx = total * chatRatio
    const divider = event.currentTarget
    const pointerId = event.pointerId
    divider.setPointerCapture?.(pointerId)
    const onMove = (moveEvent) => {
      // Px-bounded, not fractional: dragging all the way down collapses the
      // chat to exactly the composer pill (CHAT_PANE_MIN_PX) and no smaller;
      // dragging all the way up leaves at least one pill of content visible.
      const desiredPx = startRatioPx + startY - moveEvent.clientY
      setChatRatio(clampChatRatio(desiredPx, total, CHAT_PANE_MIN_PX))
    }
    // One teardown for every way the drag can end. pointerup is the normal
    // case, but an interrupted drag (incoming notification, system gesture
    // cancel, focus steal) fires pointercancel / lostpointercapture INSTEAD —
    // without handling those the move listener and the pointer capture leak,
    // leaving the divider stuck "grabbing" the pointer. releasePointerCapture
    // throws if the id is no longer captured (e.g. lostpointercapture already
    // released it), so it's guarded.
    const endDrag = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
      divider.removeEventListener('lostpointercapture', endDrag)
      try { divider.releasePointerCapture?.(pointerId) } catch {}
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
    divider.addEventListener('lostpointercapture', endDrag)
  }, [chatRatio])

  const handleResizeKey = useCallback((event) => {
    const total = bodyRef.current?.getBoundingClientRect().height || 0
    if (!total) return
    // Same px floor as the drag path: Home collapses the chat to exactly the
    // composer pill, End leaves one pill of content; Arrows step by ~6% but can
    // never cross either floor (clampChatRatio enforces both ends).
    const step = total * 0.06
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setChatRatio((r) => clampChatRatio(r * total + step, total, CHAT_PANE_MIN_PX))
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setChatRatio((r) => clampChatRatio(r * total - step, total, CHAT_PANE_MIN_PX))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setChatRatio(clampChatRatio(0, total, CHAT_PANE_MIN_PX))
    } else if (event.key === 'End') {
      event.preventDefault()
      setChatRatio(clampChatRatio(total, total, CHAT_PANE_MIN_PX))
    }
  }, [])

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
        closeStaleDraftPrompt()
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
  }, [closeNestedNav, closeStaleDraftPrompt])

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

  const openClearSessionConfirm = useCallback(async () => {
    closeNestedNav()
    if (window.mobius?.nav?.open) {
      const handle = window.mobius.nav.open('workout-clear-session', () => {
        navHandleRef.current = null
        setClearSessionPending(false)
      })
      navHandleRef.current = handle
      await handle.ready?.catch(() => false)
      if (navHandleRef.current !== handle) return
    }
    setClearSessionPending(true)
  }, [closeNestedNav])

  useEffect(() => {
    if (editingEntry || deletePending || quickAddDraft || clearSessionPending || staleDraftPrompt) return
    closeNestedNav()
  }, [editingEntry, deletePending, quickAddDraft, clearSessionPending, staleDraftPrompt, closeNestedNav])

  useEffect(() => () => {
    closeStaleDraftNav()
    closeNestedNav()
  }, [closeStaleDraftNav, closeNestedNav])

  if (bootStatus === 'loading') {
    return <div className="wk-root"><style>{CSS}</style><div className="wk-loading">Loading…</div></div>
  }

  const subtitle = tab === 'session' ? (currentSession ? 'Session in progress.' : 'Ready to train.')
    : tab === 'insights' ? 'See the shape of it.'
    : 'Everything you\'ve logged.'

  // Chat is a session-tab affordance: the split renders only when the toggle is
  // on, we're on the Session tab, and no full-screen card (edit/quick-add) owns
  // the body. This single flag gates the header toggle-state, the body's split
  // class + vars, and the divider/panel.
  const activeChatSession = chatSessionFrom(stampedSession) || chatSession
  const chatOnSessionTab = !!(chatOpen && activeChatSession && tab === 'session' && !editingEntry && !quickAddDraft)

  return (
    <div className="wk-root">
      <style>{CSS}</style>
      <div className="wk-header">
        <div className="wk-brand">
          {/* Brand mark: the app's real glossy icon (downscaled + cached),
              no name text. Falls back to an accent dot when this install
              has no custom icon and the route 404s. */}
          <img
            src={`/api/apps/${appId}/icon?size=64`}
            alt=""
            width={34}
            height={34}
            className="wk-brand-icon"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
              const f = e.currentTarget.nextElementSibling
              if (f) f.style.display = 'flex'
            }}
          />
          <span className="wk-brand-fallback" style={{ display: 'none' }} aria-hidden="true">·</span>
          <p className="wk-subtitle">{subtitle}</p>
        </div>
        <div className="wk-header-actions">
          <SyncPill status={syncStatus} onRetry={retryFailedSave} />
          {!editingEntry && !quickAddDraft && tab === 'session' && (
            <button
              type="button"
              className="wk-icon-btn wk-chat-toggle"
              aria-label={chatOpen ? 'Close chat' : 'Open chat'}
              aria-pressed={chatOpen}
              title={chatOpen ? 'Close chat' : 'Open chat'}
              onClick={toggleChat}
            >
              <ChatBubbleIcon size={18} />
            </button>
          )}
        </div>
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
          <button className={`wk-tab-btn${tab === 'insights' ? ' is-active' : ''}`}
            onClick={() => {
              // insights_viewed: fire only on a real switch INTO Insights (not a
              // re-tap while already there), so Reflection can tell whether the
              // analytics/PR surface is used or dead weight.
              if (tab !== 'insights') window.mobius?.signal?.('insights_viewed', { source: 'tab' })
              setTab('insights')
            }}
            role="tab" aria-selected={tab === 'insights'} aria-label="Insights">
            <span className="wk-tab-icon" aria-hidden><SportIcon name="chart-bar" size={15} /></span>Insights
          </button>
        </nav>
      )}

      <div
        ref={bodyRef}
        className={`wk-body${chatOnSessionTab ? ' wk-body--chat-open' : ''}`}
        style={chatOnSessionTab
          ? { '--chat-ratio': chatRatio, '--chat-pane-min': `${CHAT_PANE_MIN_PX}px` }
          : undefined}
      >
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
                    {stampedSession && (
                      <CurrentSessionPanel
                        session={stampedSession}
                        onFinish={finishCurrentSession}
                        onDeleteEntry={deleteDraftEntry}
                        onEditEntry={editSessionEntry}
                        onClear={openClearSessionConfirm}
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

        {chatOnSessionTab && (
          <>
            <div
              className="wk-chat-divider"
              role="separator"
              aria-label="Resize workout chat"
              aria-orientation="horizontal"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(chatRatio * 100)}
              tabIndex={0}
              onPointerDown={beginChatResize}
              onKeyDown={handleResizeKey}
            >
              <span className="wk-chat-divider-bar" aria-hidden="true" />
            </div>
            <AgentChatPanel
              appId={appId}
              token={token}
              store={store}
              session={activeChatSession}
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
      {clearSessionPending && (
        <ConfirmModal
          title="Clear current session?"
          body="This removes the draft workout. Finished history is not changed."
          confirmLabel="Clear"
          onConfirm={clearCurrentSession}
          onCancel={() => { closeNestedNav(); setClearSessionPending(false) }}
        />
      )}
      {staleDraftPrompt && (
        <ConfirmModal
          title="Start a new session?"
          body={`Your current session is from ${staleDraftPrompt.oldDate}. Logging this ${staleDraftPrompt.newDate} entry discards that unfinished draft and starts a new session.`}
          confirmLabel="Discard & log"
          onConfirm={confirmStaleDraftReplace}
          onCancel={closeStaleDraftPrompt}
        />
      )}
    </div>
  )
}
