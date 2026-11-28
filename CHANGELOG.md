# Changelog

What changed in the app, newest first. Started Nov 26 2026; for anything earlier, read `git log` and the dated
sections of `README.md`.

## 2026-11-27 · The backdrop charges up with your day

The backdrop used to look the same all day and turn gold on a clean sweep. Now it follows today's habits on the
way there. Guide: `README.md`, "Ambient charge".

### Added

- **Charge.** The backdrop reads today's habits done out of those due. Each check adds motes (26 at the top,
  where there were 16), brings meteors sooner (5 at the top, where there were 3), fades a second aurora in over
  the first and brightens the orbit rings. It follows today on every tab, whichever day is on screen.
- **The ring.** A habit that lands sends a ring from its emblem across the screen: one faint ring early in the
  day, two brighter ones once two thirds of the day is done, gold on the check that completes it. Unchecking
  sends none. When the habit lands without its own button being tapped, as with "In bed now", the ring starts
  where the finger went down.
- **Gold, cleaner.** On a clean sweep a gold aurora fades in and the neon one steps back. The gold sky from
  before is still there underneath.
- `test/ambient-charge.mjs`, in `npm test`: the levels, a real day from 6 of 9 to a clean sweep, where the ring
  starts, low charge, a past day, Calm mode, reduced motion, and "In bed now" as the last habit of the day.

### Changed

- **With nothing done yet the backdrop is calmer than it was**: 6 motes and 1 meteor, where there were always 16
  and 3, and dimmer orbit rings (.2, was .35). The 16 motes are back by half the day's habits and the 3 meteors
  by two thirds; past that it goes beyond the old look.
- The harness baseline was re-recorded. Against the old one, every step differs only by the charge value on its
  html line (checked by stripping it and comparing: 105 of 105 identical), and all twelve screenshots match.

### Not changed

- Calm mode and reduced motion still switch the whole backdrop off. The ring is a tap effect, like the emblem
  wave: Calm mode keeps it, reduced motion does not get one.
- Points, streaks, the clean-sweep confetti and toast, and everything on the cards.

### Known

- Published Nov 27 2026 in two steps: artifact version `1795837131-9d7b` (`css/fx.css`, `js/app.js`,
  `js/core/effects.js`, `js/core/render.js`, `js/features/today.js`), then `1795837446-2c82` (`js/core/effects.js`
  again, for the tap-point rule). `index.html` was not part of either, so the doctype check was not repeated.
  The live page was opened in desktop Chrome after each: it loads, and with 9 of 10 habits done that day the
  backdrop shows the charged look. No habit was tapped on the live page, so the ring has not been seen there.
- Before publishing it was looked at in desktop Chrome at phone size with a touch screen, in both looks. Not yet
  seen on an iPhone. The ring and the aurora layers move only transform and opacity, but the frame rate on a
  phone is not measured.
- A check on a past day sends a ring too, as strong as that day is full. It does not change the charge, which
  is today's.
- Found while in this code, and not changed: the floating "+XP" text after a check is placed at the top-left
  corner of the screen, not on the habit, because its anchor is read after the list has been redrawn. `main`
  did the same before this change.

## 2026-11-26 · Wind-down card moves under the habits

### Changed

- On Today the wind-down card ("In bed now") sits right under the habits and above the Tasks card. It was the
  first card on the screen. Order now: week strip, day score, Salah, calendar, habits, wind-down, Tasks.
- Only the card's place in `src/index.html` changed. When it shows, what it says and what its buttons do are the
  same.
- The baseline was re-recorded: every step differs only by where the card is (lifting it out of the old and new
  snapshots leaves all 105 identical).

### Known

- Published Nov 26 2026 (artifact version `1795734705-f94d`, one file: `index.html`, the complete document). The
  live page was read back and has the new order. Looked at in a phone-sized test build at 9 PM; not looked at on
  the live page with the card showing, and not on an iPhone.

## 2026-11-26 · Light/dark button in the header

A sun/moon button in the top bar, between Coach and settings, on every screen. One tap shows the other look at
once. Guide: `README.md`, "The light/dark button in the header".

### Added

- **The button** (`#btn-theme`). A moon while the page is light, a sun while it is dark: the icon shows where a
  tap goes.
- **A flip, not a setting.** The tap does not change the Theme setting. It lasts until the sun next crosses the
  horizon (sunrise or Maghrib, from the app's own prayer times), then the Theme setting decides again. With
  Auto · sun that means the page goes back to following the sun; with Light, Dark or System, that setting
  comes back.
- A toast says until when ("Dark until Maghrib, 6:29 PM"). While a flip is on, the button keeps an accent edge
  and the Theme row in Settings reads "Dark for now, until Maghrib, 6:29 PM. Then Auto · sun again."
- A second tap ends the flip ("Back to Auto · sun"). So does picking a Theme chip.
- The flip survives a reload (`localStorage` `gol-theme-flip`, this device only). If the browser refuses to
  save, it holds for the visit.
- `test/theme-flip.mjs` (day and night flips, reload, second tap, running out on the ticker and on wake-up,
  standing Light/Dark/System, blocked storage, junk in storage) and `test/header-fit.mjs` (the header at every
  width up to 600 px with the real fonts, as a phone and as a desktop browser with a scrollbar). Both run in
  `npm test`.

### Changed

- **The name is a little smaller on phones under 416 px wide**, to make room for a third button: 19.2 px on a
  390 px screen and 19.6 px on a 393 px one, where it was 22 px. From 416 px up it stays 22 px.
- At 460 px and below the header is tighter: 6 px between the buttons (it was 8), 8 px between the name and the
  buttons (it was 12), the Coach button 6 px narrower, and the name's letters a touch closer (.03em, was .04em).
- The Coach button drops its label at 371 px and below (it was 350 px). The "Mustafa" pill shows from 561 px (it
  was 441 px).
- On a desktop browser (mouse pointer) the name is sized as if a 17 px scrollbar were on screen, because the
  viewport width counts one: in a window 460 px wide or narrower it is about 2 px smaller than on a phone of the
  same width.
- The header's narrow-screen rules moved from `css/coach.css` to one block in `css/fx.css` ("header fit"), next
  to the rule that really sets the name's size. The `font-size:24px` rule that left `coach.css` never applied.
- The theme is checked when the app comes back to the foreground, not only every 30 seconds: a phone that slept
  through sunrise or Maghrib shows the right look at once.
- The baseline was re-recorded: against the old one, every step differs only by the new button's markup
  (checked by stripping it and comparing: 105 of 105 identical), and every screenshot differs only in the header
  band (compared with the same screens on `main`: no changed pixel below the top 90 px on any of the twelve, and
  page heights are unchanged).

### Fixed

- "GAME OF LIFE" wrapped onto two lines on screens 323 px wide and narrower, from 351 to 376 px (a 375 px
  iPhone) and from 441 to 471 px. It is one line at every width now.

### Not changed

- The Theme setting and its four choices, the colours of both looks, and everything below the header. With a
  flip never used, the page behaves as before.

### Known

- Published Nov 26 2026 (artifact version `1795733088-c2d9`, five files: `index.html`, `css/coach.css`,
  `css/fx.css`, `js/app.js`, `js/features/theme.js`). The live page starts with `<!doctype html>`. Checked on the
  live page with real data in desktop Chrome: one tap turned the dark page light ("Light until sunrise, 6:57 AM"),
  a second tap turned it back ("Back to Auto · sun").
- The page switches look in one step, with no fade. Only the button's icon animates (not with reduced motion).
- Before publishing it was checked in desktop Chrome with a phone-sized touch screen. The button has not been
  tried on an iPhone yet.
- The main harness lays text out in a fallback font because it blocks the network, so it cannot see text that
  does not fit. `test/header-fit.mjs` covers the header; the rest of the app has no such check.
- `test/header-fit.mjs` needs the real fonts (Google Fonts, or a stylesheet named in `GOL_FONT_CSS`). Without
  them it prints SKIPPED and checks nothing.

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

- Published Nov 26 2026 (artifact version `1795729657-6630`) and checked on the live page with real data: the
  belt, the power form, habit emblems, lift equipment and the Salah sky all load.
- The first publish of the page went out as `dist/index.html` through a tool that does not add the page skeleton,
  so for about a minute the live page had no doctype, viewport or base styles. Republished from `src/index.html`.
  The rule is now in `README.md` ("Rules for changes", rule 5).
- Test gap: the harness takes its Today screenshot on a day picked from the month view, which has no next-trophy
  line and no Salah sky. The next-trophy emblem made that line 5 px taller and the harness could not see it; it was
  found by measuring the page with and without the pictures and fixed the same day (commit 825c32e, whose message
  gives the wrong reason for the miss). Today's own Today screen still needs a screenshot in the harness.
- The motion was checked in desktop Chrome (60 fps) and on Mustafa's iPhone (Nov 26 2026: smooth). Battery use was
  not measured, and no Android phone has been tried.
- The Lifts tab still uses Dragon Ball names for forms and tiers. The new art does not depend on them.
  See `docs/APP-RELEASE.md`.
