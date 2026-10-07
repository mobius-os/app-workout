import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, Check, ChevronRight, DotsVertical, Pencil, Plus, Trash, X } from '@openai/apps-sdk-ui/components/Icon'
import { CSS } from './theme.js'
import {
  allExercises, duration, exerciseProgress, familiarExerciseIds, findExercise, finishWorkout, lastSetsFor,
  isPersonalRecord, moveWorkoutExercise, normalizeState, removeWorkoutExercise, replaceWorkoutExercise,
  sessionLogs, startWorkout, trainingSnapshot, volume,
} from './domain.js'
import {
  EXERCISEDB_CREDIT, fetchExerciseDetail, fetchExerciseMedia,
  loadExerciseThumbnail, readCatalogCache, syncExerciseCatalog,
} from './catalog.js'

const STATE_PATH = 'workout_state.json'
// Set fields save after a short pause in typing rather than on every
// keystroke; blur, hiding the app, and any other save flush the pending one.
const TYPING_SAVE_DELAY_MS = 500
const EXERCISE_PAGE_SIZE = 60

function useProgressiveExerciseList(total, resetKey) {
  const [limit, setLimit] = useState(EXERCISE_PAGE_SIZE)
  const sentinelRef = useRef(null)

  useEffect(() => setLimit(EXERCISE_PAGE_SIZE), [resetKey])
  useEffect(() => {
    if (limit >= total) return undefined
    const sentinel = sentinelRef.current
    if (!sentinel) return undefined
    if (!('IntersectionObserver' in window)) {
      setLimit(total)
      return undefined
    }
    const scrollRoot = sentinel.closest('.wk-scroll')
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      setLimit((current) => Math.min(total, current + EXERCISE_PAGE_SIZE))
    }, { root: scrollRoot, rootMargin: '420px 0px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [limit, resetKey, total])

  return {
    hasMore: limit < total,
    sentinelRef,
    visibleCount: Math.min(limit, total),
  }
}

function exerciseThumbnailLabel(exercise) {
  const target = (exercise?.target && exercise.target !== 'Other') ? exercise.target : exercise?.bodyPart
  const words = String(target || exercise?.name || 'Workout').trim().split(/\s+/).filter(Boolean)
  if (words.length > 1) return words.map((word) => word[0]).join('').slice(0, 3).toUpperCase()
  return words[0]?.slice(0, 3).toUpperCase() || 'WK'
}

function WorkoutIcon({ appId }) {
  return <span className="wk-app-icon" aria-hidden="true">
    <img src={`/api/apps/${appId}/icon?size=64`} alt="" onError={(event) => {
      event.currentTarget.style.display = 'none'
      event.currentTarget.nextElementSibling.style.display = 'grid'
    }} />
    <span className="wk-app-icon-fallback">W</span>
  </span>
}

function WorkoutElapsed({ startedAt }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])
  return duration((now - new Date(startedAt)) / 1000)
}

function useOnlineStatus() {
  const read = () => typeof window.mobius?.online === 'boolean' ? window.mobius.online : navigator.onLine !== false
  const [online, setOnline] = useState(read)
  useEffect(() => {
    const refresh = () => setOnline(read())
    const unsubscribe = window.mobius?.onOnlineChange?.((value) => setOnline(value !== false))
    window.addEventListener('online', refresh)
    window.addEventListener('offline', refresh)
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
      window.removeEventListener('online', refresh)
      window.removeEventListener('offline', refresh)
    }
  }, [])
  return online
}

function EditorHeader({ title, subtitle, cancel, save, saveDisabled }) {
  return <header className="wk-header"><div className="wk-header-inner wk-editor-header-inner">
    <button className="wk-btn wk-btn-secondary wk-editor-cancel" onClick={cancel}>Cancel</button>
    <div className="wk-brand-text wk-editor-header-copy"><h2 className="wk-title">{title}</h2>{subtitle && <span className="wk-subtitle">{subtitle}</span>}</div>
    <button className="wk-btn wk-btn-primary wk-editor-save" disabled={saveDisabled} onClick={save}>Save</button>
  </div></header>
}

function SwipeSheet({ label, close, className = '', children }) {
  const dialogRef = useDialogFocus(close)
  const pointer = useRef(null)
  const dragOffset = useRef(0)
  const closeTimer = useRef(null)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const portalRoot = document.querySelector('.wk-root')

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])
  if (!portalRoot) return null

  const dismiss = () => {
    if (dismissing) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      close()
      return
    }
    setDismissing(true)
    setDragging(false)
    closeTimer.current = window.setTimeout(close, 240)
  }
  const handlePointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    pointer.current = { id: event.pointerId, y: event.clientY, moved: false }
    try { event.currentTarget.setPointerCapture?.(event.pointerId) } catch { /* Synthetic and assistive pointers may not be capturable. */ }
    dragOffset.current = 0
    setDragging(true)
  }
  const handlePointerMove = (event) => {
    if (pointer.current?.id !== event.pointerId) return
    const next = Math.max(0, event.clientY - pointer.current.y)
    if (next > 4) pointer.current.moved = true
    dragOffset.current = Math.min(next, window.innerHeight * .72)
    setOffset(dragOffset.current)
  }
  const handlePointerEnd = (event) => {
    if (pointer.current?.id !== event.pointerId) return
    const moved = pointer.current.moved
    const shouldDismiss = dragOffset.current >= Math.min(120, Math.max(72, window.innerHeight * .1))
    pointer.current = { id: null, y: 0, moved }
    setDragging(false)
    if (shouldDismiss) dismiss()
    else {
      dragOffset.current = 0
      setOffset(0)
    }
  }
  const handlePointerCancel = (event) => {
    if (pointer.current?.id !== event.pointerId) return
    pointer.current = null
    dragOffset.current = 0
    setDragging(false)
    setOffset(0)
  }
  const handleClick = (event) => {
    if (pointer.current?.moved) {
      event.preventDefault()
      pointer.current = null
      return
    }
    dismiss()
  }

  return createPortal(<div className="wk-detail-scrim" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={dialogRef} onClick={dismiss}>
    <section className={`wk-swipe-sheet${dragging ? ' is-dragging' : ''}${dismissing ? ' is-dismissing' : ''}${className ? ` ${className}` : ''}`} style={{ '--wk-sheet-drag': `${offset}px` }} onClick={(event) => event.stopPropagation()} onTransitionEnd={(event) => { if (dismissing && event.propertyName === 'transform') close() }}>
      <button className="wk-sheet-grabber" aria-label={`Dismiss ${label}`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerEnd} onPointerCancel={handlePointerCancel} onClick={handleClick}><span aria-hidden="true" /></button>
      {children}
    </section>
  </div>, portalRoot)
}

function useDialogFocus(onClose) {
  const dialogRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previousFocus = document.activeElement
    const siblingStates = [...(dialog.parentElement?.children || [])]
      .filter((element) => element !== dialog && element instanceof HTMLElement && element.tagName !== 'STYLE')
      .map((element) => ({ element, inert: element.inert, ariaHidden: element.getAttribute('aria-hidden') }))
    siblingStates.forEach(({ element }) => {
      element.inert = true
      element.setAttribute('aria-hidden', 'true')
    })
    const focusable = () => [...dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.hidden)
    const first = focusable()[0]
    ;(first || dialog).focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current?.()
        return
      }
      if (event.key !== 'Tab') return
      const controls = focusable()
      if (!controls.length) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const firstControl = controls[0]
      const lastControl = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === firstControl) {
        event.preventDefault()
        lastControl.focus()
      } else if (!event.shiftKey && document.activeElement === lastControl) {
        event.preventDefault()
        firstControl.focus()
      }
    }
    dialog.addEventListener('keydown', handleKeyDown)
    return () => {
      dialog.removeEventListener('keydown', handleKeyDown)
      siblingStates.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert
        if (ariaHidden === null) element.removeAttribute('aria-hidden')
        else element.setAttribute('aria-hidden', ariaHidden)
      })
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [])

  return dialogRef
}

export default function App({ appId, token }) {
  const store = window.mobius?.storage
  const [state, setState] = useState(null)
  const [tab, setTab] = useState('workout')
  const [toast, setToast] = useState('')
  const [saveState, setSaveState] = useState('idle')
  const [detail, setDetail] = useState(null)
  const [detailState, setDetailState] = useState('idle')
  const [builder, setBuilder] = useState(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [catalog, setCatalog] = useState([])
  const [catalogStatus, setCatalogStatus] = useState({ state: 'idle', loaded: 0, total: 1500 })
  const [catalogCacheReady, setCatalogCacheReady] = useState(false)
  const [catalogSyncNonce, setCatalogSyncNonce] = useState(0)
  const online = useOnlineStatus()
  const catalogSeed = useRef(null)
  const catalogSyncStarted = useRef(false)
  const catalogAutoRetries = useRef(0)
  const readySignalled = useRef(false)
  const stateRef = useRef(null)
  const saveQueue = useRef(Promise.resolve())
  const pendingSaves = useRef(0)
  const typingSaveTimer = useRef(null)
  const detailController = useRef(null)
  const finishing = useRef(false)
  const toastTimer = useRef(null)

  useEffect(() => {
    let alive = true
    const applyState = (value) => {
      if (!alive) return
      // A typed edit waiting for its save is newer than any stored echo.
      if ((pendingSaves.current > 0 || typingSaveTimer.current != null) && stateRef.current) return
      const normalized = normalizeState(value)
      stateRef.current = normalized
      setState(normalized)
      if (value && value.schemaVersion !== normalized.schemaVersion) {
        store?.set(STATE_PATH, normalized).catch((error) => window.mobius?.signal?.('error', { source: 'state-migration', message: error.message }))
      }
      if (!readySignalled.current) {
        readySignalled.current = true
        window.mobius?.signal?.('app_ready', { routine_count: normalized.routines.length })
      }
    }
    const unsubscribe = store?.subscribe?.(STATE_PATH, applyState)
    if (!unsubscribe) store?.get(STATE_PATH).then(applyState).catch(() => applyState(null))
    return () => { alive = false; if (typeof unsubscribe === 'function') unsubscribe() }
  }, [store])

  useEffect(() => {
    let alive = true
    readCatalogCache(store).then((cached) => {
      if (!alive) return
      catalogSeed.current = cached
      if (cached) {
        setCatalog(cached.exercises)
        setCatalogStatus({ state: cached.complete ? 'ready' : 'partial', loaded: cached.exercises.length, total: cached.total })
      }
      setCatalogCacheReady(true)
    }).catch(() => { if (alive) setCatalogCacheReady(true) })
    return () => { alive = false }
  }, [store])

  useEffect(() => {
    if (!catalogCacheReady || catalogSyncStarted.current) return
    catalogSyncStarted.current = true
    const controller = new AbortController()
    let retryTimer
    setCatalogStatus((current) => ({ ...current, state: 'loading' }))
    syncExerciseCatalog({
      token, store, seed: catalogSeed.current, signal: controller.signal,
      onProgress: ({ exercises, loaded, total }) => {
        if (loaded <= 25 || loaded % 100 === 0 || loaded === total) setCatalog(exercises)
        setCatalogStatus({ state: 'loading', loaded, total })
      },
    }).then((cache) => {
      catalogSeed.current = cache
      setCatalog(cache.exercises)
      setCatalogStatus({ state: cache.complete ? 'ready' : 'partial', loaded: cache.exercises.length, total: cache.total })
      catalogSyncStarted.current = cache.complete
      if (cache.complete) catalogAutoRetries.current = 0
      else if (cache.interrupted && catalogAutoRetries.current < 12) {
        const wait = Math.min(6000, 1800 + (catalogAutoRetries.current * 900))
        retryTimer = window.setTimeout(() => {
          catalogAutoRetries.current += 1
          setCatalogSyncNonce((current) => current + 1)
        }, wait)
      }
    }).catch((error) => {
      if (error.name === 'AbortError') return
      setCatalogStatus((current) => ({ ...current, state: current.loaded ? 'partial' : 'error' }))
      catalogSyncStarted.current = false
      window.mobius?.signal?.('error', { source: 'exercise-catalog', message: error.message })
    })
    return () => { controller.abort(); window.clearTimeout(retryTimer) }
  }, [catalogCacheReady, catalogSyncNonce, store, token])

  const exercises = useMemo(() => state ? allExercises(state, catalog) : [], [catalog, state])

  const showToast = useCallback((message) => {
    window.clearTimeout(toastTimer.current)
    setToast(message)
    if (message) toastTimer.current = window.setTimeout(() => setToast(''), 2200)
  }, [])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  const persist = useCallback((nextOrTransform, message = '') => {
    // Every save writes the whole latest state, so it also covers a pending typed edit.
    window.clearTimeout(typingSaveTimer.current)
    typingSaveTimer.current = null
    const next = typeof nextOrTransform === 'function' ? nextOrTransform(stateRef.current) : nextOrTransform
    stateRef.current = next
    setState(next)
    setSaveState('saving')
    pendingSaves.current += 1
    saveQueue.current = saveQueue.current.catch(() => {}).then(() => store?.set(STATE_PATH, next))
    return saveQueue.current.then(() => {
      pendingSaves.current -= 1
      if (pendingSaves.current === 0) setSaveState('idle')
      if (message) showToast(message)
      return true
    }).catch((error) => {
      pendingSaves.current -= 1
      setSaveState('error')
      window.mobius?.signal?.('error', { source: 'save', message: error.message })
      return false
    })
  }, [showToast, store])

  const persistWhileTyping = useCallback((transform) => {
    const next = transform(stateRef.current)
    stateRef.current = next
    setState(next)
    setSaveState('saving')
    window.clearTimeout(typingSaveTimer.current)
    typingSaveTimer.current = window.setTimeout(() => persist(stateRef.current), TYPING_SAVE_DELAY_MS)
  }, [persist])

  const flushTypingSave = useCallback(() => {
    if (typingSaveTimer.current != null) persist(stateRef.current)
  }, [persist])

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'hidden') flushTypingSave() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flushTypingSave)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flushTypingSave)
      flushTypingSave()
    }
  }, [flushTypingSave])

  const saveExerciseNote = useCallback((exerciseId, rawNote) => {
    persist((current) => {
      const exerciseNotes = { ...current.exerciseNotes }
      if (rawNote.trim()) exerciseNotes[exerciseId] = rawNote
      else delete exerciseNotes[exerciseId]
      return { ...current, exerciseNotes }
    })
  }, [persist])

  const closeDetail = useCallback(() => {
    detailController.current?.abort()
    detailController.current = null
    setDetail(null)
    setDetailState('idle')
  }, [])

  useEffect(() => () => detailController.current?.abort(), [])

  const openExercise = useCallback(async (exercise, addExercise = null, actionLabel = 'Add') => {
    detailController.current?.abort()
    const controller = new AbortController()
    detailController.current = controller
    setDetail({ exercise, addExercise, actionLabel })
    setDetailState('loading')
    try {
      const full = await fetchExerciseDetail(token, exercise, controller.signal)
      setDetail((current) => current ? { ...current, exercise: full } : current)
      const withMedia = await fetchExerciseMedia(token, full, controller.signal)
      setDetail((current) => current ? { ...current, exercise: withMedia } : current)
      setDetailState('ready')
    } catch (error) {
      if (error.name === 'AbortError') return
      setDetailState('error')
      window.mobius?.signal?.('error', { source: 'exercise-detail', message: error.message })
    } finally {
      if (detailController.current === controller) detailController.current = null
    }
  }, [token])

  if (!state) {
    return <div className="wk-root"><style>{CSS}</style><div className="wk-loading">Loading your training…</div></div>
  }

  const active = state.activeWorkout
  const start = (routine) => {
    persist((current) => ({ ...current, activeWorkout: startWorkout(routine) }), `${routine?.name || 'Workout'} started`).then((saved) => {
      if (saved) window.mobius?.signal?.('item_created', { type: 'workout' })
    })
  }
  const updateActive = (transform) => persist((current) => ({ ...current, activeWorkout: transform(current.activeWorkout) }))
  const typeInActive = (transform) => persistWhileTyping((current) => ({ ...current, activeWorkout: transform(current.activeWorkout) }))
  const completedSets = active?.exercises?.flatMap((exercise) => exercise.sets).filter((set) => set.completed && Number(set.reps) > 0).length || 0
  const finish = () => {
    if (!active || completedSets === 0 || finishing.current) return
    finishing.current = true
    const session = finishWorkout(active)
    persist((current) => current.activeWorkout ? ({ ...current, activeWorkout: null, sessions: [...current.sessions, session] }) : current, 'Workout saved').then((saved) => {
      if (saved) window.mobius?.signal?.('workout_finished', { exercise_count: session.exercises.length, set_count: completedSets })
    }).finally(() => { finishing.current = false })
  }
  const discard = () => {
    persist((current) => ({ ...current, activeWorkout: null }), 'Workout discarded').then((saved) => {
      if (saved) window.mobius?.signal?.('item_deleted', { type: 'workout-draft' })
    })
    setDiscardOpen(false)
  }

  return (
    <div className="wk-root">
      <style>{CSS}</style>
      <header className={`wk-top-rail${active ? ' is-active' : ''}`}>
        <div className="wk-top-rail-inner">
          <WorkoutIcon appId={appId} />
          {!active ? <>
            <h1 className="wk-sr-only">Workout</h1>
            <nav className="wk-seg" role="tablist" aria-label="Workout sections">
              {[['workout', 'Workout'], ['history', 'History'], ['exercises', 'Exercises']].map(([id, label]) => (
                <button key={id} role="tab" aria-selected={tab === id} className={`wk-seg-btn${tab === id ? ' is-active' : ''}`} onClick={() => setTab(id)}>{label}</button>
              ))}
            </nav>
          </> : <>
            <div className="wk-active-rail-copy"><h1>{active.name}</h1><span><WorkoutElapsed startedAt={active.startedAt} /> · {completedSets} sets done</span></div>
            <div className="wk-header-right"><button className="wk-btn wk-btn-secondary" onClick={() => setDiscardOpen(true)}>Discard</button><button className="wk-btn wk-btn-primary" disabled={completedSets === 0} onClick={finish}>Finish</button></div>
          </>}
        </div>
      </header>

      <div className="wk-page">
        <main className="wk-scroll">
          {active
            ? <ActiveWorkout active={active} state={state} exercises={exercises} update={updateActive} typeInSet={typeInActive} flushTyping={flushTypingSave} openExercise={openExercise} saveExerciseNote={saveExerciseNote} store={store} token={token} />
            : tab === 'workout'
              ? <WorkoutHome state={state} exercises={exercises} start={start} createRoutine={() => setBuilder({ id: crypto.randomUUID(), name: 'New routine', exercises: [] })} editRoutine={(routine) => setBuilder({ ...routine, exercises: routine.exercises.map((item) => ({ ...item })) })} />
              : tab === 'history'
                ? <History state={state} exercises={exercises} />
                : <ExerciseLibrary state={state} exercises={exercises} catalogStatus={catalogStatus} openExercise={openExercise} store={store} token={token} retryCatalog={() => {
                  catalogSyncStarted.current = false
                  catalogAutoRetries.current = 0
                  setCatalogSyncNonce((current) => current + 1)
                }} />}
        </main>
      </div>

      {saveState === 'error'
        ? <div className="wk-sync-pill is-error" role="status"><span>Couldn’t save</span><button onClick={() => persist(stateRef.current, 'Changes saved')}>Retry</button></div>
        : !online && <div className="wk-sync-pill" role="status">Offline</div>}
      {detail && <ExerciseDetail exercise={detail.exercise} mediaState={detailState} trainingState={state} note={state.exerciseNotes[detail.exercise.id] || ''} saveExerciseNote={saveExerciseNote} addExercise={detail.addExercise} actionLabel={detail.actionLabel} close={closeDetail} />}
      {builder && <RoutineBuilder state={state} value={builder} setValue={setBuilder} exercises={exercises} openExercise={openExercise} store={store} token={token} close={() => setBuilder(null)} save={() => {
        const routine = { ...builder, updatedAt: new Date().toISOString() }
        const existing = state.routines.some((item) => item.id === routine.id)
        persist((current) => ({ ...current, routines: existing ? current.routines.map((item) => item.id === routine.id ? routine : item) : [...current.routines, routine] }), existing ? 'Routine updated' : 'Routine saved').then((saved) => {
          if (saved) window.mobius?.signal?.(existing ? 'item_updated' : 'item_created', { type: 'routine' })
        })
        setBuilder(null)
      }} />}
      {discardOpen && <ConfirmDiscard cancel={() => setDiscardOpen(false)} confirm={discard} />}
      {toast && <div className="wk-toast" role="status">{toast}</div>}
    </div>
  )
}

function WorkoutHome({ state, exercises, start, createRoutine, editRoutine }) {
  return <>
    <div className="wk-quick-start">
      <button className="wk-btn wk-btn-primary wk-btn-block wk-new-workout" onClick={() => start(null)}><Plus size={18} />New workout</button>
    </div>
    <section className="wk-section">
      <div className="wk-section-heading wk-routines-heading">
        <div className="wk-section-heading-copy"><h2 className="wk-section-title">Routines</h2><span>{state.routines.length} saved</span></div>
        <button className="wk-btn wk-btn-secondary wk-new-routine" onClick={createRoutine}><Plus size={16} />New routine</button>
      </div>
      <div className="wk-routine-list">{state.routines.map((routine) => (
        <article className="wk-routine" key={routine.id}>
          <div className="wk-routine-main"><h3>{routine.name}</h3><p>{routine.exercises.map((item) => findExercise(state, item.exerciseId, exercises).name).join(', ') || 'No exercises yet'}</p></div>
          <div className="wk-routine-actions">
            <button className="wk-btn wk-btn-secondary wk-routine-edit" aria-label={`Edit ${routine.name} routine`} onClick={() => editRoutine(routine)}><Pencil size={16} />Edit</button>
            <button className="wk-btn wk-btn-primary wk-routine-start" aria-label={`Start ${routine.name} routine`} disabled={routine.exercises.length === 0} onClick={() => start(routine)}>Start</button>
          </div>
        </article>
      ))}</div>
    </section>
  </>
}

function ActiveWorkout({ active, state, exercises, update, typeInSet, flushTyping, openExercise, saveExerciseNote, store, token }) {
  const [picker, setPicker] = useState(null)
  const [menuIndex, setMenuIndex] = useState(null)
  const [query, setQuery] = useState('')
  const [clock, setClock] = useState(Date.now())
  const restTimer = active.restTimer
  useEffect(() => {
    if (!restTimer || restTimer.completed) return
    const tick = () => {
      const now = Date.now()
      setClock(now)
      if (now >= restTimer.endsAt) {
        update((current) => current.restTimer?.endsAt === restTimer.endsAt ? { ...current, restTimer: { ...current.restTimer, completed: true } } : current)
        window.mobius?.signal?.('rest_complete', { exercise_id: restTimer.exerciseId })
      }
    }
    tick()
    const interval = window.setInterval(tick, 500)
    return () => window.clearInterval(interval)
  }, [restTimer?.completed, restTimer?.endsAt, restTimer?.exerciseId, update])
  const addExercise = (exercise) => {
    update((current) => ({ ...current, exercises: [...current.exercises, {
      exerciseId: exercise.id, restSeconds: 90,
      sets: [{ id: crypto.randomUUID(), weight: '', reps: '', completed: false }],
    }] }))
    setPicker(null)
    setQuery('')
  }
  const replaceExercise = (exercise, index) => {
    update((current) => replaceWorkoutExercise(current, index, exercise.id))
    setPicker(null)
    setQuery('')
  }
  const menuItem = menuIndex === null ? null : active.exercises[menuIndex]
  const menuExercise = menuItem ? findExercise(state, menuItem.exerciseId, exercises) : null
  return <>
    {restTimer && <aside className={`wk-rest-timer${restTimer.completed ? ' is-complete' : ''}`} aria-label="Rest timer">
      <div><span>{restTimer.completed ? 'Rest complete' : `Rest · ${restTimer.exerciseName}`}</span><strong>{restTimer.completed ? 'Ready' : formatCountdown(Math.max(0, Math.ceil((restTimer.endsAt - clock) / 1000)))}</strong></div>
      <button className="wk-btn wk-btn-secondary" onClick={() => update((current) => ({ ...current, restTimer: null }))}>{restTimer.completed ? 'Dismiss' : 'Skip'}</button>
    </aside>}
    {restTimer?.completed && <span className="wk-sr-only" role="status">Rest complete for {restTimer.exerciseName}. Ready for the next set.</span>}
    {active.exercises.length === 0 && <div className="wk-empty"><div className="wk-empty-title">Add your first exercise</div><p className="wk-empty-text">Build this workout as you go. It stays recoverable until you finish or discard it.</p></div>}
    {active.exercises.map((item, exerciseIndex) => {
      const exercise = findExercise(state, item.exerciseId, exercises)
      const previous = lastSetsFor(state, exercise.id)
      return <section className="wk-active-exercise" key={`${exercise.id}-${exerciseIndex}`}>
        <div className="wk-exercise-heading"><button className="wk-exercise-name" onClick={() => openExercise(exercise)}><strong>{exercise.name}</strong><span>Rest {item.restSeconds || 90}s · View exercise</span></button><button className="wk-exercise-menu" aria-label={`Actions for ${exercise.name}`} onClick={() => setMenuIndex(exerciseIndex)}><DotsVertical size={20} /></button></div>
        <SetupNoteField exercise={exercise} value={state.exerciseNotes[exercise.id] || ''} onSave={saveExerciseNote} compact />
        <div className="wk-set-head"><span>Set</span><span>Previous</span><span>{state.preferences.unit}</span><span>Reps</span><span>Done</span></div>
        {item.sets.map((set, setIndex) => {
          const personalRecord = isPersonalRecord(state, exercise.id, set)
          return <div className={`wk-set-row${set.completed ? ' is-complete' : ''}${personalRecord ? ' is-record' : ''}`} key={set.id}>
          <span className="wk-set-number">{setIndex + 1}</span>
          <button className="wk-previous" disabled={!previous[setIndex]} aria-label={previous[setIndex] ? `Copy previous ${previous[setIndex].weight || 'zero'} by ${previous[setIndex].reps || 'zero'} into set ${setIndex + 1}` : `No previous values for set ${setIndex + 1}`} onClick={() => {
            const prior = previous[setIndex]
            if (!prior) return
            update((current) => ({ ...current, exercises: current.exercises.map((candidate, index) => index === exerciseIndex ? { ...candidate, sets: candidate.sets.map((row) => row.id === set.id ? { ...row, weight: String(prior.weight ?? ''), reps: String(prior.reps ?? ''), completed: false } : row) } : candidate) }))
          }}>{previous[setIndex] ? `${previous[setIndex].weight || '—'} × ${previous[setIndex].reps || '—'}` : '—'}</button>
          {['weight', 'reps'].map((field) => <input key={field} className="wk-input wk-set-input" inputMode="decimal" aria-label={`${field} set ${setIndex + 1} for ${exercise.name}`} value={set[field]} onBlur={flushTyping} onChange={(event) => typeInSet((current) => ({ ...current, exercises: current.exercises.map((candidate, index) => index === exerciseIndex ? { ...candidate, sets: candidate.sets.map((row) => row.id === set.id ? { ...row, [field]: event.target.value, completed: field === 'reps' && Number(event.target.value) <= 0 ? false : row.completed } : row) } : candidate) }))} />)}
          <button className={`wk-check${set.completed ? ' is-complete' : ''}${personalRecord ? ' is-record' : ''}`} disabled={!set.completed && Number(set.reps) <= 0} title={!set.completed && Number(set.reps) <= 0 ? 'Enter reps before marking this set done' : undefined} aria-label={!set.completed && Number(set.reps) <= 0 ? `Enter reps before marking set ${setIndex + 1} complete` : `${set.completed ? 'Unmark' : 'Mark'} set ${setIndex + 1} complete${personalRecord ? ', new personal record' : ''}`} onClick={() => update((current) => ({ ...current, restTimer: !set.completed && Number(set.reps) > 0 ? { exerciseId: exercise.id, exerciseName: exercise.name, endsAt: Date.now() + ((item.restSeconds || 90) * 1000), completed: false } : current.restTimer, exercises: current.exercises.map((candidate, index) => index === exerciseIndex ? { ...candidate, sets: candidate.sets.map((row) => row.id === set.id ? { ...row, completed: !row.completed } : row) } : candidate) }))}><Check size={18} /></button>
        </div>})}
        <button className="wk-add-set" onClick={() => update((current) => ({ ...current, exercises: current.exercises.map((candidate, index) => index === exerciseIndex ? { ...candidate, sets: [...candidate.sets, { id: crypto.randomUUID(), weight: '', reps: '', completed: false }] } : candidate) }))}><Plus size={16} />Add set</button>
      </section>
    })}
    {picker
      ? <ExercisePicker state={state} exercises={exercises} contextExercise={picker.contextExercise} query={query} setQuery={setQuery} preview={(exercise) => openExercise(exercise, picker.mode === 'replace' ? (next) => replaceExercise(next, picker.index) : addExercise, picker.mode === 'replace' ? 'Replace' : 'Add')} cancel={() => { setPicker(null); setQuery('') }} store={store} token={token} />
      : <button className="wk-btn wk-btn-secondary wk-btn-block" onClick={() => setPicker({ mode: 'add' })}><Plus size={17} />Add exercise</button>}
    {menuExercise && <ExerciseActions exercise={menuExercise} item={menuItem} index={menuIndex} count={active.exercises.length} close={() => setMenuIndex(null)} move={(to) => {
      update((current) => moveWorkoutExercise(current, menuIndex, to))
      setMenuIndex(null)
    }} replace={() => {
      setPicker({ mode: 'replace', index: menuIndex, contextExercise: menuExercise })
      setMenuIndex(null)
    }} remove={() => {
      update((current) => removeWorkoutExercise(current, menuIndex))
      setMenuIndex(null)
    }} />}
  </>
}

function ExerciseActions({ exercise, item, index, count, close, move, replace, remove }) {
  const dialogRef = useDialogFocus(close)
  const hasEnteredSets = item.sets.some((set) => set.completed || String(set.weight).trim() || String(set.reps).trim())
  const portalRoot = document.querySelector('.wk-root')
  if (!portalRoot) return null
  return createPortal(<div className="wk-scrim" role="dialog" aria-modal="true" aria-label={`Actions for ${exercise.name}`} tabIndex={-1} ref={dialogRef} onClick={close}>
    <div className="wk-sheet wk-action-sheet" onClick={(event) => event.stopPropagation()}>
      <div className="wk-filter-sheet-head"><div><h3 className="wk-sheet-title">{exercise.name}</h3><p className="wk-sheet-kicker">Manage this workout exercise</p></div><button className="wk-btn wk-btn-secondary wk-sheet-done" onClick={close}>Done</button></div>
      <div className="wk-action-list">
        <button disabled={index === 0} onClick={() => move(index - 1)}><ArrowUp size={18} /><span><strong>Move up</strong><small>Change the workout order</small></span></button>
        <button disabled={index === count - 1} onClick={() => move(index + 1)}><ArrowDown size={18} /><span><strong>Move down</strong><small>Change the workout order</small></span></button>
        <button onClick={replace}><ChevronRight size={18} /><span><strong>Replace exercise</strong><small>Choose a new movement; entered sets reset</small></span></button>
        <button className="is-danger" onClick={remove}><Trash size={18} /><span><strong>{hasEnteredSets ? 'Remove exercise and sets' : 'Remove exercise'}</strong><small>{hasEnteredSets ? 'Clears the values entered for this exercise' : 'Remove this empty exercise block'}</small></span></button>
      </div>
    </div>
  </div>, portalRoot)
}

function ExerciseThumbnail({ exercise, store, token }) {
  const rootRef = useRef(null)
  const [imageData, setImageData] = useState(null)
  const [thumbnailState, setThumbnailState] = useState('loading')
  useEffect(() => {
    let alive = true
    let observer
    const load = () => loadExerciseThumbnail({ token, store, exercise })
      .then((value) => {
        if (!alive) return
        setImageData(value)
        setThumbnailState(value ? 'ready' : 'unavailable')
      })
      .catch(() => { if (alive) setThumbnailState('unavailable') })
    if ('IntersectionObserver' in window && rootRef.current) {
      observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        load()
      }, { rootMargin: '180px 0px' })
      observer.observe(rootRef.current)
    } else load()
    return () => { alive = false; observer?.disconnect() }
  }, [exercise.id, store, token])
  return <span className={`wk-exercise-thumb${imageData ? ' is-ready' : ''}${thumbnailState === 'unavailable' ? ' is-unavailable' : ''}`} ref={rootRef} aria-hidden="true">
    {imageData ? <img src={imageData} alt="" /> : <span>{exerciseThumbnailLabel(exercise)}</span>}
  </span>
}

function ExerciseRow({ exercise, store, token, action, onClick }) {
  return <button className="wk-exercise-row" aria-label={`${action} ${exercise.name}`} onClick={onClick}>
    <ExerciseThumbnail exercise={exercise} store={store} token={token} />
    <span className="wk-exercise-copy"><strong>{exercise.name}</strong><span>{exercise.target} · {exercise.equipment}</span></span>
    <ChevronRight className="wk-row-chevron" size={18} aria-hidden="true" />
  </button>
}

function ExerciseFilters({ muscle, setMuscle, muscleOptions, equipment, setEquipment, equipmentOptions }) {
  const [open, setOpen] = useState(null)
  const options = open === 'equipment' ? equipmentOptions : muscleOptions
  const value = open === 'equipment' ? equipment : muscle
  const title = open === 'equipment' ? 'Equipment' : 'Muscles'
  return <>
    <div className="wk-filter-row" role="group" aria-label="Filter exercises">
      <button className={`wk-filter-btn${equipment !== 'All' ? ' is-filtered' : ''}`} type="button" aria-haspopup={equipment === 'All' ? 'dialog' : undefined} aria-expanded={equipment === 'All' ? open === 'equipment' : undefined} aria-label={equipment === 'All' ? 'Choose equipment' : `Clear equipment filter ${equipment}`} onClick={() => equipment === 'All' ? setOpen('equipment') : setEquipment('All')}><span>{equipment === 'All' ? 'All equipment' : equipment}</span>{equipment !== 'All' && <X size={16} aria-hidden="true" />}</button>
      <button className={`wk-filter-btn${muscle !== 'All' ? ' is-filtered' : ''}`} type="button" aria-haspopup={muscle === 'All' ? 'dialog' : undefined} aria-expanded={muscle === 'All' ? open === 'muscle' : undefined} aria-label={muscle === 'All' ? 'Choose muscles' : `Clear muscle filter ${muscle}`} onClick={() => muscle === 'All' ? setOpen('muscle') : setMuscle('All')}><span>{muscle === 'All' ? 'All muscles' : muscle}</span>{muscle !== 'All' && <X size={16} aria-hidden="true" />}</button>
    </div>
    {open && <FilterDialog title={title} options={options} value={value} close={() => setOpen(null)} choose={(next) => {
      if (open === 'equipment') setEquipment(next)
      else setMuscle(next)
      setOpen(null)
    }} />}
  </>
}

function FilterDialog({ title, options, value, choose, close }) {
  const dialogRef = useDialogFocus(close)
  const portalRoot = document.querySelector('.wk-root')
  if (!portalRoot) return null
  return createPortal(<div className="wk-scrim" role="dialog" aria-modal="true" aria-label={`Choose ${title.toLowerCase()}`} tabIndex={-1} ref={dialogRef} onClick={close}>
    <div className="wk-sheet wk-filter-sheet" onClick={(event) => event.stopPropagation()}>
      <div className="wk-filter-sheet-head"><h3 className="wk-sheet-title">{title}</h3><button className="wk-btn wk-btn-secondary wk-sheet-done" onClick={close}>Done</button></div>
      <div className="wk-option-list">{options.map((option) => <button className={`wk-option${option === value ? ' is-selected' : ''}`} key={option} onClick={() => choose(option)}><span>{option === 'All' ? `All ${title.toLowerCase()}` : option}</span>{option === value && <Check size={17} aria-hidden="true" />}</button>)}</div>
    </div>
  </div>, portalRoot)
}

function filterOptions(exercises, field) {
  return ['All', ...[...new Set(exercises.map((exercise) => exercise[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b))]
}

function matchesExercise(exercise, query, muscle, equipment) {
  return (muscle === 'All' || exercise.bodyPart === muscle)
    && (equipment === 'All' || exercise.equipment === equipment)
    && exerciseSearchText(exercise).includes(query.trim().toLowerCase())
}

function discoverySections(state, results, contextExercise, isDefault) {
  if (!isDefault) return { featured: [], featuredTitle: '', remaining: results, remainingTitle: 'Results' }
  let featured = []
  let featuredTitle = ''
  if (contextExercise) {
    const score = (exercise) => (exercise.target === contextExercise.target ? 4 : 0)
      + (exercise.bodyPart === contextExercise.bodyPart ? 2 : 0)
      + (exercise.equipment === contextExercise.equipment ? 1 : 0)
    featured = results.filter((exercise) => exercise.id !== contextExercise.id && score(exercise) > 0)
      .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name)).slice(0, 6)
    featuredTitle = 'Suggested exercises'
  } else {
    const byId = new Map(results.map((exercise) => [exercise.id, exercise]))
    featured = familiarExerciseIds(state, 6).map((id) => byId.get(id)).filter(Boolean)
    featuredTitle = state.sessions.length ? 'Recent exercises' : 'From your routines'
  }
  const featuredIds = new Set(featured.map((exercise) => exercise.id))
  return { featured, featuredTitle, remaining: results.filter((exercise) => !featuredIds.has(exercise.id)), remainingTitle: 'All exercises' }
}

function ExerciseResultSections({ featured, featuredTitle, remaining, remainingTitle, visibleCount, store, token, action, open }) {
  return <>
    {featured.length > 0 && <section className="wk-discovery-section" aria-label={featuredTitle}>
      <div className="wk-list-heading"><h3>{featuredTitle}</h3><span>{featured.length}</span></div>
      <div className="wk-exercise-list">{featured.map((exercise) => <ExerciseRow key={exercise.id} exercise={exercise} store={store} token={token} action={action} onClick={() => open(exercise)} />)}</div>
    </section>}
    <section className="wk-discovery-section" aria-label={remainingTitle}>
      <div className="wk-list-heading"><h3>{remainingTitle}</h3><span>{remaining.length}</span></div>
      <div className="wk-exercise-list">{remaining.slice(0, visibleCount).map((exercise) => <ExerciseRow key={exercise.id} exercise={exercise} store={store} token={token} action={action} onClick={() => open(exercise)} />)}</div>
    </section>
  </>
}

function ExercisePicker({ state, exercises, contextExercise = null, query, setQuery, preview, cancel, store, token }) {
  const [muscle, setMuscle] = useState('All')
  const [equipment, setEquipment] = useState('All')
  const muscleOptions = useMemo(() => filterOptions(exercises, 'bodyPart'), [exercises])
  const equipmentOptions = useMemo(() => filterOptions(exercises, 'equipment'), [exercises])
  const results = useMemo(() => exercises.filter((exercise) => exercise.id !== contextExercise?.id && matchesExercise(exercise, query, muscle, equipment)), [contextExercise?.id, equipment, exercises, muscle, query])
  const sections = useMemo(() => discoverySections(state, results, contextExercise, !query.trim() && muscle === 'All' && equipment === 'All'), [contextExercise, equipment, muscle, query, results, state])
  const resetKey = `${query}\u0000${muscle}\u0000${equipment}`
  const { hasMore, sentinelRef, visibleCount } = useProgressiveExerciseList(sections.remaining.length, resetKey)
  return <section className="wk-picker" aria-label="Choose an exercise">
    <div className="wk-picker-head"><input autoFocus className="wk-input" aria-label="Search exercises" placeholder="Search exercises, muscles, equipment" value={query} onChange={(event) => setQuery(event.target.value)} /><button className="wk-btn wk-btn-secondary wk-picker-cancel" onClick={cancel}>Cancel</button></div>
    <ExerciseFilters muscle={muscle} setMuscle={setMuscle} muscleOptions={muscleOptions} equipment={equipment} setEquipment={setEquipment} equipmentOptions={equipmentOptions} />
    {!results.length ? <div className="wk-empty wk-picker-empty"><div className="wk-empty-title">No matching exercises</div><p className="wk-empty-text">Try another search or clear a filter.</p></div> : <ExerciseResultSections {...sections} visibleCount={visibleCount} store={store} token={token} action="Preview" open={preview} />}
    {hasMore && <div className="wk-list-sentinel" ref={sentinelRef} aria-hidden="true" />}
  </section>
}

function ExerciseLibrary({ state, exercises, catalogStatus, openExercise, retryCatalog, store, token }) {
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState('All')
  const [equipment, setEquipment] = useState('All')
  const muscleOptions = useMemo(() => filterOptions(exercises, 'bodyPart'), [exercises])
  const equipmentOptions = useMemo(() => filterOptions(exercises, 'equipment'), [exercises])
  const filtered = useMemo(() => exercises.filter((exercise) => matchesExercise(exercise, query, muscle, equipment)), [equipment, exercises, muscle, query])
  const sections = useMemo(() => discoverySections(state, filtered, null, !query.trim() && muscle === 'All' && equipment === 'All'), [equipment, filtered, muscle, query, state])
  const resetKey = `${query}\u0000${muscle}\u0000${equipment}`
  const { hasMore, sentinelRef, visibleCount } = useProgressiveExerciseList(sections.remaining.length, resetKey)
  return <section aria-label="Exercise library">
    <input className="wk-input wk-search" type="search" aria-label="Search exercises" placeholder="Search exercises, muscles, equipment" value={query} onChange={(event) => setQuery(event.target.value)} />
    <ExerciseFilters muscle={muscle} setMuscle={setMuscle} muscleOptions={muscleOptions} equipment={equipment} setEquipment={setEquipment} equipmentOptions={equipmentOptions} />
    <div className="wk-library-summary"><span>{filtered.length} {query.trim() || muscle !== 'All' || equipment !== 'All' ? 'matching' : 'available'} exercises</span>{catalogStatus.state === 'loading' && <span>Syncing {catalogStatus.loaded}/{catalogStatus.total}</span>}{catalogStatus.state === 'partial' && <span>{catalogStatus.loaded} saved</span>}{catalogStatus.state === 'error' && <span>Catalogue unavailable</span>}</div>
    {(catalogStatus.state === 'partial' || catalogStatus.state === 'error') && <div className="wk-catalog-resume"><p>{catalogStatus.loaded ? 'Loading paused, but everything already saved is ready to use.' : 'The full exercise catalogue could not load yet.'}</p><button className="wk-btn wk-btn-secondary" onClick={retryCatalog}>Continue loading</button></div>}
    {!filtered.length ? <div className="wk-empty"><div className="wk-empty-title">No matching exercises</div><p className="wk-empty-text">Try another search or clear a filter.</p></div> : <ExerciseResultSections {...sections} visibleCount={visibleCount} store={store} token={token} action="View" open={openExercise} />}
    {hasMore && <div className="wk-list-sentinel" ref={sentinelRef} aria-hidden="true" />}
    <p className="wk-credit">Exercise data and animated demonstrations from <a href="https://oss.exercisedb.dev/docs" target="_blank" rel="noreferrer">{EXERCISEDB_CREDIT}</a>.</p>
  </section>
}

function ExerciseDetail({ exercise, mediaState, trainingState, note, saveExerciseNote, addExercise, actionLabel = 'Add', close }) {
  const progress = exerciseProgress(trainingState, exercise.id)
  const unit = trainingState.preferences.unit
  return <SwipeSheet label={`${exercise.name} details`} close={close} className="wk-exercise-detail">
    <div className="wk-sheet-heading"><div className="wk-brand-text"><h2 className="wk-title">{exercise.name}</h2><span className="wk-subtitle">{exercise.target} · {exercise.equipment}</span></div>{addExercise && <button className="wk-btn wk-btn-primary" onClick={() => { addExercise(exercise); close() }}>{actionLabel}</button>}</div>
    <div className="wk-detail-scroll">
      {exercise.imageData ? <img className="wk-gif" src={exercise.imageData} alt={`${exercise.name} animated demonstration`} /> : <div className="wk-media-state">{mediaState === 'loading' ? 'Loading demonstration…' : 'Demonstration unavailable'}</div>}
      <dl className="wk-detail-facts"><div><dt>Target</dt><dd>{exercise.target}</dd></div><div><dt>Body part</dt><dd>{exercise.bodyPart}</dd></div><div><dt>Equipment</dt><dd>{exercise.equipment}</dd></div></dl>
      <SetupNoteField exercise={exercise} value={note} onSave={saveExerciseNote} />
      <section className="wk-progress" aria-label={`${exercise.name} progress`}>
        <div className="wk-section-heading"><h3>Progress</h3><span>{progress.workouts ? `${progress.workouts} logged workout${progress.workouts === 1 ? '' : 's'}` : 'No completed sets yet'}</span></div>
        {progress.workouts > 0 && <>
          <div className="wk-progress-metrics">
            <div><span>Best weight</span><strong>{formatWeight(progress.bestWeight, unit)}</strong></div>
            <div><span>Est. 1RM</span><strong>{formatWeight(progress.bestE1rm, unit)}</strong></div>
            <div><span>Best volume</span><strong>{formatWeight(progress.bestSessionVolume, unit)}</strong></div>
          </div>
          <ExerciseTrend series={progress.series} unit={unit} />
          <div className="wk-progress-history">{progress.recent.map((session) => <div key={session.sessionId}><span>{formatProgressDate(session.finishedAt)}</span><strong>{session.bestSet.weight ? `${formatDecimal(session.bestSet.weight)} ${unit} × ${session.bestSet.reps}` : `${session.bestSet.reps} reps`}</strong><span>{session.isRecord && <b className="wk-pr-badge">PR</b>}{session.completedSets} set{session.completedSets === 1 ? '' : 's'}</span></div>)}</div>
        </>}
      </section>
      <h3>How to perform</h3>
      {exercise.instructions?.length ? <ol className="wk-instructions">{exercise.instructions.map((instruction, index) => <li key={index}>{instruction.replace(/^Step:\d+\s*/, '')}</li>)}</ol> : <p className="wk-muted-copy">Instructions are unavailable for this exercise.</p>}
      <p className="wk-credit">Exercise data and animation from <a href="https://oss.exercisedb.dev/docs" target="_blank" rel="noreferrer">{EXERCISEDB_CREDIT}</a>.</p>
    </div>
  </SwipeSheet>
}

function ExerciseTrend({ series, unit }) {
  const points = series.slice(-10)
  if (points.length < 2) return <p className="wk-trend-empty">Log this exercise twice to reveal its estimated 1RM trend.</p>
  const width = 320, height = 94, padX = 10, padY = 12
  const values = points.map((point) => point.bestSet.e1rm)
  const minimum = Math.min(...values), maximum = Math.max(...values)
  const spread = Math.max(1, maximum - minimum)
  const coordinates = values.map((value, index) => ({
    x: padX + ((width - (padX * 2)) * (index / Math.max(1, values.length - 1))),
    y: padY + ((height - (padY * 2)) * (1 - ((value - minimum) / spread))),
  }))
  const label = `Estimated one rep max trend from ${formatDecimal(values[0])} to ${formatDecimal(values.at(-1))} ${unit}`
  return <figure className="wk-trend-chart">
    <figcaption><span>Estimated 1RM trend</span><strong>{formatDecimal(values.at(-1))} {unit}</strong></figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} preserveAspectRatio="none">
      <line x1={padX} x2={width - padX} y1={height - padY} y2={height - padY} />
      <polyline points={coordinates.map((point) => `${point.x},${point.y}`).join(' ')} />
      {coordinates.map((point, index) => <circle key={points[index].sessionId} cx={point.x} cy={point.y} r="3.5"><title>{formatProgressDate(points[index].finishedAt)}: {formatDecimal(values[index])} {unit}</title></circle>)}
    </svg>
    <div className="wk-trend-scale"><span>{formatProgressDate(points[0].finishedAt)}</span><span>{formatProgressDate(points.at(-1).finishedAt)}</span></div>
  </figure>
}

function SetupNoteField({ exercise, value, onSave, compact = false }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [exercise.id, value])
  const commit = () => {
    const next = draft.trim()
    if (next !== draft) setDraft(next)
    if (next !== value) onSave(exercise.id, next)
  }
  return <label className={`wk-setup-note${compact ? ' is-compact' : ''}`}>
    <span>{compact ? 'Setup note' : 'Your setup note'}</span>
    <input className="wk-input" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} placeholder="Seat, pin, stance, or form cue" aria-label={`Setup note for ${exercise.name}`} />
  </label>
}

function RoutineBuilder({ state, value, setValue, exercises, openExercise, close, save, store, token }) {
  const dialogRef = useDialogFocus(close)
  const existing = state.routines.some((routine) => routine.id === value.id)
  const [picking, setPicking] = useState(false)
  const [query, setQuery] = useState('')
  const choose = (exercise) => {
    setValue((current) => ({ ...current, exercises: [...current.exercises, { exerciseId: exercise.id, sets: 3, targetReps: 8, restSeconds: 90 }] }))
    setPicking(false)
    setQuery('')
  }
  return <div className="wk-detail" role="dialog" aria-modal="true" aria-label="Routine builder" tabIndex={-1} ref={dialogRef}>
    <EditorHeader title={existing ? 'Edit routine' : 'Build routine'} subtitle="Reusable sets, reps, and rest" cancel={close} save={save} saveDisabled={!value.name.trim() || value.exercises.length === 0} />
    <div className="wk-detail-scroll">
      <label className="wk-field"><span>Routine name</span><input className="wk-input" value={value.name} onChange={(event) => setValue({ ...value, name: event.target.value })} /></label>
      <div className="wk-builder-list">{value.exercises.map((item, index) => {
        const exercise = findExercise(state, item.exerciseId, exercises)
        return <div className="wk-builder-item" key={`${item.exerciseId}-${index}`}><div className="wk-builder-name"><strong>{exercise?.name}</strong><span>{exercise?.target} · {exercise?.equipment}</span></div><label><span>Sets</span><input className="wk-input" inputMode="numeric" aria-label={`Sets for ${exercise?.name}`} value={item.sets} onChange={(event) => updateRoutineExercise(setValue, index, 'sets', event.target.value)} /></label><label><span>Reps</span><input className="wk-input" inputMode="numeric" aria-label={`Reps for ${exercise?.name}`} value={item.targetReps} onChange={(event) => updateRoutineExercise(setValue, index, 'targetReps', event.target.value)} /></label><button className="wk-btn wk-btn-icon" aria-label={`Remove ${exercise?.name}`} onClick={() => setValue((current) => ({ ...current, exercises: current.exercises.filter((_, candidateIndex) => candidateIndex !== index) }))}><Trash size={17} /></button></div>
      })}</div>
      {picking ? <ExercisePicker state={state} exercises={exercises} query={query} setQuery={setQuery} preview={(exercise) => openExercise(exercise, choose)} cancel={() => setPicking(false)} store={store} token={token} /> : <button className="wk-btn wk-btn-secondary wk-btn-block" onClick={() => setPicking(true)}><Plus size={17} />Add exercise</button>}
    </div>
  </div>
}

function History({ state, exercises }) {
  const [selectedSession, setSelectedSession] = useState(null)
  const snapshot = trainingSnapshot(state)
  const logs = useMemo(() => sessionLogs(state), [state])
  const comparison = snapshot.completedSets === 0 && snapshot.setDelta === 0
    ? 'Finish a workout to start your rolling baseline.'
    : snapshot.setDelta === 0 ? 'Completed sets are level with the previous 7 days.'
      : `${Math.abs(snapshot.setDelta)} ${snapshot.setDelta > 0 ? 'more' : 'fewer'} completed sets than the previous 7 days.`
  return <>
    <section className="wk-analytics" aria-label="Training snapshot">
      <div className="wk-section-heading"><h2 className="wk-section-title">Last 7 days</h2><span>Updates from your history</span></div>
      <div className="wk-metrics">
        <div><strong>{snapshot.workouts}</strong><span>Workouts</span></div>
        <div><strong>{snapshot.completedSets}</strong><span>Completed sets</span></div>
        <div><strong>{Math.round(snapshot.trainingVolume).toLocaleString()}</strong><span>Volume · {state.preferences.unit}</span></div>
      </div>
      <p className="wk-trend">{comparison}</p>
    </section>
    {!state.sessions.length
      ? <div className="wk-empty"><div className="wk-empty-title">Your history starts here</div><p className="wk-empty-text">Finish a workout and every completed set will appear as a structured record.</p></div>
      : <div className="wk-history">{[...state.sessions].reverse().map((session) => {
        const log = logs.get(session.id)
        const completedSets = log?.exercises.flatMap((exercise) => exercise.sets).length || 0
        return <button className="wk-history-row" key={session.id} onClick={() => setSelectedSession(session)} aria-label={`View ${session.name} workout log`}><div><h3>{session.name}</h3><p>{new Date(session.finishedAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</p></div><div className="wk-history-stats"><span>{duration(session.durationSeconds)}</span><span>{completedSets} sets</span><span>{Math.round(volume(session))} {state.preferences.unit}</span>{log?.recordCount > 0 && <b className="wk-pr-badge">{log.recordCount} PR{log.recordCount === 1 ? '' : 's'}</b>}</div><ChevronRight className="wk-row-chevron" size={18} aria-hidden="true" /></button>
      })}</div>}
    {selectedSession && <SessionDetail state={state} session={selectedSession} log={logs.get(selectedSession.id)} exercises={exercises} close={() => setSelectedSession(null)} />}
  </>
}

function SessionDetail({ state, session, log, exercises, close }) {
  if (!log) return null
  const completedSets = log.exercises.flatMap((exercise) => exercise.sets).length
  return <SwipeSheet label={`${session.name} workout log`} close={close} className="wk-session-detail">
    <div className="wk-sheet-heading"><div className="wk-brand-text"><h2 className="wk-title">{session.name}</h2><span className="wk-subtitle">{new Date(session.finishedAt).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></div></div>
    <div className="wk-detail-scroll">
      <section className="wk-log-summary" aria-label="Workout summary">
        <div><span>Duration</span><strong>{duration(session.durationSeconds)}</strong></div>
        <div><span>Completed</span><strong>{completedSets} sets</strong></div>
        <div><span>Volume</span><strong>{Math.round(volume(session)).toLocaleString()} {state.preferences.unit}</strong></div>
      </section>
      {log.recordCount > 0 && <p className="wk-log-record-callout"><b>{log.recordCount} personal record{log.recordCount === 1 ? '' : 's'}</b><span>Compared with workouts completed before this session.</span></p>}
      {completedSets === 0 && <div className="wk-empty wk-session-empty"><div className="wk-empty-title">No completed sets</div><p className="wk-empty-text">This saved workout has no completed sets to show.</p></div>}
      <div className="wk-session-exercises">{log.exercises.map((item, exerciseIndex) => {
        const exercise = findExercise(state, item.exerciseId, exercises)
        return <section className="wk-session-exercise" key={`${item.exerciseId}-${exerciseIndex}`}>
          <div className="wk-exercise-heading"><div className="wk-session-exercise-copy"><h3>{exercise.name}</h3><span>{exercise.target} · {exercise.equipment}</span></div></div>
          <div className="wk-log-set-head"><span>Set</span><span>Weight</span><span>Reps</span><span>Record</span></div>
          {item.sets.map((set, index) => <div className={`wk-log-set${set.isPersonalRecord ? ' is-record' : ''}`} key={set.id || `${item.exerciseId}-${index}`}><span>{index + 1}</span><strong>{Number(set.weight) ? `${formatDecimal(set.weight)} ${state.preferences.unit}` : 'Body weight'}</strong><strong>{set.reps}</strong><span>{set.recordLabel && <b className="wk-pr-badge">{set.recordLabel}</b>}</span></div>)}
        </section>
      })}</div>
    </div>
  </SwipeSheet>
}

function ConfirmDiscard({ cancel, confirm }) {
  const dialogRef = useDialogFocus(cancel)
  return <div className="wk-scrim" role="dialog" aria-modal="true" aria-label="Discard workout" tabIndex={-1} ref={dialogRef} onClick={cancel}><div className="wk-sheet" onClick={(event) => event.stopPropagation()}><h3 className="wk-sheet-title">Discard this workout?</h3><p className="wk-sheet-body">The in-progress sets will be removed. Completed workout history and routines stay untouched.</p><div className="wk-sheet-actions"><button className="wk-btn wk-btn-secondary" onClick={cancel}>Keep workout</button><button className="wk-btn wk-btn-danger" onClick={confirm}>Discard</button></div></div></div>
}

function exerciseSearchText(exercise) {
  return [exercise.name, exercise.target, exercise.bodyPart, exercise.equipment, ...(exercise.secondaryMuscles || [])].join(' ').toLowerCase()
}

function updateRoutineExercise(setValue, index, field, rawValue) {
  const value = Math.max(1, Math.min(99, Number(rawValue) || 1))
  setValue((current) => ({ ...current, exercises: current.exercises.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }))
}

function formatCountdown(seconds) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

function formatDecimal(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })
}

function formatWeight(value, unit) {
  return Number(value) > 0 ? `${formatDecimal(value)} ${unit}` : '—'
}

function formatProgressDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Earlier workout' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
