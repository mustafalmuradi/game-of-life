// Build tab: system map, ship log, skills.
import { $, addDays, clone, esc, fmt, fmtShort, mondayOf, parseKey, todayKey, uid } from '../core/utils.js';
import { state } from '../core/state.js';
import { ironLevel, ironXPFor } from '../core/strength.js';
import { persistLocal, sync } from '../core/store.js';
import { burst, toast } from '../core/effects.js';
import { registerTab, render } from '../core/render.js';
import { closeSheets, openSheet } from '../core/sheets.js';

/* ---------- build: what Moose builds with Claude ---------- */
/* Data: tracker/bnodes (map boxes + their links), tracker/bships (ship log), tracker/bskills. Builder XP is its own track. */
export var BXP = {ship:50, live:75, connect:40, upgrade:25, fix:10, skill:30};
export var BKINDS = [{k:'ship', n:'Shipped a build'}, {k:'live', n:'Went live'}, {k:'connect', n:'New connection'}, {k:'upgrade', n:'Upgrade'}, {k:'fix', n:'Fix'}];
export var BCOLS = [{k:'source', n:'Apps & data'}, {k:'engine', n:'Claude + pipes'}, {k:'build', n:'Builds'}];
export var BSTATUS = [{k:'live', n:'Live', c:'var(--z-green)'}, {k:'building', n:'Building', c:'var(--gold)'}, {k:'idea', n:'Idea', c:'var(--muted)'}, {k:'paused', n:'Paused', c:'var(--muted)'}];
var BRANKS = [[1,'Tinkerer'],[3,'Builder'],[5,'Maker'],[8,'Engineer'],[12,'Architect'],[17,'Systems Architect'],[25,'Master Builder']];
var VENTURES = ['Ock Spot', 'Web design', 'BOSS', 'AISMMA', 'Recruiting', 'Life', 'Money'];
export var bSel = null, bForm = null, bArmed = false, bShowAll = false, showBLadder = false;
export function bStatus(k){ return BSTATUS.filter(function(x){ return x.k === k; })[0] || BSTATUS[2]; }
export function bKind(k){ return BKINDS.filter(function(x){ return x.k === k; })[0] || BKINDS[3]; }
export function bNode(id){ return state.build.bnodes.filter(function(n){ return n.id === id; })[0]; }
export function bRank(L){ var r = BRANKS[0][1]; BRANKS.forEach(function(x){ if(L >= x[0]) r = x[1]; }); return r; }
export function buildStats(){
  var B = state.build, xp = 0;
  B.bships.forEach(function(x){ xp += BXP[x.kind] || BXP.fix; });
  xp += B.bskills.length * BXP.skill;
  var weeks = new Set(B.bships.map(function(x){ return mondayOf(x.date || todayKey()); }));
  var ws = mondayOf(todayKey()); if(!weeks.has(ws)) ws = addDays(ws, -7);
  var streak = 0; while(weeks.has(ws)){ streak++; ws = addDays(ws, -7); }
  var links = 0; B.bnodes.forEach(function(n){ links += (n.links || []).filter(function(l){ return bNode(l.to); }).length; });
  var live = B.bnodes.filter(function(n){ return n.kind === 'build' && n.status === 'live'; }).length;
  var L = ironLevel(xp);
  return {xp:xp, level:L, lo:ironXPFor(L), hi:ironXPFor(L+1), streak:streak, links:links, live:live, ships:B.bships.length, skills:B.bskills.length};
}
function bLabel(name, x, cy){
  var words = String(name || '').split(/\s+/), l1 = '', l2 = '';
  words.forEach(function(w){ if(!l2 && (l1 + (l1 ? ' ' : '') + w).length <= 14) l1 += (l1 ? ' ' : '') + w; else l2 += (l2 ? ' ' : '') + w; });
  if(!l1){ l1 = shortName(l2, 14); l2 = ''; }
  var t = '<text x="' + x + '" font-size="10.5" font-weight="700" fill="var(--ink)" font-family="var(--font-body)">';
  if(!l2) return t.replace('<text ', '<text y="' + (cy + 3.5) + '" ') + esc(l1) + '</text>';
  return t.replace('<text ', '<text y="' + (cy - 2.5) + '" ') + '<tspan x="' + x + '">' + esc(l1) + '</tspan><tspan x="' + x + '" dy="12">' + esc(shortName(l2, 14)) + '</tspan></text>';
}
function shortName(s, n){ s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function mapSVG(){
  var nodes = state.build.bnodes, colW = 104, gx = 16, top = 24, rowH = 44, bh = 34, W = colW*3 + gx*2 + 18;
  var pos = {}, rows = 0;
  BCOLS.forEach(function(c, ci){
    var list = nodes.filter(function(n){ return (n.kind || 'build') === c.k; }).sort(function(a, b){ return (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name)); });
    list.forEach(function(n, i){ pos[n.id] = {x:ci*(colW + gx), y:top + i*rowH, w:colW, h:bh}; });
    rows = Math.max(rows, list.length);
  });
  var H = top + Math.max(rows, 1)*rowH;
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="System map: how your apps and data feed Claude and your builds">';
  s += '<defs><marker id="bm-a" viewBox="0 0 8 8" refX="7.5" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z" fill="var(--muted)"/></marker>' +
       '<marker id="bm-b" viewBox="0 0 8 8" refX="7.5" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z" fill="var(--accent)"/></marker></defs>';
  BCOLS.forEach(function(c, ci){ s += '<text x="' + (ci*(colW + gx) + colW/2) + '" y="11" text-anchor="middle" font-size="9.5" font-weight="800" letter-spacing="1" fill="var(--muted)" font-family="var(--font-body)">' + esc(c.n.toUpperCase()) + '</text>'; });
  var edges = [], labels = [];
  nodes.forEach(function(n){ (n.links || []).forEach(function(l){ var a = pos[n.id], b = pos[l.to]; if(!a || !b) return; edges.push({from:n.id, to:l.to, label:l.label || '', a:a, b:b}); }); });
  edges.forEach(function(e){
    var on = bSel && (e.from === bSel || e.to === bSel), a = e.a, b = e.b, ay = a.y + a.h/2, by = b.y + b.h/2, d, mx, my;
    if(b.x > a.x){ var x1 = a.x + a.w, x2 = b.x - 1; d = 'M' + x1 + ' ' + ay + 'C' + (x1 + 22) + ' ' + ay + ' ' + (x2 - 22) + ' ' + by + ' ' + x2 + ' ' + by; mx = (x1 + x2)/2; my = (ay + by)/2; }
    else if(b.x < a.x){ var x3 = a.x, x4 = b.x + b.w + 1; d = 'M' + x3 + ' ' + ay + 'C' + (x3 - 22) + ' ' + ay + ' ' + (x4 + 22) + ' ' + by + ' ' + x4 + ' ' + by; mx = (x3 + x4)/2; my = (ay + by)/2; }
    else { var x5 = a.x + a.w, bend = x5 + 14; d = 'M' + x5 + ' ' + ay + 'C' + bend + ' ' + ay + ' ' + bend + ' ' + by + ' ' + (x5 + 1) + ' ' + by; mx = bend; my = (ay + by)/2; }
    s += '<path d="' + d + '" fill="none" stroke="' + (on ? 'var(--accent)' : 'var(--muted)') + '" stroke-width="' + (on ? 2 : 1.3) + '" stroke-opacity="' + (on ? 1 : (bSel ? .2 : .55)) + '" marker-end="url(#' + (on ? 'bm-b' : 'bm-a') + ')"/>';
    if(false && on && e.label) labels.push('<text x="' + mx.toFixed(1) + '" y="' + (my - 4).toFixed(1) + '" text-anchor="middle" font-size="9.5" font-weight="700" fill="var(--accent-ink)" stroke="var(--surface)" stroke-width="3" paint-order="stroke" font-family="var(--font-body)">' + esc(shortName(e.label, 22)) + '</text>');
  });
  nodes.forEach(function(n){
    var p = pos[n.id]; if(!p) return;
    var st = bStatus(n.status), sel = bSel === n.id, dim = bSel && !sel && !edges.some(function(e){ return (e.from === bSel && e.to === n.id) || (e.to === bSel && e.from === n.id); });
    s += '<g class="bn" data-act="bnode" data-id="' + esc(n.id) + '" tabindex="0" role="button" aria-label="' + esc(n.name + ', ' + st.n) + '" opacity="' + (dim ? .45 : 1) + '">' +
      '<rect x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + p.h + '" rx="9" fill="var(--surface)" stroke="' + (sel ? 'var(--accent)' : st.c) + '" stroke-width="' + (sel ? 2.5 : 1.6) + '"' + (n.status === 'idea' ? ' stroke-dasharray="4 3"' : '') + (n.status === 'paused' ? ' stroke-opacity=".5"' : '') + '/>' +
      '<circle cx="' + (p.x + 10) + '" cy="' + (p.y + p.h/2) + '" r="3.5" fill="' + st.c + '"/>' +
      bLabel(n.name, p.x + 18, p.y + p.h/2) + '</g>';
  });
  return s + labels.join('') + '</svg>';
}
function bDetailHTML(){
  var n = bNode(bSel); if(!n) return '<p class="muted small">Tap any box to see what it connects to.</p>';
  var st = bStatus(n.status), out = [], inn = [];
  state.build.bnodes.forEach(function(m){ (m.links || []).forEach(function(l){ if(m.id === n.id && bNode(l.to)) out.push({n:bNode(l.to), l:l}); if(l.to === n.id) inn.push({n:m, l:l}); }); });
  var ships = state.build.bships.filter(function(x){ return x.node === n.id; }).sort(function(a, b){ return a.date < b.date ? 1 : -1; });
  var h = '<div class="bdetail"><div class="bdetail-top"><b>' + esc(n.name) + '</b><span class="bstat-row"><span class="bst bst-' + esc(st.k) + '">' + st.n + '</span>' + (n.venture ? '<span class="bst bst-idea">' + esc(n.venture) + '</span>' : '') + '</span></div>';
  if(n.note) h += '<p>' + esc(n.note) + '</p>';
  if(n.url && /^https?:\/\//.test(n.url)) h += '<a href="' + esc(n.url) + '" target="_blank" rel="noopener">' + esc(n.url.replace(/^https?:\/\//, '')) + '</a>';
  if(out.length || inn.length){
    h += '<ul class="blinks">' + inn.map(function(x){ return '<li><span><b>' + esc(x.n.name) + '</b> → here' + (x.l.label ? ' · ' + esc(x.l.label) : '') + '</span></li>'; }).join('') +
      out.map(function(x){ return '<li><span>here → <b>' + esc(x.n.name) + '</b>' + (x.l.label ? ' · ' + esc(x.l.label) : '') + '</span><button class="rm" type="button" data-act="bunlink" data-id="' + esc(n.id) + '" data-to="' + esc(x.n.id) + '" aria-label="Remove connection to ' + esc(x.n.name) + '">×</button></li>'; }).join('') + '</ul>';
  }
  if(ships.length) h += '<p class="small"><b>' + ships.length + (ships.length === 1 ? ' ship' : ' ships') + '</b> · last: ' + esc(ships[0].title) + ' (' + esc(fmtShort(ships[0].date)) + ')</p>';
  h += '<div class="rest-pair"><button class="rest-btn" type="button" data-act="bedit-node" data-id="' + esc(n.id) + '">Edit</button><button class="rest-btn" type="button" data-act="bnew-ship" data-node="' + esc(n.id) + '">Log a ship here</button><button class="rest-btn" type="button" data-act="bsel-clear">Close</button></div></div>';
  return h;
}
function renderBuild(){
  var view = $('#view-build'), bs = buildStats(), B = state.build;
  var pct = (bs.xp - bs.lo)/(bs.hi - bs.lo)*100;
  var h = '<section class="card iron">' +
    '<div class="iron-main"><button class="emblem" type="button" data-act="toggle-bladder" aria-expanded="' + showBLadder + '" aria-label="Builder level ' + bs.level + '. Show rank ladder"><span class="emblem-in"><span class="lv">LVL</span><span class="n">' + bs.level + '</span></span></button>' +
    '<div class="iron-rank"><p class="eyebrow">Builder rank</p><p class="iron-title">' + esc(bRank(bs.level)) + '</p>' +
    '<div class="bar gold"><span style="width:' + pct.toFixed(1) + '%"></span></div>' +
    '<p class="iron-xp"><span><b>' + fmt(bs.xp) + '</b> builder XP</span><span>' + fmt(bs.hi - bs.xp) + ' to level ' + (bs.level + 1) + '</span></p></div></div>';
  if(showBLadder) h += '<div class="ladder">' + BRANKS.map(function(r, i){ var nextMin = BRANKS[i+1] ? BRANKS[i+1][0] - 1 : null; var now = bs.level >= r[0] && (nextMin === null || bs.level <= nextMin), done = nextMin !== null && bs.level > nextMin; return '<div class="rung' + (now ? ' now' : '') + (done ? ' done' : '') + '"><b>' + esc(r[1]) + '</b><span>Lv ' + r[0] + (nextMin ? '–' + nextMin : '+') + '</span></div>'; }).join('') + '</div>';
  h += '<div class="iron-tiles"><div><b>' + bs.live + '</b><span>Builds live</span></div><div><b>' + bs.links + '</b><span>Connections</span></div><div><b>' + bs.skills + '</b><span>Skills</span></div><div><b>' + bs.streak + '</b><span>Ship-week streak</span></div></div>' +
    '<p class="iron-note">Builder XP is its own track. It never feeds your belts, so building can’t cover for a skipped habit. Tell Claude what you built in any chat and it lands here.</p>' +
    '<div class="bactions"><button class="primary" type="button" data-act="bnew-ship">Log a ship</button><button class="ghost" type="button" data-act="bnew-node">Add to map</button><button class="ghost" type="button" data-act="bnew-skill">Add skill</button></div></section>';

  h += '<section class="card panel"><div class="panel-head"><h3>System map</h3><span class="muted" style="font-size:12px">' + B.bnodes.length + ' parts · ' + bs.links + ' connections</span></div>';
  h += B.bnodes.length ? '<figure class="bmap" style="margin:0">' + mapSVG() + '<figcaption class="muted small" style="margin-top:6px">Left to right: where data comes from, what moves it, what it builds. Arrows show which way it flows. Tap a box to light up its connections and see what each one carries.</figcaption></figure>' : '<p class="empty">Nothing on the map yet. Add your first build or app.</p>';
  h += '<div class="blegend">' + BSTATUS.map(function(x){ return '<span><i style="background:' + x.c + (x.k === 'paused' ? ';opacity:.5' : '') + '"></i>' + x.n + (x.k === 'idea' ? ' (dashed)' : '') + '</span>'; }).join('') + '</div>' + bDetailHTML() + '</section>';

  var ships = B.bships.slice().sort(function(a, b){ return a.date === b.date ? ((b.createdAt || 0) - (a.createdAt || 0)) : (a.date < b.date ? 1 : -1); });
  var weeks = [], wmap = {};
  ships.forEach(function(x){ var w = mondayOf(x.date || todayKey()); if(!wmap[w]){ wmap[w] = {w:w, list:[], xp:0}; weeks.push(wmap[w]); } wmap[w].list.push(x); wmap[w].xp += BXP[x.kind] || BXP.fix; });
  var shown = bShowAll ? weeks : weeks.slice(0, 4);
  h += '<section class="card panel"><div class="panel-head"><h3>Ship log</h3><span class="muted" style="font-size:12px">' + bs.ships + ' shipped · tap one to edit</span></div>';
  if(!ships.length) h += '<p class="empty">Nothing shipped yet. Log the first one.</p>';
  shown.forEach(function(wk){
    h += '<div class="bweek"><div class="bweek-h"><b>' + (wk.w === mondayOf(todayKey()) ? 'This week' : 'Week of ' + esc(fmtShort(wk.w))) + '</b><em>' + wk.list.length + (wk.list.length === 1 ? ' ship' : ' ships') + ' · +' + wk.xp + ' XP</em></div>' +
      wk.list.map(function(x){ var n = bNode(x.node), k = bKind(x.kind);
        return '<button class="bship" type="button" data-act="bedit-ship" data-id="' + esc(x.id) + '"><span class="bd">' + esc(parseKey(x.date).toLocaleDateString('en-US', {weekday:'short'})) + '<br>' + esc(fmtShort(x.date)) + '</span>' +
          '<span><span class="bt"><span class="bkind k-' + esc(k.k) + '">' + esc(k.n) + '</span>' + esc(x.title) + '</span>' + (n || x.note ? '<span class="bm" style="display:block">' + esc([n ? n.name : '', x.note || ''].filter(Boolean).join(' · ')) + '</span>' : '') + '</span>' +
          '<span class="bx">+' + (BXP[x.kind] || BXP.fix) + '</span></button>'; }).join('') + '</div>';
  });
  if(weeks.length > 4) h += '<button class="link-btn" type="button" data-act="bshow-all">' + (bShowAll ? 'Show recent weeks' : 'Show all ' + weeks.length + ' weeks') + '</button>';
  h += '</section>';

  var skills = B.bskills.slice().sort(function(a, b){ return a.date < b.date ? 1 : -1; });
  h += '<section class="card panel"><div class="panel-head"><h3>Skills learned</h3><span class="muted" style="font-size:12px">What you can do now that you couldn’t before</span></div>';
  h += skills.length ? '<div class="bskills">' + skills.map(function(x){ var n = bNode(x.node); return '<button class="bskill" type="button" data-act="bedit-skill" data-id="' + esc(x.id) + '"><b>' + esc(x.name) + '</b><span>' + esc(fmtShort(x.date)) + (n ? ' · on ' + esc(n.name) : '') + '</span>' + (x.note ? '<em>' + esc(x.note) + '</em>' : '') + '</button>'; }).join('') + '</div>' : '<p class="empty">No skills logged yet.</p>';
  h += '</section>';

  h += '<section class="card panel"><div class="panel-head"><h3>Builder XP</h3></div><ul class="rules">' +
    BKINDS.map(function(k){ return '<li><b class="g">+' + BXP[k.k] + '</b><span>' + esc(k.n) + ({ship:': a new build exists and works', live:': real people can use it', connect:': two things now talk to each other', upgrade:': a real feature added', fix:': a bug or polish pass'})[k.k] + '</span></li>'; }).join('') +
    '<li><b class="g">+' + BXP.skill + '</b><span>New skill: something you can now do on your own</span></li></ul>' +
    '<p class="principle">Log what shipped, not what you worked on. Hours don’t count; finished things do.</p></section>';
  view.innerHTML = h;
  view.style.display = 'flex'; view.style.flexDirection = 'column'; view.style.gap = '14px';
}
/* build sheet */
function bOptions(list, cur, none){ return (none ? '<option value="">' + esc(none) + '</option>' : '') + list.map(function(o){ return '<option value="' + esc(o.k) + '"' + (o.k === cur ? ' selected' : '') + '>' + esc(o.n) + '</option>'; }).join(''); }
function bNodeOptions(cur, none, skip){ return bOptions(state.build.bnodes.filter(function(n){ return n.id !== skip; }).slice().sort(function(a, b){ return String(a.name).localeCompare(String(b.name)); }).map(function(n){ return {k:n.id, n:n.name}; }), cur, none); }
export function openBuildSheet(mode, id, preset){
  bArmed = false;
  var B = state.build, rec = id ? (B[mode === 'ship' ? 'bships' : mode === 'skill' ? 'bskills' : 'bnodes'].filter(function(x){ return x.id === id; })[0] || null) : null;
  bForm = {mode:mode, id:rec ? rec.id : null};
  var r = rec || preset || {}, f = '';
  if(mode === 'ship'){
    $('#bd-h').textContent = rec ? 'Edit ship' : 'Log a ship';
    f += '<label class="lf-field full" for="bd-title"><span>What shipped</span><input id="bd-title" maxlength="90" value="' + esc(r.title || '') + '" placeholder="Ock Spot site: menu page live"></label>' +
      '<label class="lf-field" for="bd-kind"><span>Type</span><select id="bd-kind">' + bOptions(BKINDS, r.kind || 'upgrade') + '</select></label>' +
      '<label class="lf-field" for="bd-date"><span>Date</span><input id="bd-date" type="date" value="' + esc(r.date || todayKey()) + '"></label>' +
      '<label class="lf-field full" for="bd-node"><span>Part of</span><select id="bd-node">' + bNodeOptions(r.node || '', 'Not on the map') + '</select></label>' +
      '<label class="lf-field full" for="bd-note"><span>Notes</span><input id="bd-note" maxlength="160" value="' + esc(r.note || '') + '" placeholder="What changed, what it unlocks"></label>';
  } else if(mode === 'skill'){
    $('#bd-h').textContent = rec ? 'Edit skill' : 'Add a skill';
    f += '<label class="lf-field full" for="bd-name"><span>Skill</span><input id="bd-name" maxlength="60" value="' + esc(r.name || '') + '" placeholder="Connecting apps to Claude"></label>' +
      '<label class="lf-field" for="bd-date"><span>Learned</span><input id="bd-date" type="date" value="' + esc(r.date || todayKey()) + '"></label>' +
      '<label class="lf-field" for="bd-node"><span>Learned on</span><select id="bd-node">' + bNodeOptions(r.node || '', 'Nothing specific') + '</select></label>' +
      '<label class="lf-field full" for="bd-note"><span>What you can do now</span><input id="bd-note" maxlength="140" value="' + esc(r.note || '') + '" placeholder="Hook any app with a connector into a chat"></label>';
  } else {
    $('#bd-h').textContent = rec ? 'Edit ' + (rec.name || 'part') : 'Add to the map';
    f += '<label class="lf-field full" for="bd-name"><span>Name</span><input id="bd-name" maxlength="40" value="' + esc(r.name || '') + '" placeholder="Client website: Joe’s Barbershop"></label>' +
      '<label class="lf-field" for="bd-col"><span>Column</span><select id="bd-col">' + bOptions(BCOLS, r.kind || 'build') + '</select></label>' +
      '<label class="lf-field" for="bd-status"><span>Status</span><select id="bd-status">' + bOptions(BSTATUS, r.status || 'building') + '</select></label>' +
      '<label class="lf-field" for="bd-venture"><span>Venture</span><input id="bd-venture" list="bd-ventures" maxlength="30" value="' + esc(r.venture || '') + '" placeholder="Ock Spot"></label><datalist id="bd-ventures">' + VENTURES.map(function(v){ return '<option value="' + esc(v) + '"></option>'; }).join('') + '</datalist>' +
      '<label class="lf-field" for="bd-url"><span>Link</span><input id="bd-url" type="url" maxlength="200" value="' + esc(r.url || '') + '" placeholder="https://"></label>' +
      '<label class="lf-field" for="bd-to"><span>Sends to (new connection)</span><select id="bd-to">' + bNodeOptions('', 'No new connection', r.id) + '</select></label>' +
      '<label class="lf-field" for="bd-label"><span>What it sends</span><input id="bd-label" maxlength="40" placeholder="daily health records"></label>' +
      '<label class="lf-field full" for="bd-note"><span>Notes</span><input id="bd-note" maxlength="200" value="' + esc(r.note || '') + '" placeholder="What it does, what’s next"></label>';
  }
  var xpLbl = mode === 'ship' ? '+' + (BXP[r.kind || 'upgrade']) + ' XP' : mode === 'skill' ? '+' + BXP.skill + ' XP' : 'Map';
  $('#bd-xp').textContent = xpLbl;
  f += '<p class="lf-msg full" id="bd-msg" role="status"></p><div class="sheet-actions full">' + (rec ? '<button class="ghost" type="button" data-act="bdelete">Delete</button>' : '') + '<button class="ghost" type="button" data-act="close-sheet">Cancel</button><button class="primary" type="submit">Save</button></div>';
  $('#bd-form').innerHTML = f;
  openSheet('#build-sheet');
}
export function bWrite(cn, obj){
  var list = state.build[cn], i = list.map(function(x){ return x.id; }).indexOf(obj.id);
  if(i >= 0) list[i] = obj; else list.push(obj);
  persistLocal();
  if(sync.cloud && sync.cloud[cn]){ var body = clone(obj); delete body.id; sync.cloud[cn].doc(obj.id).set(body).catch(function(){ toast('Couldn’t reach your account. Saved on this device.'); }); }
}
export function bRemove(cn, id){
  state.build[cn] = state.build[cn].filter(function(x){ return x.id !== id; });
  persistLocal();
  if(sync.cloud && sync.cloud[cn]) sync.cloud[cn].doc(id).delete().catch(function(){ toast('Couldn’t reach your account.'); });
}
export function saveBuildForm(){
  var m = bForm; if(!m) return;
  var msg = $('#bd-msg'), now = Date.now(), prevL = buildStats().level, B = state.build;
  function val(id){ var el = $('#' + id); return el ? el.value.trim() : ''; }
  function err(t, id){ msg.className = 'lf-msg full err'; msg.textContent = t; if(id && $('#' + id)) $('#' + id).focus(); }
  if(m.mode === 'ship'){
    var title = val('bd-title'); if(!title) return err('Say what shipped.', 'bd-title');
    var date = val('bd-date') || todayKey(); if(date > todayKey()) return err('That date is in the future.', 'bd-date');
    var old = m.id ? B.bships.filter(function(x){ return x.id === m.id; })[0] : null;
    bWrite('bships', {id:m.id || 'b' + uid(), title:title, kind:val('bd-kind') || 'upgrade', date:date, node:val('bd-node'), note:val('bd-note'), createdAt:old ? old.createdAt : now, source:'page'});
  } else if(m.mode === 'skill'){
    var nm = val('bd-name'); if(!nm) return err('Name the skill.', 'bd-name');
    var old2 = m.id ? B.bskills.filter(function(x){ return x.id === m.id; })[0] : null;
    bWrite('bskills', {id:m.id || 'b' + uid(), name:nm, date:val('bd-date') || todayKey(), node:val('bd-node'), note:val('bd-note'), createdAt:old2 ? old2.createdAt : now, source:'page'});
  } else {
    var nn = val('bd-name'); if(!nn) return err('Give it a name.', 'bd-name');
    var url = val('bd-url'); if(url && !/^https?:\/\//.test(url)) url = 'https://' + url;
    var old3 = m.id ? bNode(m.id) : null, links = old3 && Array.isArray(old3.links) ? old3.links.slice() : [];
    var to = val('bd-to'); if(to && !links.some(function(l){ return l.to === to; })) links.push({to:to, label:val('bd-label')});
    var nid = m.id || 'n' + uid();
    bWrite('bnodes', {id:nid, name:nn, kind:val('bd-col') || 'build', status:val('bd-status') || 'building', venture:val('bd-venture'), url:url, note:val('bd-note'), links:links, order:old3 ? (old3.order || 0) : B.bnodes.length + 1, createdAt:old3 ? old3.createdAt : now, source:'page'});
    bSel = nid;
  }
  closeSheets(); render();
  var nb = buildStats();
  if(nb.level > prevL){ burst(); toast('Builder level ' + nb.level + ' · ' + bRank(nb.level)); }
  else toast(m.mode === 'node' ? 'Map updated' : 'Logged · ' + fmt(nb.xp) + ' builder XP');
}
export function bDelete(){
  var m = bForm; if(!m || !m.id) return;
  if(!bArmed){ bArmed = true; var b = document.querySelector('#bd-form [data-act="bdelete"]'); if(b){ b.textContent = 'Tap again to delete'; b.classList.add('armed'); } return; }
  var cn = m.mode === 'ship' ? 'bships' : m.mode === 'skill' ? 'bskills' : 'bnodes';
  bRemove(cn, m.id);
  if(cn === 'bnodes'){
    state.build.bnodes.forEach(function(n){ if((n.links || []).some(function(l){ return l.to === m.id; })){ var c = clone(n); c.links = c.links.filter(function(l){ return l.to !== m.id; }); bWrite('bnodes', c); } });
    if(bSel === m.id) bSel = null;
  }
  closeSheets(); render(); toast('Deleted');
}
export function bUnlink(id, to){
  var n = bNode(id); if(!n) return;
  var c = clone(n); c.links = (c.links || []).filter(function(l){ return l.to !== to; }); bWrite('bnodes', c); render();
}


/* actions app.js and the coach call; the tab's own flags stay in this file */
export function selectNode(id){ bSel = bSel === id ? null : id; render(); }
export function clearSelection(){ bSel = null; render(); }
export function toggleShowAll(){ bShowAll = !bShowAll; render(); }
export function toggleBuildLadder(){ showBLadder = !showBLadder; render(); }
export function setSelected(id){ bSel = id; }
registerTab('build', renderBuild);
