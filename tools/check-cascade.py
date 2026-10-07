#!/usr/bin/env python3
"""Prove the two CSS blocks that moved in the split cannot change the cascade.

Source order only decides between two rules that (1) can match the same element,
(2) have the same specificity and (3) set the same property. For each moved block
and each block whose relative order to it changed, every pair of rules that share
a class/id token is checked on (2) and (3); identical selectors are always flagged.
Keyframe bodies are skipped (percent steps are not selectors).
Exit 1 with a report if any pair survives.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
lines = open(os.path.join(ROOT, 'legacy', 'index.html'), encoding='utf-8').read().split('\n')

BLOCKS = {
    'today': (167, 267), 'progress': (268, 339), 'lifts': (340, 470),
    'body': (471, 602), 'sheets': (603, 653), 'build': (654, 700), 'trophies': (701, 748),
}
# moved block -> blocks it now precedes but used to follow
MOVES = {'sheets': ['today', 'progress', 'lifts', 'body'], 'trophies': ['lifts', 'body', 'build']}

def rules_of(block):
    a, b = BLOCKS[block]
    css = re.sub(r'/\*.*?\*/', '', '\n'.join(lines[a - 1:b]), flags=re.S)
    out, stack, buf, i = [], [], '', 0
    while i < len(css):
        c = css[i]
        if c == '{':
            head = buf.strip(); buf = ''
            stack.append(head)
        elif c == '}':
            head = stack.pop()
            if head and not head.startswith('@') and not any(h.startswith('@keyframes') for h in stack):
                props = set(p.split(':')[0].strip() for p in buf.split(';') if ':' in p)
                for sel in head.split(','):
                    out.append((sel.strip(), props))
            buf = ''
        else:
            buf += c
        i += 1
    return out

def specificity(sel):
    s = re.sub(r':not\(([^)]*)\)', r'\1', sel)          # :not() counts its argument
    ids = len(re.findall(r'#[\w-]+', s))
    classes = len(re.findall(r'\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+(?:\([^)]*\))?', s))
    s2 = re.sub(r'#[\w-]+|\.[\w-]+|\[[^\]]*\]|::?[\w-]+(?:\([^)]*\))?', ' ', s)
    elements = len(re.findall(r'\b[a-zA-Z][\w-]*', s2))
    return (ids, classes, elements)

def tokens(sel):
    return set(re.findall(r'[.#][A-Za-z_-][\w-]*', sel))

SRC = '\n'.join(lines)
def settings_list_src():
    a = SRC.index('function renderSettingsList'); b = SRC.index('function draftHabit', a)
    return SRC[a:b]
# Pairs the rule above flags that provably never match one element. Each proof is checked here.
ALLOW = {
    ('.st-item .ghost', '.ghost.small'): ('a .ghost.small never sits inside .st-item: the settings list renders no "small" button',
        lambda: 'small' not in settings_list_src() and not re.search(r'class="[^"]*st-item[^"]*small', SRC)),
    ('.rw-row.done', '.rung.done'): ('no element carries both .rung and .rw-row',
        lambda: not re.search(r'class="[^"]*\brung\b[^"]*rw-row|class="[^"]*rw-row[^"]*\brung\b', SRC)),
}

bad = 0
for moved, others in MOVES.items():
    mr = rules_of(moved)
    for o in others:
        orr = rules_of(o)
        flagged = []
        for ms, mp in mr:
            for os_, op in orr:
                if ms == os_:
                    flagged.append((ms, os_, 'identical selector')); continue
                if tokens(ms) & tokens(os_) and specificity(ms) == specificity(os_) and (mp & op):
                    why, proof = ALLOW.get((ms, os_), (None, None))
                    if proof and proof():
                        print(f'   allowed: {ms!r} vs {os_!r}: {why}')
                    else:
                        flagged.append((ms, os_, 'same specificity, shared props ' + ','.join(sorted(mp & op))))
        pairs = sum(1 for ms, _ in mr for os_, _ in orr if tokens(ms) & tokens(os_))
        print(f'{"XX" if flagged else "ok"} {moved:9} vs {o:9}: {len(mr)}x{len(orr)} rules, {pairs} share a token, {len(flagged)} could depend on order')
        for f in flagged: print('     ', f)
        bad += len(flagged)
print('cascade check:', 'PASS' if not bad else 'FAIL')
sys.exit(1 if bad else 0)
