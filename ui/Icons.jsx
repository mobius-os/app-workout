import React from 'react'

// Chrome icons that aren't sport keys. SportIcon (SportIcon.jsx) owns the
// activity glyphs; this holds the app-shell affordances. ChatBubbleIcon drives
// the header chat-toggle (ported from app-latex so the two chat-split apps
// share one toggle glyph).
// Icons: Tabler Icons (MIT) — https://tabler.io/icons
export function ChatBubbleIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}
