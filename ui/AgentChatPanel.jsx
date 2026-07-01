import React, { useState, useEffect, useMemo, useRef } from 'react'
import { workoutAgentPrompt } from '../agent-prompt.js'

export function AgentChatPanel({ appId, token, store, onEntriesMaybeChanged, height, quickActions }) {
  const mountRef = useRef(null)
  const [error, setError] = useState(null)
  const onEntriesRef = useRef(onEntriesMaybeChanged)
  useEffect(() => { onEntriesRef.current = onEntriesMaybeChanged }, [onEntriesMaybeChanged])
  const quickActionsRef = useRef(quickActions)
  useEffect(() => { quickActionsRef.current = quickActions }, [quickActions])
  const systemPrompt = useMemo(() => workoutAgentPrompt(appId), [appId])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || !window.mobius || typeof window.mobius.chat !== 'function') {
      setError('Embedded chat is not available in this shell.')
      return undefined
    }
    let disposed = false
    let handle = null
    setError(null)

    window.mobius.chat({
      mount,
      persist: 'chat_id.json',
      title: 'Workout',
      systemPrompt,
      picker: true,
      quickActions: quickActionsRef.current,
      onTurnDone: () => { onEntriesRef.current?.() },
      onError: ({ error: chatError }) => {
        setError(typeof chatError === 'string' ? chatError : 'Embedded chat reported an error.')
      },
    }).then((nextHandle) => {
      if (disposed) {
        nextHandle.destroy()
        return
      }
      handle = nextHandle
    }).catch((e) => {
      if (!disposed) setError(e.message || 'Could not mount embedded chat.')
    })

    return () => {
      disposed = true
      if (handle) handle.destroy()
    }
  }, [systemPrompt])

  return (
    <section className="workout-chat-panel wk-chat-panel" style={{ flex: `0 0 ${height}%` }}>
      {error && <div className="wk-chat-error">{error}</div>}
      <div className="wk-chat-embed" ref={mountRef} />
    </section>
  )
}
