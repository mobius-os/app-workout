export const CSS = `
/* THESIS: Workout is a Möbius-native training ledger, not a fitness dashboard. OWN-WORLD: theme-token surfaces, one compact logo-and-tabs rail, quiet rows, accent actions, and dense set tables. STORY: choose a routine, log beside previous values, inspect movement guidance only when needed, finish, and let other apps read the record. FIRST VIEWPORT: a single branded navigation rail above quick start and routine rows. FORM: native utility app; seed workout-native-ledger. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md */

/* mobius-ui:Focus v1 -- shared keyboard focus ring (WCAG 2.4.7); never bare outline:none */
:where(button,a,input,textarea,select,summary,[role="button"],[tabindex]:not([tabindex="-1"])):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
/* /mobius-ui:Focus */

/* mobius-ui:Root v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-root { position:relative; display:flex; flex-direction:column; height:100%; width:100%; max-width:100%; overflow:hidden; background:var(--bg); color:var(--text); font-family:var(--font); -webkit-font-smoothing:antialiased; -webkit-tap-highlight-color:transparent; }
.wk-page { flex:1; min-height:0; width:100%; display:flex; flex-direction:column; }
.wk-scroll { flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; padding:20px 16px max(36px, env(safe-area-inset-bottom)); word-break:break-word; overflow-wrap:anywhere; }
/* /mobius-ui:Root */

/* mobius-ui:Header v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-header { flex:0 0 auto; width:100%; min-height:48px; padding:0; background:var(--bg); }
.wk-header-inner { box-sizing:border-box; width:100%; max-width:760px; margin-inline:auto; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:max(12px, env(safe-area-inset-top)) 16px 12px; border-bottom:1px solid var(--border); }
.wk-app-icon { flex:0 0 auto; width:34px; height:34px; display:grid; place-items:center; }
.wk-app-icon img { display:block; width:100%; height:100%; object-fit:contain; }
.wk-app-icon-fallback { display:none; width:34px; height:34px; place-items:center; border:1px solid color-mix(in srgb,var(--accent) 28%,var(--border)); border-radius:10px; background:color-mix(in srgb,var(--accent) 14%,transparent); color:var(--accent); font-size:14px; font-weight:750; }
.wk-brand-text { min-width:0; line-height:1.15; }
.wk-title { margin:0; font-size:18px; font-weight:700; letter-spacing:-0.015em; }
.wk-subtitle { display:block; margin-top:2px; font-size:12px; font-weight:500; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-variant-numeric:tabular-nums; }
.wk-header-right { display:flex; align-items:center; gap:8px; flex:0 0 auto; }
.wk-editor-header-inner { display:grid; grid-template-columns:1fr minmax(0,auto) 1fr; }
.wk-editor-cancel { justify-self:start; margin-left:-10px; }
.wk-editor-save { justify-self:end; }
.wk-editor-header-copy { min-width:0; text-align:center; }
/* /mobius-ui:Header */

/* mobius-ui:Segmented v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-seg { flex:0 0 auto; display:flex; gap:2px; height:44px; margin:10px 16px 0; background:var(--surface-2, var(--surface)); border:0; border-radius:10px; box-shadow:inset 0 0 0 1px var(--border); }
.wk-seg-btn { box-sizing:border-box; flex:1; min-height:44px; padding:6px 14px; border:0; border-radius:7px; background:transparent; color:var(--muted); font-family:var(--font); font-size:13px; font-weight:650; cursor:pointer; transition:background .15s, color .15s; }
.wk-seg-btn:hover { color:var(--text); }
.wk-seg-btn.is-active { background:var(--bg); color:var(--text); box-shadow:0 1px 3px rgba(0,0,0,.18); }
/* /mobius-ui:Segmented */

/* Workout divergence: a flat tab rail keeps dark mode from stacking grey pills inside grey surfaces. */
.wk-seg { gap:18px; height:48px; margin:0 16px; background:transparent; border-bottom:1px solid var(--border); border-radius:0; box-shadow:none; }
.wk-seg-btn { position:relative; min-height:48px; padding:8px 4px; border-radius:0; }
.wk-seg-btn.is-active { background:transparent; color:var(--text); box-shadow:inset 0 -2px 0 var(--accent); }

/* One shared navigation rail keeps the brand and primary destinations in a single hierarchy. */
.wk-top-rail { flex:0 0 auto; width:100%; background:var(--bg); }
.wk-top-rail-inner { box-sizing:border-box; display:flex; align-items:center; gap:12px; width:100%; max-width:760px; min-height:58px; margin-inline:auto; padding:0 16px; border-bottom:1px solid var(--border); }
.wk-top-rail .wk-app-icon { width:34px; height:34px; }
.wk-top-rail .wk-seg { flex:1 1 auto; min-width:0; height:58px; margin:0; border-bottom:0; }
.wk-top-rail .wk-seg-btn { min-width:0; min-height:58px; padding-inline:4px; }
.wk-active-rail-copy { flex:1 1 auto; min-width:0; line-height:1.15; }
.wk-active-rail-copy h1 { overflow:hidden; margin:0; font-size:16px; font-weight:700; letter-spacing:-.015em; text-overflow:ellipsis; white-space:nowrap; }
.wk-active-rail-copy span { display:block; overflow:hidden; margin-top:3px; color:var(--muted); font-size:11px; font-variant-numeric:tabular-nums; text-overflow:ellipsis; white-space:nowrap; }

/* mobius-ui:Button v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; min-height:44px; padding:10px 16px; border-radius:10px; border:1px solid var(--border); background:var(--surface); color:var(--text); font-family:var(--font); font-size:14px; font-weight:600; cursor:pointer; white-space:nowrap; transition:background .14s ease, border-color .14s ease, transform .1s ease; }
.wk-btn:active { transform:scale(.97); }
.wk-btn:disabled { opacity:.5; cursor:default; transform:none; }
.wk-btn-primary { background:var(--accent); border-color:var(--accent); color:var(--accent-fg); }
.wk-btn-primary:hover { filter:brightness(1.06); }
.wk-btn-secondary { background:var(--surface-2, var(--surface)); }
.wk-btn-secondary:hover { border-color:color-mix(in srgb,var(--accent) 40%,var(--border)); }
.wk-btn-danger { background:var(--danger); border-color:var(--danger); color:var(--accent-fg); }
.wk-btn-icon { width:44px; padding:0; border-radius:8px; }
.wk-btn-block { width:100%; }
/* /mobius-ui:Button */

/* mobius-ui:Input v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-input { display:block; width:100%; box-sizing:border-box; min-height:44px; padding:11px 12px; background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:8px; font-family:var(--font); font-size:16px; line-height:1.5; transition:border-color .15s ease, box-shadow .15s ease; }
.wk-input::placeholder { color:var(--muted); }
.wk-input:focus { border-color:var(--accent); box-shadow:0 0 0 1px var(--accent); }
/* /mobius-ui:Input */

/* mobius-ui:Empty v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-empty { display:flex; flex-direction:column; align-items:center; text-align:center; gap:8px; max-width:440px; margin:0 auto; padding:48px 24px; color:var(--muted); }
.wk-empty-title { font-size:17px; font-weight:700; color:var(--text); letter-spacing:-.01em; }
.wk-empty-text { margin:0; font-size:14px; line-height:1.6; }
/* /mobius-ui:Empty */

/* mobius-ui:Sheet v1 — keep in sync; library candidate. Diverge below the marker only. */
.wk-scrim { position:absolute; inset:0; z-index:100; display:flex; align-items:flex-end; justify-content:center; padding:16px; background:rgba(0,0,0,.5); }
.wk-sheet { width:100%; max-width:480px; max-height:85vh; overflow-y:auto; padding:24px 24px max(24px, env(safe-area-inset-bottom)); background:var(--surface); border:1px solid var(--border); border-radius:16px 16px 0 0; box-shadow:0 -8px 32px rgba(0,0,0,.3); }
.wk-sheet-title { margin:0 0 12px; font-size:16px; font-weight:700; letter-spacing:-.01em; }
.wk-sheet-body { margin:0 0 16px; font-size:14px; line-height:1.5; color:var(--muted); }
.wk-sheet-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:24px; }
.wk-sheet-actions .wk-btn { flex:1; }
/* /mobius-ui:Sheet */

.wk-loading { display:grid; min-height:100%; place-items:center; color:var(--muted); font-size:14px; }
.wk-section { margin:0 0 30px; }
.wk-section-title { margin:0 0 12px; font-size:15px; font-weight:700; letter-spacing:-.01em; }
.wk-section-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:4px; }
.wk-section-heading .wk-section-title { margin:0; }
.wk-section-heading > span,.wk-section-heading-copy > span,.wk-library-summary { color:var(--muted); font-size:12px; font-variant-numeric:tabular-nums; }
.wk-quick-start { margin-bottom:34px; }
.wk-new-workout { min-height:50px; }
.wk-routines-heading { margin-bottom:8px; }
.wk-section-heading-copy { display:flex; align-items:baseline; gap:8px; min-width:0; }
.wk-new-routine { min-height:38px; padding:7px 11px; }
.wk-routine-list { border-top:1px solid var(--border); }
.wk-routine { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px 16px; align-items:center; padding:16px 0; border-bottom:1px solid var(--border); }
.wk-routine-main { min-width:0; }
.wk-routine-actions { display:flex; align-items:center; gap:6px; }
.wk-routine-edit { color:var(--text); }
.wk-routine-start { min-width:84px; }
.wk-routine h3,.wk-history-row h3 { margin:0 0 4px; font-size:15px; font-weight:700; letter-spacing:-.01em; }
.wk-routine p,.wk-history-row p { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; margin:0; color:var(--muted); font-size:12px; line-height:1.5; }

.wk-active-exercise { margin:0 0 28px; }
.wk-rest-timer { position:sticky; top:0; z-index:20; display:flex; align-items:center; justify-content:space-between; gap:14px; margin:0 0 18px; padding:10px 10px 10px 14px; border:1px solid color-mix(in srgb,var(--accent) 34%,var(--border)); border-radius:12px; background:color-mix(in srgb,var(--accent) 14%,var(--surface)); box-shadow:0 5px 16px rgba(0,0,0,.18); }
.wk-rest-timer > div { min-width:0; }
.wk-rest-timer span,.wk-rest-timer strong { display:block; }
.wk-rest-timer span { overflow:hidden; color:var(--muted); font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
.wk-rest-timer strong { margin-top:2px; font-size:20px; font-variant-numeric:tabular-nums; letter-spacing:-.02em; }
.wk-rest-timer.is-complete { border-color:color-mix(in srgb,var(--green) 45%,var(--border)); background:color-mix(in srgb,var(--green) 14%,var(--surface)); }
.wk-exercise-heading { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
.wk-exercise-heading > button { display:flex; flex-direction:column; align-items:flex-start; min-width:0; padding:4px; border:0; background:transparent; color:var(--text); text-align:left; cursor:pointer; }
.wk-exercise-heading .wk-exercise-name { flex:1; }
.wk-exercise-heading .wk-exercise-menu { flex:0 0 44px; width:44px; height:44px; align-items:center; justify-content:center; padding:0; border-radius:8px; color:var(--muted); }
.wk-exercise-heading .wk-exercise-menu:hover { background:var(--surface-2, var(--surface)); color:var(--text); }
.wk-exercise-heading strong { color:var(--accent); font-size:14px; }
.wk-exercise-heading span { margin-top:2px; color:var(--muted); font-size:11px; }
.wk-set-head,.wk-set-row { display:grid; grid-template-columns:34px repeat(3,minmax(0,1fr)) 44px; gap:6px; align-items:center; }
.wk-set-head { padding:0 6px 5px; color:var(--muted); font-size:10px; font-weight:600; text-transform:uppercase; text-align:center; letter-spacing:.035em; }
.wk-set-head span:nth-child(2) { text-align:center; }
.wk-set-row { min-height:52px; padding:6px; border-radius:9px; transition:background .15s ease; }
.wk-set-row.is-complete { background:color-mix(in srgb,var(--green) 14%,var(--surface)); }
.wk-set-number { display:grid; place-items:center; width:28px; height:28px; border-radius:50%; background:var(--surface-2, var(--surface)); font-size:12px; font-weight:700; }
.wk-previous { display:block; width:100%; min-height:44px; padding:4px; border:0; border-radius:8px; background:transparent; color:var(--muted); font-family:var(--font); font-size:12px; font-variant-numeric:tabular-nums; text-align:center; cursor:pointer; transition:background .14s ease,color .14s ease; }
.wk-previous:not(:disabled):hover { background:color-mix(in srgb,var(--accent) 10%,transparent); color:var(--accent); }
.wk-previous:disabled { cursor:default; opacity:.72; }
.wk-set-input { min-height:40px; height:40px; padding:6px 4px; text-align:center; font-weight:700; font-variant-numeric:tabular-nums; }
.wk-check { position:relative; display:grid; place-items:center; width:44px; height:44px; border:1px solid var(--border); border-radius:9px; background:var(--surface-2, var(--surface)); color:var(--muted); cursor:pointer; }
.wk-check:disabled { opacity:.42; cursor:not-allowed; }
.wk-check.is-complete { background:var(--green); border-color:var(--green); color:var(--accent-fg); }
.wk-check.is-record::after { content:'PR'; position:absolute; top:-7px; right:-5px; display:grid; place-items:center; min-width:20px; height:14px; padding-inline:3px; border:2px solid var(--bg); border-radius:999px; background:var(--accent); color:var(--accent-fg); font-size:8px; font-weight:800; line-height:1; letter-spacing:.04em; }
.wk-add-set { display:flex; align-items:center; justify-content:center; gap:5px; width:calc(100% - 12px); min-height:44px; margin:5px 6px 0; border:0; border-radius:8px; background:var(--surface-2, var(--surface)); color:var(--text); font-size:13px; font-weight:600; cursor:pointer; }
.wk-setup-note { display:block; margin:0 0 22px; }
.wk-setup-note > span { display:block; margin-bottom:6px; color:var(--muted); font-size:12px; font-weight:600; }
.wk-setup-note.is-compact { margin:-1px 0 9px; }
.wk-setup-note.is-compact > span { margin-bottom:4px; font-size:10px; text-transform:uppercase; letter-spacing:.035em; }
.wk-setup-note.is-compact .wk-input { min-height:40px; height:40px; padding-block:7px; font-size:13px; }

.wk-picker { margin-top:14px; padding:12px; border:1px solid var(--border); border-radius:12px; background:var(--surface); }
.wk-picker-head { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; margin-bottom:8px; }
.wk-picker-cancel,.wk-sheet-done { min-height:40px; padding-inline:10px; }
.wk-exercise-list { border-top:1px solid var(--border); }
.wk-exercise-row { display:grid; grid-template-columns:54px minmax(0,1fr) 24px; align-items:center; gap:12px; width:100%; min-height:72px; padding:8px 2px; border:0; border-bottom:1px solid var(--border); background:transparent; color:var(--text); text-align:left; cursor:pointer; transition:background .14s ease, transform .14s ease; }
.wk-exercise-row:hover { background:var(--surface-2, var(--surface)); transform:translateX(3px); }
.wk-exercise-thumb { display:grid; place-items:center; width:52px; height:52px; overflow:hidden; border:1px solid var(--border); border-radius:12px; background:color-mix(in srgb,var(--accent) 10%,var(--surface)); color:var(--accent); font-size:14px; font-weight:750; }
.wk-exercise-thumb.is-ready { background:#fff; }
.wk-exercise-thumb.is-unavailable { background:var(--surface-2, var(--surface)); color:var(--muted); font-size:11px; letter-spacing:.04em; }
.wk-exercise-thumb img { display:block; width:100%; height:100%; object-fit:contain; }
.wk-exercise-copy { display:block; min-width:0; }
.wk-exercise-copy strong,.wk-exercise-copy > span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.wk-exercise-copy strong { font-size:14px; font-weight:650; }
.wk-exercise-copy > span { margin-top:4px; color:var(--muted); font-size:12px; }
.wk-row-chevron { color:var(--muted); }
.wk-search { margin-bottom:10px; }
.wk-filter-row { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.wk-filter-btn { display:flex; align-items:center; justify-content:center; gap:7px; min-width:0; min-height:50px; padding:10px 12px; overflow:hidden; border:1px solid transparent; border-radius:10px; background:var(--surface-2, var(--surface)); color:var(--text); font-family:var(--font); font-size:14px; font-weight:650; white-space:nowrap; cursor:pointer; transition:background .14s ease,border-color .14s ease,transform .1s ease; }
.wk-filter-btn span { min-width:0; overflow:hidden; text-overflow:ellipsis; }
.wk-filter-btn svg { flex:0 0 auto; }
.wk-filter-btn:hover { border-color:color-mix(in srgb,var(--accent) 34%,var(--border)); }
.wk-filter-btn:active { transform:scale(.98); }
.wk-filter-btn.is-filtered { border-color:color-mix(in srgb,var(--accent) 52%,var(--border)); background:color-mix(in srgb,var(--accent) 15%,var(--surface)); color:var(--accent); }
.wk-library-summary { display:flex; justify-content:space-between; gap:12px; padding:10px 2px 8px; }
.wk-discovery-section { margin-top:18px; }
.wk-discovery-section + .wk-discovery-section { margin-top:24px; }
.wk-list-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:28px; padding:0 2px 7px; }
.wk-list-heading h3 { margin:0; font-size:14px; font-weight:700; letter-spacing:-.01em; }
.wk-list-heading span { color:var(--muted); font-size:11px; font-variant-numeric:tabular-nums; }
.wk-picker-empty { padding-block:34px; }
.wk-catalog-resume { display:flex; align-items:center; justify-content:space-between; gap:14px; margin:2px 0 12px; padding:12px; border:1px solid var(--border); border-radius:10px; background:var(--surface-2, var(--surface)); }
.wk-catalog-resume p { margin:0; color:var(--muted); font-size:12px; line-height:1.45; }
.wk-catalog-resume .wk-btn { flex:0 0 auto; }
.wk-list-sentinel { width:100%; height:1px; }
.wk-filter-sheet { max-width:520px; padding-top:18px; }
.wk-filter-sheet-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px; }
.wk-filter-sheet-head .wk-sheet-title { margin:0; }
.wk-option-list { max-height:min(58vh,520px); overflow-y:auto; border-top:1px solid var(--border); }
.wk-option { display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%; min-height:48px; padding:10px 4px; border:0; border-bottom:1px solid var(--border); background:transparent; color:var(--text); font-family:var(--font); font-size:14px; text-align:left; cursor:pointer; }
.wk-option:hover { background:var(--surface-2, var(--surface)); }
.wk-option.is-selected { color:var(--accent); font-weight:650; }
.wk-action-sheet { max-width:520px; padding-top:18px; }
.wk-sheet-kicker { margin:3px 0 0; color:var(--muted); font-size:12px; }
.wk-action-list { border-top:1px solid var(--border); }
.wk-action-list > button { display:grid; grid-template-columns:28px minmax(0,1fr); align-items:center; gap:10px; width:100%; min-height:58px; padding:9px 4px; border:0; border-bottom:1px solid var(--border); background:transparent; color:var(--text); font-family:var(--font); text-align:left; cursor:pointer; }
.wk-action-list > button:hover:not(:disabled) { background:var(--surface-2, var(--surface)); }
.wk-action-list > button:disabled { opacity:.38; cursor:default; }
.wk-action-list > button > svg { justify-self:center; color:var(--muted); }
.wk-action-list > button span,.wk-action-list > button strong,.wk-action-list > button small { display:block; min-width:0; }
.wk-action-list > button strong { font-size:14px; font-weight:650; }
.wk-action-list > button small { margin-top:3px; color:var(--muted); font-size:11px; line-height:1.35; }
.wk-action-list > button.is-danger,.wk-action-list > button.is-danger > svg { color:var(--danger); }

.wk-detail { position:absolute; inset:0; z-index:60; display:flex; flex-direction:column; overflow:hidden; background:var(--bg); color:var(--text); }
.wk-detail-scrim { position:absolute; inset:0; z-index:70; display:flex; align-items:flex-end; justify-content:center; padding:16px; background:rgba(0,0,0,.48); animation:wk-scrim-enter .18s ease-out both; }
.wk-swipe-sheet { --wk-sheet-drag:0px; display:flex; flex-direction:column; width:min(100%,760px); max-height:min(92%,900px); overflow:hidden; border:1px solid var(--border); border-radius:18px; background:var(--bg); color:var(--text); box-shadow:0 18px 55px rgba(0,0,0,.34); transform:translate3d(0,var(--wk-sheet-drag),0); transition:transform .2s cubic-bezier(.22,1,.36,1); animation:wk-sheet-enter .22s cubic-bezier(.22,1,.36,1) both; }
.wk-swipe-sheet.is-dragging { transition:none; }
.wk-swipe-sheet.is-dismissing { --wk-sheet-drag:calc(100% + 40px) !important; pointer-events:none; }
.wk-sheet-grabber { flex:0 0 auto; display:grid; place-items:center; width:100%; height:36px; padding:0; border:0; background:transparent; cursor:grab; touch-action:none; }
.wk-sheet-grabber:active { cursor:grabbing; }
.wk-sheet-grabber span { width:38px; height:4px; border-radius:999px; background:color-mix(in srgb,var(--muted) 55%,transparent); transition:transform .14s ease,background .14s ease; }
.wk-sheet-grabber:hover span { background:var(--muted); transform:scaleX(1.16); }
.wk-sheet-heading { flex:0 0 auto; display:flex; align-items:center; justify-content:space-between; gap:14px; width:100%; padding:0 20px 12px; }
.wk-sheet-heading .wk-brand-text { flex:1 1 auto; }
.wk-sheet-heading .wk-title,.wk-sheet-heading .wk-subtitle { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.wk-exercise-detail { z-index:80; }
.wk-detail-scroll { flex:1; min-height:0; overflow-y:auto; padding:20px 20px max(40px, env(safe-area-inset-bottom)); }
.wk-gif { display:block; width:100%; max-height:380px; object-fit:contain; border-radius:12px; background:#fff; border:1px solid var(--border); }
.wk-media-state { display:grid; place-items:center; min-height:220px; border:1px dashed var(--border); border-radius:12px; background:var(--surface-2, var(--surface)); color:var(--muted); font-size:13px; }
.wk-detail-facts { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin:18px 0 24px; }
.wk-detail-facts div { min-width:0; padding:12px; border:1px solid var(--border); border-radius:10px; background:var(--surface); }
.wk-detail-facts dt { margin-bottom:4px; color:var(--muted); font-size:11px; }
.wk-detail-facts dd { overflow:hidden; margin:0; text-overflow:ellipsis; font-size:13px; font-weight:650; }
.wk-detail-scroll h3 { margin:24px 0 10px; font-size:15px; }
.wk-instructions { margin:0; padding-left:22px; color:var(--muted); font-size:14px; line-height:1.55; }
.wk-instructions li { margin-bottom:9px; }
.wk-muted-copy,.wk-credit { color:var(--muted); font-size:13px; line-height:1.55; }
.wk-credit { margin:26px 0 0; }
.wk-credit a { color:var(--accent); }
.wk-progress { margin:26px 0 4px; }
.wk-progress .wk-section-heading { margin-bottom:10px; }
.wk-progress .wk-section-heading h3 { margin:0; }
.wk-progress .wk-section-heading > span { color:var(--muted); font-size:12px; }
.wk-progress-metrics { display:grid; grid-template-columns:repeat(3,1fr); border-block:1px solid var(--border); }
.wk-progress-metrics > div { min-width:0; padding:13px 10px; border-right:1px solid var(--border); }
.wk-progress-metrics > div:first-child { padding-left:0; }
.wk-progress-metrics > div:last-child { padding-right:0; border-right:0; }
.wk-progress-metrics span,.wk-progress-metrics strong { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.wk-progress-metrics span { color:var(--muted); font-size:10px; text-transform:uppercase; letter-spacing:.035em; }
.wk-progress-metrics strong { margin-top:5px; font-size:15px; font-variant-numeric:tabular-nums; }
.wk-progress-history { border-bottom:1px solid var(--border); }
.wk-progress-history > div { display:grid; grid-template-columns:74px minmax(0,1fr) auto; align-items:center; gap:10px; min-height:44px; border-bottom:1px solid var(--border); font-size:12px; }
.wk-progress-history > div:last-child { border-bottom:0; }
.wk-progress-history span { color:var(--muted); }
.wk-progress-history strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-variant-numeric:tabular-nums; }
.wk-pr-badge { display:inline-flex; align-items:center; justify-content:center; min-height:18px; margin-right:6px; padding:1px 6px; border-radius:999px; background:color-mix(in srgb,var(--accent) 16%,transparent); color:var(--accent); font-size:9px; font-weight:800; line-height:1.2; letter-spacing:.035em; text-transform:uppercase; white-space:nowrap; }
.wk-trend-chart { margin:14px 0 20px; padding:12px 12px 9px; border:1px solid var(--border); border-radius:12px; background:var(--surface); }
.wk-trend-chart figcaption { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:8px; color:var(--muted); font-size:11px; }
.wk-trend-chart figcaption strong { color:var(--text); font-size:13px; font-variant-numeric:tabular-nums; }
.wk-trend-chart svg { display:block; width:100%; height:auto; overflow:visible; }
.wk-trend-chart line { stroke:var(--border); stroke-width:1; vector-effect:non-scaling-stroke; }
.wk-trend-chart polyline { fill:none; stroke:var(--accent); stroke-width:2.5; stroke-linecap:round; stroke-linejoin:round; vector-effect:non-scaling-stroke; }
.wk-trend-chart circle { fill:var(--bg); stroke:var(--accent); stroke-width:2; vector-effect:non-scaling-stroke; }
.wk-trend-scale { display:flex; justify-content:space-between; gap:12px; margin-top:6px; color:var(--muted); font-size:10px; }
.wk-trend-empty { margin:12px 0 20px; padding:13px 0; border-block:1px solid var(--border); color:var(--muted); font-size:12px; line-height:1.5; }

.wk-field { display:block; margin-bottom:20px; }
.wk-field > span,.wk-builder-item label > span { display:block; margin-bottom:6px; color:var(--muted); font-size:12px; font-weight:600; }
.wk-builder-list { margin-bottom:14px; border-top:1px solid var(--border); }
.wk-builder-item { display:grid; grid-template-columns:minmax(0,1fr) 70px 70px 44px; gap:8px; align-items:end; padding:14px 0; border-bottom:1px solid var(--border); }
.wk-builder-name { align-self:center; min-width:0; }
.wk-builder-name strong,.wk-builder-name span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.wk-builder-name strong { font-size:14px; }
.wk-builder-name span { margin-top:3px; color:var(--muted); font-size:11px; }
.wk-builder-item .wk-input { min-height:44px; text-align:center; padding-inline:6px; }

.wk-history { border-top:1px solid var(--border); }
.wk-analytics { margin:0 0 30px; }
.wk-metrics { display:grid; grid-template-columns:repeat(3,1fr); margin-top:10px; border-block:1px solid var(--border); }
.wk-metrics > div { min-width:0; padding:15px 12px; border-right:1px solid var(--border); }
.wk-metrics > div:first-child { padding-left:0; }
.wk-metrics > div:last-child { padding-right:0; border-right:0; }
.wk-metrics strong,.wk-metrics span { display:block; overflow:hidden; text-overflow:ellipsis; }
.wk-metrics strong { font-size:20px; font-weight:750; font-variant-numeric:tabular-nums; letter-spacing:-.02em; }
.wk-metrics span { margin-top:4px; color:var(--muted); font-size:11px; white-space:nowrap; }
.wk-trend { margin:10px 0 0; color:var(--muted); font-size:12px; line-height:1.5; }
.wk-history-row { display:grid; grid-template-columns:minmax(0,1fr) auto 20px; gap:14px; align-items:center; width:100%; padding:15px 2px; border:0; border-bottom:1px solid var(--border); background:transparent; color:var(--text); font-family:var(--font); text-align:left; cursor:pointer; transition:background .14s ease; }
.wk-history-row:hover { background:var(--surface-2, var(--surface)); }
.wk-history-stats { display:flex; justify-content:flex-end; gap:12px; color:var(--muted); font-size:12px; font-variant-numeric:tabular-nums; }
.wk-log-summary { display:grid; grid-template-columns:repeat(3,1fr); margin-bottom:18px; border-block:1px solid var(--border); }
.wk-log-summary > div { min-width:0; padding:14px 10px; border-right:1px solid var(--border); }
.wk-log-summary > div:first-child { padding-left:0; }
.wk-log-summary > div:last-child { padding-right:0; border-right:0; }
.wk-log-summary span,.wk-log-summary strong { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.wk-log-summary span { color:var(--muted); font-size:10px; text-transform:uppercase; letter-spacing:.035em; }
.wk-log-summary strong { margin-top:5px; font-size:15px; font-variant-numeric:tabular-nums; }
.wk-session-empty { padding-block:28px; }
.wk-log-record-callout { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:0 0 22px; padding:12px 14px; border:1px solid color-mix(in srgb,var(--accent) 36%,var(--border)); border-radius:10px; background:color-mix(in srgb,var(--accent) 11%,var(--surface)); }
.wk-log-record-callout b,.wk-log-record-callout span { display:block; }
.wk-log-record-callout b { color:var(--accent); font-size:13px; }
.wk-log-record-callout span { color:var(--muted); font-size:11px; text-align:right; }
.wk-session-exercise { margin-bottom:26px; }
.wk-session-exercise-copy { min-width:0; }
.wk-session-exercise-copy h3,.wk-session-exercise-copy span { display:block; overflow:hidden; margin:0; text-overflow:ellipsis; white-space:nowrap; }
.wk-session-exercise-copy h3 { font-size:15px; }
.wk-session-exercise-copy span { margin-top:3px; color:var(--muted); font-size:11px; }
.wk-log-set-head,.wk-log-set { display:grid; grid-template-columns:38px minmax(92px,1fr) 60px minmax(78px,auto); gap:8px; align-items:center; }
.wk-log-set-head { padding:0 8px 6px; color:var(--muted); font-size:10px; font-weight:600; letter-spacing:.035em; text-transform:uppercase; }
.wk-log-set { min-height:42px; padding:7px 8px; border-top:1px solid var(--border); font-size:12px; font-variant-numeric:tabular-nums; }
.wk-log-set.is-record { background:color-mix(in srgb,var(--accent) 9%,transparent); }
.wk-log-set > span:last-child { text-align:right; }
.wk-log-set .wk-pr-badge { margin-right:0; }
.wk-toast,.wk-sync-pill { position:absolute; z-index:110; right:14px; bottom:max(14px, env(safe-area-inset-bottom)); padding:8px 12px; border:1px solid var(--border); border-radius:999px; background:var(--surface); color:var(--text); box-shadow:0 2px 8px rgba(0,0,0,.18); font-size:12px; font-weight:600; }
.wk-sync-pill { display:flex; align-items:center; gap:8px; }
.wk-sync-pill button { padding:0; border:0; background:transparent; color:currentColor; font:inherit; text-decoration:underline; text-underline-offset:2px; cursor:pointer; }
.wk-sync-pill.is-error { color:var(--danger); }
.wk-sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }

::selection { background:color-mix(in srgb,var(--accent) 30%,transparent); color:var(--text); }
.wk-root input { caret-color:var(--accent); }
.wk-scroll,.wk-detail-scroll,.wk-option-list { scrollbar-width:thin; scrollbar-color:var(--border) transparent; }
.wk-scroll::-webkit-scrollbar,.wk-detail-scroll::-webkit-scrollbar,.wk-option-list::-webkit-scrollbar { width:8px; }
.wk-scroll::-webkit-scrollbar-thumb,.wk-detail-scroll::-webkit-scrollbar-thumb,.wk-option-list::-webkit-scrollbar-thumb { border:2px solid transparent; border-radius:999px; background:var(--border); background-clip:padding-box; }

@media (min-width: 760px) {
  .wk-page { max-width:720px; margin-inline:auto; }
  .wk-detail-scroll { width:min(100%,720px); margin-inline:auto; }
}
@media (max-width: 560px) {
  .wk-scroll,.wk-detail-scroll { padding-inline:16px; }
  .wk-routine { grid-template-columns:1fr; }
  .wk-routine-actions { display:grid; grid-template-columns:auto minmax(0,1fr); width:100%; }
  .wk-routine-start { width:100%; }
  .wk-set-head,.wk-set-row { grid-template-columns:30px repeat(3,minmax(0,1fr)) 44px; gap:4px; }
  .wk-catalog-resume { align-items:stretch; flex-direction:column; }
  .wk-catalog-resume .wk-btn { width:100%; }
  .wk-detail-facts { grid-template-columns:1fr; }
  .wk-builder-item { grid-template-columns:minmax(0,1fr) 58px 58px 44px; }
  .wk-header-right { gap:4px; }
  .wk-header-right .wk-btn:not(.wk-btn-icon) { padding-inline:11px; }
  .wk-top-rail-inner { gap:9px; padding-inline:12px; }
  .wk-top-rail .wk-app-icon { width:31px; height:31px; }
  .wk-top-rail .wk-seg { gap:8px; }
  .wk-top-rail .wk-seg-btn { font-size:12px; }
  .wk-history-row { grid-template-columns:minmax(0,1fr) 20px; gap:5px 12px; }
  .wk-history-stats { justify-content:flex-start; }
  .wk-history-row .wk-history-stats { grid-column:1; grid-row:2; flex-wrap:wrap; gap:6px 11px; }
  .wk-history-row .wk-row-chevron { grid-column:2; grid-row:1 / span 2; }
  .wk-log-record-callout { align-items:flex-start; flex-direction:column; }
  .wk-log-record-callout span { text-align:left; }
  .wk-log-set-head,.wk-log-set { grid-template-columns:30px minmax(84px,1fr) 46px minmax(68px,auto); gap:5px; }
  .wk-detail-scrim { padding:0; }
  .wk-swipe-sheet { width:100%; max-height:96%; border-inline:0; border-bottom:0; border-radius:20px 20px 0 0; }
  .wk-sheet-heading { padding-inline:16px; }
}

/* mobius-ui:ReducedMotion v1 — keep in sync; library candidate. Diverge below the marker only. */
@media (prefers-reduced-motion: reduce) { .wk-btn,.wk-seg-btn,.wk-set-row,.wk-exercise-row,.wk-input,.wk-filter-btn,.wk-previous,.wk-history-row,.wk-swipe-sheet,.wk-sheet-grabber span { transition:none !important; animation:none !important; } .wk-detail-scrim { animation:none !important; } }
/* /mobius-ui:ReducedMotion */

@keyframes wk-sheet-enter { from { transform:translate3d(0,28px,0); opacity:.72; } to { transform:translate3d(0,var(--wk-sheet-drag),0); opacity:1; } }
@keyframes wk-scrim-enter { from { opacity:0; } to { opacity:1; } }
`
