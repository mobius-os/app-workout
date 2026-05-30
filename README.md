# Gym

A lightweight training-program tracker for [Möbius](https://github.com/mobius-os). Pick a program (PPL, full-body, upper/lower, or roll your own), then log sessions set by set with a sticky rest timer, a PR table, and a 53-week activity heatmap.

No agent involvement. No cloud. Just a clean training journal that lives in your Möbius storage.

## Install

### Via the App Store (recommended)

Open the **App Store** mini-app in Möbius, search for "Gym", tap **Install**.

### Via paste-a-URL

In the App Store, choose **Install from URL** and paste:

```
https://raw.githubusercontent.com/mobius-os/app-gym/main/mobius.json
```

Möbius will fetch the manifest, seed the starter pack into your storage, and install in one tap.

## What's in the box

Three bottom tabs:

- **Today** — shows the next session in your active program (picked from today's weekday, falling back to round-robin from your last logged session). Big "Start session" CTA opens the set logger. Every set has ± steppers for weight and reps, and a check mark that fires the sticky rest timer at the top. Local notes per session for sleep, niggles, or PR remarks.
- **Programs** — three built-in starter packs (PPL 6-day, full-body 3-day, upper/lower 4-day) plus any forks you make. Starters are read-only; tap **Fork & edit** to make a custom copy. The active program is highlighted; tap any program to make it active.
- **History** — a year-at-a-glance calendar heatmap (53 weeks × 7 days, green-tint on session days), a personal-records table ranked by estimated 1RM (Epley), and a hand-drawn line chart per lift showing top set over time.

## Customising your program

In **Programs**, tap **Fork & edit** on any starter. You'll get an editable copy with:

- Editable program name
- Per-session day-of-week + display name
- Drag-free exercise rows (name, sets, reps, default weight) with `+ exercise` and `−` per row

Hit **Save program** and switch to it from the Programs list.

## Data shape

Everything lives in `state.json` in your app storage. Single object:

```json
{
  "active_program_id": "ppl6",
  "starter_pack_installed": true,
  "programs": { "ppl6": { "name": "...", "sessions": [...] } },
  "history": [
    { "date": "2026-05-30", "program_id": "ppl6", "session_idx": 0,
      "sets": [{ "exercise": "Bench", "reps": 5, "weight": 80 }],
      "notes": "..." }
  ]
}
```

The app reads/writes via `window.mobius.storage` when the offline runtime is present, and falls back to direct `/api/storage` calls otherwise — so it works on every recent Möbius build and gets offline benefits automatically when the runtime lands.

## License

MIT — see [LICENSE](LICENSE).
