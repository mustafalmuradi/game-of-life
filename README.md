# Game of Life

Moose's habit, strength, health and build tracker. It runs as a Claude artifact
with a per-user database, a signed-in viewer, and a built-in coach that can read
and write the tracker through tools.

## Layout

| Path | What it is |
| --- | --- |
| `legacy/index.html` | The single-file version of the app. Feature changes land here and in `src/` together, so the harness keeps proving the modules behave exactly like it. |
| `src/` | v3: the same app split into modules. `index.html` is the shell, `css/` one stylesheet per feature, `js/core/` shared code, `js/features/` one file per tab, `js/app.js` the composition root. |
| `test/` | The old-vs-new regression harness (see below). |
| `tools/` | The split itself, as scripts: `split-css.py` and `split-js.py` regenerate `src/` from `legacy/index.html`; `check-cascade.py` and `reassemble-js.py` prove what changed. |

The architecture plan lives in the Claude doc "Game of Life v3 Architecture".

## How `src/js` is laid out

| Layer | Files | Rule |
| --- | --- | --- |
| `app.js` | events + boot | The composition root. The only file that imports everything. |
| `features/` | `today`, `progress`, `lifts`, `body`, `build`, `coach` | One file per tab. Each calls `registerTab()` when it loads and keeps its own UI flags behind small exported actions. |
| `core/` | `config`, `utils`, `state`, `xp`, `strength`, `stats`, `store`, `effects`, `svg`, `render`, `sheets` | Shared by every tab, imports nothing above it. `store.js` is the only file that talks to the database. |

`npm run check` prints the cascade proof and the line-by-line difference between
the modules and the original script (98.7% of lines moved verbatim; the rest is
the import/export plumbing, the tab registry, and the per-tab actions).

## Running the regression harness

```
npm install
npm test              # legacy vs src, with screenshots
npm run test:local    # the same without a Claude runtime (local mode)
npm run test:self     # legacy vs legacy: must be all identical
```

Both directories are served locally and driven through the same 66-step
scenario with an identical seeded fixture, a frozen clock, seeded `Math.random`
and a fake `window.claude` (database, user, coach). After every step the DOM,
localStorage and the cloud-write log must be identical. `--shots` adds
light/dark screenshots of every tab with a pixel diff. Output lands in
`test/out/`.

Proving the harness itself: `node test/harness.mjs --old legacy --new legacy`
must pass with every step identical.

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
4. Run the harness before publishing. Publish by republishing the artifact
   with `src/index.html` as the page and `src/css`, `src/js` as its files.

## Power levels (Lifts tab)

The strength rank is themed on Dragon Ball Z: `MOOSE_RANKS` in `core/strength.js` maps strength level to a form, paced for about a year at ~1,400 XP/week (1 Saiyan Warrior, 4 Kaioken, 9 Super Saiyan, 15 Super Saiyan 2, 22 Super Saiyan 3, 30 Super Saiyan Blue, 40 Ultra Instinct). Each entry's third element lists the levels where its 3 stages start; `mooseStage(L)` returns `{form, stage, next}` for the stage row under the title, the ladder and the level-up toast. Per-lift tiers (`TIERS`, est. 1RM gain): Weighted Gi, Gravity Room +5%, Time Chamber +10%, King Kai's Planet +20%, Over 9,000 +35%. Only labels changed; tier keys (`bronze`…`diamond`) and their colors are unchanged.

## Daily tasks (Tasks tab + the Tasks card on Today)

Pure data, no XP. One document per day at `tracker/tasks/YYYY-MM-DD`: `{date, schema:1, plannedAt, closedAt, items:[...]}`. Each item: `id, title, lane, q (1-4 Covey quadrant), block (am deep work / pm physical / eve), est, actual (minutes), link {t: node|habit|win, id, label}, note, src (page|coach|sched|recur|rollover), tpl (template id), origin (date first planned), rolled (times pushed), createdAt, startedAt, doneAt, droppedAt, dropWhy, rolledTo, timer {on, ms}`. Nothing derived is stored; `taskStats()` recomputes everything from the docs.

- Rollover: on the first render of a new day, every open non-recurring item from the last 30 days is marked `rolledTo` on its old day and copied onto today with `rolled + 1` (`ensureToday` / `rollInto`). Close day does the same into tomorrow and stamps `closedAt`. Lock plan stamps `plannedAt`; the Tasks tab reports how often that happened before `targets.planBy` (07:30).
- Recurring templates live in the settings doc as `taskTemplates` (`id, title, lane, q, block, est, days[0-6], link, since, paused`) and are materialized onto their weekday once (`materialize`). A missed recurring task stays on its day as a miss; it never rolls.
- Timer: one running at a time; stopping accumulates `timer.ms`; check-off with a timer fills `actual`.
- Logic: `features/tasks.js` (data, Today card, Tasks tab, task sheet), sync in `core/store.js` (dirty keys `tasks:YYYY-MM-DD` share the days queue), normalizers in `core/state.js`, Coach tools `tasks` and `task_templates` in `features/coach.js`, export adds `tasks` to data.json and `tasks.csv`.
