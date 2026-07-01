import React from 'react'

// Sport + chrome icons — the rendering half of logic.js's icon keys. logic.js
// stores a Tabler icon KEY per entry (it stays JSX-free; sportIconKey picks
// the key from the activity name); this map turns that key into the inline
// SVG inner markup, copied verbatim from Tabler's outline set. Drawn with the
// shared <SportIcon> below so every render site picks up the same
// stroke/sizing. history / chart-bar / stopwatch are app chrome (tab bar),
// not sport keys.
// Icons: Tabler Icons (MIT) — https://tabler.io/icons
export const ICONS = {
  barbell: (
    <>
      <path d="M2 12h1" />
      <path d="M6 8h-2a1 1 0 0 0 -1 1v6a1 1 0 0 0 1 1h2" />
      <path d="M6 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1 -1v-10a1 1 0 0 0 -1 -1h-1a1 1 0 0 0 -1 1" />
      <path d="M9 12h6" />
      <path d="M15 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1 -1v-10a1 1 0 0 0 -1 -1h-1a1 1 0 0 0 -1 1" />
      <path d="M18 8h2a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-2" />
      <path d="M22 12h-1" />
    </>
  ),
  heartbeat: (
    <>
      <path d="M19.5 13.572l-7.5 7.428l-2.896 -2.868m-6.117 -8.104a5 5 0 0 1 9.013 -3.022a5 5 0 1 1 7.5 6.572" />
      <path d="M3 13h2l2 3l2 -6l1 3h3" />
    </>
  ),
  run: (
    <>
      <path d="M11.007 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
      <path d="M4 17l5 1l.75 -1.5" />
      <path d="M15 21v-4l-4 -3l1 -6" />
      <path d="M7 12v-3l5 -1l3 3l3 1" />
    </>
  ),
  bike: (
    <>
      <path d="M2 18a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
      <path d="M16 18a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
      <path d="M12 19v-4l-3 -3l5 -4l2 3h3" />
      <path d="M13.007 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    </>
  ),
  swimming: (
    <>
      <path d="M15 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M6 11l4 -2l3.5 3l-1.5 2" />
      <path d="M3 16.75a2.4 2.4 0 0 0 1 .25a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 1 -.25" />
    </>
  ),
  kayak: (
    <>
      <path d="M6.414 6.414a2 2 0 0 0 0 -2.828l-1.414 -1.414l-2.828 2.828l1.414 1.414a2 2 0 0 0 2.828 0" />
      <path d="M17.586 17.586a2 2 0 0 0 0 2.828l1.414 1.414l2.828 -2.828l-1.414 -1.414a2 2 0 0 0 -2.828 0" />
      <path d="M6.5 6.5l11 11" />
      <path d="M22 2.5c-9.983 2.601 -17.627 7.952 -20 19.5c9.983 -2.601 17.627 -7.952 20 -19.5" />
      <path d="M6.5 12.5l5 5" />
      <path d="M12.5 6.5l5 5" />
    </>
  ),
  mountain: (
    <>
      <path d="M3 20h18l-6.921 -14.612a2.3 2.3 0 0 0 -4.158 0l-6.921 14.612" />
      <path d="M7.5 11l2 2.5l2.5 -2.5l2 3l2.5 -2" />
    </>
  ),
  yoga: (
    <>
      <path d="M4 20h4l1.5 -3" />
      <path d="M17 20l-1 -5h-5l1 -7" />
      <path d="M4 10l4 -1l4 -1l4 1.5l4 1.5" />
      <path d="M10.007 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    </>
  ),
  'ball-football': (
    <>
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M12 7l4.76 3.45l-1.76 5.55h-6l-1.76 -5.55l4.76 -3.45" />
      <path d="M12 7v-4m3 13l2.5 3m-.74 -8.55l3.74 -1.45m-11.44 7.05l-2.56 2.95m.74 -8.55l-3.74 -1.45" />
    </>
  ),
  sparkles: (
    <>
      <path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6" />
    </>
  ),
  trekking: (
    <>
      <path d="M12 4m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M7 21l2 -4" />
      <path d="M13 21v-4l-3 -3l1 -6l3 4l3 2" />
      <path d="M10 14l-1.827 -1.218a2 2 0 0 1 -.831 -2.15l.28 -1.117a2 2 0 0 1 1.939 -1.515h1.439l4 1l3 -2" />
      <path d="M17 12v9" />
      <path d="M16 20h2" />
    </>
  ),
  walk: (
    <>
      <path d="M13 4m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M7 21l3 -4" />
      <path d="M16 21l-2 -4l-3 -3l1 -6" />
      <path d="M6 12l2 -3l4 -1l3 3l3 1" />
    </>
  ),
  stretching: (
    <>
      <path d="M11 4a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" />
      <path d="M6.5 21l3.5 -5" />
      <path d="M5 11l7 -2" />
      <path d="M16 21l-4 -7v-5l7 -4" />
    </>
  ),
  'jump-rope': (
    <>
      <path d="M6 14v-6a3 3 0 1 1 6 0v8a3 3 0 0 0 6 0v-6" />
      <path d="M16 3m0 2a2 2 0 0 1 2 -2h0a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h0a2 2 0 0 1 -2 -2z" />
      <path d="M4 14m0 2a2 2 0 0 1 2 -2h0a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h0a2 2 0 0 1 -2 -2z" />
    </>
  ),
  karate: (
    <>
      <path d="M18 4m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M3 9l4.5 1l3 2.5" />
      <path d="M13 21v-8l3 -5.5" />
      <path d="M8 4.5l4 2l4 1l4 3.5l-2 3.5" />
    </>
  ),
  'ball-basketball': (
    <>
      <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M5.65 5.65l12.7 12.7" />
      <path d="M5.65 18.35l12.7 -12.7" />
      <path d="M12 3a9 9 0 0 0 9 9" />
      <path d="M3 12a9 9 0 0 1 9 9" />
    </>
  ),
  'ball-tennis': (
    <>
      <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M6 5.3a9 9 0 0 1 0 13.4" />
      <path d="M18 5.3a9 9 0 0 0 0 13.4" />
    </>
  ),
  treadmill: (
    <>
      <path d="M10 3a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" />
      <path d="M3 14l4 1l.5 -.5" />
      <path d="M12 18v-3l-3 -2.923l.75 -5.077" />
      <path d="M6 10v-2l4 -1l2.5 2.5l2.5 .5" />
      <path d="M21 22a1 1 0 0 0 -1 -1h-16a1 1 0 0 0 -1 1" />
      <path d="M18 21l1 -11l2 -1" />
    </>
  ),
  dumbbell: (
    <>
      <path d="M6 7l3 0l0 10l-3 0" />
      <path d="M4 8l0 8" />
      <path d="M18 7l-3 0l0 10l3 0" />
      <path d="M20 8l0 8" />
      <path d="M9 12l6 0" />
      <path d="M2 10l0 4" />
      <path d="M22 10l0 4" />
    </>
  ),
  jump: (
    <>
      <path d="M6 21m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
      <path d="M15.5 5m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0" />
      <path d="M4 15l3 -3l3 1l3 -3" />
      <path d="M13 10l1 -3l3 2l3 -1" />
      <path d="M17 21l-3 -6" />
    </>
  ),
  dance: (
    <>
      <path d="M13 4m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M11 21l1 -6l-2 -3l3 -3l2 3l3 1" />
      <path d="M13 12l-2 -3l-4 1l-1 4" />
      <path d="M6 21l2 -5" />
    </>
  ),
  golf: (
    <>
      <path d="M12 18v-15l7 4l-7 4" />
      <path d="M9 21a3 3 0 0 0 6 0" />
      <path d="M12 18a3 3 0 0 0 -3 3" />
    </>
  ),
  ski: (
    <>
      <path d="M15 4m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M4 17l5.5 -1.5" />
      <path d="M3 21l17 -4" />
      <path d="M11 21v-6l-2 -3l4 -3l2 3l3 1" />
      <path d="M15 9l1 -2" />
    </>
  ),
  snowboard: (
    <>
      <path d="M15 4m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M3 17l7 3l11 -5" />
      <path d="M7 19l4 -8l4 3l3 -1" />
      <path d="M11 11l-1 -3l3 -2l2 3" />
    </>
  ),
  'ice-skate': (
    <>
      <path d="M8 3v11" />
      <path d="M14 3v11" />
      <path d="M8 8h6" />
      <path d="M8 14c0 2 1 3 3 3h4a2 2 0 0 1 2 2" />
      <path d="M5 21h16" />
      <path d="M5 19h16" />
    </>
  ),
  skateboard: (
    <>
      <path d="M14 6m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M3 14l4 -1l3 2l3 -4" />
      <path d="M13 11l4 2l3 -1" />
      <path d="M10 21l1 -5" />
      <path d="M4 20a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" />
      <path d="M18 20a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" />
      <path d="M4 20l3 -1l11 0l2 1" />
    </>
  ),
  surf: (
    <>
      <path d="M3 21c2.5 0 3.5 -1.5 5 -3s2.5 -3 4 -3s2.5 1.5 4 3s2.5 3 5 3" />
      <path d="M6 14c1.5 -5 4.5 -8.5 12 -11c-1.5 6 -4.5 9.5 -9 12" />
      <path d="M10 11l3 3" />
    </>
  ),
  stairs: (
    <>
      <path d="M5 20h5v-4h4v-4h4v-4h1" />
      <path d="M5 20v-2h2" />
      <path d="M10 16v-2h2" />
      <path d="M14 12v-2h2" />
    </>
  ),
  'ball-volleyball': (
    <>
      <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M12 12a8.6 8.6 0 0 1 3.5 8.5" />
      <path d="M12 12a8.6 8.6 0 0 1 -8 3" />
      <path d="M12 12a8.6 8.6 0 0 1 4.5 -8" />
      <path d="M12 3a9 9 0 0 0 4 7" />
      <path d="M4.5 8a9 9 0 0 0 8 4" />
      <path d="M8 20a9 9 0 0 0 4 -8" />
    </>
  ),
  'ball-baseball': (
    <>
      <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M5.65 5.65a9 9 0 0 1 2.35 6.35a9 9 0 0 1 -2.35 6.35" />
      <path d="M18.35 5.65a9 9 0 0 0 -2.35 6.35a9 9 0 0 0 2.35 6.35" />
    </>
  ),
  history: (
    <>
      <path d="M12 8l0 4l2 2" />
      <path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" />
    </>
  ),
  'chart-bar': (
    <>
      <path d="M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
      <path d="M15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
      <path d="M9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
      <path d="M4 20h14" />
    </>
  ),
  stopwatch: (
    <>
      <path d="M5 13a7 7 0 1 0 14 0a7 7 0 0 0 -14 0z" />
      <path d="M14.5 10.5l-2.5 2.5" />
      <path d="M17 8l1 -1" />
      <path d="M14 3h-4" />
    </>
  ),
}

// Renders a category's Tabler icon. `name` is the CATEGORIES[k].icon key; an
// unknown key falls back to the neutral `sparkles` glyph so a future category
// added in logic.js without a matching ICONS entry still draws something.
export function SportIcon({ name, color, size = 20 }) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size}
      fill="none" stroke={color || 'currentColor'} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden
    >
      {ICONS[name] || ICONS.sparkles}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Storage layer — two paths into the same place:
//   1. window.mobius.storage  — the offline runtime. Reads/writes the local
//      outbox so the app works without a network, then syncs on reconnect.
//   2. fetch(/api/storage/...) — direct backend call when the runtime isn't
//      installed yet.
// We probe `window.mobius?.storage` at call time (not module load) so the
// runtime can be injected after the app boots without us missing it.
// ---------------------------------------------------------------------------

