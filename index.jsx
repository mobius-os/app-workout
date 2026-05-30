import React, {
  useState, useEffect, useCallback, useMemo, useRef,
} from 'react'

// ---------------------------------------------------------------------------
// Storage layer
// ---------------------------------------------------------------------------
// Two paths into the same place:
//   1. window.mobius.storage   — the offline runtime (worktree session-offline).
//                                Reads/writes the local outbox so the app works
//                                without a network, then syncs when the shell
//                                reconnects.
//   2. fetch(/api/storage/...) — direct backend call. Used when the offline
//                                runtime is not installed yet.
//
// We probe `window.mobius?.storage` at call time (not at module load) so the
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
      // state.json is JSON; tolerate empty body.
      const text = await r.text()
      if (!text) return null
      try { return JSON.parse(text) } catch { return null }
    } catch { return null }
  }

  // Returns the shim's {synced:true} | {queued:true} when the runtime is
  // present so callers can branch their UI ("Saved" vs "Pending"). When
  // the runtime isn't loaded we fall back to a direct PUT and return a
  // synthetic {synced:true} on success so the caller sees the same shape.
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
      // No runtime + no network = caller has no offline mirror; best we
      // can do is signal failure so the indicator can flag it.
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

  return { get, set, pendingCount }
}

// ---------------------------------------------------------------------------
// Defaults — used only if state.json failed to seed (older mobius without
// storage_seeds support, or a manual install path). The manifest's
// storage_seeds.state.json is the canonical starter pack with all three
// programs; this constant is a deliberately-minimal belt-and-braces fallback
// so the app is never blank. `starter_pack_installed: false` flags that the
// full pack didn't land — the Programs tab uses it to show a hint that the
// user can reinstall to get the rest.
// ---------------------------------------------------------------------------

const FALLBACK_STATE = {
  active_program_id: 'ppl6',
  starter_pack_installed: false,
  history: [],
  programs: {
    ppl6: {
      name: 'Push / Pull / Legs (6-day)',
      sessions: [
        { day: 'Mon', name: 'Push A', exercises: [
          { name: 'Bench Press', sets: 4, reps: 6, default_weight: 60 },
          { name: 'Overhead Press', sets: 3, reps: 8, default_weight: 40 },
        ] },
      ],
    },
  },
}

// ---------------------------------------------------------------------------
// Styles — every color/font comes from a CSS token painted by the Möbius
// shell. The shell repaints these on theme change, so the app inherits any
// future themes without us touching this file.
// ---------------------------------------------------------------------------

const S = {
  root: {
    height: '100%', display: 'flex', flexDirection: 'column',
    background: 'var(--bg)', color: 'var(--text)',
    fontFamily: 'var(--font)',
    maxWidth: '100%', overflowX: 'hidden',
  },
  header: {
    padding: '18px 20px 12px', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', flexShrink: 0,
    borderBottom: '1px solid var(--border)',
  },
  title: { fontSize: '22px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 },
  subtitle: { fontSize: '12px', color: 'var(--muted)', margin: '2px 0 0' },

  // Scroll surface — `pb` reserves room for the bottom tab bar so the last
  // row of content is reachable above the fixed nav.
  scroll: {
    flex: 1, overflowY: 'auto', overflowX: 'hidden',
    padding: '14px 20px 96px',
    wordBreak: 'break-word', overflowWrap: 'anywhere',
  },

  // Bottom tab bar — fixed inside the app frame, not the viewport, because
  // the Möbius shell already owns the viewport's bottom edge.
  tabbar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    display: 'flex',
    background: 'var(--surface)',
    borderTop: '1px solid var(--border)',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    flexShrink: 0,
  },
  tabBtn: (active) => ({
    flex: 1, padding: '12px 8px 14px', border: 'none', cursor: 'pointer',
    background: 'transparent',
    color: active ? 'var(--accent)' : 'var(--muted)',
    fontFamily: 'var(--font)', fontSize: '12px', fontWeight: 600,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
  }),
  tabIcon: { fontSize: '20px', lineHeight: 1 },

  // Cards — the universal container for Today's session card, programs,
  // PR rows, etc.
  card: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '14px', padding: '16px', marginBottom: '14px',
  },
  cardTitle: { fontSize: '16px', fontWeight: 700, margin: '0 0 4px' },
  cardSub: { fontSize: '12px', color: 'var(--muted)', margin: '0 0 12px' },

  // Buttons — chunky, accent-filled for primary; outlined surface for
  // secondary. Big tap targets per spec (48px tall minimum on primaries).
  btnPrimary: {
    width: '100%', padding: '14px 16px', borderRadius: '12px',
    border: 'none', background: 'var(--accent)', color: '#fff',
    fontFamily: 'var(--font)', fontSize: '15px', fontWeight: 600,
    cursor: 'pointer', minHeight: '48px',
  },
  btnSecondary: {
    padding: '10px 14px', borderRadius: '10px',
    border: '1px solid var(--border)', background: 'var(--surface2, var(--surface))',
    color: 'var(--text)', fontFamily: 'var(--font)',
    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
  },
  btnGhost: {
    padding: '8px 12px', borderRadius: '8px',
    border: 'none', background: 'transparent',
    color: 'var(--accent)', fontFamily: 'var(--font)',
    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
  },
  btnRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' },

  // Exercise list inside today's preview card
  exerciseRow: {
    display: 'flex', justifyContent: 'space-between',
    padding: '10px 0', borderBottom: '1px solid var(--border)',
    fontSize: '14px',
  },
  exerciseName: { color: 'var(--text)', fontWeight: 500 },
  exerciseMeta: { color: 'var(--muted)', fontSize: '12px' },

  // Sticky rest timer at top of session logger
  restBar: (active) => ({
    position: 'sticky', top: 0, zIndex: 10,
    background: active ? 'var(--accent)' : 'var(--surface)',
    color: active ? '#fff' : 'var(--text)',
    padding: '12px 16px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    borderBottom: '1px solid var(--border)',
    margin: '-14px -20px 14px',
    fontSize: '15px', fontWeight: 600,
    transition: 'background 0.2s',
  }),
  restBtn: {
    border: '1px solid currentColor', background: 'transparent',
    color: 'inherit', padding: '6px 12px', borderRadius: '8px',
    fontFamily: 'var(--font)', fontSize: '12px', fontWeight: 600,
    cursor: 'pointer',
  },

  // Set logger — one row per set, with chunky +/- weight buttons.
  exerciseBlock: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '14px', padding: '14px 14px 6px', marginBottom: '14px',
  },
  exerciseHead: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    marginBottom: '8px',
  },
  exerciseHeadName: { fontSize: '15px', fontWeight: 700, margin: 0 },
  exerciseHeadTarget: { fontSize: '12px', color: 'var(--muted)' },
  setRow: {
    display: 'grid',
    gridTemplateColumns: '28px 1fr 1fr auto',
    alignItems: 'center', gap: '8px',
    padding: '8px 0', borderTop: '1px solid var(--border)',
  },
  setIdx: { fontSize: '13px', fontWeight: 600, color: 'var(--muted)' },
  // Number-stepper: -/value/+ in one tidy widget. Big enough to thumb.
  stepper: {
    display: 'flex', alignItems: 'center', gap: '4px',
    background: 'var(--surface2, var(--bg))',
    border: '1px solid var(--border)', borderRadius: '10px',
    padding: '2px',
  },
  // 44px tap target per iOS HIG — the visual ± stays the same, the
  // surface around it is the bit your thumb actually lands on.
  stepBtn: {
    width: '44px', height: '44px',
    border: 'none', background: 'transparent', color: 'var(--text)',
    fontSize: '18px', fontWeight: 700, cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
  stepValue: {
    minWidth: '56px', textAlign: 'center',
    fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: '15px',
  },
  stepLabel: {
    fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase',
    letterSpacing: '0.5px', textAlign: 'center', marginTop: '2px',
  },
  stepWrap: { display: 'flex', flexDirection: 'column', gap: '2px' },
  doneToggle: (done) => ({
    width: '44px', height: '44px', borderRadius: '10px',
    border: `1px solid ${done ? 'var(--accent)' : 'var(--border)'}`,
    background: done ? 'var(--accent)' : 'transparent',
    color: done ? '#fff' : 'var(--muted)',
    fontSize: '18px', fontWeight: 700, cursor: 'pointer',
    fontFamily: 'var(--font)',
  }),

  // Inputs
  textarea: {
    width: '100%', minHeight: '72px',
    fontFamily: 'var(--font)', fontSize: '13px', lineHeight: 1.5,
    padding: '10px',
    background: 'var(--surface2, var(--surface))', color: 'var(--text)',
    border: '1px solid var(--border)', borderRadius: '10px',
    outline: 'none', resize: 'vertical', boxSizing: 'border-box',
  },
  textInput: {
    width: '100%', fontFamily: 'var(--font)', fontSize: '14px',
    padding: '10px',
    background: 'var(--surface2, var(--surface))', color: 'var(--text)',
    border: '1px solid var(--border)', borderRadius: '10px',
    outline: 'none', boxSizing: 'border-box',
  },
  label: { fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' },

  // Programs tab
  programRow: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '12px', padding: '14px',
    marginBottom: '10px', cursor: 'pointer',
  },
  programRowActive: {
    borderColor: 'var(--accent)',
    boxShadow: '0 0 0 1px var(--accent)',
  },
  programRowHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  programRowName: { fontSize: '15px', fontWeight: 700, margin: 0 },
  badge: {
    fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px',
    color: 'var(--accent)', fontWeight: 700,
  },

  // History
  heatmap: {
    width: '100%', height: 'auto', display: 'block',
    marginTop: '8px',
  },
  prTable: {
    width: '100%', borderCollapse: 'collapse', fontSize: '13px',
    marginTop: '8px',
  },
  prTh: {
    textAlign: 'left', fontWeight: 600, color: 'var(--muted)',
    padding: '8px 6px', borderBottom: '1px solid var(--border)',
    fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px',
  },
  prTd: {
    padding: '10px 6px', borderBottom: '1px solid var(--border)',
  },
  chartCard: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '12px', padding: '12px', marginBottom: '12px',
  },
  chartTitle: { fontSize: '13px', fontWeight: 700, margin: '0 0 4px' },
  chartSub: { fontSize: '11px', color: 'var(--muted)', margin: '0 0 8px' },

  empty: {
    textAlign: 'center', padding: '36px 16px', color: 'var(--muted)',
    fontSize: '13px', lineHeight: 1.6,
  },
  loading: {
    textAlign: 'center', padding: '40px 16px', color: 'var(--muted)',
    fontSize: '13px',
  },

  // In-app confirm modal. The Möbius sandbox excludes `allow-modals`,
  // which makes window.confirm/alert/prompt silently no-op and return
  // false — so destructive actions need their own in-DOM dialog.
  modalScrim: {
    position: 'absolute', inset: 0, zIndex: 100,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '20px',
  },
  modal: {
    background: 'var(--surface)', borderRadius: '14px',
    border: '1px solid var(--border)',
    padding: '20px', maxWidth: '320px', width: '100%',
    boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
  },
  modalTitle: { fontSize: '16px', fontWeight: 700, margin: '0 0 6px' },
  modalBody: { fontSize: '13px', color: 'var(--muted)', margin: '0 0 16px', lineHeight: 1.5 },
  modalBtns: { display: 'flex', gap: '8px', justifyContent: 'flex-end' },

  // Sync-status pill — sits in the header, also passed into the session
  // logger so it's visible while logging. Three states: idle ("Saved"),
  // pending writes ("Offline · N pending" or "Syncing · N"), and a
  // transient "Saving…" right after a write resolves. Auto-hides itself
  // when there's nothing to say (online + 0 pending + not flashing).
  pill: (variant) => ({
    fontSize: '11px', fontWeight: 600,
    padding: '4px 10px', borderRadius: '999px',
    letterSpacing: '0.2px',
    background: variant === 'offline'
      ? 'var(--surface2, var(--surface))'
      : variant === 'pending'
        ? 'var(--surface2, var(--surface))'
        : 'transparent',
    border: `1px solid ${
      variant === 'offline' ? 'var(--accent)'
        : variant === 'pending' ? 'var(--border)'
        : 'var(--border)'
    }`,
    color: variant === 'offline' ? 'var(--accent)' : 'var(--muted)',
    whiteSpace: 'nowrap',
  }),
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayISO() {
  const d = new Date()
  // Local-day ISO (YYYY-MM-DD). The user thinks "did I lift today" in
  // their local clock, not UTC, so we slice from a local-date string.
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fmtElapsed(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

// Estimate 1RM via the Epley formula. Used to rank PRs across
// (weight, reps) pairs so a 100kg×5 ranks above 110kg×1.
function estimate1RM(weight, reps) {
  if (!weight || !reps) return 0
  if (reps === 1) return weight
  return Math.round(weight * (1 + reps / 30) * 10) / 10
}

// Pick the next session index for the active program: the session whose
// `day` matches today's weekday, falling back to the next chronological
// session after the last logged one, falling back to 0.
function pickTodaySession(state) {
  const prog = state.programs?.[state.active_program_id]
  if (!prog || !prog.sessions?.length) return 0
  const weekday = new Date().toLocaleDateString('en-US', { weekday: 'short' })
  const byDay = prog.sessions.findIndex(s => s.day === weekday)
  if (byDay >= 0) return byDay
  // Round-robin from the last entry for this program
  const last = [...(state.history || [])]
    .reverse()
    .find(h => h.program_id === state.active_program_id)
  if (last) return (last.session_idx + 1) % prog.sessions.length
  return 0
}

// ---------------------------------------------------------------------------
// Sync status — observes the Möbius offline runtime and exposes a {state,
// pending, online} snapshot the UI can paint as a pill.
//
// Three triggers refresh the count:
//   1. Caller pokes `bump()` after every write resolves. The {synced,
//      queued} hint from store.set is recorded so we can flash "Saved" /
//      "Pending" right after a save without waiting for the next poll.
//   2. A 10s background poll — catches drains the runtime did on
//      `online`/`focus`/`pageshow`/`visibilitychange` that we didn't
//      otherwise observe.
//   3. `online` / `offline` events on `window` — flip the connectivity
//      half of state immediately.
// ---------------------------------------------------------------------------

function useSyncStatus(store) {
  const [pending, setPending] = useState(0)
  const [online, setOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  // Transient `flash` overrides the steady-state pill for ~1.2s after a
  // write resolves. Lets the user see "Saved" briefly even when nothing
  // is queued.
  const [flash, setFlash] = useState(null)
  // Tracks the active flash-clear timer so successive writes don't leave
  // stale timeouts racing each other, and so unmount can cancel cleanly.
  const flashTimerRef = useRef(null)

  const refresh = useCallback(async () => {
    try {
      const n = await store.pendingCount()
      setPending(n)
    } catch { /* leave previous count */ }
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
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    }
  }, [refresh])

  // Caller hands us the result of a store.set so we can flash + refresh
  // the count immediately.
  const bump = useCallback((result) => {
    if (result && result.queued) setFlash('pending')
    else if (result && result.synced) setFlash('saved')
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => {
      setFlash(null)
      flashTimerRef.current = null
    }, 1200)
    refresh()
  }, [refresh])

  return { pending, online, flash, bump, refresh }
}

function SyncPill({ status }) {
  const { pending, online, flash } = status
  // Decide what to say. Offline > pending > flash > nothing.
  let label, variant
  if (!online && pending > 0) {
    label = `Offline · ${pending} pending`
    variant = 'offline'
  } else if (!online) {
    label = 'Offline'
    variant = 'offline'
  } else if (pending > 0) {
    label = `Syncing · ${pending}`
    variant = 'pending'
  } else if (flash === 'saved') {
    label = 'Saved'
    variant = 'saved'
  } else if (flash === 'pending') {
    label = 'Queued'
    variant = 'pending'
  } else {
    // Idle + online + no pending — render nothing so the header doesn't
    // get a persistent "Saved" sticker that means nothing after the first
    // minute.
    return null
  }
  return (
    <span
      style={S.pill(variant)}
      role="status"
      aria-live="polite"
      aria-label={
        variant === 'offline'
          ? `Offline${pending > 0 ? `, ${pending} pending` : ''}`
          : label
      }
    >
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Session logger — the core interactive surface.
// ---------------------------------------------------------------------------
//
// State machine: idle → logging (rest timer ticking) → finished.
// Each set has { reps, weight, done }. Marking a set done resets the rest
// timer; the timer is just a visual hint, no enforcement.
// ---------------------------------------------------------------------------

function SessionLogger({ session, programId, sessionIdx, onSave, onCancel, syncStatus }) {
  // Hydrate one editable row per planned set, pre-filled with the template's
  // reps/weight so the user only adjusts when they hit a different number.
  const initial = useMemo(() => session.exercises.map(ex => ({
    name: ex.name,
    targetSets: ex.sets,
    targetReps: ex.reps,
    sets: Array.from({ length: ex.sets }, () => ({
      reps: ex.reps,
      weight: ex.default_weight,
      done: false,
    })),
  })), [session])

  const [exercises, setExercises] = useState(initial)
  const [notes, setNotes] = useState('')
  // Rest timer state. `restStart` is null when idle; otherwise it's the
  // ms timestamp the last set was marked done.
  const [restStart, setRestStart] = useState(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    // One global tick at 1Hz — drives the rest-timer display.
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const restSeconds = restStart ? Math.floor((now - restStart) / 1000) : 0

  // ----- mutators -----
  const updateSet = (eIdx, sIdx, patch) => {
    setExercises(prev => prev.map((ex, i) => {
      if (i !== eIdx) return ex
      return {
        ...ex,
        sets: ex.sets.map((s, j) => j === sIdx ? { ...s, ...patch } : s),
      }
    }))
  }

  const toggleDone = (eIdx, sIdx) => {
    // Compute the new `done` value first so we can decide about the rest
    // timer without round-tripping through state. Reading exercises here
    // is safe because we're inside a stable render — the value reflects
    // the most recent committed state, and rapid double-taps will queue
    // through the setExercises updater either way.
    const wasDone = exercises[eIdx].sets[sIdx].done
    const nextDone = !wasDone
    setExercises(prev => prev.map((ex, i) => {
      if (i !== eIdx) return ex
      return {
        ...ex,
        sets: ex.sets.map((s, j) => j === sIdx ? { ...s, done: nextDone } : s),
      }
    }))
    // Only start the timer when MARKING done — undoing a check shouldn't
    // restart rest.
    if (nextDone) setRestStart(Date.now())
  }

  const addSet = (eIdx) => {
    setExercises(prev => prev.map((ex, i) => {
      if (i !== eIdx) return ex
      const last = ex.sets[ex.sets.length - 1] || { reps: ex.targetReps, weight: 0 }
      return {
        ...ex,
        sets: [...ex.sets, { reps: last.reps, weight: last.weight, done: false }],
      }
    }))
  }

  const removeSet = (eIdx) => {
    setExercises(prev => prev.map((ex, i) => {
      if (i !== eIdx) return ex
      if (ex.sets.length <= 1) return ex
      return { ...ex, sets: ex.sets.slice(0, -1) }
    }))
  }

  const handleFinish = () => {
    // Flatten to history row shape. Drop un-done sets so an abandoned
    // set doesn't pollute the PR table.
    const flatSets = []
    for (const ex of exercises) {
      for (const s of ex.sets) {
        if (!s.done) continue
        flatSets.push({
          exercise: ex.name,
          reps: Number(s.reps) || 0,
          weight: Number(s.weight) || 0,
        })
      }
    }
    if (flatSets.length === 0) {
      // Nothing logged — treat as cancel so we don't write empty rows.
      onCancel()
      return
    }
    onSave({
      date: todayISO(),
      program_id: programId,
      session_idx: sessionIdx,
      sets: flatSets,
      notes: notes.trim() || undefined,
    })
  }

  return (
    <div>
      <div style={S.restBar(restStart !== null)}>
        <span>
          {restStart !== null
            ? `Rest · ${fmtElapsed(restSeconds)}`
            : 'Tap ✓ on a set to start the rest timer'}
        </span>
        {restStart !== null && (
          <button
            style={S.restBtn}
            onClick={() => setRestStart(null)}
            aria-label="Dismiss rest timer"
          >
            Dismiss ×
          </button>
        )}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '10px', marginBottom: '14px',
      }}>
        <h2 style={{ ...S.cardTitle, margin: 0 }}>{session.name}</h2>
        {syncStatus && <SyncPill status={syncStatus} />}
      </div>

      {exercises.map((ex, eIdx) => (
        <div key={eIdx} style={S.exerciseBlock}>
          <div style={S.exerciseHead}>
            <h3 style={S.exerciseHeadName}>{ex.name}</h3>
            <span style={S.exerciseHeadTarget}>
              {ex.targetSets}×{ex.targetReps}
            </span>
          </div>
          {ex.sets.map((s, sIdx) => (
            <div key={sIdx} style={S.setRow}>
              <span style={S.setIdx}>{sIdx + 1}</span>
              <div style={S.stepWrap}>
                <div style={S.stepper}>
                  <button
                    style={S.stepBtn}
                    onClick={() => updateSet(eIdx, sIdx, {
                      weight: Math.max(0, (Number(s.weight) || 0) - 2.5),
                    })}
                    aria-label="Decrease weight"
                  >−</button>
                  <span style={S.stepValue}>{s.weight}</span>
                  <button
                    style={S.stepBtn}
                    onClick={() => updateSet(eIdx, sIdx, {
                      weight: (Number(s.weight) || 0) + 2.5,
                    })}
                    aria-label="Increase weight"
                  >+</button>
                </div>
                <div style={S.stepLabel}>kg</div>
              </div>
              <div style={S.stepWrap}>
                <div style={S.stepper}>
                  <button
                    style={S.stepBtn}
                    onClick={() => updateSet(eIdx, sIdx, {
                      reps: Math.max(0, (Number(s.reps) || 0) - 1),
                    })}
                    aria-label="Decrease reps"
                  >−</button>
                  <span style={S.stepValue}>{s.reps}</span>
                  <button
                    style={S.stepBtn}
                    onClick={() => updateSet(eIdx, sIdx, {
                      reps: (Number(s.reps) || 0) + 1,
                    })}
                    aria-label="Increase reps"
                  >+</button>
                </div>
                <div style={S.stepLabel}>reps</div>
              </div>
              <button
                style={S.doneToggle(s.done)}
                onClick={() => toggleDone(eIdx, sIdx)}
                aria-label={s.done ? 'Unmark set' : 'Mark set done'}
              >
                ✓
              </button>
            </div>
          ))}
          <div style={{ ...S.btnRow, padding: '10px 0 4px', justifyContent: 'flex-end' }}>
            <button style={S.btnGhost} onClick={() => removeSet(eIdx)}>− set</button>
            <button style={S.btnGhost} onClick={() => addSet(eIdx)}>+ set</button>
          </div>
        </div>
      ))}

      <div style={S.card}>
        <label style={S.label}>Notes</label>
        <textarea
          style={S.textarea}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Sleep, mood, niggles, PR notes…"
        />
      </div>

      <button style={S.btnPrimary} onClick={handleFinish}>
        Finish session
      </button>
      <div style={{ height: '10px' }} />
      <button
        style={{ ...S.btnSecondary, width: '100%' }}
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Today tab — preview the upcoming session, then hand off to SessionLogger.
// ---------------------------------------------------------------------------

function TodayTab({ state, onSaveSession, syncStatus }) {
  const [logging, setLogging] = useState(false)
  const program = state.programs?.[state.active_program_id]
  const sessionIdx = useMemo(() => pickTodaySession(state), [state])
  const session = program?.sessions?.[sessionIdx]

  // moebius:nav-back integration — when the user swipes back / presses
  // the device back button mid-session, the shell hands the back-press
  // to us via this event. We close the logger instead of dismissing
  // the whole gym app. Same protocol prod's klix-filter uses.
  useEffect(() => {
    function onMessage(event) {
      if (event.origin !== window.location.origin) return
      if (event.data?.type === 'moebius:nav-back') {
        setLogging(false)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // openLogger / closeLogger keep our state and the shell's
  // back-sentinel in lock-step. nav-push is async with an ack timeout
  // so the user isn't stuck if an older shell doesn't respond.
  const openLogger = useCallback(async () => {
    const requestId = `np-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          window.removeEventListener('message', onAck)
          reject(new Error('nav-push timeout'))
        }, 5000)
        function onAck(event) {
          if (event.origin !== window.location.origin) return
          if (event.data?.requestId !== requestId) return
          if (event.data.type === 'moebius:nav-push-ack') {
            clearTimeout(timer); window.removeEventListener('message', onAck); resolve()
          } else if (event.data.type === 'moebius:nav-push-rejected') {
            clearTimeout(timer); window.removeEventListener('message', onAck); reject()
          }
        }
        window.addEventListener('message', onAck)
        window.parent.postMessage(
          { type: 'moebius:nav-push', label: 'gym-session', requestId },
          window.location.origin,
        )
      })
    } catch {
      // Older shell — fall back to opening without the sentinel.
    }
    setLogging(true)
  }, [])

  const closeLogger = useCallback(() => {
    window.parent.postMessage(
      { type: 'moebius:nav-pop' }, window.location.origin,
    )
    setLogging(false)
  }, [])

  if (!program || !session) {
    return (
      <div style={S.empty}>
        No active program. Pick one from the Programs tab to get started.
      </div>
    )
  }

  if (logging) {
    return (
      <SessionLogger
        session={session}
        programId={state.active_program_id}
        sessionIdx={sessionIdx}
        onSave={(row) => { onSaveSession(row); closeLogger() }}
        onCancel={closeLogger}
        syncStatus={syncStatus}
      />
    )
  }

  // Did we already log this session today? If so, soften the CTA but still
  // allow another go (sometimes you log a session twice — supersets, AM/PM).
  const alreadyToday = (state.history || []).some(
    h => h.date === todayISO()
      && h.program_id === state.active_program_id
      && h.session_idx === sessionIdx,
  )

  return (
    <div>
      <div style={S.card}>
        <p style={{ ...S.cardSub, margin: 0 }}>{program.name}</p>
        <h2 style={S.cardTitle}>{session.name}</h2>
        <p style={{ ...S.cardSub, marginTop: '2px' }}>
          {session.exercises.length} exercises ·{' '}
          {session.exercises.reduce((acc, e) => acc + (e.sets || 0), 0)} sets planned
        </p>
        <div style={{ marginTop: '6px' }}>
          {session.exercises.map((ex, i) => (
            <div key={i} style={S.exerciseRow}>
              <span style={S.exerciseName}>{ex.name}</span>
              <span style={S.exerciseMeta}>
                {ex.sets}×{ex.reps} · {ex.default_weight}kg
              </span>
            </div>
          ))}
        </div>
        <div style={{ height: '14px' }} />
        <button style={S.btnPrimary} onClick={openLogger}>
          {alreadyToday ? 'Log another session' : 'Start session'}
        </button>
        {alreadyToday && (
          <p style={{ ...S.cardSub, textAlign: 'center', marginTop: '8px', marginBottom: 0 }}>
            You already logged this one today — nice.
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// In-app confirm modal — substitute for window.confirm, which the Möbius
// sandbox disallows (allow-modals not granted). Caller renders this when
// `pending` is non-null and clears it on either action.
// ---------------------------------------------------------------------------

function ConfirmModal({ title, body, confirmLabel, onConfirm, onCancel }) {
  return (
    <div
      style={S.modalScrim}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={S.modalTitle}>{title}</h3>
        <p style={S.modalBody}>{body}</p>
        <div style={S.modalBtns}>
          <button style={S.btnSecondary} onClick={onCancel}>Cancel</button>
          <button
            style={{ ...S.btnSecondary, background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Programs tab — list, pick active, fork starter, edit custom.
// ---------------------------------------------------------------------------

function ProgramsTab({ state, onState }) {
  const [editingId, setEditingId] = useState(null)
  // Pending delete: { id, name } when the user tapped Delete and we're
  // waiting for in-app confirm. Null otherwise.
  const [deletePending, setDeletePending] = useState(null)

  const setActive = (id) => {
    onState(prev => ({ ...prev, active_program_id: id }))
  }

  const fork = (id) => {
    const src = state.programs[id]
    if (!src) return
    const newId = uid()
    onState(prev => ({
      ...prev,
      programs: {
        ...prev.programs,
        [newId]: {
          // Deep-clone so editing the fork can't mutate the original.
          name: `${src.name} (copy)`,
          sessions: JSON.parse(JSON.stringify(src.sessions)),
          forked_from: id,
        },
      },
    }))
    setEditingId(newId)
  }

  const deleteProgram = (id) => {
    onState(prev => {
      const { [id]: _gone, ...rest } = prev.programs
      const next = { ...prev, programs: rest }
      // If we deleted the active one, point at whatever's still around.
      if (prev.active_program_id === id) {
        next.active_program_id = Object.keys(rest)[0] || null
      }
      return next
    })
  }

  if (editingId) {
    return (
      <ProgramEditor
        program={state.programs[editingId]}
        onSave={(updated) => {
          onState(prev => ({
            ...prev,
            programs: { ...prev.programs, [editingId]: updated },
          }))
          setEditingId(null)
        }}
        onCancel={() => setEditingId(null)}
      />
    )
  }

  const entries = Object.entries(state.programs || {})

  // If state was hydrated from the inline FALLBACK_STATE (because the
  // manifest's storage_seeds didn't land — older mobius, manual install,
  // or storage write race), the user is missing two of the three starter
  // packs. Surface a one-line hint so they know reinstalling will fix it.
  const starterPackMissing = state.starter_pack_installed === false

  return (
    <div>
      <p style={S.cardSub}>
        Tap a program to make it active. Fork a starter to customise it; built-in
        starters are read-only.
      </p>
      {starterPackMissing && (
        <div style={{ ...S.card, borderColor: 'var(--accent)' }}>
          <p style={{ ...S.cardSub, margin: 0 }}>
            Only the minimal starter is installed. Reinstall the app from the
            App Store to get the full PPL / full-body / upper-lower pack.
          </p>
        </div>
      )}
      {entries.map(([id, prog]) => {
        const isActive = id === state.active_program_id
        const isStarter = id === 'ppl6' || id === 'fb3' || id === 'ul4'
        return (
          <div
            key={id}
            style={{ ...S.programRow, ...(isActive ? S.programRowActive : {}) }}
            onClick={() => setActive(id)}
          >
            <div style={S.programRowHead}>
              <h3 style={S.programRowName}>{prog.name}</h3>
              {isActive && <span style={S.badge}>Active</span>}
            </div>
            <p style={{ ...S.cardSub, margin: '4px 0 8px' }}>
              {prog.sessions.length} sessions/week ·{' '}
              {prog.sessions.reduce((acc, s) => acc + s.exercises.length, 0)} exercises total
              {isStarter ? ' · starter' : ''}
            </p>
            <div style={S.btnRow}>
              <button
                style={S.btnSecondary}
                onClick={(e) => { e.stopPropagation(); fork(id) }}
              >
                Fork & edit
              </button>
              {!isStarter && (
                <>
                  <button
                    style={S.btnSecondary}
                    onClick={(e) => { e.stopPropagation(); setEditingId(id) }}
                  >
                    Edit
                  </button>
                  <button
                    style={{ ...S.btnSecondary, color: 'var(--red, #ef4444)' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeletePending({ id, name: prog.name })
                    }}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })}
      {entries.length === 0 && (
        <div style={S.empty}>
          No programs yet. Reinstall the app to get the starter pack back.
        </div>
      )}
      {deletePending && (
        <ConfirmModal
          title={`Delete "${deletePending.name}"?`}
          body="This program and its template will be removed. Logged sessions in your history are kept."
          confirmLabel="Delete"
          onConfirm={() => {
            deleteProgram(deletePending.id)
            setDeletePending(null)
          }}
          onCancel={() => setDeletePending(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Program editor — rename + edit sessions/exercises inline. Kept minimal
// (text inputs, ± steppers) rather than building a drag-handle UI; the
// editing surface is forks of starter packs, so the common case is small
// tweaks (swap an exercise, bump default weight).
// ---------------------------------------------------------------------------

function ProgramEditor({ program, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(program)))

  const setName = (v) => setDraft(d => ({ ...d, name: v }))

  const updateExercise = (sIdx, eIdx, patch) => {
    setDraft(d => ({
      ...d,
      sessions: d.sessions.map((sess, i) => {
        if (i !== sIdx) return sess
        return {
          ...sess,
          exercises: sess.exercises.map((ex, j) =>
            j === eIdx ? { ...ex, ...patch } : ex),
        }
      }),
    }))
  }

  const updateSession = (sIdx, patch) => {
    setDraft(d => ({
      ...d,
      sessions: d.sessions.map((sess, i) => i === sIdx ? { ...sess, ...patch } : sess),
    }))
  }

  const addExercise = (sIdx) => {
    setDraft(d => ({
      ...d,
      sessions: d.sessions.map((sess, i) => {
        if (i !== sIdx) return sess
        return {
          ...sess,
          exercises: [
            ...sess.exercises,
            { name: 'New exercise', sets: 3, reps: 10, default_weight: 0 },
          ],
        }
      }),
    }))
  }

  const removeExercise = (sIdx, eIdx) => {
    setDraft(d => ({
      ...d,
      sessions: d.sessions.map((sess, i) => {
        if (i !== sIdx) return sess
        return { ...sess, exercises: sess.exercises.filter((_, j) => j !== eIdx) }
      }),
    }))
  }

  return (
    <div>
      <div style={S.card}>
        <label style={S.label}>Program name</label>
        <input
          style={S.textInput}
          value={draft.name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {draft.sessions.map((sess, sIdx) => (
        <div key={sIdx} style={S.card}>
          <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: '8px' }}>
            <div>
              <label style={S.label}>Day</label>
              <input
                style={S.textInput}
                value={sess.day}
                onChange={(e) => updateSession(sIdx, { day: e.target.value })}
              />
            </div>
            <div>
              <label style={S.label}>Session name</label>
              <input
                style={S.textInput}
                value={sess.name}
                onChange={(e) => updateSession(sIdx, { name: e.target.value })}
              />
            </div>
          </div>
          <div style={{ height: '8px' }} />
          {sess.exercises.map((ex, eIdx) => (
            <div key={eIdx} style={{
              display: 'grid',
              gridTemplateColumns: '1fr 50px 50px 60px 36px',
              gap: '6px', alignItems: 'center', marginBottom: '6px',
            }}>
              <input
                style={S.textInput}
                value={ex.name}
                onChange={(e) => updateExercise(sIdx, eIdx, { name: e.target.value })}
                placeholder="Exercise"
              />
              <input
                style={{ ...S.textInput, textAlign: 'center' }}
                type="number"
                inputMode="numeric"
                min="1"
                value={ex.sets}
                onChange={(e) => updateExercise(sIdx, eIdx, { sets: Math.max(1, Number(e.target.value) || 1) })}
                aria-label="Sets"
              />
              <input
                style={{ ...S.textInput, textAlign: 'center' }}
                type="number"
                inputMode="numeric"
                min="1"
                value={ex.reps}
                onChange={(e) => updateExercise(sIdx, eIdx, { reps: Math.max(1, Number(e.target.value) || 1) })}
                aria-label="Reps"
              />
              <input
                style={{ ...S.textInput, textAlign: 'center' }}
                type="number"
                inputMode="decimal"
                min="0"
                value={ex.default_weight}
                onChange={(e) => updateExercise(sIdx, eIdx, { default_weight: Math.max(0, Number(e.target.value) || 0) })}
                aria-label="Default weight"
              />
              <button
                style={{
                  ...S.btnGhost, padding: '0',
                  color: 'var(--muted)', minHeight: '44px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onClick={() => removeExercise(sIdx, eIdx)}
                aria-label="Remove exercise"
              >×</button>
            </div>
          ))}
          <div style={{ ...S.btnRow, justifyContent: 'flex-end', marginTop: '6px' }}>
            <button style={S.btnGhost} onClick={() => addExercise(sIdx)}>+ exercise</button>
          </div>
        </div>
      ))}

      <button style={S.btnPrimary} onClick={() => onSave(draft)}>
        Save program
      </button>
      <div style={{ height: '10px' }} />
      <button style={{ ...S.btnSecondary, width: '100%' }} onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// History tab — PR table, per-lift line charts, calendar heatmap.
// ---------------------------------------------------------------------------

function buildPRTable(history) {
  // For each unique exercise, find the entry with the highest estimated
  // 1RM (Epley). Tie-break on heavier-weight, then more-reps so a
  // genuinely heavier set still wins on equal e1RM.
  const byExercise = new Map()
  for (const row of history || []) {
    for (const s of row.sets || []) {
      const e1rm = estimate1RM(s.weight, s.reps)
      const prev = byExercise.get(s.exercise)
      if (
        !prev
        || e1rm > prev.e1rm
        || (e1rm === prev.e1rm && s.weight > prev.weight)
      ) {
        byExercise.set(s.exercise, {
          exercise: s.exercise,
          weight: s.weight,
          reps: s.reps,
          date: row.date,
          e1rm,
        })
      }
    }
  }
  return [...byExercise.values()].sort((a, b) => b.e1rm - a.e1rm)
}

function buildLiftSeries(history) {
  // For each exercise, one point per session: the heaviest set's weight
  // (by e1RM tiebreaker). Used for the per-lift line charts.
  const byExercise = new Map()
  for (const row of history || []) {
    const top = new Map()
    for (const s of row.sets || []) {
      const e1rm = estimate1RM(s.weight, s.reps)
      const prev = top.get(s.exercise)
      if (!prev || e1rm > prev.e1rm) {
        top.set(s.exercise, { weight: s.weight, reps: s.reps, e1rm })
      }
    }
    for (const [name, t] of top) {
      if (!byExercise.has(name)) byExercise.set(name, [])
      byExercise.get(name).push({ date: row.date, weight: t.weight, reps: t.reps })
    }
  }
  // Sort each series by date, return only those with 2+ points (a single
  // dot looks broken).
  const out = []
  for (const [name, points] of byExercise) {
    points.sort((a, b) => a.date.localeCompare(b.date))
    if (points.length >= 2) out.push({ name, points })
  }
  // Most-tracked lift first.
  out.sort((a, b) => b.points.length - a.points.length)
  return out
}

// Hand-rolled SVG line chart. No chart library — just normalize the points
// into a viewBox and draw a polyline + dots. The chart inherits theme
// colors via currentColor so it tints with the active theme.
function LineChart({ points }) {
  if (!points || points.length === 0) return null
  const W = 320, H = 90, pad = 8
  const xs = points.map((_, i) => i)
  const ys = points.map(p => p.weight)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const yRange = maxY - minY || 1
  const xRange = (xs.length - 1) || 1
  const toX = (i) => pad + (i / xRange) * (W - 2 * pad)
  const toY = (y) => H - pad - ((y - minY) / yRange) * (H - 2 * pad)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(p.weight)}`).join(' ')

  const first = points[0].weight
  const last = points[points.length - 1].weight
  const delta = last - first

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', color: 'var(--accent)' }}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Top-set trend: ${first}kg to ${last}kg over ${points.length} sessions (${delta >= 0 ? '+' : ''}${delta}kg)`}
    >
      {/* Baseline at min — gives the rough scale a visual floor. */}
      <line
        x1={pad} x2={W - pad} y1={H - pad} y2={H - pad}
        stroke="var(--border)" strokeWidth="1"
      />
      <path
        d={path}
        fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <circle key={i} cx={toX(i)} cy={toY(p.weight)} r="3"
          fill="currentColor" />
      ))}
    </svg>
  )
}

// 53-column × 7-row calendar heatmap (GitHub-style). One square per day for
// the last year. Days with a logged session tint with the accent.
function Heatmap({ history }) {
  const sessionDays = useMemo(() => {
    const s = new Set()
    for (const row of history || []) s.add(row.date)
    return s
  }, [history])

  // Build a 53-week grid ending today. Each cell carries its ISO date so
  // hover/tap can show it as a tooltip via the title attribute.
  const today = new Date()
  // Walk back to the most recent Sunday so column boundaries line up.
  const dayOfWeek = today.getDay()
  const lastSunday = new Date(today)
  lastSunday.setDate(today.getDate() - dayOfWeek)

  const weeks = []
  for (let w = 52; w >= 0; w--) {
    const week = []
    for (let d = 0; d < 7; d++) {
      const cell = new Date(lastSunday)
      cell.setDate(lastSunday.getDate() - w * 7 + d)
      const y = cell.getFullYear()
      const m = String(cell.getMonth() + 1).padStart(2, '0')
      const day = String(cell.getDate()).padStart(2, '0')
      const iso = `${y}-${m}-${day}`
      const isFuture = cell > today
      week.push({ iso, has: sessionDays.has(iso), isFuture })
    }
    weeks.push(week)
  }

  const cell = 11, gap = 2
  const W = 53 * (cell + gap)
  const H = 7 * (cell + gap)
  const sessionCount = sessionDays.size

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={S.heatmap}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Activity heatmap: ${sessionCount} day${sessionCount === 1 ? '' : 's'} with logged sessions in the last 53 weeks`}
    >
      {weeks.map((week, wi) => week.map((d, di) => (
        <rect
          key={`${wi}-${di}`}
          x={wi * (cell + gap)}
          y={di * (cell + gap)}
          width={cell}
          height={cell}
          rx={2}
          fill={d.isFuture
            ? 'transparent'
            : d.has ? 'var(--accent)' : 'var(--border)'}
          opacity={d.isFuture ? 0 : d.has ? 1 : 0.4}
        >
          <title>{d.iso}{d.has ? ' · session logged' : ''}</title>
        </rect>
      )))}
    </svg>
  )
}

function HistoryTab({ state }) {
  const history = state.history || []
  const prs = useMemo(() => buildPRTable(history), [history])
  const series = useMemo(() => buildLiftSeries(history), [history])

  if (history.length === 0) {
    return (
      <div style={S.empty}>
        No sessions logged yet.
        <br />
        Finish a session from the Today tab and your PRs + heatmap will fill in here.
      </div>
    )
  }

  return (
    <div>
      <div style={S.card}>
        <h3 style={S.cardTitle}>Activity</h3>
        <p style={S.cardSub}>
          {history.length} session{history.length === 1 ? '' : 's'} logged ·
          last {history[history.length - 1].date}
        </p>
        <Heatmap history={history} />
      </div>

      <div style={S.card}>
        <h3 style={S.cardTitle}>Personal records</h3>
        <p style={S.cardSub}>
          Ranked by estimated 1-rep max (Epley). Heaviest top set per exercise.
        </p>
        <table style={S.prTable}>
          <thead>
            <tr>
              <th style={S.prTh}>Exercise</th>
              <th style={{ ...S.prTh, textAlign: 'right' }}>Top set</th>
              <th style={{ ...S.prTh, textAlign: 'right' }}>e1RM</th>
            </tr>
          </thead>
          <tbody>
            {prs.map((p) => (
              <tr key={p.exercise}>
                <td style={S.prTd}>{p.exercise}</td>
                <td style={{ ...S.prTd, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {p.weight}kg × {p.reps}
                </td>
                <td style={{
                  ...S.prTd, textAlign: 'right', fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {p.e1rm}kg
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {series.length > 0 && (
        <div>
          <h3 style={{ ...S.cardTitle, padding: '0 4px' }}>Top set over time</h3>
          {series.map(s => (
            <div key={s.name} style={S.chartCard}>
              <h4 style={S.chartTitle}>{s.name}</h4>
              <p style={S.chartSub}>
                {s.points.length} sessions ·{' '}
                {s.points[0].weight}kg → {s.points[s.points.length - 1].weight}kg
              </p>
              <LineChart points={s.points} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default function App({ appId, token }) {
  const store = useMemo(() => makeStore(appId, token), [appId, token])
  const [tab, setTab] = useState('today')
  const [state, setState] = useState(null)
  // `bootStatus` distinguishes the three first-paint outcomes:
  //  - 'ready': state.json arrived (canonical or fallback usable)
  //  - 'first-boot-offline': no cached state AND offline. We can't seed
  //    the starter pack from disk because storage.get returns null
  //    offline; the user needs one online tick to hydrate.
  //  - 'load-fail-online': online but get() returned null (404, server
  //    error, racing seed). Fall back to FALLBACK_STATE and warn.
  const [bootStatus, setBootStatus] = useState('loading')
  const syncStatus = useSyncStatus(store)

  // Initial load. We read state.json exactly once on mount — subsequent
  // reads all go through React state. The dep is [store], which is
  // memoized on [appId, token] so it's stable for the session.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const loaded = await store.get('state.json')
      if (cancelled) return
      if (loaded && typeof loaded === 'object' && loaded.programs) {
        setState(loaded)
        setBootStatus('ready')
        return
      }
      // No state and we're offline → we genuinely have nothing to show.
      // The manifest's storage_seeds.state.json runs server-side, so
      // until the first online fetch lands the user can't see the
      // starter pack. Render a friendly first-boot screen instead of
      // misleading them with FALLBACK_STATE (which would let them log
      // sessions into a write that may never reconcile with a real seed).
      if (!navigator.onLine) {
        setBootStatus('first-boot-offline')
        return
      }
      setState(FALLBACK_STATE)
      setBootStatus('load-fail-online')
    })()
    return () => { cancelled = true }
  }, [store])

  // When we boot offline-empty, listen for online to re-attempt the
  // load. One-shot — once we land state, the effect above won't re-run
  // (store is stable), so we have to manually re-fetch here.
  useEffect(() => {
    if (bootStatus !== 'first-boot-offline') return
    let cancelled = false
    async function tryLoad() {
      if (!navigator.onLine) return
      const loaded = await store.get('state.json')
      if (cancelled) return
      if (loaded && typeof loaded === 'object' && loaded.programs) {
        setState(loaded)
        setBootStatus('ready')
      }
    }
    window.addEventListener('online', tryLoad)
    return () => {
      cancelled = true
      window.removeEventListener('online', tryLoad)
    }
  }, [bootStatus, store])

  // Updater wrapper: optimistic local update + write through the shim.
  // We await the shim so we can record its {synced|queued} hint for the
  // pill, but the React state is already updated by the time set()
  // resolves — the UI never waits. Depend on the stable `bump` callback
  // rather than the whole syncStatus object so this callback's identity
  // doesn't churn each render (would force props-equality recomputes in
  // every child tab).
  const bumpSync = syncStatus.bump
  const updateState = useCallback((updater) => {
    setState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      ;(async () => {
        const result = await store.set('state.json', next)
        bumpSync(result)
      })()
      return next
    })
  }, [store, bumpSync])

  const saveSession = useCallback((row) => {
    updateState(prev => ({
      ...prev,
      history: [...(prev.history || []), row],
    }))
  }, [updateState])

  if (bootStatus === 'loading') {
    return (
      <div style={S.root}>
        <div style={S.loading}>Loading…</div>
      </div>
    )
  }

  if (bootStatus === 'first-boot-offline') {
    return (
      <div style={S.root}>
        <div style={S.header}>
          <div>
            <h1 style={S.title}>Gym</h1>
            <p style={S.subtitle}>Offline first-boot.</p>
          </div>
          <SyncPill status={syncStatus} />
        </div>
        <div style={S.scroll}>
          <div style={{ ...S.card, borderColor: 'var(--accent)' }}>
            <h2 style={S.cardTitle}>Connect once to seed</h2>
            <p style={{ ...S.cardSub, margin: 0 }}>
              The starter programs haven't downloaded yet. Reconnect to
              Möbius once — the app will pick up automatically — then
              everything works offline from then on.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...S.root, position: 'relative' }}>
      <div style={S.header}>
        <div>
          <h1 style={S.title}>Gym</h1>
          <p style={S.subtitle}>
            {tab === 'today' && 'Train.'}
            {tab === 'programs' && 'Plan.'}
            {tab === 'history' && 'Track progress.'}
          </p>
        </div>
        <SyncPill status={syncStatus} />
      </div>

      <div style={S.scroll}>
        {bootStatus === 'load-fail-online' && (
          <div style={{ ...S.card, borderColor: 'var(--accent)' }}>
            <p style={{ ...S.cardSub, margin: 0 }}>
              Couldn't load saved state — showing starter programs.
              Your sessions will save once the connection is back.
            </p>
          </div>
        )}
        {tab === 'today' && (
          <TodayTab
            state={state}
            onSaveSession={saveSession}
            syncStatus={syncStatus}
          />
        )}
        {tab === 'programs' && <ProgramsTab state={state} onState={updateState} />}
        {tab === 'history' && <HistoryTab state={state} />}
      </div>

      <nav style={S.tabbar} role="tablist" aria-label="Gym tabs">
        <button
          style={S.tabBtn(tab === 'today')}
          onClick={() => setTab('today')}
          role="tab"
          aria-selected={tab === 'today'}
        >
          <span style={S.tabIcon} aria-hidden>●</span>
          Today
        </button>
        <button
          style={S.tabBtn(tab === 'programs')}
          onClick={() => setTab('programs')}
          role="tab"
          aria-selected={tab === 'programs'}
        >
          <span style={S.tabIcon} aria-hidden>▤</span>
          Programs
        </button>
        <button
          style={S.tabBtn(tab === 'history')}
          onClick={() => setTab('history')}
          role="tab"
          aria-selected={tab === 'history'}
        >
          <span style={S.tabIcon} aria-hidden>▦</span>
          History
        </button>
      </nav>
    </div>
  )
}
