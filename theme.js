// ---------------------------------------------------------------------------
// Styles — one module-level stylesheet (the `wk-` prefix scopes it to this
// app's iframe) rendered once at the root as <style>{CSS}</style>. Every
// color/font is a CSS token painted by the Möbius shell, so the app inherits
// future themes for free. Render-time dynamic values (per-category accent
// colors, the measured chat-panel height, the bar-fill %) stay inline; every
// app-driven state that used to be an S.foo(active) helper is now a modifier
// class (.is-active / :disabled). Shared-chrome blocks are fenced with
// mobius-ui markers so a future extraction is mechanical.
// ---------------------------------------------------------------------------

export const CSS = `
/* mobius-ui:Root v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-root {
  position: relative;
  display: flex; flex-direction: column;
  height: 100%; width: 100%; max-width: 100%;
  overflow: hidden;
  background: var(--bg); color: var(--text); font-family: var(--font);
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
}
.wk-scroll {
  flex: 1; min-height: 0;
  overflow-y: auto; overflow-x: hidden;
  padding: 16px;
  word-break: break-word; overflow-wrap: anywhere;
  overscroll-behavior: contain;
}
/* /mobius-ui:Root */

/* mobius-ui:Scrollskin v2 — keep in sync; hidden by default, content stays scrollable. */
.wk-scroll,
.wk-sheet-body {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.wk-scroll::-webkit-scrollbar,
.wk-sheet-body::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}
/* /mobius-ui:Scrollskin */

/* mobius-ui:Focus v1 -- shared keyboard focus ring (WCAG 2.4.7); never bare outline:none */
:where(button,a,input,textarea,select,summary,[role="button"],[tabindex]:not([tabindex="-1"])):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
/* /mobius-ui:Focus */

/* Web cap so desktop gets a proper working canvas while mobile stays direct. */
.wk-inner { width: 100%; max-width: 1040px; margin-left: auto; margin-right: auto; }

/* mobius-ui:Header v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-header {
  flex: 0 0 auto;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: max(12px, env(safe-area-inset-top)) 16px 10px;
  background: var(--surface); border-bottom: 1px solid var(--border);
}
.wk-brand { display: inline-flex; align-items: center; gap: 10px; min-width: 0; }
.wk-brand-icon { width: 34px; height: 34px; border-radius: 8px; object-fit: cover; flex-shrink: 0; display: block; }
.wk-brand-fallback {
  width: 34px; height: 34px; border-radius: 8px; flex-shrink: 0;
  align-items: center; justify-content: center;
  background: var(--accent); color: var(--accent-fg);
  font-weight: 700; line-height: 1;
}
.wk-subtitle { margin: 0; font-size: 12px; color: var(--muted); user-select: none; }
.wk-header-actions { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; }
/* Base border so the pressed-state border-color below is visible (the shared
   .wk-icon-btn is borderless). */
.wk-chat-toggle { width: 44px; height: 44px; border: 1px solid transparent; }
.wk-chat-toggle[aria-pressed="true"] {
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}
/* /mobius-ui:Header */

/* mobius-ui:Segmented v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-tabbar {
  flex: 0 0 auto;
  display: flex; gap: 4px; padding: 8px 12px;
  background: var(--surface); border-bottom: 1px solid var(--border);
}
.wk-tab-btn {
  flex: 1; min-height: 44px; padding: 10px 8px;
  display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 6px;
  border: 1px solid transparent; border-radius: 8px;
  background: transparent; color: var(--muted);
  font-family: var(--font); font-size: 12px; font-weight: 700; cursor: pointer;
  touch-action: manipulation; user-select: none;
}
.wk-tab-btn.is-active {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--text);
}
@media (prefers-reduced-motion: no-preference) {
  .wk-tab-btn:active { opacity: 0.75; }
}
.wk-tab-icon { display: flex; line-height: 1; }
/* /mobius-ui:Segmented */

/* mobius-ui:ChatEmbed v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-chat-embed {
  flex: 1 1 auto; min-height: 0;
  overflow: hidden; background: var(--bg);
}
.wk-chat-embed iframe { display: block; width: 100%; height: 100%; border: 0; }
/* /mobius-ui:ChatEmbed */

/* Toggle-split body (ported from app-latex). The body is a flex column: the
   scroll content on top, then — only when the chat toggle is on — a draggable
   divider + the chat pane below. Without the split class it's just the content
   column (chat hidden). */
.wk-body {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column;
}
/* Chat open: the chat pane takes the --chat-ratio share of the body height,
   floored at --chat-pane-min (composer pill + divider) so the embed's input is
   never clipped, and capped at the same floor from the other end so the content
   never fully eats the chat. The drag/keyboard ratio math already honors these
   bounds; the CSS floor also covers the persisted/default ratio on a short
   viewport before any drag. */
.wk-body--chat-open .wk-scroll {
  flex: 1 1 auto;
  min-height: min(var(--chat-pane-min, 74px), 100%);
}
.wk-chat-panel {
  flex: 0 0 auto;
  height: calc(var(--chat-ratio, 0.5) * 100%);
  min-height: min(var(--chat-pane-min, 74px), 100%);
  max-height: calc(100% - var(--chat-pane-min, 74px));
  display: flex; flex-direction: column;
  background: var(--bg);
  overflow: hidden;
  overscroll-behavior: contain;
  /* Bottom-pinned sheet: lift the embedded chat composer above the iPhone
     home-indicator / Android gesture bar on a full-screen PWA. */
  padding-bottom: env(safe-area-inset-bottom);
}
/* The draggable divider ("glider") between content and chat: a slim 10px visual
   bar; the ::before overlay extends the pointer hit area to ~26px without adding
   visual weight. z-index keeps the overlay above the adjacent panes so the extra
   hit area actually receives the pointer. */
.wk-chat-divider {
  flex: 0 0 10px;
  height: 10px;
  box-sizing: border-box;
  position: relative;
  z-index: 5;
  display: flex; align-items: center; justify-content: center;
  cursor: ns-resize;
  background: var(--surface);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  touch-action: none;
  user-select: none;
}
.wk-chat-divider::before {
  content: '';
  position: absolute;
  left: 0; right: 0; top: -8px; bottom: -8px;
}
.wk-chat-divider:hover,
.wk-chat-divider:focus-visible {
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
}
.wk-chat-divider:focus-visible { outline-offset: -2px; }
.wk-chat-divider-bar {
  width: 44px; height: 4px; border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 65%, transparent);
  pointer-events: none;
}
.wk-chat-error {
  flex: 0 0 auto;
  margin: 8px 14px 0;
  padding: 8px 10px;
  border: 1px solid var(--border); border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--text); font-size: 12px;
}

/* mobius-ui:Card v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 12px; padding: 16px; margin-bottom: 14px;
}
.wk-confirm-card {
  max-width: 760px;
  margin-left: auto;
  margin-right: auto;
}
.wk-card.is-ambiguous { border-color: var(--accent); }
.wk-card-title { margin: 0 0 4px; font-size: 16px; font-weight: 700; }
.wk-card-sub { margin: 0 0 12px; font-size: 12px; color: var(--muted); }
/* /mobius-ui:Card */

/* mobius-ui:Button v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-btn-primary {
  width: 100%; min-height: 48px; padding: 14px 16px; border-radius: 12px;
  border: none; background: var(--accent); color: var(--accent-fg);
  font-family: var(--font); font-size: 15px; font-weight: 600; cursor: pointer;
  touch-action: manipulation; user-select: none;
}
.wk-btn-primary:disabled { pointer-events: none; opacity: 0.6; }
@media (prefers-reduced-motion: no-preference) {
  .wk-btn-primary:not(:disabled):active { opacity: 0.82; transform: scale(0.98); }
}
.wk-btn-secondary {
  min-height: 44px; padding: 12px 14px; border-radius: 10px;
  border: 1px solid var(--border); background: var(--surface2, var(--surface));
  color: var(--text); font-family: var(--font);
  font-size: 14px; font-weight: 600; cursor: pointer;
  touch-action: manipulation; user-select: none;
}
.wk-btn-secondary:disabled { pointer-events: none; opacity: 0.6; }
@media (prefers-reduced-motion: no-preference) {
  .wk-btn-secondary:not(:disabled):active { opacity: 0.8; transform: scale(0.97); }
}
.wk-btn-secondary.is-block { width: 100%; }
.wk-btn-secondary.is-danger { background: var(--danger); color: var(--accent-fg); border-color: var(--danger); }
.wk-btn-ghost {
  min-height: 44px; padding: 10px 12px; border-radius: 8px;
  border: none; background: transparent; color: var(--accent);
  font-family: var(--font); font-size: 13px; font-weight: 600; cursor: pointer;
  touch-action: manipulation; user-select: none;
}
.wk-btn-ghost:disabled { pointer-events: none; opacity: 0.55; }
@media (prefers-reduced-motion: no-preference) {
  .wk-btn-ghost:not(:disabled):active { opacity: 0.75; }
}
.wk-btn-ghost.is-muted { color: var(--muted); }
.wk-btn-row { display: flex; gap: 8px; flex-wrap: wrap; }
/* /mobius-ui:Button */

/* Entry feed card — app-specific list row with a per-sport icon tile. Tight
   rows: the icon names the sport, the meta line carries the key numbers. */
.wk-entry-card {
  display: flex; align-items: center; gap: 10px;
  padding: 10px; margin-bottom: 8px;
  background: color-mix(in srgb, var(--surface) 96%, var(--bg));
  border: 1px solid var(--border); border-radius: 10px;
}
.wk-entry-card.is-draft { background: color-mix(in srgb, var(--bg) 62%, var(--surface)); }
.wk-entry-icon {
  width: 32px; height: 32px; flex-shrink: 0; border-radius: 8px;
  display: flex; align-items: center; justify-content: center; font-size: 18px;
}
.wk-entry-body { flex: 1; min-width: 0; }
.wk-entry-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.wk-entry-name { margin: 0; font-size: 14px; font-weight: 760; letter-spacing: 0; }
.wk-entry-time { font-size: 12px; color: var(--muted); white-space: nowrap; }
.wk-entry-meta { margin: 3px 0 0; font-size: 13px; font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums; }
.wk-entry-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.wk-icon-btn {
  position: relative;
  width: 32px; height: 32px; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center; line-height: 1;
  border: none; background: transparent; color: var(--muted);
  font-family: var(--font); font-size: 14px; font-weight: 800; cursor: pointer;
  touch-action: manipulation; user-select: none;
}
/* Extend the tap target to a 44px minimum (WCAG 2.5.5) without growing the 32px
   visual box, so the dense entry/header rows stay compact. */
.wk-icon-btn::before {
  content: ''; position: absolute; top: 50%; left: 50%;
  width: 44px; height: 44px; transform: translate(-50%, -50%);
}
.wk-icon-btn:disabled { pointer-events: none; opacity: 0.5; }
@media (prefers-reduced-motion: no-preference) {
  .wk-icon-btn:not(:disabled):active { opacity: 0.7; transform: scale(0.9); }
}
.wk-icon-btn.is-accent { color: var(--accent); }

.wk-sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}

/* Current-session draft panel — app-specific. The is-live treatment (accent
   wash + pulsing dot + ticking elapsed time) makes the in-progress workout
   read as the one live thing on the screen. */
.wk-current-session {
  margin-bottom: 14px; overflow: hidden;
  border: 1px solid var(--border); border-radius: 12px; background: var(--surface);
}
.wk-current-session.is-live {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 6%, var(--surface));
}
.wk-current-session-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 14px; border-bottom: 1px solid var(--border);
}
.wk-current-session-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.wk-current-session-title {
  margin: 0; display: flex; align-items: center;
  font-size: 14px; line-height: 1.25; font-weight: 800; letter-spacing: 0; user-select: none;
}
.wk-live-dot {
  width: 8px; height: 8px; flex-shrink: 0; border-radius: 999px;
  margin-right: 7px; background: var(--accent);
}
@keyframes wk-live-pulse {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 50%, transparent); }
  60% { box-shadow: 0 0 0 6px transparent; }
}
@media (prefers-reduced-motion: no-preference) {
  .wk-live-dot { animation: wk-live-pulse 2.2s ease-in-out infinite; }
}
.wk-current-session-sub { margin: 3px 0 0; color: var(--muted); font-size: 12px; user-select: none; }
.wk-rest-timer {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin: 10px 12px 0; padding: 9px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  color: var(--text);
}
.wk-rest-label { margin-right: 8px; color: var(--muted); font-size: 12px; font-weight: 700; }
.wk-rest-value { font-size: 18px; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.wk-rest-actions { display: flex; gap: 4px; }
.wk-rest-actions button {
  min-width: 44px; min-height: 36px; padding: 6px 9px; border: 0; border-radius: 8px;
  background: var(--surface); color: var(--accent);
  font-family: var(--font); font-size: 12px; font-weight: 800; cursor: pointer;
}
.wk-current-session-list { padding: 10px 12px 4px; }
.wk-current-session-empty { padding: 18px 14px; color: var(--muted); font-size: 13px; }
.wk-current-session-missing { margin: 0; padding: 0 12px 12px; color: var(--muted); font-size: 12px; line-height: 1.45; }
.wk-finish-btn {
  min-height: 44px; padding: 10px 14px; border-radius: 8px;
  border: none; background: var(--accent); color: var(--accent-fg);
  font-family: var(--font); font-size: 13px; font-weight: 800;
  white-space: nowrap; cursor: pointer;
  touch-action: manipulation; user-select: none;
}
.wk-finish-btn:disabled { opacity: 0.52; cursor: not-allowed; pointer-events: none; }
@media (prefers-reduced-motion: no-preference) {
  .wk-finish-btn:not(:disabled):active { opacity: 0.82; transform: scale(0.97); }
}

/* Date-group label rows in the log / all tabs — app-specific. */
.wk-session-label {
  display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
  margin: 20px 0 9px; font-size: 12px; color: var(--muted); font-weight: 700;
  user-select: none;
}
.wk-session-date { color: var(--text); font-size: 13px; font-weight: 800; letter-spacing: 0; user-select: none; }

/* mobius-ui:Input v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-input {
  display: block; width: 100%; box-sizing: border-box; min-height: 44px; padding: 12px;
  background: var(--surface2, var(--surface)); color: var(--text);
  border: 1px solid var(--border); border-radius: 8px;
  font-family: var(--font); font-size: 16px;
}
.wk-input:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent);
}
.wk-input.is-auto { width: auto; }
.wk-label { display: block; margin-bottom: 4px; font-size: 12px; font-weight: 600; color: var(--muted); }
/* /mobius-ui:Input */

.wk-set-row {
  display: grid; grid-template-columns: 24px 1fr 1fr auto;
  align-items: center; gap: 8px; padding: 6px 0;
}
.wk-set-index { font-size: 13px; font-weight: 600; color: var(--muted); }

/* Sets stepper on the add form — [−] [N] [+], min 1. */
.wk-stepper { display: grid; grid-template-columns: 44px 1fr 44px; gap: 6px; align-items: center; }
.wk-stepper-input { text-align: center; }

/* Live-session worksheet — the draft card is now an editable grid, not a static
   summary. A strength row is [# reps × weight unit]; cardio/other rows are
   labelled fields. Incomplete rows/entries get the danger accent so the owner
   sees exactly what still blocks Finish. */
.wk-entry-card.is-draft {
  display: grid; grid-template-columns: 32px minmax(0, 1fr) 32px;
  align-items: flex-start;
}
.wk-entry-card.is-draft .wk-entry-body { display: contents; }
.wk-entry-card.is-draft .wk-entry-top { grid-column: 2; align-self: center; }
.wk-entry-card.is-draft .wk-entry-actions { grid-column: 3; grid-row: 1; }
.wk-entry-card.is-draft .wk-worksheet,
.wk-entry-card.is-draft .wk-entry-meta { grid-column: 1 / -1; }
.wk-entry-card.is-draft .wk-entry-icon { margin-top: 2px; }
.wk-entry-card.is-incomplete { border-color: color-mix(in srgb, var(--danger) 45%, var(--border)); }
.wk-worksheet { margin-top: 6px; display: flex; flex-direction: column; gap: 6px; }
.wk-set-block {
  padding: 6px; border-radius: 9px;
  background: color-mix(in srgb, var(--bg) 52%, transparent);
}
.wk-set-block.is-complete {
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
}
.wk-worksheet-row {
  display: grid; grid-template-columns: 44px 20px minmax(48px, 1fr) 12px minmax(48px, 1fr) 22px;
  align-items: center; gap: 6px;
}
.wk-set-check {
  width: 44px; height: 44px; padding: 0; border-radius: 8px;
  border: 1px solid var(--border); background: var(--surface); color: var(--accent);
  font-family: var(--font); font-size: 16px; font-weight: 900; cursor: pointer;
}
.wk-set-check[aria-pressed="true"] { border-color: var(--accent); background: var(--accent); color: var(--accent-fg); }
.wk-set-previous {
  display: flex; justify-content: space-between; gap: 8px;
  margin: 4px 28px 0 62px; color: var(--muted);
  font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums;
}
.wk-use-last {
  min-height: 44px; margin-left: 7px; padding: 4px 8px;
  border: 0; border-radius: 7px;
  background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent);
  font-family: var(--font); font-size: 11px; font-weight: 800; cursor: pointer;
}
.wk-worksheet-row.is-incomplete .wk-input {
  border-color: color-mix(in srgb, var(--danger) 55%, var(--border));
}
.wk-worksheet-x { text-align: center; color: var(--muted); font-size: 13px; font-weight: 700; }
.wk-worksheet-unit { font-size: 12px; color: var(--muted); font-weight: 600; }
.wk-worksheet-field { display: grid; grid-template-columns: 78px 1fr; gap: 8px; align-items: center; }
.wk-worksheet-label { font-size: 12px; color: var(--muted); font-weight: 600; }
.wk-entry-card.is-incomplete .wk-entry-meta.wk-current-session-missing {
  padding: 0; color: var(--danger); font-weight: 600;
}

/* Activity library picker — manual logging is search-first over a broad list,
   while the storage category stays an internal analytics detail. */
.wk-activity-picker {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: color-mix(in srgb, var(--bg) 44%, var(--surface));
}
.wk-activity-head {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  margin-bottom: 6px;
}
.wk-activity-selected {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 28px; padding: 4px 8px; border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--muted);
  font-size: 12px; font-weight: 700;
  white-space: nowrap;
}
.wk-activity-search { font-size: 15px; }
.wk-activity-group-row {
  display: flex; gap: 6px; overflow-x: auto;
  margin: 10px -2px 8px; padding: 0 2px 2px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.wk-activity-group-row::-webkit-scrollbar { display: none; }
.wk-activity-group {
  flex: 0 0 auto;
  min-height: 34px; padding: 7px 10px; border-radius: 999px;
  border: 1px solid transparent;
  background: transparent; color: var(--muted);
  font-family: var(--font); font-size: 12px; font-weight: 800;
  display: inline-flex; align-items: center; gap: 6px;
  cursor: pointer; touch-action: manipulation; user-select: none;
}
.wk-activity-group.is-active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
  color: var(--text);
}
.wk-activity-group-count {
  min-width: 18px;
  padding: 1px 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--border) 62%, transparent);
  color: var(--muted);
  font-size: 10px;
  line-height: 1.5;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.wk-activity-group.is-active .wk-activity-group-count {
  background: color-mix(in srgb, var(--accent) 22%, var(--surface));
  color: var(--text);
}
.wk-activity-result-count {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  user-select: none;
}
.wk-activity-results {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 6px;
  max-height: 284px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 2px;
}
.wk-activity-more {
  width: 100%; min-height: 44px; margin-top: 8px; padding: 8px 12px;
  border: 1px solid var(--border); border-radius: 9px;
  background: var(--surface2, var(--surface)); color: var(--accent);
  font: 700 12px/1.2 var(--font); cursor: pointer;
}
.wk-more-options {
  color: var(--text); font-size: 12px;
}
.wk-more-options summary {
  min-height: 44px; display: flex; align-items: center;
  color: var(--accent); font-weight: 750; cursor: pointer; user-select: none;
}
.wk-activity-option {
  min-width: 0;
  min-height: 48px;
  display: flex; align-items: center; gap: 9px;
  padding: 8px 9px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  text-align: left;
  font-family: var(--font);
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
}
.wk-activity-option.is-active {
  border-color: color-mix(in srgb, var(--accent) 52%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.wk-activity-option.is-custom {
  border-style: dashed;
}
.wk-activity-option-icon {
  width: 30px; height: 30px; flex: 0 0 30px; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--bg) 70%, transparent);
}
.wk-activity-option-text { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.wk-activity-option-name {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 13px; font-weight: 800;
}
.wk-activity-option-meta { font-size: 11px; font-weight: 700; color: var(--muted); }
@media (prefers-reduced-motion: no-preference) {
  .wk-activity-option:active,
  .wk-activity-group:active { opacity: 0.78; transform: scale(0.98); }
}

/* Chart / insight cards — app-specific. */
.wk-chart-card {
  background: color-mix(in srgb, var(--surface) 94%, #000); border: 1px solid var(--border);
  border-radius: 8px; padding: 14px; margin-bottom: 14px;
}
.wk-chart-card.is-nested { margin-top: 14px; }
.wk-chart-card.is-last { margin-top: 14px; margin-bottom: 0; }
.wk-chart-title { margin: 0 0 2px; font-size: 14px; font-weight: 700; user-select: none; }
.wk-chart-sub { margin: 0 0 10px; font-size: 12px; color: var(--muted); user-select: none; }
.wk-streak-value { font-size: 34px; font-weight: 800; color: var(--accent); }
.wk-streak-unit { font-size: 15px; font-weight: 600; color: var(--muted); }

.wk-pr-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 4px; }
.wk-pr-th {
  padding: 8px 6px; text-align: left; font-weight: 600; color: var(--muted);
  border-bottom: 1px solid var(--border);
  font-size: 12px; letter-spacing: 0;
  user-select: none;
}
.wk-pr-th.is-right { text-align: right; }
.wk-pr-td { padding: 10px 6px; border-bottom: 1px solid var(--border); }
.wk-pr-td.is-right { text-align: right; font-variant-numeric: tabular-nums; }
.wk-pr-td.is-strong { font-weight: 700; }

.wk-heatmap { display: block; width: 100%; height: auto; margin-top: 8px; }
.wk-sparkline { display: block; width: 100%; height: auto; }

/* mobius-ui:Empty v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-empty {
  padding: 48px 16px; text-align: center; color: var(--muted);
  font-size: 13px; line-height: 1.6;
}
.wk-empty.is-inline { padding: 18px 8px; }
.wk-empty-icon {
  width: 58px; height: 58px; margin: 0 auto 14px; border-radius: 18px;
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 34%, var(--border));
}
/* /mobius-ui:Empty */

.wk-loading { padding: 40px 16px; text-align: center; color: var(--muted); font-size: 13px; }

/* mobius-ui:Sheet v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-modal-scrim {
  position: absolute; inset: 0; z-index: 100;
  display: flex; align-items: center; justify-content: center;
  padding: 20px; background: rgba(0, 0, 0, 0.5);
}
.wk-modal {
  width: 100%; max-width: 320px; padding: 20px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.28);
  overscroll-behavior: contain;
}
.wk-modal-title { margin: 0 0 6px; font-size: 16px; font-weight: 700; user-select: none; }
.wk-modal-body { margin: 0 0 16px; font-size: 13px; line-height: 1.5; color: var(--muted); }
.wk-modal-btns { display: flex; gap: 8px; justify-content: flex-end; }
/* /mobius-ui:Sheet */

/* mobius-ui:SyncPill v1 — keep in sync; library candidate. */
.wk-pill {
  padding: 4px 10px; border-radius: 999px;
  font-size: 12px; font-weight: 600; letter-spacing: 0; white-space: nowrap;
  background: transparent; border: 1px solid var(--border); color: var(--muted);
  font-family: var(--font); user-select: none;
}
button.wk-pill { cursor: pointer; }
.wk-pill.is-pending { background: var(--surface2, var(--surface)); }
.wk-pill.is-offline {
  background: var(--surface2, var(--surface));
  border-color: var(--accent); color: var(--accent);
}
.wk-pill.is-error {
  background: color-mix(in srgb, var(--danger) 10%, var(--surface));
  border-color: var(--danger); color: var(--danger);
}
/* /mobius-ui:SyncPill */

/* Category-volume bars — app-specific (per-category accent inline). */
.wk-bar-list { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.wk-bar-row { display: grid; grid-template-columns: 88px 1fr 48px; gap: 10px; align-items: center; }
.wk-bar-label { font-size: 12px; color: var(--muted); font-weight: 700; overflow: hidden; text-overflow: ellipsis; }
.wk-bar-label.is-right { text-align: right; font-variant-numeric: tabular-nums; }
.wk-bar-track {
  height: 10px; border-radius: 999px; overflow: hidden;
  background: color-mix(in srgb, var(--border) 72%, transparent);
}
.wk-bar-fill { height: 100%; border-radius: 999px; }

/* Category stat tiles — app-specific. */
.wk-stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(138px, 1fr)); gap: 10px; }
.wk-stat-tile {
  padding: 12px; border: 1px solid var(--border); border-radius: 12px;
  background: color-mix(in srgb, var(--bg) 55%, transparent);
}
.wk-stat-head { display: flex; align-items: center; gap: 8px; }
.wk-stat-value { margin: 7px 0 2px; font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; }
.wk-stat-label { font-size: 12px; color: var(--muted); font-weight: 700; user-select: none; }

/* A tappable exercise name (opens the per-exercise detail sheet). Renders as
   plain text but is a real <button> for keyboard + screen-reader access. */
.wk-ex-link {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 0; margin: 0; border: none; background: none;
  font: inherit; color: var(--text); font-weight: 700; cursor: pointer; text-align: left;
  touch-action: manipulation; user-select: none;
}
@media (prefers-reduced-motion: no-preference) {
  .wk-ex-link:active { opacity: 0.75; }
}
.wk-ex-chevron { margin-left: 2px; color: var(--muted); font-weight: 700; }

/* Per-exercise detail sheet (Hevy-style drill-down) — Sheet variant: centered,
   all-corner radius, full-height column with its own scroll body. */
/* mobius-ui:Sheet v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-sheet-scrim {
  position: absolute; inset: 0; z-index: 120;
  display: flex; align-items: center; justify-content: center;
  padding: 16px; background: rgba(0, 0, 0, 0.55);
}
.wk-sheet {
  width: 100%; max-width: 480px; max-height: 88%;
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.32);
}
.wk-sheet-head {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 14px 14px 12px; border-bottom: 1px solid var(--border);
}
.wk-sheet-title { margin: 0; font-size: 16px; font-weight: 800; letter-spacing: 0; user-select: none; }
.wk-sheet-sub { margin: 2px 0 0; font-size: 12px; color: var(--muted); user-select: none; }
.wk-sheet-body { padding: 14px; overflow-y: auto; overscroll-behavior: contain; }
/* /mobius-ui:Sheet */

.wk-sheet-head-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }

.wk-rec-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 8px; }
.wk-rec-tile {
  padding: 10px; border: 1px solid var(--border); border-radius: 8px;
  background: color-mix(in srgb, var(--bg) 55%, transparent);
}
.wk-rec-label { font-size: 12px; color: var(--muted); font-weight: 700; letter-spacing: 0; user-select: none; }
.wk-rec-value { margin: 3px 0 0; font-size: 17px; font-weight: 800; font-variant-numeric: tabular-nums; }

.wk-trend-meta {
  display: flex; justify-content: space-between; gap: 10px; margin-top: 4px;
  font-size: 12px; color: var(--muted); font-weight: 600; font-variant-numeric: tabular-nums;
  user-select: none;
}
.wk-hist-list { display: flex; flex-direction: column; }
.wk-hist-row {
  display: flex; justify-content: space-between; gap: 10px;
  padding: 9px 0; border-bottom: 1px solid var(--border); font-size: 13px;
}
.wk-hist-row.is-last { border-bottom: none; }
.wk-hist-date { color: var(--muted); font-weight: 600; white-space: nowrap; }
.wk-hist-summary { text-align: right; font-variant-numeric: tabular-nums; }

/* Confirm-card layout helpers — app-specific spacers + grids. */
.wk-spacer-10 { height: 10px; }
.wk-spacer-12 { height: 12px; }
.wk-spacer-14 { height: 14px; }
.wk-spacer-16 { height: 16px; }
.wk-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.wk-grid-metric { display: grid; grid-template-columns: 1fr 80px; gap: 8px; align-items: end; }
.wk-btn-row-finish { justify-content: space-between; align-items: center; margin-top: 4px; }
.wk-min44 { min-width: 44px; }

/* Session tab layout — one column on phones, current workout + library rail on web. */
.wk-session-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.wk-session-layout.is-empty {
  max-width: 720px;
  margin-left: auto;
  margin-right: auto;
}
.wk-session-main,
.wk-session-side { min-width: 0; }
.wk-session-recap {
  margin-bottom: 14px; padding: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 34%, var(--border));
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent) 9%, var(--surface));
  color: var(--text);
}
.wk-session-recap-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.wk-session-recap-head > div { display: flex; flex-direction: column; gap: 2px; }
.wk-session-recap-head strong { font-size: 14px; }
.wk-session-recap-head span { color: var(--muted); font-size: 12px; }
.wk-session-recap-list { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.wk-recap-row { display: flex; align-items: center; gap: 9px; padding: 7px 0; }
.wk-recap-row + .wk-recap-row { border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent); }
.wk-recap-icon {
  width: 32px; height: 32px; flex: 0 0 32px; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center;
}
.wk-recap-copy { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.wk-recap-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.wk-recap-copy small { color: var(--muted); font-size: 12px; line-height: 1.35; }
.wk-recap-row.is-pr .wk-recap-copy small,
.wk-recap-row.is-up .wk-recap-copy small { color: var(--text); }

.wk-coach-cta {
  width: 100%; min-height: 52px; margin-top: 10px; padding: 8px 10px;
  display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; gap: 9px;
  border: 0; border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 12%, var(--surface)); color: var(--text);
  text-align: left; font-family: var(--font); cursor: pointer;
}
.wk-coach-cta-icon {
  width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center;
  border-radius: 8px; background: var(--surface); color: var(--accent);
}
.wk-coach-cta > span:nth-child(2) { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.wk-coach-cta strong { font-size: 13px; }
.wk-coach-cta small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 11px; }

/* Quick-add strip — recent exercise chips on the Log tab so a repeat set is one tap. */
.wk-quick-add {
  margin-bottom: 14px;
  padding: 14px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
}
.wk-quick-add.is-empty { text-align: center; }
.wk-quick-add-label {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  margin-bottom: 10px; font-size: 13px; font-weight: 800; color: var(--text);
  user-select: none;
}
.wk-quick-add.is-empty .wk-quick-add-label { justify-content: center; }
.wk-quick-chip {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 44px; padding: 7px 11px; border-radius: 10px;
  border: 1px solid var(--border); background: color-mix(in srgb, var(--bg) 55%, transparent);
  color: var(--text); font-family: var(--font); font-size: 13px; font-weight: 600;
  cursor: pointer; touch-action: manipulation; user-select: none;
  white-space: nowrap; max-width: 100%;
}
@media (prefers-reduced-motion: no-preference) {
  .wk-quick-chip:active { opacity: 0.75; transform: scale(0.96); }
}
.wk-quick-chip-row {
  display: flex; gap: 6px; flex-wrap: wrap;
}
.wk-quick-add-btn {
  min-height: 44px; padding: 7px 13px; border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
  background: color-mix(in srgb, var(--accent) 9%, transparent);
  color: var(--accent); font-family: var(--font); font-size: 13px; font-weight: 700;
  cursor: pointer; touch-action: manipulation; user-select: none;
  white-space: nowrap;
}
@media (prefers-reduced-motion: no-preference) {
  .wk-quick-add-btn:active { opacity: 0.75; }
}

@media (min-width: 840px) {
  .wk-scroll { padding: 18px 22px 22px; }
  .wk-session-layout:not(.is-empty) {
    grid-template-columns: minmax(0, 1fr) minmax(260px, 320px);
    gap: 18px;
  }
  .wk-session-side {
    position: sticky;
    top: 0;
  }
  .wk-session-side .wk-quick-chip-row {
    flex-direction: column;
  }
  .wk-session-side .wk-quick-chip,
  .wk-session-side .wk-quick-add-btn {
    width: 100%;
    justify-content: flex-start;
  }
  .wk-session-side .wk-quick-add-label .wk-quick-add-btn {
    width: auto; margin-left: auto; justify-content: center;
  }
  .wk-confirm-card { padding: 18px; }
}

@media (max-width: 420px) {
  .wk-current-session-head { align-items: flex-start; }
  .wk-current-session-actions { flex-direction: column-reverse; align-items: flex-end; gap: 2px; }
  .wk-entry-card.is-draft { padding: 9px; }
  .wk-entry-card.is-draft .wk-entry-time { font-size: 0; }
  .wk-entry-card.is-draft .wk-use-last { margin-left: 4px; font-size: 11px; }
  .wk-entry-card.is-draft .wk-entry-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .wk-worksheet-row { grid-template-columns: 44px 18px minmax(42px, 1fr) 10px minmax(42px, 1fr) 20px; gap: 4px; }
  .wk-worksheet-row .wk-input { min-height: 44px; padding: 8px 5px; text-align: center; }
  .wk-set-previous { margin-left: 66px; margin-right: 24px; }
  .wk-activity-results { max-height: none; overflow: visible; overscroll-behavior: auto; }
}

@media (max-width: 839px) {
  .wk-current-session-head {
    position: sticky; top: 0; z-index: 2;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
}

/* mobius-ui:ReducedMotion v1 -- honor the OS reduce-motion setting */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
/* /mobius-ui:ReducedMotion */
`
