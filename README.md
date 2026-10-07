# Game of Life

Moose's habit, strength, health and build tracker. It runs as a Claude artifact
with a per-user database, a signed-in viewer, and a built-in coach that can read
and write the tracker through tools.

## Layout

| Path | What it is |
| --- | --- |
| `legacy/index.html` | v2: the single-file artifact exactly as it was before the split. Kept as the regression baseline. |
| `src/` | v3: the same app split into modules. `index.html` is the shell, `css/` one stylesheet per feature, `js/core/` shared code, `js/features/` one file per tab, `js/app.js` the composition root. |
| `test/` | The old-vs-new regression harness (see below). |
| `docs/` | The architecture plan lives in the Claude doc "Game of Life v3 Architecture"; `docs/` holds anything exported from it. |

## Running the regression harness

```
npm install
node test/harness.mjs --old legacy --new src --shots
```

Both directories are served locally and driven through the same 60-step
scenario with an identical seeded fixture, a frozen clock, seeded `Math.random`
and a fake `window.claude` (database, user, coach). After every step the DOM,
localStorage and the cloud-write log must be identical. `--shots` adds
light/dark screenshots of every tab with a pixel diff. Output lands in
`test/out/`.

Proving the harness itself: `node test/harness.mjs --old legacy --new legacy`
must pass with every step identical.

## Rules for changes to `src/`

1. One file, one job. A tab's code lives in its feature file.
2. Imports point down: `app.js` → `features/` → `core/` → the runtime.
3. State that more than one file changes lives in `core/state.js`.
4. Run the harness before publishing. Publish by republishing the artifact
   with `src/index.html` as the page and `src/css`, `src/js` as its files.
