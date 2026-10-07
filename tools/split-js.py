#!/usr/bin/env python3
"""Levels 4-6: cut the script out of legacy/index.html into ES modules under src/js/.

The code moves verbatim. The only edits are the ones listed in EDITS below (each
one is an exact-string replacement that must match exactly once), the generated
import/export lines, and the tab registry in core/render.js. Run after
tools/split-css.py; rewrites src/js/** and the <script> tag in src/index.html.
tools/reassemble-js.py shows the whole difference against the original.
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jsmap import ROOT, MODULES, IIFE_OPEN, IIFE_CLOSE, lines, text_of, strip_strings_and_comments, top_level_names, TOP_FN

# ---- the final map: the lift maths and the stats engine leave the lifts section for core/ ----
MODULES.clear()
MODULES.update({
    'core/config.js':        [(1017, 1044)],
    'core/utils.js':         [(1045, 1068)],
    'core/state.js':         [(1069, 1152)],
    'core/xp.js':            [(1153, 1260)],
    'core/strength.js':      [(1261, 1394)],
    'core/stats.js':         [(1395, 1461), (2092, 2104)],  # recompute(), habit30()
    'core/store.js':         [(1463, 1603)],
    'features/today.js':     [(1604, 1682), (1895, 2014)],
    'core/effects.js':       [(1683, 1764)],
    'core/svg.js':           [(1765, 1874)],
    'core/render.js':        [(1875, 1894), (2015, 2022), (2105, 2118)],  # render(), renderBelt(), renderSync(), habitRankRow()
    'features/progress.js':  [(2023, 2091), (2119, 2246)],
    'features/lifts.js':     [(2247, 2455)],
    'features/body.js':      [(2456, 2933)],
    'features/build.js':     [(2934, 3154)],
    'core/sheets.js':        [(3155, 3221)],
    'features/coach.js':     [(3222, 3868)],
    'app.js':                [(3869, 4003), (4004, 4014)],
})
ORDER = sorted(MODULES, key=lambda m: MODULES[m][0][0])  # original file order, for reassembly

DOC = {
    'core/config.js': 'Scoring rules, belts, the default habits and the nutrition/sleep targets. Numbers only.',
    'core/utils.js': 'Small helpers: DOM query, escaping, date keys, formatting, ids.',
    'core/state.js': 'The one state object, the normalizers that keep stored data well-formed, and the habit activity rules.',
    'core/xp.js': 'XP curves, rank titles, belt tests, milestones and trophies.',
    'core/strength.js': 'Lift maths: estimated 1RM, lift scoring, Iron ranks, quests, the strength analysis.',
    'core/stats.js': 'recompute(): walks every day and rebuilds state.stats and state.liftStats. Call it after any data change. Plus habit30(), the 30-day hit rate.',
    'core/store.js': 'Persistence: the localStorage cache, the cloud database sync, the retry queues. The only file that talks to the db.',
    'features/today.js': 'Today tab: week strip, day card, habit list, and the habit mutations (toggle, rest, extras).',
    'core/effects.js': 'Floating XP, toasts, confetti, promotion screens.',
    'core/svg.js': 'SVG builders: belt, rings, rank progress.',
    'core/render.js': 'render(): the belt, the tab bar, the sync line, the habit rank row, and the registry each tab adds its renderer to.',
    'features/progress.js': 'Progress tab: charts, heatmap, badges, trophy room, rewards.',
    'features/lifts.js': 'Lifts tab: session cards, the lift sheet, save/delete.',
    'features/body.js': 'Body tab: WHOOP and Cal AI metrics, the check-in sheet, readiness, the weekly review.',
    'features/build.js': 'Build tab: system map, ship log, skills.',
    'core/sheets.js': 'Bottom sheets: open/close, the rank sheet, the extras sheet, habit settings.',
    'features/coach.js': 'Coach: rules, the tracker snapshot Claude sees, the tools it can call, the conversation, the chat UI.',
    'app.js': 'The composition root: wires events to the features and boots the app. The only file that imports everything.',
}

# ---- mechanical edits: (module, old, new) — each must match exactly once ----
EDITS = [
    # sync bookkeeping leaves state.js for store.js, which owns it; popSeg becomes ui.popSeg (two writers)
    ('core/state.js',
     "var lsOK = false;\nvar cloud = null;\nvar dirty = new Map();\nvar writing = new Set();\nvar timers = {};\nvar unsynced = new Set();\nvar flushedOnce = false;\nvar settingsWriting = false;\nvar popSeg = null;\nvar liftOps = {};\nvar liftArmed = null, liftArmTimer = null;\nvar openLiftKeys = new Set();\n",
     "var ui = {popSeg:null}; // set by the Today tab, cleared by render()\n"),
    ('core/store.js',
     "/* ---------- persistence ---------- */\n",
     "/* ---------- persistence ---------- */\nvar sync = {lsOK:false, cloud:null, flushedOnce:false, settingsWriting:false, liftOps:{}};\nvar dirty = new Map(), writing = new Set(), timers = {}, unsynced = new Set();\n"),
    ('features/lifts.js',
     "/* ---------- lifts view ---------- */\n",
     "/* ---------- lifts view ---------- */\nvar liftArmed = null, liftArmTimer = null;\nvar openLiftKeys = new Set();\n"),
    # the stats engine no longer reaches into the Body tab's cache; the cache invalidates itself per recompute()
    ('core/stats.js', "function recompute(){\n  blCache = {};\n", "function recompute(){\n"),
    ('features/body.js',
     "function baselineAt(d, k){\n  var key = d + '|' + k;\n",
     "var blStats = null; // the cache is valid for one state.stats; recompute() replaces that object\nfunction baselineAt(d, k){\n  if(blStats !== state.stats){ blCache = {}; blStats = state.stats; }\n  var key = d + '|' + k;\n"),
    # render() dispatches through a registry instead of importing every tab
    ('core/render.js',
     "function render(){\n  renderBelt();\n",
     "var tabs = {};\nfunction registerTab(name, fn){ tabs[name] = fn; }\nfunction render(){\n  renderBelt();\n"),
    ('core/render.js',
     "  if(state.tab === 'today'){ renderWeek(); renderDay(); renderHabits(); renderSync(); }\n  else if(state.tab === 'lifts') renderLifts();\n  else if(state.tab === 'body') renderBody();\n  else if(state.tab === 'build') renderBuild();\n  else renderProgress();\n",
     "  (tabs[state.tab] || tabs.progress)();\n"),
    # each tab's UI flags are flipped by the tab's own actions; app.js calls the action
    ('app.js',
     "      case 'body-week': { var nwk = addDays(bodyWeek || mondayOf(todayKey()), 7*(parseInt(t.getAttribute('data-dir'), 10) || 0)); if(nwk <= mondayOf(todayKey())){ bodyWeek = nwk; render(); } break; }\n",
     "      case 'body-week': stepBodyWeek(parseInt(t.getAttribute('data-dir'), 10) || 0); break;\n"),
    ('app.js', "      case 'lift-filter': liftFilter = t.getAttribute('data-loc'); render(); break;\n",
               "      case 'lift-filter': setLiftFilter(t.getAttribute('data-loc')); break;\n"),
    ('app.js', "      case 'toggle-ladder': showLadder = !showLadder; render(); break;\n",
               "      case 'toggle-ladder': toggleLadder(); break;\n"),
    ('app.js', "      case 'bnode': { var bid = t.getAttribute('data-id'); bSel = bSel === bid ? null : bid; render(); break; }\n",
               "      case 'bnode': selectNode(t.getAttribute('data-id')); break;\n"),
    ('app.js', "      case 'bsel-clear': bSel = null; render(); break;\n", "      case 'bsel-clear': clearSelection(); break;\n"),
    ('app.js', "      case 'bshow-all': bShowAll = !bShowAll; render(); break;\n", "      case 'bshow-all': toggleShowAll(); break;\n"),
    ('app.js', "      case 'toggle-bladder': showBLadder = !showBLadder; render(); break;\n", "      case 'toggle-bladder': toggleBuildLadder(); break;\n"),
    ('app.js', "if(e.key === 'Escape'){ closeSheets(); promoQueue = []; $('#promo').hidden = true; }",
               "if(e.key === 'Escape'){ closeSheets(); clearPromos(); }"),
    ('app.js',
     "  $('#lf-ex').addEventListener('change', function(){\n    var name = norm($('#lf-ex').value);\n    var past = state.lifts.filter(function(e){ return norm(e.exercise) === name; }).sort(function(a, b){ return liftKey(a) < liftKey(b) ? 1 : -1; })[0];\n    var empty = Array.from($('#lf-sets').querySelectorAll('input')).every(function(i){ return !i.value; });\n    if(past){\n      $('#lf-loc').value = past.location || 'Home';\n      if(empty){ $('#lf-sets').innerHTML = ''; liftSetCount = 0; past.sets.forEach(function(s){ addSetRow(s.w, ''); }); }\n      var tgt = past.target || autoTarget(past, past.location);\n      $('#lf-msg').className = 'lf-msg full'; $('#lf-msg').textContent = 'Quest from last time: ' + tgt;\n    }\n  });\n",
     "  $('#lf-ex').addEventListener('change', onExerciseChange);\n"),
    # T() reads state.settings; it lives with the state, not in the Body tab (state.js needs it for habit targets)
    ('features/body.js', "function T(){ return state.settings.targets || DEFAULT_TARGETS; }\n", ""),
    ('core/state.js', "function habitById(id){", "function T(){ return state.settings.targets || DEFAULT_TARGETS; }\nfunction habitById(id){"),
    # the coach's build tool selects a node through the Build tab's own setter
    ('features/coach.js', "bWrite('bnodes', obj); bSel = obj.id;", "bWrite('bnodes', obj); setSelected(obj.id);"),
    ('features/coach.js', "if(bSel === nid) bSel = null;", "if(bSel === nid) setSelected(null);"),
    ('features/coach.js', "if(bSel === id) bSel = null;", "if(bSel === id) setSelected(null);"),
]

# text appended to a module (actions and tab registrations)
APPEND = {
    'features/today.js': "\n/* the Today tab renders four parts; render() calls this through the registry */\nfunction renderToday(){ renderWeek(); renderDay(); renderHabits(); renderSync(); }\nregisterTab('today', renderToday);\n",
    'features/progress.js': "\nregisterTab('progress', renderProgress);\n",
    'features/lifts.js': "\n/* actions app.js calls; the tab's own flags stay in this file */\nfunction setLiftFilter(loc){ liftFilter = loc; render(); }\nfunction toggleLadder(){ showLadder = !showLadder; render(); }\nfunction onExerciseChange(){\n  var name = norm($('#lf-ex').value);\n  var past = state.lifts.filter(function(e){ return norm(e.exercise) === name; }).sort(function(a, b){ return liftKey(a) < liftKey(b) ? 1 : -1; })[0];\n  var empty = Array.from($('#lf-sets').querySelectorAll('input')).every(function(i){ return !i.value; });\n  if(past){\n    $('#lf-loc').value = past.location || 'Home';\n    if(empty){ $('#lf-sets').innerHTML = ''; liftSetCount = 0; past.sets.forEach(function(s){ addSetRow(s.w, ''); }); }\n    var tgt = past.target || autoTarget(past, past.location);\n    $('#lf-msg').className = 'lf-msg full'; $('#lf-msg').textContent = 'Quest from last time: ' + tgt;\n  }\n}\nregisterTab('lifts', renderLifts);\n",
    'features/body.js': "\n/* action app.js calls; bodyWeek stays in this file */\nfunction stepBodyWeek(dir){ var nwk = addDays(bodyWeek || mondayOf(todayKey()), 7*dir); if(nwk <= mondayOf(todayKey())){ bodyWeek = nwk; render(); } }\nregisterTab('body', renderBody);\n",
    'features/build.js': "\n/* actions app.js and the coach call; the tab's own flags stay in this file */\nfunction selectNode(id){ bSel = bSel === id ? null : id; render(); }\nfunction clearSelection(){ bSel = null; render(); }\nfunction toggleShowAll(){ bShowAll = !bShowAll; render(); }\nfunction toggleBuildLadder(){ showBLadder = !showBLadder; render(); }\nfunction setSelected(id){ bSel = id; }\nregisterTab('build', renderBuild);\n",
    'core/effects.js': "\nfunction clearPromos(){ promoQueue = []; $('#promo').hidden = true; }\n",
}

# identifiers that become properties of an exported object
RENAME = {'cloud': 'sync.cloud', 'lsOK': 'sync.lsOK', 'flushedOnce': 'sync.flushedOnce',
          'settingsWriting': 'sync.settingsWriting', 'liftOps': 'sync.liftOps', 'popSeg': 'ui.popSeg'}

OUT = os.path.join(ROOT, 'src')

def ident_positions(code, name):
    """Start offsets of `name` used as an identifier (not a property, not an object key) in code with strings blanked."""
    return [m.start() for m in re.finditer(r'(?<![\w$.])' + re.escape(name) + r'(?![\w$])(?!:)', code)]

def rename_idents(src, mapping):
    masked = strip_strings_and_comments(src)
    assert len(masked) == len(src)
    edits = []
    for name, new in mapping.items():
        for pos in ident_positions(masked, name):
            edits.append((pos, len(name), new))
    for pos, n, new in sorted(edits, reverse=True):
        src = src[:pos] + new + src[pos + n:]
    return src

def declared_names(src):
    """Top-level names in a module body (functions and var declarators), in order of appearance."""
    names = []
    for m in re.finditer(r'^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^var\s+([^\n]*)', src, re.M):
        if m.group(1): names.append(m.group(1)); continue
        depth, cur, parts = 0, '', []
        for ch in strip_strings_and_comments(m.group(2)):
            if ch in '([{': depth += 1
            elif ch in ')]}': depth -= 1
            if ch == ',' and depth == 0: parts.append(cur); cur = ''
            else: cur += ch
        parts.append(cur)
        for p in parts:
            mm = re.match(r'\s*([A-Za-z_$][\w$]*)', p)
            if mm: names.append(mm.group(1))
    return names

def main():
    bodies = {m: text_of(m) for m in MODULES}
    for m, old, new in EDITS:
        assert bodies[m].count(old) == 1, f'edit did not match exactly once in {m}: {old[:60]!r} ({bodies[m].count(old)} hits)'
        bodies[m] = bodies[m].replace(old, new)
    for m, extra in APPEND.items():
        bodies[m] += extra
    for m in bodies:
        bodies[m] = rename_idents(bodies[m], RENAME)
    # ownership
    owner = {}
    for m in MODULES:
        for n in declared_names(bodies[m]):
            assert n not in owner, f'{n} declared in both {owner[n]} and {m}'
            owner[n] = m
    for n in RENAME: assert n not in owner, f'{n} still declared somewhere'
    assert 'sync' in owner and 'ui' in owner
    # who uses what
    imports = {m: {} for m in MODULES}
    exported = {m: set() for m in MODULES}
    for m in MODULES:
        code = strip_strings_and_comments(bodies[m])
        for n, o in owner.items():
            if o != m and ident_positions(code, n):
                imports[m].setdefault(o, []).append(n)
                exported[o].add(n)
    # imports must point down: core never imports from features or app
    for m in MODULES:
        for o in imports[m]:
            if m.startswith('core/') and not o.startswith('core/'):
                raise SystemExit(f'LAYERING: {m} imports from {o}: {imports[m][o]}')
            if m.startswith('features/') and o == 'app.js':
                raise SystemExit(f'LAYERING: {m} imports from app.js: {imports[m][o]}')
    # write modules
    os.makedirs(os.path.join(OUT, 'js', 'core'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'js', 'features'), exist_ok=True)
    for m in MODULES:
        body = bodies[m]
        # export: prefix the declaring line
        for n in sorted(exported[m]):
            pat = re.compile(r'^((?:async\s+)?function\s+' + re.escape(n) + r'(?![\w$]))', re.M)
            if pat.search(body):
                body = pat.sub(r'export \1', body, count=1)
            else:
                # a var declarator: find its declaration line
                found = False
                for vm in re.finditer(r'^(export )?var\s+([^\n]*)', body, re.M):
                    if n in declared_names('var ' + vm.group(2) + '\n'):
                        if not vm.group(1):
                            body = body[:vm.start()] + 'export ' + body[vm.start():]
                        found = True; break
                assert found, f'could not export {n} from {m}'
        head = '// ' + DOC[m] + '\n'
        rel = lambda o: ('./' if os.path.dirname(m) == os.path.dirname(o) else ('../' if m.count('/') else './')) + (os.path.basename(o) if os.path.dirname(m) == os.path.dirname(o) else o)
        for o in sorted(imports[m], key=lambda o: ORDER.index(o)):
            names = sorted(imports[m][o], key=str.lower)
            head += f"import {{ {', '.join(names)} }} from '{rel(o)}';\n"
        if m == 'app.js':
            # features register their tabs when they load; import them for that even if nothing is called by name
            for f in ['features/today.js', 'features/progress.js', 'features/lifts.js', 'features/body.js', 'features/build.js', 'features/coach.js']:
                if f not in imports[m]: head += f"import './{f}';\n"
        path = os.path.join(OUT, 'js', m)
        open(path, 'w', encoding='utf-8').write(head + '\n' + body)
        print(f'{m:22} {len(body.splitlines()):5} lines  imports {sum(len(v) for v in imports[m].values()):3}  exports {len(exported[m]):3}')
    # index.html: swap the inline script for the module entry
    html_path = os.path.join(OUT, 'index.html')
    html = open(html_path, encoding='utf-8').read()
    a = html.index('<script>\n(function(){'); b = html.index('</script>', a) + len('</script>')
    html = html[:a] + '<script type="module" src="js/app.js"></script>' + html[b:]
    open(html_path, 'w', encoding='utf-8').write(html)
    print('src/index.html now loads js/app.js as a module')

if __name__ == '__main__':
    main()
