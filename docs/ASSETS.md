# Art: emblems and skies

The pictures the app ships, how the page uses them, and how to make more.
Added Nov 26 2026 (see `CHANGELOG.md`). To look at every picture in every state, serve the repo root and open
`/art/gallery.html`.

## What ships

| Where in the app | Emblem ids | Count | Shown at |
| --- | --- | --- | --- |
| Today: each habit's check circle | `habit-read`, `-meditate`, `-workout`, `-money`, `-sleep`, `-nicotine`, `-eat`, `-sunnah`, `-dhikr`, `-ice` | 10 | 34 px |
| Every screen: overall rank on the belt card | `belt-0` … `belt-4` (White, Blue, Purple, Brown, Black) | 5 | 70 px |
| Today: next trophy. The "Trophy unlocked" screen. Progress: Trophy Room | `trophy-pillars-1…5`, `trophy-house-1…5`, `trophy-sweep-1…5`, `trophy-sweeps-1…5`, `trophy-streak-1…3` | 23 | 24 px, 132 px, 34 px |
| Progress: badges | `badge-firstrep`, `-cleansweep`, `-doubleup`, `-lightsout`, `-deepreader`, `-rainmaker`, `-yearone` | 7 | 40 px |
| Lifts: power form, and the ladder under it | `power-1` … `power-7` | 7 | 88 px, 32 px |
| Lifts: the equipment beside each exercise | `lift-band`, `-rope`, `-kettlebell`, `-abwheel`, `-rings`, `-row`, `-plate`, `-machine`, `-bench`, `-cable`, `-curlbar`, `-barbell` (a dumbbell lift reuses `habit-workout`) | 12 | 30 px |
| Today: backdrop of the Salah card | skies `dawn`, `day`, `afternoon`, `sunset`, `night` | 5 | card width |

64 emblems and 5 skies: 203 files, 3.9 MB, in `src/img/art` and `src/img/sky`. The 23 trophy pictures cover every
trophy, because all habits' streak cups (30, 75 and 250 days) share the three `trophy-streak` pictures.

## Glass and solid

Every emblem is two pictures of the same object, cropped to the same box so one can replace the other in place:

| State | Meaning | Looks like |
| --- | --- | --- |
| `glass` | not earned yet | a hologram: tinted glass with glowing edges |
| `solid` | earned | the same object in its real material (metal, cloth, stone) |
| `loop` | a hero emblem | glass → solid → glass, a wave out from the centre every 6 seconds |

Rules the page follows:

- **Habits**: glass until the habit is done that day, then solid. A rest day, a light day or a pass keeps the glass
  (the row counts, the emblem shows it was not the real thing).
- **Trophies and badges**: glass and dimmed until earned, then solid.
- **Overall rank and power form**: these two loop, on every screen they appear on. The ladder shows forms already
  reached as solid and the ones ahead as glass.
- **Lift equipment**: always solid (a logged lift is a done thing).
- **Earning something plays the wave once** (0.95 s): the tapped habit, the lift just saved, the trophy screen.
- **Reduced motion** (the device setting): nothing moves; a hero rests solid.
- **Calm mode** (the app's switch): the loop and the breathing glow stop; the one wave on a tap stays ("Taps still pop").
- **No picture, no problem**: if an image fails to load, that emblem is dropped and the page shows what it showed
  before the art existed (the check mark, the SVG cup, the hexagon). The id is remembered for the session so the
  next render does not try again.

## Files

```
src/img/art/<id>.g.webp      glass, 128 px
src/img/art/<id>.s.webp      solid, 128 px
src/img/art/<id>.g.lg.webp   glass, 384 px   belts, trophies and power forms only
src/img/art/<id>.s.lg.webp   solid, 384 px
src/img/sky/<name>.webp      900 x 600
```

128 px covers every small placement at 3x screens; the 384 px file is used where the emblem is drawn 70 px or
larger. WebP quality 88 (small), 86 (large), 82 (skies).

## How the page picks a picture

All of it is in `src/js/core/art.js`; the styles are in `src/css/art.css`.

| Function | Input | Rule |
| --- | --- | --- |
| `emblem(id, state, opts)` | an id from the table above | Returns the two-layer markup, or `''` when there is no picture (the caller keeps its old look). `opts.lg` asks for the 384 px file, `opts.pop` plays the earned wave, `opts.key` says which thing was earned when several share one picture. |
| `habitArt(habit)` | a habit record | By id for the built-in habits, then by words in the name (so "Dhikr", "Ice" or "Cold shower" find their picture). No match: no emblem, the plain check stays. |
| `trophyArt(key)` | a trophy key from `xp.js` | `pillars-3` → `trophy-pillars-3`; `h:<habit>-2` → `trophy-streak-2`. |
| `beltArt(b)` / `powerArt(i)` | belt index 0-4 / form index 0-6 | By position, so renaming a belt or a form needs no new art. |
| `liftArt(name)` | an exercise name | First matching rule in `LIFT_RULES` wins (band, rope, dumbbell, …); anything unmatched gets the weight plate. |
| `skyFor(idx, night)` | the open prayer window | Fajr → dawn, sunrise and Dhuhr → day, Asr → afternoon, Maghrib → sunset, Isha until Fajr → night. |

Two details worth knowing before changing the motion:

- The page rebuilds its cards on every tap, and again about half a second later when the save comes back. A CSS
  animation would restart each time. So `emblem()` hands every animation the point its clock already stands at
  (`--emb-at`, a negative delay): loops read a shared 6-second clock, and an earned wave remembers when it began.
- The Salah card takes the night palette whenever its sky is dark (dawn, sunset, night), in the light theme too,
  so the words keep their contrast.

## Making or changing art

The masters were generated on Higgsfield (model `gpt_image_2_6`, high quality, 1k, transparent PNG; skies 3:2),
1.25 credits an image. The whole set cost 188.75 credits (151 images: the 133 that ship, plus style samples and rerolls).

`art/` holds the record and the tools:

| File | What it is |
| --- | --- |
| `art/manifest.json` | Every picture: the app files it became, its Higgsfield job id, the exact prompt, and for an edited picture the job it was edited from. |
| `art/masters.txt` | Master file name → Higgsfield result file. |
| `art/pipeline/spec.py` | The list of emblems and skies with their prompts, and the request builder. |
| `art/pipeline/fetch.py` | Downloads masters and builds review sheets. |
| `art/pipeline/build.py` | Crops, resizes and converts the masters into `src/img`, and writes the manifest. |
| `art/pipeline/jobs.json`, `rounds/` | Which job made which picture, and the requests as they were sent. |
| `art/gallery.html` | The review page. |

This repo is public, so two things are kept out of it: the Higgsfield account's ids, and links to the full-size
masters. The masters (133 PNGs, 1024 px) are in the Higgsfield project "Game Of Life" and in Mustafa's archive
folder `~/Game-Of-Life-Art/masters`, with their links in `~/Game-Of-Life-Art/final/masters.txt`.
`spec.py` reads the two account values from the environment (`HF_PROJECT`, `HF_CDN`; see its header).

To add an emblem:

1. Add it to `spec.py` (`add(...)`): the subject, and what the solid twin is made of. For a variant of an existing
   emblem (another tier or colour), give `ref` and `change` so it is made by editing that one.
2. `spec.py requests glass <label>` (or `edit`), generate the batch on Higgsfield, `spec.py record <label>`, then
   `spec.py stamps <label>` once the jobs finish.
3. `spec.py requests solid <label>`: each solid is an image-to-image edit of its own glass picture, which is what
   keeps the pair registered. Record and stamp as before.
4. `fetch.py get`, then `fetch.py pairs <label> <ids>` and look at the sheet: the two must share an outline (the
   sheet prints the offset; the current set is within 14 px on 1024).
5. `build.py`, then copy `out/art` and `out/sky` into `src/img` and `out/manifest.json`, `out/masters.txt` into `art/`.
6. Register the id in the `ART` table in `src/js/core/art.js` (1 = small only, 2 = has a large file) and call
   `emblem()` where it belongs.
7. `npm test`, read the diffs, `npm run test:record`.

`build.py` crops each glass/solid pair to one shared box. Belts and each trophy family share one box across the
family, so the object keeps its size from tier to tier; power forms are cropped one by one, so each form fills its
frame as it grows.

## Rules for the pictures

- Objects only: no people, faces, hands or animals.
- No text, letters, numbers or logos inside a picture.
- Original designs only. Nothing from a film, show, game or brand, and no real artwork. The power forms are
  crystals for that reason: they carry no reference to the names the Lifts tab currently uses for them
  (see `docs/APP-RELEASE.md`).
- Prayer rug and prayer beads carry no writing and no depiction of a place.
- Small emblems use chunky shapes with few details, so they hold at 30 px.

## Rights

The pictures are AI-generated on a paid Higgsfield plan. Higgsfield's terms (section 4.4, read Nov 26 2026) allow
commercial use of outputs and say outputs are not exclusive: another user could get a similar result. Read the
terms again before a store release; this note is a pointer, not legal advice.

## Testing

- `npm test` runs with the art in place: the baseline in `test/baseline/hashes.json` includes the emblem markup.
- The harness runs with reduced motion, so its snapshots hold no animation timing.
- To see the fallback, delete `src/img/art` from a copy of `src` and run the harness against it: every screenshot
  matches the pre-art look.
