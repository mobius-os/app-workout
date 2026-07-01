// Chat toggle model — persistence + clamp constants and helpers. Ported from
// app-latex's toggle-split chat (its exact implementation, keys namespaced
// `workout:` not `latex:`). The embedded chat is HIDDEN by default; a top-bar
// toggle brings it down as the bottom pane of a draggable split.
//   chatOpen:  boolean (panel visible).
//   chatRatio: 0..1 (the chat pane's fraction of the body height).
// Both persist in localStorage, versioned so an older stored value can be
// bumped past a schema change. Extracted from index.jsx (modularization).

export const CHAT_OPEN_VERSION = 1
export const CHAT_RATIO_VERSION = 1

// The chat pane must never collapse smaller than the embedded composer's input
// pill. The embed runs the real ChatView in an opaque iframe and publishes no
// composer-height var, so we floor the pane at the standard Möbius composer pill
// height (~64px) plus the divider (10px). The message list above the pill can
// collapse to zero; the pill itself always stays fully visible and usable. The
// same floor caps the OTHER end so the content never fully eats the chat.
export const CHAT_PILL_MIN_PX = 64
export const CHAT_DIVIDER_PX = 10
export const CHAT_PANE_MIN_PX = CHAT_PILL_MIN_PX + CHAT_DIVIDER_PX

// Clamp a desired chat-pane height (px) into [pill, total - pill] and return it
// as a 0..1 ratio of the body. When the body is shorter than two pills, fall
// back to a 50/50 split so neither pane vanishes. Pure — unit-testable.
export function clampChatRatio(desiredPx, total, minPx) {
  if (!(total > 0)) return 0.5
  const floor = minPx
  const ceil = total - minPx
  // Body too short to honor both floors: split evenly rather than clip a pill.
  if (ceil <= floor) return 0.5
  const px = Math.max(floor, Math.min(ceil, desiredPx))
  return px / total
}

export function chatOpenKey(appId) { return `workout:${appId}:chat-open:v${CHAT_OPEN_VERSION}` }
export function chatRatioKey(appId) { return `workout:${appId}:chat-ratio:v${CHAT_RATIO_VERSION}` }

export function readChatOpen(appId) {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(chatOpenKey(appId)) === 'true'
}

export function readChatRatio(appId) {
  if (typeof localStorage === 'undefined') return 0.5
  const raw = Number(localStorage.getItem(chatRatioKey(appId)))
  if (!Number.isFinite(raw) || raw <= 0 || raw >= 1) return 0.5
  return Math.max(0.05, Math.min(0.95, raw))
}
