# Game of Life

Mustafa's habit, strength, health, salah and build tracker. It runs as a Claude artifact
with a per-user database, a signed-in viewer, and a built-in coach that can read
and write the tracker through tools.

## Layout

| Path | What it is |
| --- | --- |
| `legacy/index.html` | The single-file v2 app, frozen at the module split (Oct 2026). It is an archive now: features land in `src/` only. `npm run test:legacy` still runs the two side by side for the features both have. |
| `src/` | v3: the same app split into modules. `index.html` is the shell, `css/` one stylesheet per feature, `js/core/` shared code, `js/features/` one file per tab, `js/app.js` the composition root. |
| `test/` | The golden-master regression harness (see below), plus `salah.mjs` (prayer-time engine against reference values) and `stale-cache.mjs`. |
| `tools/` | `publish-prep.py` builds `dist/` for the artifact (`npm run dist`). The split scripts (`split-*.py`, `check-cascade.py`, `reassemble-js.py`) are the one-off migration from `legacy/` and are kept for the record. |

The architecture plan lives in the Claude doc "Game of Life v3 Architecture".

## How `src/js` is laid out

| Layer | Files | Rule |
| --- | --- | --- |
| `app.js` | events + boot | The composition root. The only file that imports everything. |
| `features/` | `today`, `salah`, `winddown`, `calendar`, `tasks`, `progress`, `lifts`, `gym`, `body`, `build`, `coach` | One file per tab or card. Each tab calls `registerTab()` when it loads and keeps its own UI flags behind small exported actions. |
| `core/` | `config`, `utils`, `state`, `xp`, `strength`, `salah`, `stats`, `store`, `effects`, `svg`, `render`, `sheets` | Shared by every tab, imports nothing above it. `store.js` is the only file that talks to the database. |

`npm run check` prints the cascade proof and the line-by-line difference between
the modules and the original script (98.7% of lines moved verbatim; the rest is
the import/export plumbing, the tab registry, and the per-tab actions).

## Running the regression harness

```
npm install
npm test              # src against the recorded baseline, with screenshots (plus the stale-cache check)
npm run test:record   # record a new baseline after a reviewed change
npm run test:self     # src vs src side by side: must be all identical (proves the harness is deterministic)
npm run test:local    # the same without a Claude runtime (local mode)
npm run test:legacy   # legacy vs src side by side, for the features both have
node test/salah.mjs   # the prayer-time engine against reference values
```

The app is served locally and driven through an 89-step scenario with a seeded
fixture, a frozen clock (2026-10-07 15:30 ET), seeded `Math.random` and a fake
`window.claude` (database, user, coach). After every step the DOM, localStorage
and the cloud-write log are snapshotted. The golden master is
`test/baseline/hashes.json` (committed: one sha per step); the full snapshots
and screenshots are written next to it, untracked, so a failing step shows a
diff when they exist on the machine. `--shots` adds light/dark screenshots of
every tab with a pixel diff. Output lands in `test/out/`.

Workflow for a change: build, `npm test` (expect DIFF only where you changed
things, no ERROR and no console lines), read the diffs, then
`npm run test:record` and commit `hashes.json` with the change.

## Coach and data

The coach (`src/js/features/coach.js`) can read and change everything the page can: check-ins, habits (add, edit, pause, resume), lifts, the Build tab, rewards, targets and notes. Every change has an undo.

Storage:
- Records live in the artifact database under `data/users/<id>/tracker/`: `days`, `lifts`, `bnodes`, `bships`, `bskills`, `notes`, and `coachlog` (one doc per day holding every Coach exchange). The cap is 25,000 documents.
- Photos sent to the coach are shrunk to 2048 px JPEG and kept in the artifact's asset storage. Their ids are stored with the conversation.
- Settings → Your data shows usage, and "Download everything" (or asking the coach) saves one .zip: `data.json` with everything, CSVs for days, lifts, ships, skills, map, notes and the coach log, and every photo.

## Rest days on set weekdays

A habit can limit its rest days to certain weekdays (`restOn`, 0 = Sunday) and make a logged rest pay the full base XP (`restFull`). Money-producing work uses both: one rest a week, Sundays only, +20 when logged. Off-day misses are never excused. Logic: `restDayOK` in `core/stats.js`, the row in `features/today.js`, editable through the coach's `manage_habit`.

## Planned late nights

Bed on time has 2 planned late nights a week (Friday, already `friBed` 11 PM, and Saturday, already `satBed` midnight, don't count), latest midnight, set before the normal bedtime. The plan lives on the night's day doc as `m.late = {bed, reason, xp, verdict}`. Hitting the planned time keeps the habit done and pays the coach-judged `xp` (0-20, rubric in the coach rules); in bed by the normal time still pays the full 20. Logic: `LATE`, `lateOf`, `lateXP` in `core/state.js`; `lateOpen` and the Today line in `features/today.js`; the `late_night` tool in `features/coach.js`.

## Rules for changes to `src/`

1. One file, one job. A tab's code lives in its feature file.
2. Imports point down: `app.js` → `features/` → `core/` → the runtime.
3. State that more than one file changes lives in `core/state.js`.
4. Run the harness before publishing. `npm run dist` builds `dist/`; publish by
   republishing the artifact with `dist/index.html` as the page and `dist/css`,
   `dist/js`, `dist/tools` as its files. The artifact declares these runtime
   capabilities (restate all of them whenever `capabilities` is passed):
   `assets`, `db`, `downloads`, `sample` (`images: true`), `user`, and `mcp` with
   `servers: [{server: "Google Calendar", tools: ["list_events", "create_event"]}]`.

## Power levels (Lifts tab)

The strength rank is themed on Dragon Ball Z: `MOOSE_RANKS` in `core/strength.js` maps strength level to a form, paced for about a year at ~1,400 XP/week (1 Saiyan Warrior, 4 Kaioken, 9 Super Saiyan, 15 Super Saiyan 2, 22 Super Saiyan 3, 30 Super Saiyan Blue, 40 Ultra Instinct). Each entry's third element lists the levels where its 3 stages start; `mooseStage(L)` returns `{form, stage, next}` for the stage row under the title, the ladder and the level-up toast. Per-lift tiers (`TIERS`, est. 1RM gain): Weighted Gi, Gravity Room +5%, Time Chamber +10%, King Kai's Planet +20%, Over 9,000 +35%. Only labels changed; tier keys (`bronze`…`diamond`) and their colors are unchanged.

## Layout: three sections, two views each (Oct 2026)

The main bar is **Headquarters · Body · Progress**. Under it, a switch shows the section's two views: Headquarters = Today | Tasks, Body = Body | Lifts, Progress = Progress | Build. `SECTIONS` / `sectionOf()` in `src/js/core/render.js` hold the mapping. `state.tab` is still the view id (today, tasks, body, lifts, progress, build), so the views, Coach's `navigate` tool and the data are unchanged; tapping a section opens its home view. Section buttons carry `data-sec`, view buttons keep `data-tab`. The harness's `tab()` helper taps the section, then the view.

## Full-points rest days, capped per week

A habit with `restFull: true` pays full base XP for a declared (non-light) rest day. `restFullMax` (0-3, unset = no cap) limits how many of those pay per week; the rest still keep the streak but score 0. Train is set to `restFull: true, restFullMax: 1`: the one full rest day in the 5 strength + 1 light + 1 rest program pays +20, a second full rest in the same week keeps the streak at 0 XP, and the light day keeps its own light XP. `byDate[d].full` lists the habits whose rest paid that day. Scoring is recomputed from history, so it applies to past weeks too. `test/rest-full.mjs` covers it (runs in `npm test`).

## Band sets (RipRight and other band work)

A lift set can be a resistance band instead of pounds: `{w: 0, r: 220, b: 'thick'}`. The ladder is `BANDS` in `src/js/core/strength.js` (Light band, Thick band; add a heavier band at the end of the list). In the lift sheet each set row has an lb/band picker; Coach's `log_lift` and `update_lift` take `b`.

- Progress: a heavier band outranks any reps on a lighter one; within a band, more reps is progress. Score = reps × band level (light 1x, thick 2x), so moving up a band reads as a PR.
- Quest: same band, about 5% more reps (220 → 230). No "add weight" chip for bands.
- Train: a band-only lift marks Train as a light day (not strength) unless Train is already done or rested. Any weighted lift that day still checks it as done.
- Export: `lifts.csv` has a `band` column.
- `test/stale-cache.mjs` and the harness both run in `npm test`; the harness has band steps (light yesterday, thick today).

## Daily tasks (Tasks tab + the Tasks card on Today)

Pure data, no XP. One document per day at `tracker/tasks/YYYY-MM-DD`: `{date, schema:1, plannedAt, closedAt, items:[...]}`. Each item: `id, title, lane, q (1-4 Covey quadrant), block (am deep work / pm physical / eve), est, actual (minutes), link {t: node|habit|win, id, label}, note, src (page|coach|sched|recur|rollover), tpl (template id), origin (date first planned), rolled (times pushed), createdAt, startedAt, doneAt, droppedAt, dropWhy, rolledTo, timer {on, ms}`. Nothing derived is stored; `taskStats()` recomputes everything from the docs.

- Rollover: on the first render of a new day, every open non-recurring item from the last 30 days is marked `rolledTo` on its old day and copied onto today with `rolled + 1` (`ensureToday` / `rollInto`). Close day does the same into tomorrow and stamps `closedAt`. Lock plan stamps `plannedAt`; the Tasks tab reports how often that happened before `targets.planBy` (07:30).
- Recurring templates live in the settings doc as `taskTemplates` (`id, title, lane, q, block, est, days[0-6], link, since, paused`) and are materialized onto their weekday once (`materialize`). A missed recurring task stays on its day as a miss; it never rolls.
- Timer: one running at a time; every run is kept in `timer.log` as `{s, e}` (start/end ms) and summed into `timer.ms`; check-off with a timer fills `actual`.
- Lanes: Body, Islam, Family, Home, Money, Ock Spot, Upsurge, Build. BOSS was merged into Ock Spot on 2026-10-18; `TASK_LANE_ALIASES` in `core/config.js` maps old lane names on read (`laneOf`).
- The Tasks tab has its own week strip (`tasksWeekHTML`, `tkSel` / `tkWeek`): any day up to 4 weeks ahead can be opened and planned; past days are read-only for adding. Future days show a planned-count badge.
- Quick-add is text only: after the item is saved with defaults, `autoSort` asks Claude (the `sample` capability, `modelTier: complex`, JSON) for lane, quadrant, block, estimate and link, then updates the item with `sortedBy: 'claude'` unless he already edited it. No runtime or a bad answer = the defaults stay.
- Logic: `features/tasks.js` (data, Today card, Tasks tab, task sheet), sync in `core/store.js` (dirty keys `tasks:YYYY-MM-DD` share the days queue), normalizers in `core/state.js`, Coach tools `tasks` and `task_templates` in `features/coach.js`, export adds `tasks` to data.json and `tasks.csv`.

## Salah (prayer times and the rawatib tracker)

Prayer times are computed on the device in `core/salah.js` from the solar
equations (no network, no library): ISNA angles (Fajr and Isha 15°), Maghrib
at sunset, Dhuhr a minute past the zenith, Asr standard or Hanafi. The place
and method live in the settings doc's targets: `lat`, `lng`, `place`,
`fajrAngle`, `ishaAngle`, `asrHanafi` (defaults: Staten Island, 15/15,
standard). Times follow the device clock, so travelling only needs the
coordinates changed (Coach: `set_targets`). `test/salah.mjs` checks a year of
dates against the adhan library's values (within a minute).

- Today tab, `#salah` card (`features/salah.js`, `css/salah.css`): the next
  prayer with a live countdown, the six times on one timeline with a moving
  "now" marker and the current window highlighted, Jumuʿah on Fridays, and the
  start of the last third of the night. Past days show their times; future days
  show times with the chips locked.
- HUD: the next prayer and the time to it, in the slot the wall clock used.
  `salahTick()` moves the countdown and marker every 30 s and re-renders when a
  new prayer window starts.
- Rawatib: five chips for the 12 daily sunnah rakʿāt (Fajr 2 before, Dhuhr 4
  before, Dhuhr 2 after, Maghrib 2 after, Isha 2 after), stored on the day doc
  as `m.rawatib` (array of keys). All five logged checks the Sunnah prayers
  habit through `mutateDay` (same XP, sweep and promotion path as the check
  button) and sets `m.rawatibAuto`; dropping below five again unchecks the
  habit only if that automatic check still holds it. A hand check is left
  alone; a hand uncheck clears the flag. `days.csv` gets a `rawatib` column.
- Coach: the live data carries today's times, the current and next prayer and
  the rawatib state; the `salah` tool reads times for any date and logs or
  removes rawatib (`done` / `undone` keys); `set_targets` takes the location.

## Wind-down (Today, Isha → bed)

`features/winddown.js`. From Isha, or an hour before the bed target if that is
earlier, until the night's bedtime is logged, the first card on Today counts
down to the target for the night (`targets.bed`, `friBed`, `satBed`, or a
planned late night), turns red past it, marks the screens-off checkpoint 30
minutes before, and shows the next Fajr and the sleep still available. "In bed
now" writes `m.bed` (this minute) on the wake date, which is where the check-in
and the Coach put bedtimes, so `commitMetrics` scores Bed on time exactly as
before; the toast has Undo. After midnight the card still belongs to last night
until Fajr. A 30-second tick keeps it live.

### "Life happens" passes (Bed on time)

Bed on time has two passes a week: its habit record carries `restPerWeek: 2`,
`restFull: true` (a declared pass pays the full 20 and counts for the sweep)
and `restManual: true` (only a declared pass spends one; a silent miss is a
miss, as before). `normalizeSettings` gives an older saved doc the three flags
once. The Wind-down card shows "Life happens · n of 2 left this week" and
toggles the night's `rest.sleep` through `toggleRest('sleep', null, night)`;
the habit row calls the same thing a pass and shows "Life happens · +20"; the
settings sheet labels the number "Life-happens passes a week"; the Coach uses
`set_habit sleep rest`. Passes reset with the week (Monday).

## Google Calendar (Today card + task sheet)

`features/calendar.js`, through the `mcp` capability with the viewer's own
Google Calendar connector (calls run as the viewer; the page never sees a
token). Today shows today's events from a `watchTool` on `list_events` (cached
a minute, refreshed every 5 minutes, re-registered at midnight): all-day chips,
earlier events folded, the live one marked Now, the next one with a countdown.
A watch cannot ask for consent, so the first time the card shows one button
whose `callTool` asks; every error code gets its own copy (reconnect, add the
connector, declined). The task sheet's "Add to Calendar" creates an event
(`create_event`: title, next quarter hour today or the block's usual start on
another day, the estimate or 30 minutes) and stores the event id as `task.cal`
so the button reads "On calendar" afterwards. Without the capability (a local
copy, the harness without the fake) the card and the button do not exist.
`test/fake-runtime.js` serves a fake connector when the config carries
`mcpEvents`, so the harness exercises both paths.

## Gym mode (lift sheet)

`features/gym.js`. A rest timer with 1:30 / 2:00 / 3:00 quick picks: tap the
dial to start or pause, it chimes (WebAudio), flashes the screen and vibrates
where the phone allows at zero, floats as a pill at the bottom of the page while
the sheet is closed, and the lift-saved toast offers to start it. Plate math
turns the total loaded (both sides, no bar, his convention) into plates per
side, with a bar option. A screen wake lock holds while the sheet is open or a
rest is running.

## Theme follows the sun

`features/theme.js`. By default the page is light from sunrise (Shuruq) to
Maghrib and dark from Maghrib to sunrise, using the same prayer-time engine and
location, re-checked every 30 s. Settings has a Theme row: Auto (sun), Light,
Dark, System; the choice is kept on the device (`localStorage` `gol-theme`) and
written to `<html data-theme>`, which the stylesheets already honour
(`data-theme="light"` beats a dark system setting and vice versa; System removes
the attribute). The harness switches the pref to System before its light/dark
screenshots so the emulated colour scheme is what gets shot.

## Ambient layer

`css/fx.css`, "ambient v2": 16 ki motes in the habit colours rising on their own
loops, 3 meteors on long staggered cycles, two slow orbit rings behind the belt
card. `render()` sets `data-sweep="1"` on `<html>` when today is a clean sweep,
which turns the aurora, motes and rings gold. Everything ambient is off in calm
mode and under `prefers-reduced-motion`.
