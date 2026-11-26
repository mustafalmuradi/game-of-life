# Changelog

What changed in the app, newest first. Started Nov 26 2026; for anything earlier, read `git log` and the dated
sections of `README.md`.

## 2026-11-26 · Art v1: holo emblems and the Salah sky

The first pictures in the app. Every emblem exists twice, as holographic glass (not earned yet) and as a solid
object (earned), and the page moves between the two. Guide: `docs/ASSETS.md`.

### Added

- **Today**
  - Each habit's check circle holds its emblem: glass until the habit is done, then a wave turns it solid and
    the check mark becomes a small badge on the corner.
  - The "Next:" trophy line shows that trophy, still glass.
  - The "Trophy unlocked" screen shows the trophy at full size as the wave turns it solid.
  - The Salah card's backdrop is the sky of the prayer window that is open: dawn, day, afternoon, sunset, night.
- **Every screen**: the belt card carries the belt of the overall rank. It loops glass → solid → glass every
  6 seconds.
- **Lifts**
  - The power level hexagon is replaced by the current form (seven crystal forms, one per rung), looping the
    same way, with the level on a plate under it.
  - The ladder is one column with each form's emblem: reached forms solid, the ones ahead glass.
  - Every logged exercise shows its equipment (dumbbell, rope, bench, plate, band and so on).
- **Progress**: the Trophy Room and the badges use the same emblems, glass until earned.
- `src/js/core/art.js`, `src/css/art.css`, `src/img/` (64 emblems, 5 skies, 203 files, 3.9 MB).
- `art/`: the manifest of every picture (prompt, Higgsfield job, settings), the generation and build scripts, and
  `art/gallery.html`, a page that shows every emblem in every state.
- `docs/ASSETS.md`, `docs/APP-RELEASE.md`, this file.

### Changed

- `tools/publish-prep.py` copies `src/img` into `dist/`; the artifact is published with `dist/img` as well.
- `test/harness.mjs` serves `.webp`. The baseline was re-recorded: against the old one, every step differs only
  by the emblem markup (checked by stripping it and comparing, 105 of 105 identical), and with the pictures
  removed every screenshot matches the old look.
- `nextTrophy()` in `xp.js` returns the trophy's key (`k`), so Today can show its emblem.

### Not changed

- Scoring, data, storage and the Coach. Tasks is untouched apart from the belt card every screen shares.
- With reduced motion nothing animates. Calm mode stops the loops and keeps the one wave on a tap.
- If a picture cannot load, the page shows what it showed before.

### Known

- The motion was checked in desktop Chrome (60 fps). It has not been checked on a phone yet.
- The Lifts tab still uses Dragon Ball names for forms and tiers. The new art does not depend on them.
  See `docs/APP-RELEASE.md`.
