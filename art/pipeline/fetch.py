#!/usr/bin/env python3
"""Download finished masters and build QA contact sheets.
  fetch.py get                 download every finished job that has no master file yet (needs HF_CDN, see spec.py)
  fetch.py sheet <label> keys  one JPEG sheet of the named images (dark half, light half)
  fetch.py pairs <label> ids   one JPEG sheet of glass|solid pairs with their registration offset
"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont
import spec
HERE = os.path.dirname(os.path.abspath(__file__)); M = os.path.join(HERE, 'masters'); Q = os.path.join(HERE, 'qa')
jobs = json.load(open(os.path.join(HERE, 'jobs.json')))
def path(k): return os.path.join(M, k.replace(':', '.') + '.png')
def font(s):
    for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'):
        if os.path.exists(f): return ImageFont.truetype(f, s)
    return ImageFont.load_default()
def bbox(im):
    a = im.getchannel('A').point(lambda v: 255 if v > 24 else 0); return a.getbbox()
def get():
    todo = [(k, spec.BASE + j['file']) for k, j in jobs.items() if j.get('file') and not os.path.exists(path(k))]
    if todo and not spec.BASE: sys.exit('Set HF_CDN to the account\'s result-URL prefix first (see spec.py).')
    os.makedirs(M, exist_ok=True)
    procs = [(k, subprocess.Popen(['curl', '-sS', '--fail', '-m', '90', '-o', path(k), u])) for k, u in todo]
    bad = []
    for k, p in procs:
        if p.wait() != 0 or not os.path.exists(path(k)):
            bad.append(k)
            if os.path.exists(path(k)): os.remove(path(k))
    print('downloaded', len(todo) - len(bad), 'failed', bad)
def cell(k, S):
    c = Image.new('RGB', (S, S + 22), (5, 9, 19)); d = ImageDraw.Draw(c)
    if not os.path.exists(path(k)): d.text((6, 6), 'MISSING', fill=(255, 80, 80), font=font(14))
    else:
        im = Image.open(path(k)).convert('RGBA'); t = im.resize((S, S), Image.LANCZOS)
        if k.startswith('sky'): c.paste(t.convert('RGB'), (0, 0))
        else:
            c.paste((234, 240, 251), (S // 2, 0, S, S)); c.paste(t, (0, 0), t)   # right half on the light theme colour
            b = bbox(im); w, h = im.size
            if b and (b[0] < 6 or b[1] < 6 or b[2] > w - 6 or b[3] > h - 6): d.rectangle((0, 0, S - 1, S - 1), outline=(255, 60, 60), width=3)   # touches an edge
    d.text((4, S + 3), k.replace('trophy-', 't-'), fill=(200, 215, 240), font=font(13)); return c
def sheet(label, keys, S=200, cols=6):
    rows = (len(keys) + cols - 1) // cols; out = Image.new('RGB', (cols * S, rows * (S + 22)), (30, 30, 34))
    for i, k in enumerate(keys): out.paste(cell(k, S), ((i % cols) * S, (i // cols) * (S + 22)))
    f = os.path.join(Q, label + '.jpg'); out.save(f, quality=78); print(f, out.size, os.path.getsize(f) // 1024, 'KiB')
def pairs(label, ids, S=170, cols=4):
    rows = (len(ids) + cols - 1) // cols; out = Image.new('RGB', (cols * S * 2 + (cols - 1) * 8, rows * (S + 22)), (30, 30, 34))
    for i, id in enumerate(ids):
        x = (i % cols) * (S * 2 + 8); y = (i // cols) * (S + 22)
        out.paste(cell(id + ':g', S), (x, y)); out.paste(cell(id + ':s', S), (x + S, y))
        try:
            a = bbox(Image.open(path(id + ':g')).convert('RGBA')); b = bbox(Image.open(path(id + ':s')).convert('RGBA'))
            off = max(abs(a[j] - b[j]) for j in range(4)); ImageDraw.Draw(out).text((x + S * 2 - 46, y + S + 3), 'd%d' % off, fill=(255, 90, 90) if off > 28 else (120, 230, 150), font=font(13))
        except Exception: pass
    f = os.path.join(Q, label + '.jpg'); out.save(f, quality=78); print(f, out.size, os.path.getsize(f) // 1024, 'KiB')
if __name__ == '__main__':
    c = sys.argv[1]
    if c == 'get': get()
    elif c == 'sheet': sheet(sys.argv[2], sys.argv[3:])
    elif c == 'pairs': pairs(sys.argv[2], sys.argv[3:])
