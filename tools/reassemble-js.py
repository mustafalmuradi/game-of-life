#!/usr/bin/env python3
"""Show exactly how src/js/** differs from the script in legacy/index.html.

Takes every line of the original script and every line of the modules (minus
import lines, the `export ` prefix, the one-line file headers, and the
sync./ui. property renames) and prints the lines that exist on one side only.
Everything else moved verbatim. Writes the full report to test/out/js-reassembly.txt.
"""
import os, re, sys
from collections import Counter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jsmap import ROOT, IIFE_OPEN, IIFE_CLOSE, lines

RENAME_BACK = {'sync.cloud': 'cloud', 'sync.lsOK': 'lsOK', 'sync.flushedOnce': 'flushedOnce',
               'sync.settingsWriting': 'settingsWriting', 'sync.liftOps': 'liftOps', 'ui.popSeg': 'popSeg'}

def norm(l):
    for a, b in RENAME_BACK.items(): l = l.replace(a, b)
    return l.rstrip()

orig = [norm(l) for l in lines()[IIFE_OPEN[1]:IIFE_CLOSE[0] - 1]]
mods = []
files = []
for d, _, fs in os.walk(os.path.join(ROOT, 'src', 'js')):
    for f in sorted(fs):
        if f.endswith('.js'): files.append(os.path.join(d, f))
for f in sorted(files):
    for i, l in enumerate(open(f, encoding='utf-8').read().split('\n')):
        if i == 0 and l.startswith('// '): continue          # file header
        if re.match(r'^import\s', l): continue               # generated imports
        l = re.sub(r'^export ', '', l)                       # generated exports
        mods.append((norm(l), os.path.relpath(f, ROOT)))

oc, mc = Counter(orig), Counter(l for l, _ in mods)
only_orig = [l for l in orig if l.strip() and oc[l] > mc.get(l, 0)]
only_mods = [(l, f) for l, f in mods if l.strip() and mc[l] > oc.get(l, 0)]
# de-duplicate while keeping order
seen = set(); oo = [l for l in only_orig if not (l in seen or seen.add(l))]
seen = set(); om = [(l, f) for l, f in only_mods if not (l in seen or seen.add(l))]

total = sum(1 for l in orig if l.strip())
report = [f'original script: {total} non-blank lines; modules: {sum(1 for l, _ in mods if l.strip())} non-blank lines after stripping imports/exports',
          f'lines moved verbatim: {total - len(oo)} of {total} ({(total - len(oo)) / total * 100:.1f}%)',
          f'lines only in the original ({len(oo)}):'] + ['  - ' + l[:160] for l in oo] + \
         [f'lines only in the modules ({len(om)}):'] + [f'  + [{f}] ' + l[:160] for l, f in om]
out = os.path.join(ROOT, 'test', 'out'); os.makedirs(out, exist_ok=True)
open(os.path.join(out, 'js-reassembly.txt'), 'w').write('\n'.join(report) + '\n')
print('\n'.join(report))
