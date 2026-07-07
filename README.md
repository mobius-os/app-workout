# Workout

A natural-language activity logger for [Möbius](https://github.com/mobius-os). Type what you did — `3×5 deadlift at 100kg`, `ran 5k in 24 min`, `hiked 8h in Hawaii`, `played football for an hour` — and the embedded agent builds a current session, asks for required missing details, auto-categorizes activities, and commits the session when you press Finish session. Built for the gym, generalized to any activity.

## Install

### Via the App Store (recommended)

Open the **App Store** mini-app in Möbius, search for "Workout", tap **Install**.

### Via paste-a-URL

In the App Store, choose **Install from URL** and paste:

```
https://raw.githubusercontent.com/mobius-os/app-workout/main/mobius.json
```

## How it works

The **Session** tab is the home surface: a live current-session draft plus a quick-add strip, with an embedded Möbius chat available behind a header toggle (hidden by default). Tell the Workout agent what you did — for example, `deadlift 3×5 at 120kg, swam 40 minutes, then hiked 8km` — or tap **Quick add**, and the app maintains `current_session.json`. It shows that draft live, refreshes it after each chat turn, and commits the complete group into `entries.json` only when you press **Finish session**. Model/provider selection is the normal embedded-chat picker, the same path used by the LaTeX app.

Required details are intentionally strict:

- Strength needs an exercise plus at least one set, and every set needs reps and weight.
- Cardio/running/cycling/swimming/rowing/hiking needs an activity plus duration or distance.
- Yoga/sport/other needs an activity plus duration, note, or location.

If the user says `2 sets of deadlifts`, the agent should ask for reps and weight before adding it. If the user says `2 sets with 20kg`, it should ask which exercise. Multi-activity messages are split into one session draft.

Three top tabs:

- **Session** — the live current-session draft (an editable worksheet: fill in reps/weight/distance/duration in place, each cell with a visible unit), a quick-add strip for repeat exercises, and the toggle-in Workout chat. A follow-up like "another set with 90" resolves in the ongoing chat context.
- **History** — a flat, newest-first list of every committed entry, with edit and delete.
- **Insights** — analytics *by category and exercise*: weekly volume over the last 6 weeks (strength = kg·reps, cardio = km, other = minutes), category stats, strength PRs ranked by estimated 1-rep max (Epley), cardio bests, and a 26-week streak heatmap. **Tap any exercise** (in the Exercises, Strength PRs, or Cardio bests tables) to open its drill-down: lifetime records (heaviest, est. 1RM, best set/session volume, most reps — or longest distance/time and best pace for cardio), a per-session trend sparkline (estimated-1RM for lifts, distance/pace for cardio), set-records (best weight at each rep count), and full session history. The trend is hand-drawn SVG, so the drill-down works offline like the rest of Insights.

## Categories

Ten categories — `strength`, `cardio`, `running`, `cycling`, `swimming`, `rowing`, `hiking`, `yoga`, `sport`, `other`. The model picks the category *key*; the app owns the icon and color, so a hallucinated emoji can never drift the look of the app.

## Data shape

Workout keeps the in-progress workout in `current_session.json`, then appends complete entries into `entries.json` on Finish session. Each committed activity is one entry; sessions are stored with a shared `sessionId` and can still be derived by the 4-hour gap for older data. Weights are stored in **kilograms**, distances in **metres**, durations in **seconds** (SI) regardless of the units you typed, so analytics never has to branch on unit.

```json
[
  {
    "id": "ab12cd3",
    "ts": 1735730000000,
    "localDate": "2026-06-02",
    "sessionId": "s-1735729000000",
    "category": "strength",
    "activity": "Deadlift",
    "icon": "barbell",
    "metrics": { "sets": [{ "weight_kg": 100, "reps": 8, "unit": "kg" }] },
    "raw": "did 1 set of deadlift 100kg x8",
    "source": "ai",
    "confirmed": true
  }
]
```

A v1.x install (the old program/set tracker, which stored `state.json`) is migrated on first open: each logged history row's sets become strength entries. Programs themselves were templates, not logged activity, so they're dropped — but the logged history is preserved.

## Development

Möbius installs `index.jsx` plus the `source_files` module tree declared in `mobius.json` (`logic.js`, `format.js`, `storage.js`, `theme.js`, `constants.js`, `agent-prompt.js`, and the `ui/*` components), so there is **no build or inlining step** — edit the source modules directly. The pure, headless logic (parse→normalize mapping, session grouping, e1RM, analytics, and the CAS session controller) lives in `logic.js`; per-view display/aggregation helpers live in `format.js`. Both are the main test targets.

```
npm test   # the full node --test suite — no host-specific setup
```

Tests are portable across a fresh clone on Node 22+:

- `__tests__/logic.test.mjs` — the pure logic and display helpers (imports `logic.js` + `format.js` directly).
- `tests/gym.test.mjs` — a focused normalize / merge / summarize smoke.
- `test-integrity.mjs` — the CAS zero-loss acceptance gate. It drives the **real** `createSessionController` and the **real** platform `useDocument` hook against a CAS-aware mock store with true If-Match/412 semantics, so it needs the platform runtime `mobius-runtime.js`. It is discovered from the Möbius checkout by default; set `MOBIUS_RUNTIME` to a file URL or path to point it elsewhere (and `ESBUILD_BIN` if `esbuild` isn't on the default path).

## License

MIT — see [LICENSE](LICENSE).
