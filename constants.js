// Chat-panel height persistence + clamp constants and helpers. The embedded
// chat collapses to just its composer pill; chatHeight is stored as a % of the
// body and clamped on read so a value saved under an older floor/ceiling can't
// strand the panel. Extracted from index.jsx unchanged (modularization).

export const CHAT_HEIGHT_CACHE_VERSION = 1

// The chat panel collapses to just its composer pill so a logged-by-typing
// session can hand most of the screen to the analytics above it. chatHeight is
// stored as a percentage of the body (the panel uses flex-basis %), but the
// real floor is a pixel quantity: CHAT_MIN_PX is the embed input pill (~48px) +
// its 8px/8px foot padding — the panel can collapse to just the input + Send.
// The CSS min-height pins the rendered floor at CHAT_MIN_PX regardless of the
// stored percentage; the drag handler derives the matching min-percent from the
// live body height. CHAT_MIN_PCT is only a backstop for the percentage setters
// that run without a measured container — small enough that on any real screen
// the CSS pixel floor, not the percentage, is what stops the drag.
export const CHAT_MIN_PX = 64
export const CHAT_MIN_PCT = 8
export const CHAT_MAX_PCT = 82
export const CHAT_DEFAULT_PCT = 64

export function chatHeightKey(appId) {
  return `workout:${appId}:chat-height:v${CHAT_HEIGHT_CACHE_VERSION}`
}

export function clampChatPct(value) {
  return Math.min(CHAT_MAX_PCT, Math.max(CHAT_MIN_PCT, value))
}

export function readChatHeight(appId) {
  if (typeof localStorage === 'undefined') return CHAT_DEFAULT_PCT
  const saved = localStorage.getItem(chatHeightKey(appId))
  if (saved == null) return CHAT_DEFAULT_PCT
  const raw = Number(saved)
  if (!Number.isFinite(raw)) return CHAT_DEFAULT_PCT
  // Clamp on read: a height saved under the old 44% floor must not strand the
  // panel above the new minimum, and an over-tall value must not exceed the max.
  return clampChatPct(raw)
}
