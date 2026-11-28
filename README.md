# Game of Life

Mustafa's habit, strength, health, salah and build tracker. It runs as a Claude artifact
with a per-user database, a signed-in viewer, and a built-in coach that can read
and write the tracker through tools.

## Layout

| Path | What it is |
| --- | --- |
| `legacy/index.html` | The single-file v2 app, frozen at the module split (Oct 2026). It is an archive now: features land in `src/` only. `npm run test:legacy` still runs the two side by side for the features both have. |
| `src/` | v3: the same app split into modules. `index.html` is the shell, `css/` one stylesheet per feature, `js/core/` shared code, `js/features/` one file per tab, `js/app.js` the composition root, `img/` the art. |
| `art/` | How the art was made: the manifest of every picture (prompt, Higgsfield job, settings), the generation and build scripts, and `gallery.html`, a page showing every emblem in every state. Not published with the app. |
| `docs/` | `ASSETS.md` (the art: what ships, how the page uses it, how to add more) and `APP-RELEASE.md` (what has to change before this ships as an app). `CHANGELOG.md` sits at the root. |
| `test/` | The golden-master regression harness (see below), plus `salah.mjs` (prayer-time engine against reference values), `stale-cache.mjs`, and one file per feature that needs its own walk (`theme-flip.mjs`, `header-fit.mjs`, `ambient-charge.mjs`, `hq-reorder.mjs` and the others in `npm test`). |
| `tools/` | `publish-prep.py` builds `dist/` for the artifact (`npm run dist`). The split scripts (`split-*.py`, `check-cascade.py`, `reassemble-js.py`) are the one-off migration from `legacy/` and are kept for the record. |

The architecture plan lives in the Claude doc "Game of Life v3 Architecture".

## How `src/js` is laid out

| Layer | Files | Rule |
| --- | --- | --- |
| `app.js` | events + boot | The composition root. The only file that imports everything. |
| `features/` | `today`, `salah`, `winddown`, `calendar`, `tasks`, `progress`, `lifts`, `gym`, `body`, `build`, `coach` | One file per tab or card. Each tab calls `registerTab()` when it loads and keeps its own UI flags behind small exported actions. |
| `core/` | `config`, `utils`, `state`, `xp`, `strength`, `salah`, `stats`, `store`, `effects`, `svg`, `art`, `render`, `sheets` | Shared by every tab, imports nothing above it. `store.js` is the only file that talks to the database. |

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
node test/theme-flip.mjs   # the header light/dark button (part of npm test)
node test/ambient-charge.mjs   # the backdrop's charge and the ring (part of npm test)
node test/header-fit.mjs   # the header at every width, real fonts (part of npm test; see "Header fit")
```

The app is served locally and driven through a 105-step scenario with a seeded
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
   `dist/js`, `dist/tools`, `dist/img` as its files. The artifact declares these runtime
   capabilities (restate all of them whenever `capabilities` is passed):
   `assets`, `db`, `downloads`, `sample` (`images: true`), `user`, and `mcp` with
   `servers: [{server: "Google Calendar", tools: ["list_events", "create_event"]}]`.
5. Which `index.html` to publish depends on the tool. One that wraps the page in its own
   skeleton takes `dist/index.html` (content only). One that stores each file exactly as
   given (`publish_files` on the claude-artifacts server does) must get **`src/index.html`**,
   the complete document. Given the content-only file it publishes a page with no doctype,
   no viewport and none of the base styles (this happened for one minute on Nov 26 2026).
   After every publish, read the live page and check that it starts with `<!doctype html>`.
   Publish only the files that changed; the rest are kept. When images are new, publish them
   first and the code last, so the page never asks for a picture that is not there yet.

## Art: holo emblems and the Salah sky (Nov 26 2026)

Habits, the overall rank, trophies, badges, power forms and lift equipment each have an emblem, and the Salah card has a sky for each prayer window. Every emblem is two registered pictures: **glass** (not earned yet) and **solid** (earned). A habit turns solid when it is done; the overall rank on the belt card and the power form on Lifts loop glass → solid → glass every 6 seconds. `core/art.js` holds the registry, the id mapping (`habitArt`, `trophyArt`, `liftArt`, `beltArt`, `powerArt`, `skyFor`) and `emblem()`, which returns the two-layer markup or `''`; every caller keeps its old markup next to it and adds `has-art`, so a picture that is missing or fails to load leaves the page as it was. `css/art.css` holds the wave (a radial mask on two registered custom properties), where each emblem sits, and the sky. The page rebuilds its cards on every tap, so `emblem()` starts each animation where its clock already stands (`--emb-at`); that is what keeps the loop unbroken. Reduced motion stops everything; Calm mode stops the loops and keeps the one wave on a tap. Files are `src/img/art/<id>.g|s[.lg].webp` and `src/img/sky/<name>.webp`. The full guide, including how to generate and add an emblem, is `docs/ASSETS.md`; `art/gallery.html` shows them all.

## Power levels (Lifts tab)

The strength rank is themed on Dragon Ball Z (names that have to change before a public release: `docs/APP-RELEASE.md`): `MOOSE_RANKS` in `core/strength.js` maps strength level to a form, paced for about a year at ~1,400 XP/week (1 Saiyan Warrior, 4 Kaioken, 9 Super Saiyan, 15 Super Saiyan 2, 22 Super Saiyan 3, 30 Super Saiyan Blue, 40 Ultra Instinct). Each entry's third element lists the levels where its 3 stages start; `mooseStage(L)` returns `{form, stage, next}` for the stage row under the title, the ladder and the level-up toast. Per-lift tiers (`TIERS`, est. 1RM gain): Weighted Gi, Gravity Room +5%, Time Chamber +10%, King Kai's Planet +20%, Over 9,000 +35%. Only labels changed; tier keys (`bronze`…`diamond`) and their colors are unchanged.

## Layout: three sections, two views each (Oct 2026)

The main bar is **Headquarters · Body · Progress**. Under it, a switch shows the section's two views: Headquarters = Today | Tasks, Body = Body | Lifts, Progress = Progress | Build. `SECTIONS` / `sectionOf()` in `src/js/core/render.js` hold the mapping. `state.tab` is still the view id (today, tasks, body, lifts, progress, build), so the views, Coach's `navigate` tool and the data are unchanged; tapping a section opens its home view. Section buttons carry `data-sec`, view buttons keep `data-tab`. The harness's `tab()` helper taps the section, then the view.

## Life happens passes (declared only)

A habit with `restManual: true` only spends a pass when he declares it; a silent miss still breaks the streak. Those passes are labelled **Life happens** everywhere (button, tag, settings, undo toast) via `restWords()`. Bed on time: 2 a week at full points (`restFull`). Eat enough (Oct 30, 2026): 1 a week, streak only, 0 XP, so its ladder scales to 6 days a week. Coach's manage_habit takes `restManual`.

Money (Nov 6, 2026) keeps its Sunday full-points rest *and* gets `lifePerWeek: 1`: a separate declared-only pass, any day, stored as `rest[id] = 'life'`, streak and sweep held, 0 XP. Counted in `stats.lifeUsed`; it does not shrink the belt ladder (it's an emergency valve, not a scheduled day). Coach: `set_habit` status `life`, manage_habit `lifePerWeek`.

## Coach tool routing (Nov 25 2026)

The runtime caps how many tools one Coach call may offer (`sample.limits().tools.maxCount`). The Coach has 20; the old code sent `COACH_TOOLS.slice(0, maxCount)`, so under a lower cap the last-added tools (`late_night`, `tasks`, `task_templates`, `salah`) never reached the model, and on Nov 25 it answered "I have no late-night planning tool". Now `pickTools(cap, cur, recent)` sends every tool when they fit; otherwise it ranks: tools his new message cues (`TOOL_CUES` keywords), then the core (`update_day`, `set_habit`, `read_days`), then tools the last exchange cues (so a "yes" follow-up keeps its tool), then the rest by daily use (`TOOL_PRIORITY`: tasks and late nights near the top, export and storage status last). The tools left out are named in the turn (`[...not loaded for this one: ...]`) so the Coach asks him to name it again instead of claiming the feature doesn't exist. Test: `test/coach-tools.mjs` (routing at caps 16 and 8, plus the real Coach UI planning a late night on a fake runtime capped at 16; the fake runtime takes `toolCap` and `logInput`).

## Month view (Headquarters week strip, Nov 2026)

Tap anywhere on the week strip (its title or any day) and it expands in place into a WHOOP-style month (`src/js/features/month.js`); the week arrows still page week by week. The color lives on each day's number (Mustafa's rule, Nov 24): green = clean sweep, yellow = 1-3 habits missed, red = 4+ missed. Missed is `byDate[d].total - done`, so logged rest days, light days and passes count as done, exactly like the sweep. Today sits in a soft disc and stays neutral until it is a clean sweep (or the day ends); the selected day is underlined. Future days up to the week arrows' reach (Sunday of the week 4 weeks out, `planLimit()`) are grey and tappable for planning, with a dot when tasks are planned; days before the first logged day (`stats.start`) are inert. Monday-first, so each row is one tracker week. `mv-prev` / `mv-next` page from the first logged month to the furthest plannable month; tapping a day (`mv-day`) selects it, moves the week strip to it and folds back; the title (`month-close`) folds back without changing the day. The title shows the month's sweeps ("plan ahead" for a month still to come). Colors are the `--mc-*` tokens (darker in light mode for contrast). The calendar briefly lived on Progress (Nov 24) and moved here the same morning. Unit check: `test/month-view.mjs`.

## Medical Rest (Train, Coach-only, Nov 9 2026)

For a real injury or illness that makes training unsafe (a limp, sharp pain, swelling, an illness flag with symptoms, a doctor's or PT's orders). Stored as `rest.workout = 'medical'` with the reason on the day as `m.medical = {why, at, by}`. It holds the Train streak and the day sweep, pays 0 XP, does not spend a weekly rest day, and stays out of the Body tab's full-rest count (shown as "medical rest n"). Cap: `medicalPer30` per habit (Train 3, set by `normalizeSettings`) in any rolling `MEDICAL_WINDOW` (30) days; a 4th inside the window breaks the day. Only the Coach (or Claude in chat) sets it: `set_habit workout medical` with `why`; the page shows "Medical rest · 0 XP" and the reason but has no button for it and no Undo (Coach `undone` clears it and the reason; `done` replaces it). Logic: the `medical` branch in `core/stats.js`, `isMedical` / `medicalLeft` in `core/state.js`, the Train row in `features/today.js`, `dayKind` in `features/body.js`, the MEDICAL REST rules in `features/coach.js`. Tests: `test/medical-rest.mjs` (engine + Coach guards) and `test/medical-ui.mjs` (Today row), both in `npm test`.

## Full-points rest days, capped per week

A habit with `restFull: true` pays full base XP for a declared (non-light) rest day. `restFullMax` (0-3, unset = no cap) limits how many of those pay per week; the rest still keep the streak but score 0. Train is set to `restFull: true, restFullMax: 1`: the one full rest day in the 5 strength + 1 light + 1 rest program pays +20, a second full rest in the same week keeps the streak at 0 XP, and the light day keeps its own light XP. `byDate[d].full` lists the habits whose rest paid that day. `lightFull: true` makes a paid light day earn full base XP (+20) instead of `LIGHT_XP` (+10); Train has it on (Oct 27, 2026: light days are programmed shoulder rehab), still capped by `lightPerWeek`. Habit ladder calibrated Oct 29, 2026: 60 XP for the first stripe, +30 each after (was 80 + 45), so a habit done every day at base XP earns each belt as its time-in floor opens (Blue ~30 days, Purple ~98, Brown ~203, Black held to 365), in step with the overall belts. Streak tests and floors unchanged. Belt ladders only shrink for passes that pay nothing (`unpaidPasses` in `xp.js`; a `restFull` habit with no `restFullMax` pays every pass, so Money and Bed on time use the full 7-day ladder): Train = 3 passes - 1 paid full rest - 1 paid light day = 1, so it scales to 6 days a week (51 + 26 per stripe, Blue = 12 sessions). A belt earned before a rebalance is kept with `levelFloor` on the habit (Train: 5 = Blue): the level holds and the bar shows total XP against the next stripe until XP catches up. Scoring is recomputed from history, so it applies to past weeks too. `test/rest-full.mjs` covers it (runs in `npm test`).

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
earlier, until the night's bedtime is logged, a card on Today, right under the
habits (it was the first card until Nov 26 2026), counts
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

### The light/dark button in the header (Nov 26 2026)

`#btn-theme`, between Coach and settings, on every screen. One tap shows the
other look at once. It is a flip, not a setting:

- The flip is stored as `{mode, until, edge}` under `localStorage`
  `gol-theme-flip`. `until` is the next time the sun crosses the horizon: today's
  sunrise, today's Maghrib, or tomorrow's sunrise (`nextSunEdge()`, same engine
  and location). The standing setting (`gol-theme`) is not touched.
- It ends at `until` (the 30 s ticker checks, and so does the app when it comes
  back to the foreground), when the button is tapped again, or when a Theme chip
  is picked. Then the standing setting decides again: with Auto that is the sun,
  with Light, Dark or System that setting comes back.
- While it is on, `<html data-theme-flip>` holds the flipped look: the button
  keeps an accent edge, and the Theme row in Settings says until when
  ("Dark for now, until Maghrib, 6:29 PM. Then Auto · sun again.").
- The icon shows where a tap goes: a moon on a light page, a sun on a dark one.
  The `aria-label` says the same ("Switch to dark mode").
- If the browser refuses to save, the flip holds in memory for the visit. A
  stored value that is not a flip (or ends more than 36 hours away) is ignored
  and removed.

`test/theme-flip.mjs` walks all of it on a frozen clock that the test moves.

### Header fit

The name, Coach, the light/dark button and settings share one line from 280 px
up. `css/fx.css` ("header fit") sets the name's size from the viewport width
with `clamp()`: on a phone, 22 px from 416 px up, 19.2 px at 390 px, 17.4 px at
375 px. At 460 px and below the gaps tighten; at 371 px and below the Coach
label goes and the name grows back into the room; the "Mustafa" pill shows from
561 px. The viewport width counts a scrollbar that stays on screen, which a
desktop browser may have and a phone never does, so where the pointer is a mouse
the rule leaves 17 px for one (`--sb`) and the name comes out about 2 px smaller
in a narrow window. The numbers in that block come from measuring Orbitron 800,
so a change to a button, a gap or the font changes them.

`test/header-fit.mjs` sweeps every width up to 600 px with the real fonts, as a
phone (from 280 px) and as a desktop browser with its scrollbar on screen (from
300 px), and fails if the name wraps, anything overlaps, or a button changes
size. It needs the fonts: they load from Google Fonts as in the live app, or
from a stylesheet named in `GOL_FONT_CSS` when there is no network. Without
them it prints SKIPPED and checks nothing.

The main harness cannot see a fit problem. It blocks the network, so it lays
text out in a fallback font that is narrower than Orbitron, and it is a desktop
browser, so its screenshots show the name at the desktop size. Before this
change the name wrapped onto two lines at 323 px and below, from 351 to 376 px
(a 375 px iPhone) and from 441 to 471 px, and no test noticed.

## Ambient layer

`css/fx.css`, "ambient v2": 16 ki motes in the habit colours rising on their own
loops, 3 meteors on long staggered cycles, two slow orbit rings behind the belt
card. `render()` sets `data-sweep="1"` on `<html>` when today is a clean sweep,
which turns the aurora, motes and rings gold. Everything ambient is off in calm
mode and under `prefers-reduced-motion`.

### Ambient charge (Nov 27 2026)

The backdrop charges up with the day. `render()` sets `--charge` on `<html>`:
today's habits done out of those due, 0 to 1. It is always the device's today,
whichever day is on screen. `css/fx.css`, "ambient charge", reads it:

- **Motes and meteors.** Each has an `--at` (handed out in `app.js`) and shows
  once the charge reaches it. 6 motes and 1 meteor at 0; the 16 motes from before
  by one half and the 3 meteors from before by two thirds; 10 faster motes (.55
  to 1) and 2 more meteors (.85 and 1) after that. The late ones take their
  numbers from their index, not from `Math.random`: the harness seeds it, and
  extra calls at boot would shift every id generated afterwards.
- **Second aurora.** `.ambient::before` fades in over the first, at opacity
  `charge × --charge-glow`. The orbit rings go from .2 to .55.
- **Gold.** On a clean sweep `.ambient::after` fades in to `--charge-gold` and
  the neon aurora steps back to 18 %, so the gold stays clean.
- **The ring.** `shockwave(at, gold)` in `core/effects.js`. `mutateDay` calls it
  when a day's done count goes up: one ring while under two thirds of that
  day's habits are done, two from there, gold on the check that completes the
  day. It starts on the habit's
  check button, whose place is read before `render()` replaces the row. With
  no button to start from (In bed now, a check-in that scores a habit) it
  starts where the finger just went down, and in the middle of the screen when
  there was no tap in the last second and a half (the Coach did it). It sits over the
  page and under the sheets (`z-index:45`), and is a 360 px box scaled up, so
  only transform and opacity move. A check on a past day sends a ring too, as
  strong as that day is full, and leaves the charge alone.
- **Off switches.** Calm mode and reduced motion hide `.ambient`, so the charge
  look goes with the rest. The ring is a tap effect: Calm mode keeps it, and
  under reduced motion none is made.

The harness snapshot carries the charge at every step (`style=--charge: …` on
its html line). `test/ambient-charge.mjs` covers the levels, the ring and the
off switches with live motion.

### Headquarters habit order (Nov 2026)

`settings.hqOrder` is a list of habit ids, top to bottom, set from the **Reorder habits** button under the Headquarters habit list (drag handles, arrow keys on a focused handle, Done / Cancel). Only the Today list follows it (`hqSort` in `features/today.js`); progress, rank sheets and the Coach keep the habits array order. Habits missing from the list (new ones) go last. Tested by `test/hq-reorder.mjs` (mouse, touch, keyboard, cancel, done, reload).
