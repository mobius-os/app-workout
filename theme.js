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
  -webkit-tap-highlight-color: transparent;
}
.wk-scroll {
  flex: 1; min-height: 0;
  overflow-y: auto; overflow-x: hidden;
  padding: 14px 16px 16px;
  word-break: break-word; overflow-wrap: anywhere;
  overscroll-behavior: contain;
}
/* /mobius-ui:Root */

/* mobius-ui:Focus v1 -- shared keyboard focus ring (WCAG 2.4.7); never bare outline:none */
:where(button,a,input,textarea,select,summary,[role="button"],[tabindex]:not([tabindex="-1"])):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
/* /mobius-ui:Focus */

/* Web cap so the column doesn't sprawl on desktop while staying mobile-first. */
.wk-inner { width: 100%; max-width: 720px; margin-left: auto; margin-right: auto; }

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
  background: var(--accent, currentColor); color: var(--bg, #0c0c0c);
  font-weight: 700; line-height: 1;
}
.wk-subtitle { margin: 0; font-size: 12px; color: var(--muted); user-select: none; }
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

/* Resizable embedded-chat panel — app-specific drag chrome above the ChatEmbed. */
.wk-chat-panel {
  flex: 0 0 auto;
  /* Hard pixel floor = the composer pill; lets the panel collapse to just the
     input + Send while the analytics above take the rest of the screen. */
  min-height: 64px;
  max-height: calc(100% - 110px);
  display: flex; flex-direction: column;
  background: var(--bg);
  padding-bottom: env(safe-area-inset-bottom);
}
.wk-chat-resizer {
  flex: 0 0 9px;
  display: flex; align-items: center; justify-content: center;
  cursor: ns-resize;
  background: var(--surface);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  touch-action: none;
}
.wk-chat-resizer-bar {
  width: 44px; height: 3px; border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 65%, transparent);
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
  border-radius: 8px; padding: 16px; margin-bottom: 14px;
}
.wk-card.is-ambiguous { border-color: var(--accent); }
.wk-card-title { margin: 0 0 4px; font-size: 16px; font-weight: 700; }
.wk-card-sub { margin: 0 0 12px; font-size: 12px; color: var(--muted); }
/* /mobius-ui:Card */

/* mobius-ui:Button v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-btn-primary {
  width: 100%; min-height: 48px; padding: 14px 16px; border-radius: 12px;
  border: none; background: var(--accent); color: #fff;
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
.wk-btn-secondary.is-danger { background: var(--danger); color: #fff; border-color: var(--danger); }
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
  padding: 9px 10px; margin-bottom: 6px;
  background: color-mix(in srgb, var(--surface) 94%, #000);
  border: 1px solid var(--border); border-radius: 8px;
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
  width: 32px; height: 32px; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center; line-height: 1;
  border: none; background: transparent; color: var(--muted);
  font-family: var(--font); font-size: 14px; font-weight: 800; cursor: pointer;
  touch-action: manipulation; user-select: none;
}
.wk-icon-btn:disabled { pointer-events: none; opacity: 0.5; }
@media (prefers-reduced-motion: no-preference) {
  .wk-icon-btn:not(:disabled):active { opacity: 0.7; transform: scale(0.9); }
}
.wk-icon-btn.is-accent { color: var(--accent); }

/* Current-session draft panel — app-specific. The is-live treatment (accent
   wash + pulsing dot + ticking elapsed time) makes the in-progress workout
   read as the one live thing on the screen. */
.wk-current-session {
  margin-bottom: 14px; overflow: hidden;
  border: 1px solid var(--border); border-radius: 10px; background: var(--surface);
}
.wk-current-session.is-live {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 9%, var(--surface)), var(--surface) 60%);
  box-shadow: 0 6px 20px color-mix(in srgb, var(--accent) 12%, transparent);
}
.wk-current-session-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px; border-bottom: 1px solid var(--border);
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
.wk-current-session-list { padding: 8px 10px 2px; }
.wk-current-session-empty { padding: 16px 12px; color: var(--muted); font-size: 13px; }
.wk-current-session-missing { margin: 0; padding: 0 12px 12px; color: var(--muted); font-size: 12px; line-height: 1.45; }
.wk-finish-btn {
  min-height: 38px; padding: 10px 12px; border-radius: 8px;
  border: none; background: var(--accent); color: #fff;
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
  border: 1px solid var(--border); border-radius: 10px;
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
.wk-entry-card.is-draft { align-items: flex-start; }
.wk-entry-card.is-draft .wk-entry-icon { margin-top: 2px; }
.wk-entry-card.is-incomplete { border-color: color-mix(in srgb, var(--danger) 45%, var(--border)); }
.wk-worksheet { margin-top: 6px; display: flex; flex-direction: column; gap: 6px; }
.wk-worksheet-row {
  display: grid; grid-template-columns: 20px 1fr 14px 1fr 22px;
  align-items: center; gap: 6px;
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

/* Category chips for the confirm card — app-specific (per-category accent inline). */
.wk-chip-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.wk-chip {
  display: flex; align-items: center; gap: 6px;
  min-height: 44px; padding: 8px 12px; border-radius: 999px;
  border: 1px solid var(--border); background: transparent; color: var(--muted);
  font-family: var(--font); font-size: 13px; font-weight: 600; cursor: pointer;
  touch-action: manipulation; user-select: none;
}
@media (prefers-reduced-motion: no-preference) {
  .wk-chip:active { opacity: 0.8; transform: scale(0.96); }
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
  font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;
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
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  overscroll-behavior: contain;
}
.wk-modal-title { margin: 0 0 6px; font-size: 16px; font-weight: 700; user-select: none; }
.wk-modal-body { margin: 0 0 16px; font-size: 13px; line-height: 1.5; color: var(--muted); }
.wk-modal-btns { display: flex; gap: 8px; justify-content: flex-end; }
/* /mobius-ui:Sheet */

/* mobius-ui:SyncPill v1 — keep in sync; library candidate. */
.wk-pill {
  padding: 4px 10px; border-radius: 999px;
  font-size: 12px; font-weight: 600; letter-spacing: 0.2px; white-space: nowrap;
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
  padding: 12px; border: 1px solid var(--border); border-radius: 8px;
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
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.4);
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
.wk-rec-label { font-size: 12px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; user-select: none; }
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

/* Quick-add strip — recent exercise chips on the Log tab so a repeat set is one tap. */
.wk-quick-add {
  margin-bottom: 14px;
  padding: 12px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
}
.wk-quick-add-label {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  margin-bottom: 8px; font-size: 12px; font-weight: 700; color: var(--muted);
  user-select: none;
}
.wk-quick-chip {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 38px; padding: 6px 12px; border-radius: 999px;
  border: 1px solid var(--border); background: color-mix(in srgb, var(--bg) 65%, transparent);
  color: var(--text); font-family: var(--font); font-size: 13px; font-weight: 600;
  cursor: pointer; touch-action: manipulation; user-select: none;
  white-space: nowrap;
}
@media (prefers-reduced-motion: no-preference) {
  .wk-quick-chip:active { opacity: 0.75; transform: scale(0.96); }
}
.wk-quick-chip-row {
  display: flex; gap: 6px; flex-wrap: wrap;
}
.wk-quick-add-btn {
  min-height: 38px; padding: 6px 14px; border-radius: 999px;
  border: 1px dashed var(--border); background: transparent;
  color: var(--accent); font-family: var(--font); font-size: 13px; font-weight: 700;
  cursor: pointer; touch-action: manipulation; user-select: none;
  white-space: nowrap;
}
@media (prefers-reduced-motion: no-preference) {
  .wk-quick-add-btn:active { opacity: 0.75; }
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
