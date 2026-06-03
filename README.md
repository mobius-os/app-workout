# Workout

A natural-language activity logger for [Möbius](https://github.com/mobius-os). Type what you did — `3×5 deadlift at 100kg`, `ran 5k in 24 min`, `hiked 8h in Hawaii`, `played football for an hour` — and it parses the entry, lets you confirm or tweak it, auto-categorizes it, and groups it into sessions. Built for the gym, generalized to any activity.

## Install

### Via the App Store (recommended)

Open the **App Store** mini-app in Möbius, search for "Workout", tap **Install**.

### Via paste-a-URL

In the App Store, choose **Install from URL** and paste:

```
https://raw.githubusercontent.com/mobius-os/app-gym/main/mobius.json
```

## How it works

A sticky composer — styled like the Möbius chat composer — sits at the bottom of the **Log** tab. You type a sentence; the app sends it to the on-device agent proxy (`/api/ai`) with a JSON-only prompt that returns a category, an activity name, and structured metrics. Every parse opens an **editable confirm card** before anything is saved — nothing auto-commits, and an ambiguous or unparseable entry still lands as a card you can fill in by hand. Offline, the composer skips the model and opens a blank manual-entry card directly.

Three bottom tabs:

- **Log** — the composer plus your entries grouped into sessions (entries within 4 hours of each other share a session). A follow-up like "another set with 90" resolves against the session you're mid-way through, because the app passes the open session as context to the model.
- **Insights** — analytics *by category*: a donut of your category split, a stacked volume-over-time bar (strength = kg·reps, cardio = km, other = minutes), a strength PR table ranked by estimated 1-rep max (Epley), cardio bests, and a year-at-a-glance streak heatmap. The charting library isn't precached for offline, so when you're offline Insights gracefully degrades to the streak + heatmap (which need no library).
- **All** — a flat, newest-first list of every entry, with delete.

## Categories

Ten categories — `strength`, `cardio`, `running`, `cycling`, `swimming`, `rowing`, `hiking`, `yoga`, `sport`, `other`. The model picks the category *key*; the app owns the icon and color, so a hallucinated emoji can never drift the look of the app.

## Data shape

Workout is **append-only**. Each logged activity is one entry in `entries.json`; sessions are *derived* (never stored) by grouping entries within a 4-hour gap. Weights are stored in **kilograms**, distances in **metres**, durations in **seconds** (SI) regardless of the units you typed, so analytics never has to branch on unit.

```json
[
  {
    "id": "ab12cd3",
    "ts": 1735730000000,
    "localDate": "2026-06-02",
    "sessionId": "s-1735729000000",
    "category": "strength",
    "activity": "Deadlift",
    "icon": "🏋️",
    "metrics": { "sets": [{ "weight_kg": 100, "reps": 8, "unit": "kg" }] },
    "raw": "did 1 set of deadlift 100kg x8",
    "source": "ai",
    "confirmed": true
  }
]
```

A v1.x install (the old program/set tracker, which stored `state.json`) is migrated on first open: each logged history row's sets become strength entries. Programs themselves were templates, not logged activity, so they're dropped — but the logged history is preserved.

## Development

The pure logic (parse→normalize mapping, session grouping, e1RM, analytics) lives in `logic.js` and is the test target. Because Möbius's installer compiles only the single `entry` file, `build-entry.mjs` inlines `logic.js` into `index.jsx` between sentinel comments — edit `logic.js`, then run `node build-entry.mjs`. A test asserts the inlined block stays in sync.

```
node build-entry.mjs   # regenerate index.jsx's inlined logic block
node --test            # run the logic tests (also checks the inline is in sync)
npm test               # build-entry + node --test
```

## License

MIT — see [LICENSE](LICENSE).
