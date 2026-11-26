#!/usr/bin/env python3
"""Game Of Life art spec: every emblem and sky, and the Higgsfield requests that make them.

Each emblem is two images: a "glass" (holographic) one and its "solid" twin, made by editing the
glass image so the two stay registered. The app animates between them (glass = not earned yet,
solid = earned; hero emblems loop between the two).

  spec.py requests <kind> <label>   write rounds/<label>.json: batches of 12 for generate_image_batch
                                    kind: glass | edit | solid | sky   (only what is still missing)
  spec.py record <label>            stdin: the tool's "- index N: <job id>" lines  -> jobs.json
  spec.py stamps <label>            stdin: "N YYYYMMDD_HHMMSS" per finished job    -> result file names
  spec.py drop <key> [...]          forget a job so the next "requests" makes it again (key: id:g | id:s | sky id)
  spec.py status                    what exists, what is missing

Two values belong to the Higgsfield account, not to the repo, and come from the environment:
  HF_PROJECT  id of the Higgsfield project (folder) the images are filed in. Optional: without it they land in the account's default folder.
  HF_CDN      the account's result-URL prefix, "https://<host>/<user folder>/". fetch.py needs it to download masters.
jobs.json keeps each result's file name (hf_<date>_<time>_<job id>.png); the full link is HF_CDN + that name.
"""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_NAME = 'Game Of Life'                      # the Higgsfield project the images are filed in
PROJECT = os.environ.get('HF_PROJECT', '')         # its id (see the note above)
BASE = os.environ.get('HF_CDN', '')                # the account's result-URL prefix (see the note above)
MODEL = 'gpt_image_2_6'
EMB = dict(model=MODEL, aspect_ratio='1:1', quality='high', resolution='1k', background='transparent', output_format='png')
SKY = dict(model=MODEL, aspect_ratio='3:2', quality='high', resolution='1k', output_format='png')
if PROJECT: EMB['folder_id'] = SKY['folder_id'] = PROJECT

CYAN, MAGENTA, VIOLET = 'electric cyan (#22E3FF)', 'magenta (#FF3DDC)', 'violet (#9D7BFF)'
GLASS = ("Style: futuristic holographic game-UI emblem. The object is made of translucent tinted glass with thin glowing "
         "edge lines: {main} as the main light, {acc}. Sci-fi cockpit HUD aesthetic, subtle bloom, smooth 3D render.")
FRAME = ("Single centered object occupying about {pct}% of the frame with clear empty margin on every side, nothing touching "
         "or cropped by the edges. Isolated on a fully transparent background, no ground plane, no floor shadow, no text, "
         "no letters, no numbers, no symbols, no logos, no people, no hands, no faces, no animals.")
SMALL = "Simple chunky shapes with a few large details and no fine surface pattern, so it stays sharp as a tiny app icon."
BIG = "Clean bold silhouette that stays readable as a small app icon."
KEEP = ("Use the reference image. Keep the exact same object, shape, proportions, camera angle, size and position in the "
        "frame, with the same outline")
TAIL = ("Isolated on a fully transparent background, no ground plane, no floor shadow, no text, no letters, no numbers, "
        "no symbols, no logos, no people.")
STEEL = 'bright brushed steel (light silver, never dark)'

# tier: (name, light for the glass image, material for the solid twin)
TIERS = [
    ('bronze', 'warm bronze-orange (#E8955A)', 'cast in polished bronze'),
    ('silver', 'cool silver-white (#B9C4D6)', 'cast in polished silver'),
    ('gold', 'warm gold (#FFC53D)', 'cast in polished gold'),
    ('platinum', 'icy cyan-white (#4FE0F2)', 'made of platinum: a bright white metal with a faint icy-cyan tint'),
    ('diamond', 'brilliant blue-violet (#8AA8FF) with prismatic sparkle', 'cut from diamond: clear faceted crystal with blue-violet refraction and platinum trim'),
]

A = {}   # id -> spec
def add(id, family, size, subj, solid, tint=None, main=None, acc=None, pct=72, ref=None, change=None):
    A[id] = dict(id=id, family=family, size=size, subj=subj, solid=solid, tint=tint, main=main, acc=acc, pct=pct, ref=ref, change=change)

# ---- habits: small, each carries its habit colour ----
add('habit-read', 'habit', 's', 'an open hardcover book with its pages fanned slightly, in a three-quarter view', 'A real hardcover book with cream paper pages, a deep rose-pink cloth cover and ' + STEEL + ' corner caps', 'hot pink (#FF5FD0)')
add('habit-meditate', 'habit', 's', 'a smooth sphere resting at the centre of three concentric flat rings, like a still drop in calm water', 'Polished rings of ' + STEEL + ' around a glossy violet glass-enamel sphere', 'soft violet (#A88CFF)')
add('habit-workout', 'habit', 's', 'a single hexagonal-head dumbbell in a three-quarter view', 'A dumbbell of ' + STEEL + ' with polished beveled edges, warm orange (#FF7A50) enamel panels where the reference has orange panels, and a knurled steel grip', 'warm orange (#FF7A50)')
add('habit-money', 'habit', 's', 'a neat stack of three thick blank coins with a bold upward arrow rising behind them', 'Bright polished gold coins with plain blank faces and a glossy emerald-green enamel arrow', 'emerald green (#2EE887)')
add('habit-sleep', 'habit', 's', 'a crescent moon resting on a small soft cloud', 'A bright pearl-white ceramic crescent moon with a soft blue sheen, resting on a matte white cloud', 'sky blue (#4FD8FF)')
add('habit-nicotine', 'habit', 's', 'a rounded heraldic shield with one flowing breath-of-air swirl embossed on its face', 'A shield of ' + STEEL + ' with an amber-gold enamel face and a raised polished swirl', 'amber (#FFB042)')
add('habit-eat', 'habit', 's', 'a deep round bowl with a fork and a spoon standing crossed behind it', 'A glossy white ceramic bowl with a teal enamel band, and a fork and spoon of bright polished steel', 'teal (#2EDCE2)')
add('habit-sunnah', 'habit', 's', 'a prayer rug laid flat in a three-quarter view, woven with a simple pointed-arch design and short tassels at both ends, with no writing on it', 'A real woven prayer rug in deep emerald green with cream and gold thread and cream tassels, no writing on it', 'lime green (#B4FF5C)')
add('habit-dhikr', 'habit', 's', 'a loop of round prayer beads with one larger bead and a short tassel, laid in a soft teardrop loop', 'Polished amethyst-violet stone beads on a cord, with one larger bright gold bead and a cream tassel', 'soft violet (#A88CFF)')
add('habit-ice', 'habit', 's', 'a single ice cube with rounded corners and a small six-point frost crystal floating above it', 'A solid block of real clear ice with frosted white edges and crisp refractions, with a bright white frost crystal above it', 'icy teal (#2EDCE2)')

# ---- belts: the blue one is the approved sample; the others are recolours of it ----
BELTS = [('White', 'pearl white (#F4F4F0), a milky white glass', 'pearl-white', 'black'), ('Blue', None, 'royal-blue (#2356C0)', 'black'),
         ('Purple', 'royal purple (#6B3FB0)', 'royal-purple (#6B3FB0)', 'black'), ('Brown', 'deep chocolate brown (#6E4526): a dark smoked brown glass with warm amber edge highlights, clearly brown and not orange', 'chocolate-brown (#6E4526)', 'black'),
         ('Black', 'black (#141417), a smoked dark glass with bright edge lines, and make the rank bar red (#B3261E)', 'black (#141417)', 'red (#B3261E)')]
for i, (name, glass, cloth, bar) in enumerate(BELTS):
    add('belt-%d' % i, 'belt', 'l', 'a martial-arts cloth belt tied in a classic flat knot, royal blue (#2356C0), with the two ends hanging down symmetrically and a short black rank bar near the tip of one end',
        'An opaque %s woven cotton martial-arts belt tied in the same flat knot, with visible rows of stitching and a solid %s rank bar in the same place' % (cloth, bar) + (', its stitching bright white and its edges caught by a strong cyan and magenta rim light so the outline stays bright against a dark background' if i == 4 else ''),
        ref=None if i == 1 else 'belt-1', change=None if i == 1 else 'the belt colour becomes ' + glass)

# ---- trophies: one design per family, five tiers by light and metal (gold is the base) ----
FAMS = [('pillars', 'a trophy emblem of five classical columns standing in a row on a stepped base, topped by a flat lintel', 5),
        ('house', 'a small house emblem with a pitched roof and a chimney, every window and its open door glowing with light, standing on a low stepped base', 5),
        ('sweep', 'a five-point star racing up and to the right, trailing a long tapered comet tail made of three streaks', 5),
        ('sweeps', 'a round medal framed by a laurel wreath, with a raised five-point star in its centre and two short ribbon tails below', 5),
        ('streak', 'a classic two-handled trophy cup on a short stem and a square base, with a small flame rising from the bowl', 3)]
for fam, subj, n in FAMS:
    base = 'trophy-%s-3' % fam
    for t in range(n):
        tn, light, metal = TIERS[t]
        id = 'trophy-%s-%d' % (fam, t + 1)
        add(id, 'trophy', 'l', subj, 'The same emblem %s, with crisp beveled edges' % metal, main=TIERS[2][1], acc=CYAN + ' and ' + MAGENTA + ' as edge accents',
            ref=None if id == base else base, change=None if id == base else 'the light of the glass changes from gold to ' + light + ', so it reads as the ' + tn + ' tier')

# ---- badges ----
add('badge-firstrep', 'badge', 's', 'a bold check mark standing upright on a small round pedestal', 'A check mark of ' + STEEL + ' with cyan enamel inlay on a steel pedestal')
add('badge-cleansweep', 'badge', 's', 'a radiant eight-point starburst with a round core', 'A polished gold starburst with a bright faceted core', 'warm gold (#FFC53D)')
add('badge-doubleup', 'badge', 's', 'two bold chevron arrows stacked one above the other, both pointing up', 'Polished gold chevrons with beveled edges', 'warm gold (#FFC53D)')
add('badge-lightsout', 'badge', 's', 'a bedside lamp with its shade tilted down and a small crescent moon beside it', 'A matte navy-blue lamp with a bright brass stem and a pearl-white moon', 'sky blue (#4FD8FF)')
add('badge-deepreader', 'badge', 's', 'a stack of three thick closed books with a ribbon bookmark hanging out', 'Three real hardcover books in rose, cream and plum cloth with a gold ribbon', 'hot pink (#FF5FD0)')
add('badge-rainmaker', 'badge', 's', 'a round cloud raining thick blank coins', 'A pearl-white cloud with bright polished gold coins with plain blank faces', 'emerald green (#2EE887)')
add('badge-yearone', 'badge', 's', 'a desk calendar block with a blank page and a five-point star rising from its top', 'A calendar block of ' + STEEL + ' with a plain white blank page and a polished gold star')

# ---- power forms: one crystal, growing form by form (original designs, name-agnostic) ----
POWER = [('ember orange (#FF7A50)', None, 'ember-orange'),
         ('hot magenta (#FF3DDC)', 'two small crystal shards now orbit it, one on each side', 'magenta'),
         ('violet (#9D7BFF)', 'four small crystal shards now float around it and one thin ring orbits it at a tilt', 'violet'),
         ('electric cyan (#22E3FF)', 'six crystal shards now float around it and two thin rings cross around it', 'cyan'),
         ('lime green (#B4FF5C)', 'eight crystal shards now form a crown around it, two thin rings cross around it and small arcs of energy jump between the shards', 'lime-green'),
         ('warm gold (#FFC53D)', 'it has grown two layered wings of long crystal shards, three thin rings orbit it and arcs of energy jump between the shards', 'gold'),
         ('white with a full-spectrum prismatic sheen', 'it has become a radiant many-pointed star crystal with long shard wings, three thin rings and a bright halo of light behind it', 'white diamond')]
for i, (col, grow, gem) in enumerate(POWER):
    add('power-%d' % (i + 1), 'power', 'l', 'an upright faceted energy crystal, hexagonal and pointed at both ends, hovering just above a small flat ring base',
        'The crystal and every shard are now solid cut %s gemstones with polished facets, and every ring and the base are %s with gold trim' % (gem, STEEL), col, pct=40,
        ref=None if i == 0 else 'power-1', change=None if i == 0 else 'the crystal stays the same size in the same place, but ' + grow + ', all kept inside the frame with a clear margin, and the glass colour becomes ' + col)

# ---- lifts: equipment only, small ----
add('lift-band', 'lift', 's', 'a looped resistance band with two grip handles, laid in a loose figure-eight', 'A matte bright-red rubber band with black foam handles and bright steel clips')
add('lift-rope', 'lift', 's', 'a triceps rope cable attachment: a short thick rope bent into an upside-down U, with a rubber ball stopper on each end and a metal ring at the top', 'A real black braided rope with black rubber ends and a bright steel ring')
add('lift-kettlebell', 'lift', 's', 'a kettlebell with a thick handle', 'A kettlebell of ' + STEEL + ' with a cyan enamel band')
add('lift-abwheel', 'lift', 's', 'an ab roller wheel with a straight handle through its centre', 'A black rubber wheel with a bright orange hub and steel handles with black grips')
add('lift-rings', 'lift', 's', 'a pair of gymnastic rings hanging from two short straps', 'Light birch-wood rings with black nylon straps and bright steel buckles')
add('lift-row', 'lift', 's', 'a close-grip V-shaped row handle for a cable machine: two parallel grips joined to a single eyelet', 'A bright chromed steel V-handle with black rubber grips')
add('lift-plate', 'lift', 's', 'a round weight plate with a centre hole and three grip cut-outs, in a three-quarter view', 'A weight plate of ' + STEEL + ' with a cyan enamel ring')
add('lift-machine', 'lift', 's', 'a compact gym weight stack: a column of flat rectangular plates between two guide rods, with a selector pin in one plate', 'Plates and rods of ' + STEEL + ' with a bright red selector pin')
add('lift-bench', 'lift', 's', 'an adjustable gym bench set to an incline, in a three-quarter view', 'A bench with black padded upholstery and a frame of ' + STEEL)
add('lift-cable', 'lift', 's', 'a single D-shaped cable handle with a short strap and a snap hook', 'A bright chromed steel D-handle with a black rubber grip and a black strap')
add('lift-curlbar', 'lift', 's', 'an EZ curl bar with a zig-zag shaft and one small plate on each end', 'A bright chromed steel EZ bar with plates of ' + STEEL)
add('lift-barbell', 'lift', 's', 'a straight barbell with two plates on each end, in a three-quarter view', 'A bright chromed steel bar with plates of ' + STEEL + ' and cyan enamel rings')

SKYS = {
 'sky-dawn': 'just before sunrise. Deep indigo and navy above, a thin band of soft peach and rose light glowing along a flat horizon low in the frame',
 'sky-day': None, 'sky-sunset': None,   # approved samples
 'sky-afternoon': 'in the late afternoon. Soft azure above easing to pale warm gold near a flat horizon low in the frame, long gentle light',
 'sky-night': 'at night. Deep navy fading to near black at the top, a calm field of small crisp stars, a faint violet glow along a flat horizon low in the frame',
}
SKY_PROMPT = ("A wide calm sky {when}, used as the backdrop of a prayer-times card in a sci-fi HUD app. Stylized, not photographic: the sky is built from "
              "smooth layered translucent gradients like tinted holographic glass. One thin luminous cyan horizon line, a few long soft glassy cloud bands, "
              "a faint perspective grid fading toward the horizon. Minimal and quiet, with lots of empty sky in the upper two thirds. No sun disc, no moon, "
              "no text, no letters, no numbers, no people, no animals, no buildings, no birds.")

def glass_prompt(a):
    main = a['main'] or CYAN
    acc = a['acc'] or (MAGENTA + ' as the accent, ' + VIOLET + ' inner glow' + (', and ' + a['tint'] + ' for its own colour' if a['tint'] else ''))
    return 'Subject: %s. %s %s %s' % (a['subj'], GLASS.format(main=main, acc=acc), FRAME.format(pct=a['pct']), SMALL if a['size'] == 's' else BIG)
def edit_prompt(a):
    return '%s and the same holographic glass style. Change only this: %s. %s' % (KEEP, a['change'], TAIL)
def solid_prompt(a):
    return ('%s. Change only the material: the hologram has become a real, solid object. %s. Soft studio lighting with a thin cyan (#22E3FF) rim light. '
            'No translucency, no see-through areas, no outer glow. %s') % (KEEP, a['solid'], TAIL)

def load(name, default):
    p = os.path.join(HERE, name)
    return json.load(open(p)) if os.path.exists(p) else default
def save(name, obj): json.dump(obj, open(os.path.join(HERE, name), 'w'), indent=1, sort_keys=True)

def pending(kind, jobs):
    out = []
    if kind == 'sky':
        return [(k, dict(SKY, prompt=SKY_PROMPT.format(when=w))) for k, w in SKYS.items() if w and k not in jobs]
    for id, a in A.items():
        if kind == 'glass' and not a['ref'] and id + ':g' not in jobs:
            out.append((id + ':g', dict(EMB, prompt=glass_prompt(a))))
        if kind == 'edit' and a['ref'] and id + ':g' not in jobs and a['ref'] + ':g' in jobs:
            out.append((id + ':g', dict(EMB, prompt=edit_prompt(a), medias=[dict(role='image_references', value=jobs[a['ref'] + ':g']['job'])])))
        if kind == 'solid' and id + ':s' not in jobs and id + ':g' in jobs:
            out.append((id + ':s', dict(EMB, prompt=solid_prompt(a), medias=[dict(role='image_references', value=jobs[id + ':g']['job'])])))
    return out

def main():
    cmd = sys.argv[1]; jobs = load('jobs.json', {})
    if cmd == 'requests':
        kind, label = sys.argv[2], sys.argv[3]
        items = pending(kind, jobs); keys = [k for k, _ in items]
        doc = {'keys': keys}
        for b in range(0, len(items), 12):
            doc['b%d' % (b // 12)] = [dict(index=b + j, params=p) for j, (_, p) in enumerate(items[b:b + 12])]
        save('rounds/%s.json' % label, doc)
        print(label, len(items), 'requests in', (len(items) + 11) // 12, 'batches'); print(' '.join(keys))
    elif cmd == 'record':
        keys = load('rounds/%s.json' % sys.argv[2], {})['keys']; n = 0
        for m in re.finditer(r'index\D{0,3}(\d+)\D{1,3}([0-9a-f]{8}-[0-9a-f-]{27})', sys.stdin.read()):
            jobs[keys[int(m.group(1))]] = {'job': m.group(2), 'round': sys.argv[2]}; n += 1
        save('jobs.json', jobs); print('recorded', n, 'of', len(keys))
    elif cmd == 'stamps':
        keys = load('rounds/%s.json' % sys.argv[2], {})['keys']; n = 0
        for m in re.finditer(r'^\s*(\d+)\s+(\d{8}_\d{6})\s*$', sys.stdin.read(), re.M):
            j = jobs[keys[int(m.group(1))]]; j['file'] = 'hf_%s_%s.png' % (m.group(2), j['job']); n += 1
        save('jobs.json', jobs); print('stamped', n, 'of', len(keys))
    elif cmd == 'drop':
        for k in sys.argv[2:]: print('dropped' if jobs.pop(k, None) else 'not found', k)
        save('jobs.json', jobs)
    elif cmd == 'status':
        need = [id + s for id in A for s in (':g', ':s')] + list(SKYS)
        have = [k for k in need if k in jobs]; done = [k for k in have if jobs[k].get('file')]
        print(len(A), 'emblems,', len(SKYS), 'skies;', len(need), 'images;', len(have), 'submitted,', len(done), 'finished')
        print('missing:', ' '.join(k for k in need if k not in jobs) or 'none')
        print('not finished:', ' '.join(k for k in have if not jobs[k].get('file')) or 'none')
if __name__ == '__main__': main()
