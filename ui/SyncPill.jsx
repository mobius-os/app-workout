import React, { useState, useEffect, useCallback } from 'react'
import { isDurableSetResult } from '../storage.js'

// Read the platform's PROBED reachability when the Mobius runtime is present,
// falling back to the browser's navigator.onLine only outside it. Inside the
// iframe navigator.onLine reports the browser's network state, which can
// disagree with whether Mobius storage is actually reachable.
function readOnline() {
  const ms = (typeof window !== 'undefined') ? window.mobius : null
  if (ms && typeof ms.online === 'boolean') return ms.online
  return typeof navigator !== 'undefined' ? navigator.onLine : true
}

export function useSyncStatus(store) {
  const [pending, setPending] = useState(0)
  const [hasError, setHasError] = useState(false)
  const [online, setOnline] = useState(readOnline)

  const refresh = useCallback(async () => {
    try {
      const nextPending = await store.pendingCount()
      setPending(nextPending)
    } catch { /* keep previous */ }
  }, [store])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 10_000)
    const ms = (typeof window !== 'undefined') ? window.mobius : null
    // Prefer Mobius's probed reachability (window.mobius.online +
    // onOnlineChange) over the browser online/offline events, so the pill
    // tracks storage reachability, not just the browser's network flag.
    if (ms && typeof ms.onOnlineChange === 'function') {
      setOnline(typeof ms.online === 'boolean' ? ms.online : true)
      const unsub = ms.onOnlineChange((next) => { setOnline(!!next); refresh() })
      return () => {
        clearInterval(id)
        if (typeof unsub === 'function') unsub()
      }
    }
    function onOnline() { setOnline(true); refresh() }
    function onOffline() { setOnline(false); refresh() }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      clearInterval(id)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [refresh])

  // A write is durable only after the runtime synced it or accepted it into
  // the offline queue; every other set result stays user-visible until retried.
  const bump = useCallback((result) => {
    if (result !== undefined) setHasError(!isDurableSetResult(result))
    refresh()
  }, [refresh])

  return { pending, online, hasError, bump, refresh }
}

// Sync is SILENT WHEN HEALTHY — nothing renders while online and idle. Offline
// shows a plain "Offline" pill (no pending count; queued writes are invisible
// plumbing). A durable WRITE failure the owner must act on shows the retry pill,
// but only while ONLINE and checked AFTER offline: an offline write is queued
// (not failed) and a flaky offline READ is not a save, so neither may surface as
// "Save failed" — the bug where an offline poll turned into a red Save-failed
// pill. hasError is reserved for durable write failures on the write paths.
export function SyncPill({ status, onRetry }) {
  const { online, hasError } = status
  if (!online) {
    return (
      <span className="wk-pill is-offline" role="status" aria-live="polite"
        title="Changes save locally and sync when you're back online."
        aria-label="Offline">
        Offline
      </span>
    )
  }
  if (hasError) {
    return (
      <button className="wk-pill is-error" type="button" role="alert" onClick={onRetry}
        title="The last save was not confirmed. Retry saving now."
        aria-label="Save failed, retry">
        Save failed · Retry
      </button>
    )
  }
  return null
}
