"""Shared map of the legacy script: which lines go to which module, plus analysis helpers.
Line numbers are 1-based and refer to legacy/index.html.
"""
import os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEGACY = os.path.join(ROOT, 'legacy', 'index.html')

# module -> list of (first, last) line ranges, in the order they appear in the file
MODULES = {
    'core/config.js':        [(1017, 1044)],
    'core/utils.js':         [(1045, 1068)],
    'core/state.js':         [(1069, 1152)],
    'core/xp.js':            [(1153, 1260)],
    'features/lifts.js':     [(1261, 1462), (2247, 2455)],
    'core/store.js':         [(1463, 1603)],
    'features/today.js':     [(1604, 1682), (1895, 2022)],
    'core/effects.js':       [(1683, 1764)],
    'core/svg.js':           [(1765, 1874)],
    'core/render.js':        [(1875, 1894)],
    'features/progress.js':  [(2023, 2246)],
    'features/body.js':      [(2456, 2933)],
    'features/build.js':     [(2934, 3154)],
    'core/sheets.js':        [(3155, 3221)],
    'features/coach.js':     [(3222, 3868)],
    'app.js':                [(3869, 4003), (4004, 4014)],
}
IIFE_OPEN = (1013, 1016)   # <script>, (function(){, 'use strict';, blank
IIFE_CLOSE = (4015, 4016)  # })();, </script>

_lines = None
def lines():
    global _lines
    if _lines is None:
        _lines = open(LEGACY, encoding='utf-8').read().split('\n')
    return _lines

def text_of(module):
    return ''.join('\n'.join(lines()[a - 1:b]) + '\n' for a, b in MODULES[module])

def strip_strings_and_comments(src):
    """Blank out string/regex/comment contents so identifier scans only see code."""
    out, i, n = [], 0, len(src)
    while i < n:
        c = src[i]
        if src.startswith('//', i):
            j = src.find('\n', i); j = n if j < 0 else j
            out.append(' ' * (j - i)); i = j
        elif src.startswith('/*', i):
            j = src.find('*/', i) + 2
            out.append(re.sub(r'[^\n]', ' ', src[i:j])); i = j
        elif c in '\'"`':
            j = i + 1
            while j < n and src[j] != c:
                if src[j] == '\\': j += 1
                if src[j] == '\n' and c != '`': break
                j += 1
            j += 1
            out.append(c + ' ' * max(0, j - i - 2) + c); i = j
        elif c == '/' and re.search(r'[=(,:\[!&|?{};]\s*$', ''.join(out)[-20:]) :
            # a regex literal (what precedes it cannot end an expression)
            j = i + 1
            while j < n and src[j] != '/':
                if src[j] == '\\': j += 1
                if src[j] == '[':
                    while j < n and src[j] != ']': j += 1
                j += 1
            j += 1
            while j < n and src[j].isalpha(): j += 1
            out.append(' ' * (j - i)); i = j
        else:
            out.append(c); i += 1
    return ''.join(out)

TOP_FN = re.compile(r'^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)', re.M)
TOP_VAR = re.compile(r'^var\s+(.*?);\s*$', re.M | re.S)

def top_level_names(module):
    """Names declared at the top level of a module: functions and vars."""
    src = text_of(module)
    names = set(TOP_FN.findall(src))
    # var lines: take the declaration list up to the first top-level ';' at line end
    for m in re.finditer(r'^var\s+([^\n]*)', src, re.M):
        decl = m.group(1)
        # split declarators on commas that are not inside brackets/braces/strings
        depth, cur, parts = 0, '', []
        for ch in strip_strings_and_comments(decl):
            if ch in '([{': depth += 1
            elif ch in ')]}': depth -= 1
            if ch == ',' and depth == 0: parts.append(cur); cur = ''
            else: cur += ch
        parts.append(cur)
        for p in parts:
            mm = re.match(r'\s*([A-Za-z_$][\w$]*)', p)
            if mm: names.add(mm.group(1))
    return names

def uses(module, name):
    """Does the module reference `name` as an identifier (not a property or object key)?"""
    src = strip_strings_and_comments(text_of(module))
    return re.search(r'(?<![\w$.])' + re.escape(name) + r'(?![\w$])(?!:)', src) is not None

def reassigns(module, name):
    """Lines where the module assigns `name = ...` (binding reassignment, not a property)."""
    out = []
    src = strip_strings_and_comments(text_of(module))
    for i, l in enumerate(src.split('\n')):
        if re.search(r'(?<![\w$.])' + re.escape(name) + r'\s*(=(?!=)|\+\+|--|[-+*/]=)', l) and not re.match(r'\s*var\s', l):
            out.append(l.strip()[:100])
        if re.search(r'(?:\+\+|--)' + re.escape(name) + r'(?![\w$])', l):
            out.append(l.strip()[:100])
    return out
