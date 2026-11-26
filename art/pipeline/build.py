#!/usr/bin/env python3
"""Turn the masters into app assets and a manifest.

  build.py   -> out/art/<id>.g.webp + <id>.s.webp   128 px  (glass, solid)
                out/art/<id>.g.lg.webp + .s.lg.webp 384 px  (belts, trophies, power forms)
                out/sky/<name>.webp                 900x600
                out/manifest.json, out/masters.txt (master file -> Higgsfield result file), then gol-art.zip

Every glass/solid pair is cropped to one shared box so the two stay registered when the app swaps them.
Belts and each trophy family share one box across the whole family, so the object keeps its size from
tier to tier. Power forms are cropped one by one: each form fills its own frame as it grows.
"""
import json, os, re, shutil, sys, zipfile
from PIL import Image
import spec
HERE = os.path.dirname(os.path.abspath(__file__)); M = os.path.join(HERE, 'masters'); OUT = os.path.join(HERE, 'out')
SMALL, LARGE, PAD = 128, 384, 0.06
jobs = json.load(open(os.path.join(HERE, 'jobs.json')))
def master(k): return os.path.join(M, k.replace(':', '.') + '.png')
def bbox(im): return im.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
def group(id):
    if id.startswith('belt-'): return 'belt'
    m = re.match(r'(trophy-[a-z]+)-\d+$', id); return m.group(1) if m else id

SAMPLE_TAIL = (" Single centered object filling about 80% of the frame, isolated on a fully transparent background, no ground plane, no floor shadow, no text, no letters, "
               "no numbers, no logos, no people, no hands, no faces, no animals. Clean bold silhouette that stays readable as a small app icon.")
SAMPLE_STYLE = ("Style: futuristic holographic game-UI emblem. The object is {made} translucent tinted glass with thin glowing edge lines: {light}. "
                "Sci-fi cockpit HUD aesthetic, subtle bloom, smooth 3D render.")
CMV = "electric cyan (#22E3FF) as the main light, magenta (#FF3DDC) as the accent, violet (#9D7BFF) inner glow"
SAMPLE_SOLID = ("Use the reference image. Keep the exact same object, shape, proportions, camera angle, size and position in the frame, with the same outline. "
                "Change only the material: the hologram has become a real, solid object. {what} Soft studio lighting with a thin cyan (#22E3FF) rim light. "
                "No translucency, no see-through areas, no outer glow. Isolated on a fully transparent background, no ground plane, no floor shadow, no text, "
                "no letters, no numbers, no logos, no people.")
SAMPLE_SKY = ("A wide calm sky at {when}, used as the backdrop of a prayer-times card in a sci-fi HUD app. Stylized, not photographic: the sky is built from smooth layered "
              "translucent gradients like tinted holographic glass. {look} One thin luminous cyan horizon line, a few long soft glassy {clouds}cloud bands, a faint perspective grid "
              "fading toward the horizon. {mood}, with lots of empty sky in the upper two thirds. No sun disc, no text, no letters, no numbers, no people, no animals, no buildings, no birds.")
SAMPLES = {   # the approved style, motion and sky samples, with the prompts they were made from
 'habit-workout:g': "Subject: a single hexagonal-head dumbbell in a three-quarter view, with a warm orange (#FF7A50) accent. " + SAMPLE_STYLE.format(made='made of', light=CMV) + SAMPLE_TAIL,
 'belt-1:g': "Subject: a martial-arts cloth belt tied in a classic flat knot, royal blue (#2356C0), with the two ends hanging down symmetrically and a short black rank bar near the tip of one end. " + SAMPLE_STYLE.format(made='rendered as', light=CMV) + SAMPLE_TAIL,
 'trophy-pillars-3:g': "Subject: a trophy emblem of five classical columns standing in a row on a stepped base, topped by a flat lintel, gold tier with golden light. " + SAMPLE_STYLE.format(made='made of', light='warm gold (#FFC53D) as the main light, electric cyan (#22E3FF) and magenta (#FF3DDC) as edge accents') + SAMPLE_TAIL,
 'belt-1:s': SAMPLE_SOLID.format(what="An opaque royal-blue (#2356C0) woven cotton martial-arts belt tied in the same flat knot, with visible rows of stitching and a solid black rank bar in the same place."),
 'trophy-pillars-3:s': SAMPLE_SOLID.format(what="The same five-column emblem cast in opaque polished gold with a dark gunmetal band on the base, crisp beveled edges."),
 'sky-sunset': SAMPLE_SKY.format(when='sunset', look='Warm amber and magenta glow along a flat horizon low in the frame, rising into deep violet and dark navy above.', clouds='', mood='Minimal and quiet'),
 'sky-day': SAMPLE_SKY.format(when='midday', look='Bright clear electric blue at the top easing to pale cyan and white near a flat horizon low in the frame.', clouds='white ', mood='Light, airy and minimal'),
}
_rounds = {}
def prompt_of(k):
    j = jobs[k]
    if j['round'] == 'samples': return SAMPLES[k], None
    if j['round'] not in _rounds: _rounds[j['round']] = json.load(open(os.path.join(HERE, 'rounds', j['round'] + '.json')))
    r = _rounds[j['round']]; i = r['keys'].index(k)
    for b in r:
        if b == 'keys': continue
        for q in r[b]:
            if q['index'] == i:
                ref = (q['params'].get('medias') or [{}])[0].get('value'); return q['params']['prompt'], ref
    raise KeyError(k)

def fit(im, box, side, out, q):
    c = im.crop(box); w, h = c.size; s = int(round(max(w, h) * (1 + 2 * PAD)))
    sq = Image.new('RGBA', (s, s), (0, 0, 0, 0)); sq.paste(c, ((s - w) // 2, (s - h) // 2))
    sq.resize((side, side), Image.LANCZOS).save(out, 'WEBP', quality=q, method=4)

def main():
    shutil.rmtree(OUT, ignore_errors=True); os.makedirs(os.path.join(OUT, 'art')); os.makedirs(os.path.join(OUT, 'sky'))
    missing = [k for id in spec.A for k in (id + ':g', id + ':s') if not os.path.exists(master(k))] + [k for k in spec.SKYS if not os.path.exists(master(k))]
    if missing: print('MISSING', missing); sys.exit(1)
    boxes = {}
    for id in spec.A:
        for k in (id + ':g', id + ':s'):
            b = bbox(Image.open(master(k)).convert('RGBA')); g = group(id); a = boxes.get(g)
            boxes[g] = b if a is None else (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))
    man = {'model': spec.MODEL, 'higgsfield_project': spec.PROJECT_NAME, 'settings': {k: v for k, v in spec.EMB.items() if k not in ('model', 'folder_id')},
           'sky_settings': {k: v for k, v in spec.SKY.items() if k not in ('model', 'folder_id')}, 'credits_per_image': 1.25, 'emblems': {}, 'skies': {}}
    lines = []
    for id, a in spec.A.items():
        big = a['family'] in ('belt', 'trophy', 'power'); entry = {'family': a['family'], 'subject': a['subj'], 'files': []}
        for st, k in (('glass', id + ':g'), ('solid', id + ':s')):
            im = Image.open(master(k)).convert('RGBA'); tag = k[-1]
            fit(im, boxes[group(id)], SMALL, os.path.join(OUT, 'art', '%s.%s.webp' % (id, tag)), 88); entry['files'].append('%s.%s.webp' % (id, tag))
            if big: fit(im, boxes[group(id)], LARGE, os.path.join(OUT, 'art', '%s.%s.lg.webp' % (id, tag)), 86); entry['files'].append('%s.%s.lg.webp' % (id, tag))
            p, ref = prompt_of(k); entry[st] = {'job': jobs[k]['job'], 'file': jobs[k]['file'], 'round': jobs[k]['round'], 'prompt': p}
            if ref: entry[st]['reference_job'] = ref
            lines.append('%s.png %s' % (k.replace(':', '.'), jobs[k]['file']))
        man['emblems'][id] = entry
    for k in spec.SKYS:
        im = Image.open(master(k)).convert('RGB'); w, h = im.size; s = 900 / w; im = im.resize((900, int(round(h * s))), Image.LANCZOS)
        top = (im.height - 600) // 2; im.crop((0, top, 900, top + 600)).save(os.path.join(OUT, 'sky', k[4:] + '.webp'), 'WEBP', quality=82, method=4)
        p, _ = prompt_of(k); man['skies'][k] = {'files': [k[4:] + '.webp'], 'job': jobs[k]['job'], 'file': jobs[k]['file'], 'round': jobs[k]['round'], 'prompt': p}
        lines.append('%s.png %s' % (k, jobs[k]['file']))
    json.dump(man, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
    open(os.path.join(OUT, 'masters.txt'), 'w').write('\n'.join(lines) + '\n')
    z = os.path.join(HERE, 'gol-art.zip')
    with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as f:
        for root, _, files in os.walk(OUT):
            for n in files: f.write(os.path.join(root, n), os.path.relpath(os.path.join(root, n), OUT))
        for n in ('spec.py', 'fetch.py', 'build.py', 'jobs.json'): f.write(os.path.join(HERE, n), 'pipeline/' + n)
        for n in sorted(os.listdir(os.path.join(HERE, 'rounds'))): f.write(os.path.join(HERE, 'rounds', n), 'pipeline/rounds/' + n)
    art = os.listdir(os.path.join(OUT, 'art')); size = sum(os.path.getsize(os.path.join(OUT, 'art', n)) for n in art)
    print(len(man['emblems']), 'emblems,', len(art), 'art files,', size // 1024, 'KiB;', len(man['skies']), 'skies,', sum(os.path.getsize(os.path.join(OUT, 'sky', n)) for n in os.listdir(os.path.join(OUT, 'sky'))) // 1024, 'KiB; zip', os.path.getsize(z) // 1024, 'KiB;', len(lines), 'masters')
if __name__ == '__main__': main()
