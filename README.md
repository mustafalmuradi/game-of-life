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

## Rules for changes to `src/`

1. One file, one job. A tab's code lives in its feature file.
2. Imports point down: `app.js` → `features/` → `core/` → the runtime.
3. State that more than one file changes lives in `core/state.js`.
4. Run the harness before publishing. Publish by republishing the artifact
   with `src/index.html` as the page and `src/css`, `src/js` as its files.
