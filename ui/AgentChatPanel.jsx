import React, { useState, useEffect, useMemo, useRef } from 'react'
import { workoutAgentPrompt } from '../agent-prompt.js'

// The bottom pane of the toggle-split chat (ported from app-latex's ChatPanel).
// It FILLS the height its parent split allots via --chat-ratio: the section is a
// flex column (flex:1 + min-height:0 in the theme), the embed fills it, and the
// iframe fills the embed — so the chat's composer is pinned to the pane's bottom
// and the panel is never clipped. No `height` prop: the parent owns the sizing.
export function AgentChatPanel({ appId, token, store, onEntriesMaybeChanged, quickActions }) {
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
    <section className="wk-chat-panel" aria-label="Agent chat">
      {error && <div className="wk-chat-error">{error}</div>}
      <div className="wk-chat-embed" ref={mountRef} />
    </section>
  )
}
