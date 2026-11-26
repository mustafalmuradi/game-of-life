# Before this ships as an app

Game of Life runs today as one person's Claude artifact. This is the list of things that have to change before it
goes out to other people or into a store. It is a working list: add to it, and strike a line when it is done.
Started Nov 26 2026.

## Blockers

| # | What | Where | What it takes |
| --- | --- | --- | --- |
| 1 | **Dragon Ball names.** The Lifts tab names its forms and tiers after Dragon Ball, which belongs to someone else. | `MOOSE_RANKS` in `src/js/core/strength.js` (Saiyan Warrior, Kaioken, Super Saiyan, Super Saiyan 2, Super Saiyan 3, Super Saiyan Blue, Ultra Instinct). `TIERS` in the same file (Weighted Gi, Gravity Room, Time Chamber, King Kai's Planet, Over 9,000). Lift badges "Time Chamber" and "Super Saiyan 2" (`liftBadges`, same file). The tier help line and the button label "Show the Saiyan ladder" in `src/js/features/lifts.js`. The "Power levels" section of `README.md`. | New names for 7 forms and 5 tiers, then a text change in those places. No art change: the form emblems are original crystals picked by position (`powerArt(i)`), and the tier keys (`bronze` … `diamond`) stay. Saved data holds levels and keys, not names, so nothing migrates. |
| 2 | **It needs the Claude runtime.** Sign-in, the database, the Coach, Google Calendar, exports and photo storage all come from `window.claude`. | `window.claude.use(...)` for six capabilities: `db`, `user`, `sample`, `mcp`, `downloads`, `assets`. `src/js/core/store.js` is the only file that talks to the database. | A standalone app needs its own accounts, database, model access for the Coach, Google sign-in for Calendar, file export and photo storage. `store.js` and the Coach's call to the model are the two seams. |
| 3 | **It is built for one person.** | The starting habits, their rules and ladders; the Staten Island default for prayer times; the task lanes (Ock Spot, Upsurge and others); the Coach's rules, which are written about Mustafa. | A first-run setup that asks for habits, place and lanes, and Coach rules that read the person's own settings. |

## Check before release

| What | Why | Where |
| --- | --- | --- |
| Picture rights | The art is AI-generated on Higgsfield. Its terms allowed commercial use and said outputs are not exclusive when read on Nov 26 2026. Read them again, and keep `art/manifest.json` as the record of how each picture was made. | `docs/ASSETS.md`, "Rights" |
| Fonts | Orbitron, Space Grotesk and JetBrains Mono load from Google Fonts. They are open-licensed; a store app should bundle them instead of loading them from the network, and carry their licence files. | `src/index.html` |
| Health wording | The app shows recovery zones, training advice, calorie and protein targets, a nicotine habit and "Medical Rest". Stores review health claims, and the Coach gives advice. It needs a clear "not medical advice" line and a look at each store's health rules. | Body, Lifts, Coach |
| Old nickname in the code | Mustafa no longer goes by "Moose". It survives in identifiers (`MOOSE_RANKS`, `mooseRank`, `mooseStage`: 17 lines in `src/`). Nobody sees them, but they should go when the forms are renamed. | `src/js/core/strength.js`, `src/js/features/lifts.js` |
| Motion on other phones | The emblem loops are smooth on Mustafa's iPhone (Nov 26 2026) and held 60 fps in desktop Chrome. Still to check: a mid-range Android, and battery use over a full day. Calm mode is the off switch. | `src/css/art.css` |
| This repo is public | Code, art and this list are visible to anyone. Account ids and links to the full-size art masters are kept out on purpose. Decide whether the repo stays public once the app is a product. | GitHub settings |

## Already in good shape for a release

- One job per file, imports pointing one way, and a 105-step regression harness with a recorded baseline.
- Every piece of art has a fallback: the app works with no pictures at all.
- The art has no people, no text and nothing borrowed, so the pictures themselves carry no third-party claim.
- All data access is behind `store.js`, and scores are recomputed from the day records, never stored.
