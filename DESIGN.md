---
name: Workout
description: A Möbius-native training ledger for fast, recoverable set logging.
colors:
  background: "var(--bg)"
  surface: "var(--surface)"
  surface-secondary: "var(--surface-2, var(--surface))"
  text: "var(--text)"
  muted: "var(--muted)"
  border: "var(--border)"
  accent: "var(--accent)"
  accent-foreground: "var(--accent-fg)"
  completion: "var(--green)"
  danger: "var(--danger)"
  scrim: "rgba(0,0,0,.5)"
  media-canvas: "#ffffff"
typography:
  micro:
    fontFamily: "var(--font)"
    fontSize: "8px"
    fontWeight: 700
  overline:
    fontFamily: "var(--font)"
    fontSize: "9px"
    fontWeight: 700
  compact-label:
    fontFamily: "var(--font)"
    fontSize: "10px"
    fontWeight: 600
  caption:
    fontFamily: "var(--font)"
    fontSize: "11px"
    fontWeight: 600
  supporting:
    fontFamily: "var(--font)"
    fontSize: "13px"
    fontWeight: 600
  input:
    fontFamily: "var(--font)"
    fontSize: "16px"
    fontWeight: 400
  empty-title:
    fontFamily: "var(--font)"
    fontSize: "17px"
    fontWeight: 700
  headline:
    fontFamily: "var(--font)"
    fontSize: "18px"
    fontWeight: 700
    letterSpacing: "-0.015em"
  title:
    fontFamily: "var(--font)"
    fontSize: "15px"
    fontWeight: 700
    letterSpacing: "-0.01em"
  metric:
    fontFamily: "var(--font)"
    fontSize: "20px"
    fontWeight: 750
    letterSpacing: "-0.02em"
  body:
    fontFamily: "var(--font)"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "var(--font)"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.5
rounded:
  flat: "0"
  compact: "7px"
  input: "8px"
  set-row: "9px"
  control: "10px"
  card: "12px"
  bottom-sheet: "16px"
  adaptive-sheet: "18px"
  phone-sheet: "20px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "6px"
  md: "8px"
  control: "10px"
  content: "12px"
  gutter-phone: "16px"
  gutter: "20px"
  sheet: "24px"
  section: "30px"
components:
  app-icon:
    size: "36px"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface-secondary}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "44px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.input}"
    padding: "11px 12px"
    height: "44px"
  tab-active:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.flat}"
    height: "48px"
  rest-timer:
    backgroundColor: "color-mix(in srgb, var(--accent) 14%, var(--surface))"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
    padding: "10px 10px 10px 14px"
  completion-toggle:
    backgroundColor: "{colors.completion}"
    textColor: "{colors.accent-foreground}"
    rounded: "{rounded.set-row}"
    size: "44px"
  exercise-thumbnail:
    backgroundColor: "{colors.surface-secondary}"
    textColor: "{colors.accent}"
    rounded: "{rounded.control}"
    size: "52px"
---

# Design System: Workout

## Overview

**Creative North Star: “The Möbius Token Ledger”**

Workout is a Möbius-native training ledger, not a fitness dashboard. The interface inherits the shell’s current light or dark tokens, places the real Workout icon beside one flat primary tab rail, and keeps navigation quiet beside dense set data. Ruled rows, aligned numbers, and restrained color make the record feel dependable at a glance.

The core journey is deliberately progressive: start a routine, reuse a saved setup note, tap previous values into the next set, let a recoverable rest timer begin when a valid set is completed, and inspect both rolling and exercise-specific progress. Exercise discovery remains preview-then-add: library and picker rows extend automatically as the ledger scrolls and lazily request one cached still frame, while the selected exercise alone rises in an adaptive sheet and requests the animated demonstration. Catalogue and media failures never block saved routines or an active workout.

**Key Characteristics:**
- A compact app icon anchors the single root navigation rail and remains present beside an active workout.
- Three flat 48px tabs use a two-pixel accent underline instead of a pill or lifted selection.
- History leads with a ruled rolling seven-day ledger for workouts, completed sets, volume, and comparison with the preceding seven days.
- Library and picker rows share one continuously extending 52px still-thumbnail treatment; only the selected adaptive sheet requests and renders a GIF.
- Read-only detail rises above context in a handle-led sheet: floating on larger screens, bottom-anchored and swipe-dismissible on phones.
- Equal-width “All equipment” and “All muscles” controls filter discovery without decorative arrows.
- Completing a valid set starts a sticky, persisted rest timer that can recover, complete, skip, or dismiss without entering finished history.

## Colors

The palette has no app-owned brand hex. Every interactive and structural role inherits from Möbius so accent, contrast, surfaces, completion, and danger remain correct across themes.

### Primary
- **Möbius Accent** (`var(--accent)`): Primary actions, the active-tab underline, exercise links and marks, focus rings, and the running rest-timer tint.
- **Accent Foreground** (`var(--accent-fg)`): Text or checks placed on accent, completion, and danger fills.

### Secondary
- **Completion** (`var(--green)`): Valid completed-set controls, the completed-row tint, and the finished rest-timer state.
- **Danger** (`var(--danger)`): The destructive confirmation action only.

### Neutral
- **Background** (`var(--bg)`): Root canvas and focused editor layers.
- **Surface** (`var(--surface)`): Header, inputs, sheets, toast, and primary neutral containers.
- **Secondary Surface** (`var(--surface-2, var(--surface))`): Secondary buttons, set numbers, incomplete checks, recovery cards, and media placeholders.
- **Text / Muted / Border** (`var(--text)`, `var(--muted)`, `var(--border)`): Primary copy, supporting metadata, ruled analytics, and one-pixel structure.
- **Media Canvas** (`#ffffff`): Stable neutral behind the selected exercise animation, independent of shell theme.
- **Scrim** (`rgba(0,0,0,.5)`): Adaptive detail and confirmation backdrop.

### Named Rules
**The Token-Only Rule.** Do not introduce app-owned light/dark palettes. Use the shell roles exactly, including `surface-2`’s fallback to `surface`.

**The State-Color Rule.** Accent means action or current progress, green means valid completion, and danger means destructive intent. Color is never decoration.

## Typography

**Display Font:** None; Workout has no marketing-scale type.

**Body Font:** Möbius UI family (`var(--font)`)

**Label Font:** Möbius UI family (`var(--font)`), with tabular numerals wherever values change.

**Character:** Compact, direct, and gym-native. Weight, alignment, and restrained size changes establish hierarchy; metadata stays quiet so exercises, metrics, values, and actions win the glance.

### Hierarchy
- **Headline** (700, `18px`, `-0.015em`): Active workout, focused editor, and sheet titles.
- **Title** (700, `15–17px`, `-0.01em`): Sections, routine/history rows, empty-state headings, and sheet titles.
- **Metric** (750, `20px`, `-0.02em`): Rolling seven-day totals and the rest countdown.
- **Body** (400, `14px`, `1.5–1.6`): Instructions, sheet copy, and empty-state explanation.
- **Control** (600–650, `13–14px`): Buttons, flat tabs, exercise names, and row actions.
- **Label** (500–600, `10–12px`): Subtitles, metadata, analytics captions, facts, summaries, and set headings. Set headings are uppercase with `0.035em` tracking.
- **Numbers:** Previous values, active-workout counts, countdowns, seven-day statistics, and set inputs use tabular numerals.

### Named Rules
**The Glanceable Ledger Rule.** Previous performance, current values, completion, and rolling totals stay aligned; descriptive text must not overpower them.

## Layout

The root is a full-height flex column with one combined logo-and-tabs rail above an independently scrolling content region. Root content uses `20px` gutters and safe-area-aware bottom padding. The rail is at least `58px` high, uses a compact app icon, and gives the three tabs the remaining width with `18px` between equal items. There is no duplicated app-title row. Tabs disappear while a workout is active and their space becomes the workout title, duration, set count, and actions. The separator stops at the centered content rail rather than cutting across wide canvases.

At `760px` and wider, the header background can span the canvas while its separator stops with the centered `760px` inner rail that aligns the logo and actions; tabs and scrolling content sit in a centered `720px` reading column. At `560px` and narrower, gutters remain `16px`; quick actions, routines, filters, catalogue recovery, detail facts, and history rows stack; set and routine-builder columns tighten without changing information order. Header actions remain visible with reduced inline padding.

Collections remain ruled rows rather than card grids. History places the rolling seven-day ledger above the chronological session list. Exercise library and picker rows share the same thumbnail, name, target, equipment, and chevron structure; accessible names preserve the preview/view distinction. Sixty-row render batches append automatically before the scroll boundary, avoiding a manual “show more” interruption without mounting the full catalogue at once. Read-only exercise and completed-workout details use the shared adaptive sheet. The routine builder remains a focused editor with explicit Cancel and Save actions. The rest timer is sticky at the top of active-workout content so it remains reachable while the set ledger scrolls.

## Elevation & Depth

Workout is flat and ruled by default. Tonal mixing distinguishes completion, recovery, and timer states; shadows appear only where content is genuinely stacked above the ledger. Flat tabs use no shadow.

### Shadow Vocabulary
- **Sticky Rest Timer** (`0 5px 16px rgba(0,0,0,.18)`): Separates the recoverable countdown from set rows scrolling beneath it.
- **Adaptive Sheet** (`0 18px 52px rgba(0,0,0,.32)`): Separates read-only detail from its context on larger screens; the phone variant uses the same elevation from the bottom edge.
- **Status Pill** (`0 2px 8px rgba(0,0,0,.18)`): Keeps save errors and brief confirmations legible over content.

### Named Rules
**The Structural Elevation Rule.** Rows, analytics cells, tabs, and ordinary containers remain flat. Shadows are reserved for sticky, modal, or transient overlay states.

## Shapes

The form language is compact and gently rounded without turning navigation into pills. Active tabs stay square and announce state with a two-pixel underline. Compact filter fallbacks use `7px`, inputs and icon buttons `8px`, set rows and checks `9px`, ordinary controls and fact/recovery cards `10px`, and the picker, media, and rest timer `12px`. Destructive bottom sheets use `16px`; adaptive details use `18px` on wide screens and `20px` across the phone top edge while remaining square against the lower viewport. Set numbers are circular; pills are reserved for transient save/status feedback. The app icon occupies a 36px square without a decorative container; the letter fallback alone uses a 10px rounded tile.

## Components

### Unified App Rail
- **Identity:** The real Workout icon is fetched through the app icon route at 64px source size and displayed compactly. If it cannot load, a bordered accent-tinted “W” fallback appears.
- **Shape:** One square-edged logo-and-tabs rail with safe-area padding; on wide screens its one-pixel separator ends with the centered inner rail.
- **Root Content:** The icon sits directly beside Workout, History, and Exercises. The visually hidden Workout heading preserves the page name without duplicating it on screen.
- **Active Content:** The same rail shows the workout name plus tabular duration and completed-set count, followed by Discard and Finish.
- **Secondary Content:** The focused routine editor uses Cancel and Save; read-only sheets rely on the visible dismissal handle, backdrop, Escape, or a downward swipe rather than an X or Back control.

### Flat Underline Navigation
- **Shape:** A transparent `48px` rail with a single bottom border, square tab items, and no inset track or shadow.
- **State:** Muted at rest; hover promotes text; the active tab uses text color plus an inset two-pixel accent underline.
- **Behavior:** Three equal tabs—Workout, History, Exercises—disappear while a workout is active.

### Buttons and Inputs
- **Buttons:** `44px` minimum height, `10px` radius, and `10px 16px` padding. Primary actions use accent fill; secondary actions retain a visible border and secondary surface; danger appears only in destructive confirmation. Flat interactive styling is reserved for tabs, ledger values, list rows, and the swipe handle rather than standalone actions.
- **Home Hierarchy:** New workout is the sole full-width primary action. New routine sits with the Routines heading as a compact secondary action. Each saved routine keeps Start primary while Edit is a visible, pencil-labelled secondary button.
- **States:** Active compresses to `scale(.97)` over `100ms`; disabled is 50% opacity and never transforms. Focus-visible uses a two-pixel accent outline with a two-pixel offset.
- **Inputs:** `44px` minimum height, `8px` radius, one-pixel border, surface background, and `16px` text to avoid mobile zoom. Numeric set inputs shrink to `40px`, center their text, and use tabular numerals.

### Rolling Seven-Day Analytics Ledger
- **Structure:** Three equal ruled cells show workouts, completed sets, and rounded training volume for the latest rolling seven-day window.
- **Comparison:** A plain-text line compares completed sets with the immediately preceding seven-day window; an empty ledger explains how to establish a baseline.
- **Determinism:** The calculation accepts an explicit time boundary, then uses half-open adjacent windows so the same sessions and boundary always produce the same result.
- **Tone:** Metrics are part of the history ledger, not raised dashboard cards; borders and alignment do the structural work.

### Exercise Library, Filters, and Lazy Preview
- **Shared Rows:** Library and picker results use the same ruled row with a 52px still thumbnail, name, target, equipment, and chevron. The picker’s accessible name announces “Preview”; choosing a row opens detail and never adds immediately.
- **Filters:** Two equal-width, arrow-free buttons open accessible equipment and muscle sheets. Selected labels replace “All equipment” or “All muscles” without changing layout.
- **Continuous Discovery:** Both surfaces begin with 60 results and append another bounded batch as the scroll boundary approaches. Search or filter changes reset the visible window; there is no manual pagination button or fixed picker cap.
- **Progressive Thumbnails:** An intersection observer requests a thumbnail only near the viewport. The app decodes the first visible GIF frame into a small still, limits concurrent work, deduplicates requests, and stores the result per exercise.
- **Fallback:** Missing official media uses a neutral target-muscle abbreviation such as `LAT` or `ABS`, and a seven-day negative cache prevents a broken ExerciseDB URL from being retried on every mount. A thumbnail failure never hides the exercise or blocks selection.
- **Preview:** The adaptive detail sheet leads with one selected exercise animation or a `220px` loading/unavailable placeholder, followed by target, body part, equipment, and instructions.
- **Add:** When preview was opened from an active workout or routine builder, the sheet exposes a deliberate Add action. Dismissing leaves the workout or routine unchanged.
- **Lazy Media Boundary:** Rows may request one static first frame; only the selected detail requests and renders an animation.
- **Catalogue Recovery:** Saved entries remain usable when loading pauses, paired with an explicit “Continue loading” action.

### Adaptive Detail, Focused Editing, and Confirmation
- **Keyboard Boundary:** Exercise detail, completed-workout detail, routine builder, and discard confirmation trap keyboard focus, close or cancel on Escape, hide background siblings from assistive technology, and return focus to the invoking control.
- **Read-Only Sheet:** Exercise and completed-workout detail share one labelled surface. At larger widths it floats above the ledger; on phones it anchors to the lower edge. A visible handle is both a touch target and the origin for a downward drag. Tapping the handle, tapping the backdrop, or pressing Escape also dismisses.
- **Dismissal Motion:** The sheet enters with one restrained `220ms` ease-out transition and exits in a single `200ms` downward translation beyond its own height before unmounting. Reduced-motion mode closes immediately.
- **Editor Boundary:** Routine creation and editing remain full, focused editors with explicit Cancel and Save actions so unsaved changes are never confused with read-only dismissal.
- **Confirmation Sheet:** Discard remains bottom-aligned above a 50% black scrim with a `480px` maximum width and split Keep workout / Discard actions.
- **Timer Announcement:** The running timer stays quiet while counting; completion creates one polite screen-reader announcement rather than speaking every tick.

### Recoverable Automatic Rest Timer
- **Start:** Marking a valid incomplete set done automatically creates the exercise’s configured countdown, defaulting to 90 seconds.
- **Placement:** A sticky 12px timer card sits above the active ledger, names the exercise, and uses a tabular `m:ss` countdown.
- **Recovery:** The timer’s absolute end time and completion state live inside the persisted active workout, so reopening the draft recomputes the remaining time instead of restarting it.
- **Completion:** At zero it changes to the green “Rest complete / Ready” state and emits the completion signal. Running timers can be skipped; completed timers can be dismissed.
- **Record Boundary:** Finishing a workout removes timer state before the session enters history.

### Guarded Set Logger
- **Ledger:** Five columns preserve set number, previous performance, unit value, reps, and Done. Previous, unit, and reps share the available width equally; their headings and values are centered. Compact outer columns tighten at `560px` but never reorder.
- **Copy Previous:** The previous-value cell is a 44px minimum button. Tapping it copies both weight and reps into the current incomplete set without marking it complete.
- **Setup Notes:** A compact note field is shared by the active logger and exercise detail. Notes are stored once per exercise, survive future workouts, trim on blur, and disappear from the record when cleared.
- **Completion Guardrails:** A set cannot be marked done until reps are greater than zero. Editing reps back to zero clears completion. Finish remains disabled until at least one valid completed set exists.
- **Completed State:** A valid completed row receives a 14% green tint and its `44px` check becomes solid completion green.
- **Draft Recovery:** Active work persists as a recoverable draft. Discard requires the destructive sheet and explicitly states routines and completed history stay untouched.

### Exercise-Specific Progress
- **Metrics:** Detail shows best completed weight, estimated one-rep max, best session volume, and workout count as flat ruled values rather than dashboard cards.
- **History:** The latest four completed sessions list date, best set, completed-set count, and session volume.
- **Single Source:** Progress is derived from completed session sets at render time; it is never persisted as a parallel analytics record.

### Cross-App Data

Workout is the sole writer of its versioned record. There is no export dashboard or editable shared copy in the primary UI: other permitted apps consume the authoritative Workout record read-only. Visual additions around data portability must reinforce that ownership boundary rather than implying two-way sync or mutation.

## Do's and Don'ts

### Do:
- **Do** show the app icon in the root and active-workout header, with the established letter fallback if loading fails.
- **Do** keep the three root tabs flat and use only the two-pixel accent underline for active state.
- **Do** keep rolling seven-day metrics ruled, tabular, and deterministic against one explicit time boundary.
- **Do** extend library and picker results automatically as the user scrolls, while keeping each render batch bounded.
- **Do** show one progressively cached still frame in library and picker rows, use the target label when official media is missing, then fetch animation only for the selected detail.
- **Do** keep the two discovery filters equal-width, arrow-free, and available in both the library and picker.
- **Do** keep reusable setup notes and tap-to-copy previous values directly in the logging path.
- **Do** persist the automatic rest timer with the active draft, and remove it before writing finished history.
- **Do** keep previous performance beside current set inputs and preserve all five ledger columns at phone widths.
- **Do** center the Previous label and values, and give Previous, unit, and reps equal flexible width.
- **Do** use the adaptive handle-led sheet for read-only detail, with a single continuous dismissal and an immediate reduced-motion close.
- **Do** present catalogue interruption as recoverable: saved exercises work now and loading can resume.
- **Do** remove component transitions under `prefers-reduced-motion: reduce`.

### Don't:
- **Don't** restore a filled, rounded, or shadowed segmented-control treatment for the root tabs.
- **Don't** turn the rolling ledger into a card-heavy fitness dashboard or use decorative analytics color.
- **Don't** restore manual “show more” controls or a fixed picker-result cap.
- **Don't** add from a picker row, autoplay or preload multiple GIFs, or let thumbnail failure remove a usable exercise.
- **Don't** persist derived progress beside completed sessions or introduce a second analytics record.
- **Don't** restart a recovered countdown from its full duration or copy timer state into completed history.
- **Don't** allow zero-rep sets to become or remain complete, or allow an empty workout to finish.
- **Don't** add X or Back controls to read-only sheet headers, or animate dismissal to an intermediate resting point.
- **Don't** hide recovery behind a generic error; name what remains usable and provide the resume action.
- **Don't** imply that cross-app readers may write back into Workout’s record.
