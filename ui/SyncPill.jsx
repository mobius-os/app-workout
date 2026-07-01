import React, { useState, useEffect, useCallback } from 'react'
import { isDurableSetResult } from '../storage.js'

export function useSyncStatus(store) {
  const [pending, setPending] = useState(0)
  const [hasError, setHasError] = useState(false)
  const [online, setOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true)

  const refresh = useCallback(async () => {
    try {
      const nextPending = await store.pendingCount()
      setPending(nextPending)
    } catch { /* keep previous */ }
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

// Standard: show nothing when online+idle unless the last write failed.
export function SyncPill({ status, onRetry }) {
  const { pending, online, hasError } = status
  if (hasError) {
    return (
      <button className="wk-pill is-error" type="button" role="alert" onClick={onRetry}
        title="The last save was not confirmed. Retry saving now."
        aria-label="Save failed, retry">
        Save failed · Retry
      </button>
    )
  }
  if (online && pending === 0) return null
  const label = !online
    ? (pending > 0 ? `Offline · ${pending} pending` : 'Offline')
    : null
  if (!label) return null
  return (
    <span className="wk-pill is-offline" role="status" aria-live="polite"
      title="Changes save locally and sync when you're back online."
      aria-label={`Offline${pending > 0 ? `, ${pending} pending` : ''}`}>
      {label}
    </span>
  )
}
