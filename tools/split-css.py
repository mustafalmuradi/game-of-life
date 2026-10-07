#!/usr/bin/env python3
"""Level 3: cut the CSS out of legacy/index.html into src/css/*.css, byte for byte.

Every rule keeps its text. Files are linked in the order the rules appear in the
original, except for two blocks that move next to their feature:
  - "sheets, toast, promo" (603-653) joins the shell styles in app.css
  - "trophies + rewards" (701-748) joins progress.css
tools/check-cascade.py proves those moves cannot change the cascade.
Line numbers are 1-based and refer to legacy/index.html.
"""
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'legacy', 'index.html')
OUT = os.path.join(ROOT, 'src')

# (file, [(first_line, last_line), ...]) in link order
CSS = [
    ('tokens.css',   [(7, 82)]),
    ('app.css',      [(83, 166), (603, 653)]),
    ('today.css',    [(167, 267)]),
    ('progress.css', [(268, 339), (701, 748)]),
    ('lifts.css',    [(340, 470)]),
    ('body.css',     [(471, 602)]),
    ('build.css',    [(654, 700)]),
    ('coach.css',    [(749, 828)]),
]
STYLE_OPEN, STYLE_CLOSE = 6, 829   # the <style> and </style> lines

HEADERS = {
    'tokens.css': '/* Design tokens: every colour, shadow and font the app uses, light and dark. */\n',
    'app.css': '/* The shell: base, header, belt, tabs, bottom sheets, toast, promotion screens. */\n',
    'today.css': '/* Today tab: week strip, day card, habit list. */\n',
    'progress.css': '/* Progress tab: charts, heatmap, badges, trophies and rewards. */\n',
    'lifts.css': '/* Lifts tab: strength rank, session cards, lift sheet. */\n',
    'body.css': '/* Body tab: readiness, check-in sheet, weekly review. */\n',
    'build.css': '/* Build tab: system map, ship log, skills. */\n',
    'coach.css': '/* Coach: the chat sheet. */\n',
}

def main():
    lines = open(SRC, encoding='utf-8').read().split('\n')
    assert lines[STYLE_OPEN - 1] == '<style>' and lines[STYLE_CLOSE - 1] == '</style>', 'style boundaries moved'
    os.makedirs(os.path.join(OUT, 'css'), exist_ok=True)
    covered = []
    for name, ranges in CSS:
        body = ''.join('\n'.join(lines[a - 1:b]) + '\n' for a, b in ranges)
        open(os.path.join(OUT, 'css', name), 'w', encoding='utf-8').write(HEADERS[name] + body)
        covered += [(a, b) for a, b in ranges]
    # every CSS line between the tags must be covered exactly once
    seen = sorted(covered)
    want = STYLE_OPEN + 1
    for a, b in seen:
        assert a == want, f'gap or overlap at line {want} (next range starts {a})'
        want = b + 1
    assert want == STYLE_CLOSE, f'CSS ends at {want - 1}, expected {STYLE_CLOSE - 1}'
    links = ''.join(f'<link rel="stylesheet" href="css/{name}">\n' for name, _ in CSS)
    html = '\n'.join(lines[:STYLE_OPEN - 1]) + '\n' + links + '\n'.join(lines[STYLE_CLOSE:])
    open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(html)
    print(f'wrote {len(CSS)} stylesheets and src/index.html ({len(html.splitlines())} lines)')

if __name__ == '__main__':
    main()
