// Lifts tab: session cards, the lift sheet, save/delete.
import { $, esc, fmt, fmtLong, fmtShort, pad, todayKey, uid } from '../core/utils.js';
import { habitById, isActive, state } from '../core/state.js';
import { autoTarget, fmtW, ironXPFor, isBW, liftBadges, liftKey, liftScore, liftVolume, LSTATUS, LXP, MOOSE_RANKS, mooseRank, norm, REP_TOP, STALL_N, TIERS, topSet, workingText } from '../core/strength.js';
import { recompute } from '../core/stats.js';
import { flushLiftOps, persistLocal, sync } from '../core/store.js';
import { mutateDay } from './today.js';
import { burst, toast } from '../core/effects.js';
import { registerTab, render } from '../core/render.js';
import { badgeSVG } from './progress.js';
import { tmin } from './body.js';
import { closeSheets, openSheet } from '../core/sheets.js';

/* ---------- lifts view ---------- */
var liftArmed = null, liftArmTimer = null;
var openLiftKeys = new Set();
function sparkSVG(entries){
  var pts = entries.slice(-12).map(liftScore);
  if(pts.length < 2) return '<svg class="spark" viewBox="0 0 132 44" aria-hidden="true"><line x1="4" y1="22" x2="128" y2="22" stroke="var(--line)" stroke-width="1" stroke-dasharray="3 3"/><circle cx="128" cy="22" r="3.5" fill="var(--accent)"/></svg>';
  var min = Math.min.apply(null, pts), max = Math.max.apply(null, pts), pad = 6, W = 132, H = 44, span = max - min || 1;
  var xy = pts.map(function(v, i){ return [4 + i*((W-8)/(pts.length-1)), H - pad - ((v-min)/span)*(H - pad*2)]; });
  var line = xy.map(function(p, i){ return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
  var last = xy[xy.length-1];
  var area = line + ' L' + last[0].toFixed(1) + ' ' + H + ' L' + xy[0][0].toFixed(1) + ' ' + H + ' Z';
  return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-label="Est. 1RM trend, last ' + pts.length + ' sessions"><line x1="0" y1="' + (H-1) + '" x2="' + W + '" y2="' + (H-1) + '" stroke="var(--line)" stroke-width="1"/><path d="' + area + '" fill="var(--spark-fill)"/><path d="' + line + '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="3.5" fill="var(--accent)"/></svg>';
}
function setsHTML(sets){ return (sets || []).map(function(s){ return '<span class="set">' + (s.w > 0 ? fmtW(s.w) : 'BW') + '<small> × </small>' + s.r + '</span>'; }).join(''); }
function tierInfo(g){
  var tk = g.tier[0], tn = g.tier[1], tmin = g.tier[2];
  var ti = TIERS.map(function(t){ return t[0]; }).indexOf(tk), nxt = TIERS[ti+1];
  var pct = nxt ? Math.max(0, Math.min(100, (g.gain - tmin)/(nxt[2] - tmin)*100)) : 100;
  var label = (g.gain >= 0 ? '+' : '') + g.gain.toFixed(1) + '% est. 1RM' + (nxt ? ' · ' + (nxt[2] - g.gain).toFixed(1) + '% to ' + nxt[1] : ' · top tier');
  return {key:tk, name:tn, pct:pct, label:label};
}
function sessionEntry(e, g){
  var st = LSTATUS[e._status] || LSTATUS.base, t = tierInfo(g), bw = isBW(e), ts = topSet(e);
  var isLatest = g.last.id === e.id, armed = liftArmed === e.id;
  var rir = e.rir !== undefined && e.rir !== null && e.rir !== '' ? 'RIR ' + esc(e.rir) : '';
  var meta = [rir, e.notes ? esc(e.notes) : ''].filter(Boolean).join(' · ');
  var h = '<div class="sx t-' + t.key + '">' +
    '<div class="sx-head"><h4>' + esc(e.exercise) + '</h4><span class="lpill ' + st[0] + '">' + st[1] + '</span>' + (e._cleared ? '<span class="cleared">✓ Quest</span>' : '') + '<span class="sx-xp">+' + e._xp + '</span></div>' +
    '<div class="sets">' + setsHTML(e.sets) + '</div>' +
    (meta ? '<p class="meta">' + meta + '</p>' : '');
  if(isLatest){
    var parsed = /^\s*([\d.]+|BW)\s*[×xX*]/i.test(g.quest);
    h += '<div class="quest"><span class="q-tag">Next</span><span class="q-text">' + esc(g.quest) + '<small>' + (parsed ? 'Hit every set at this weight next session' : 'Beat this session’s best set') + '</small></span><span class="q-xp">+' + LXP.quest + ' XP</span></div>';
    if(g.prog && g.prog.addWeight) h += '<p class="meta"><span class="pchip add">Add weight next session</span> Every working set hit ' + REP_TOP + '.</p>';
    else if(g.prog && g.prog.stall) h += '<p class="meta"><span class="pchip stall">Stall</span> ' + g.prog.since + ' sessions without more weight or reps. Change something: rest, reps in reserve, or a deload.</p>';
  }
  h += '<details class="sx-more" data-id="' + esc(e.id) + '"' + (openLiftKeys.has(e.id) ? ' open' : '') + '><summary>Lift progress <span class="tierchip">' + t.name + '</span></summary>' +
    '<div class="lift-figs"><div class="figs">' +
      '<div class="fig"><span class="fn">' + (bw ? g.best : Math.round(g.best)) + '</span><span class="fl">' + (bw ? 'Best reps' : 'Best est. 1RM') + '</span></div>' +
      '<div class="fig"><span class="fn">' + (ts ? (bw ? ts.r : fmtW(ts.w) + '×' + ts.r) : '–') + '</span><span class="fl">Top set here</span></div>' +
      (bw ? '' : '<div class="fig"><span class="fn">' + fmt(liftVolume(e)) + '</span><span class="fl">Volume lb</span></div>') +
      '<div class="fig"><span class="fn">' + g.entries.length + '</span><span class="fl">Sessions</span></div></div>' + sparkSVG(g.entries) + '</div>' +
    '<div class="tierbar"><div class="tb-track"><span style="width:' + t.pct.toFixed(1) + '%"></span></div><span class="tb-lbl">' + t.label + '</span></div>' +
    '<button class="delbtn' + (armed ? ' armed' : '') + '" type="button" data-act="del-lift" data-id="' + esc(e.id) + '">' + (armed ? 'Tap again to delete this entry' : 'Delete this entry') + '</button>' +
    '</details></div>';
  return h;
}
export var sessOpen = new Map();
function sessionCard(date, entries, groupOf, idx){
  var today = todayKey();
  var vol = entries.reduce(function(t, e){ return t + liftVolume(e); }, 0);
  var sets = entries.reduce(function(t, e){ return t + (e.sets || []).length; }, 0);
  var prs = entries.filter(function(e){ return e._status === 'pr'; }).length;
  var quests = entries.filter(function(e){ return e._cleared; }).length;
  var xp = entries.reduce(function(t, e){ return t + e._xp; }, LXP.day);
  var locs = Array.from(new Set(entries.map(function(e){ return e.location || 'Home'; }))).join(', ');
  var open = sessOpen.has(date) ? sessOpen.get(date) : idx < 2;
  var meta = [locs, entries.length + (entries.length === 1 ? ' lift' : ' lifts'), sets + ' sets', fmt(vol) + ' lb'];
  if(prs) meta.push(prs + (prs === 1 ? ' PR' : ' PRs'));
  if(quests) meta.push(quests + (quests === 1 ? ' quest' : ' quests'));
  return '<details class="card sess" data-date="' + date + '"' + (open ? ' open' : '') + '>' +
    '<summary class="sess-head"><span class="sess-l"><span class="sess-date">' + esc(date === today ? 'Today · ' + fmtShort(date) : fmtLong(date)) + '</span>' +
    '<span class="sess-meta">' + esc(meta.join(' · ')) + '</span></span>' +
    '<span class="sess-r"><span class="sess-xp">+' + xp + '<small>XP</small></span><svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></span></summary>' +
    '<div class="sess-body">' + entries.map(function(e){ return sessionEntry(e, groupOf.get(e.id)); }).join('') + '</div></details>';
}
var liftFilter = 'All', showLadder = false;
function renderLifts(){
  var view = $('#view-lifts');
  view.querySelectorAll('details.sx-more').forEach(function(d){ if(d.open) openLiftKeys.add(d.dataset.id); else openLiftKeys.delete(d.dataset.id); });
  view.querySelectorAll('details.sess').forEach(function(d){ sessOpen.set(d.dataset.date, d.open); });
  var a = state.liftStats, L = a.level, lo = ironXPFor(L), hi = ironXPFor(L+1), pct = (a.xp - lo)/(hi - lo)*100;
  var h = '<section class="card iron">' +
    '<div class="iron-main"><button class="emblem" type="button" data-act="toggle-ladder" aria-expanded="' + showLadder + '" aria-label="Strength level ' + L + '. Show rank ladder"><span class="emblem-in"><span class="lv">LVL</span><span class="n">' + L + '</span></span></button>' +
    '<div class="iron-rank"><p class="eyebrow">Strength rank</p><p class="iron-title">' + esc(mooseRank(L)) + '</p>' +
    '<div class="bar gold"><span style="width:' + pct.toFixed(1) + '%"></span></div>' +
    '<p class="iron-xp"><span><b>' + fmt(a.xp) + '</b> strength XP</span><span>' + fmt(hi - a.xp) + ' to level ' + (L+1) + '</span></p></div></div>';
  if(showLadder){
    h += '<div class="ladder">' + MOOSE_RANKS.map(function(r, i){
      var nextMin = MOOSE_RANKS[i+1] ? MOOSE_RANKS[i+1][0] - 1 : null;
      var now = L >= r[0] && (nextMin === null || L <= nextMin), done = nextMin !== null && L > nextMin;
      return '<div class="rung' + (now ? ' now' : '') + (done ? ' done' : '') + '"><b>' + esc(r[1]) + '</b><span>Lv ' + r[0] + (nextMin ? '–' + nextMin : '+') + '</span></div>';
    }).join('') + '</div>';
  }
  h += '<div class="iron-tiles">' +
    '<div><b>' + a.streak + '</b><span>Week streak</span></div><div><b>' + a.prs + '</b><span>PRs set</span></div>' +
    '<div><b>' + a.quests + '</b><span>Quests cleared</span></div><div><b>' + (a.vol/2000).toFixed(a.vol < 20000 ? 1 : 0) + '</b><span>Tons moved</span></div></div>';
  h += '<p class="iron-note">Belts reward showing up. Strength rank rewards getting stronger. Logging a lift checks off Work out for that day.</p>' +
    '<button class="primary wide" type="button" data-act="open-lift">Log a lift</button></section>';

  if(a.groups.length){
    h += '<section class="card panel"><div class="panel-head"><h3>Progression</h3><span class="muted" style="font-size:12px">8–12 reps · trend per lift</span></div><div class="lprog">' +
      a.groups.map(function(g){
        var pr = g.prog, chip;
        if(pr.addWeight) chip = '<span class="pchip add">Add weight</span>';
        else if(pr.stall) chip = '<span class="pchip stall">Stall · ' + pr.since + '</span>';
        else if(g.entries.length === 1) chip = '<span class="pchip">Baseline</span>';
        else if(pr.up) chip = '<span class="pchip up">Progress</span>';
        else chip = '<span class="pchip">Holding ' + pr.since + '</span>';
        return '<div class="lp-row"><b>' + esc(g.name) + '</b><span class="lp-w">' + esc(workingText(pr.working)) + ' \u00b7 ' + g.entries.length + (g.entries.length === 1 ? ' session' : ' sessions') + '</span>' + sparkSVG(g.entries) + chip + '</div>';
      }).join('') + '</div><p class="muted small">Add weight: every set at your working weight hit ' + REP_TOP + '. Stall: ' + STALL_N + ' sessions in a row without more weight or reps. The line is estimated 1RM (reps for bodyweight).</p></section>';
  }

  var locs = ['All'].concat(Array.from(new Set(a.groups.map(function(g){ return g.location; }))));
  if(locs.indexOf(liftFilter) < 0) liftFilter = 'All';
  if(locs.length > 2) h += '<div class="lfilters" role="group" aria-label="Filter by location">' + locs.map(function(l){ return '<button class="lchip" type="button" data-act="lift-filter" data-loc="' + esc(l) + '" aria-pressed="' + (l === liftFilter) + '">' + esc(l) + '</button>'; }).join('') + '</div>';
  if(!a.groups.length) h += '<p class="empty">No lifts yet. Tap Log a lift, or tell Claude your sets and it will log them here.</p>';
  else {
    var groupOf = new Map();
    a.groups.forEach(function(g){ g.entries.forEach(function(e){ groupOf.set(e.id, g); }); });
    var byDay = new Map();
    a.entries.forEach(function(e){
      if(liftFilter !== 'All' && (e.location || 'Home') !== liftFilter) return;
      if(!byDay.has(e.date)) byDay.set(e.date, []);
      byDay.get(e.date).push(e);
    });
    var dates = Array.from(byDay.keys()).sort().reverse();
    h += '<p class="sess-count eyebrow">' + dates.length + (dates.length === 1 ? ' session' : ' sessions') + '</p>';
    h += dates.map(function(d, i){ return sessionCard(d, byDay.get(d), groupOf, i); }).join('');
  }

  var list = liftBadges(a), got = list.filter(function(b){ return b.got; }).length;
  list.sort(function(x, y){ return (y.got - x.got) || ((y.cur/y.goal) - (x.cur/x.goal)); });
  h += '<section class="card panel"><div class="panel-head"><h3>Lift badges</h3><span class="muted" style="font-size:12px">' + got + ' of ' + list.length + ' earned</span></div><div class="badges">' +
    list.map(function(b){
      var p = Math.max(0, Math.min(100, b.cur/b.goal*100));
      return '<div class="badge' + (b.got ? ' earned' : '') + '">' + badgeSVG(b.got, 'var(--gold)', '<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>') + '<div><p class="bt">' + esc(b.name) + '</p><p class="bd">' + esc(b.desc) + '</p>' +
        (b.got ? '<p class="bp">Earned</p>' : '<div class="bar gold thin"><span style="width:' + p.toFixed(1) + '%"></span></div><p class="bp">' + fmt(b.cur) + ' / ' + fmt(b.goal) + '</p>') + '</div></div>';
    }).join('') + '</div></section>';

  h += '<section class="card panel"><div class="panel-head"><h3>Strength XP</h3></div><ul class="rules">' +
    '<li><b class="g">+' + LXP.set + '</b><span>Every working set logged</span></li>' +
    '<li><b class="g">+' + LXP.pr + '</b><span>PR: best est. 1RM ever on that lift</span></li>' +
    '<li><b class="g">+' + LXP.up + '</b><span>Beat last session, not a PR (+' + LXP.same + ' for matching it)</span></li>' +
    '<li><b class="g">+' + LXP.quest + '</b><span>Quest cleared: hit the next-session target</span></li>' +
    '<li><b class="g">+' + LXP.base + '</b><span>New lift added, plus +' + LXP.day + ' per training day</span></li>' +
    '<li><b>Tiers</b><span>Est. 1RM gain since your first session on a lift: Bronze, Silver +5%, Gold +10%, Platinum +20%, Diamond +35%.</span></li></ul>' +
    '<p class="principle">Strength XP is its own track. It doesn’t feed your belts, so a heavy day can’t cover for a skipped habit.</p></section>';
  view.innerHTML = h;
  view.style.display = 'flex'; view.style.flexDirection = 'column'; view.style.gap = '14px';
}
var liftSetCount = 0;
export function addSetRow(w, r){
  var i = liftSetCount++, row = document.createElement('div');
  row.className = 'setrow';
  row.innerHTML = '<span class="idx" aria-hidden="true"></span><input id="lf-w-' + i + '" type="number" inputmode="decimal" step="0.5" min="0" placeholder="lb" aria-label="Weight in pounds"><input id="lf-r-' + i + '" type="number" inputmode="numeric" step="1" min="1" placeholder="reps" aria-label="Reps"><button type="button" class="rm" aria-label="Remove set">×</button>';
  row.querySelector('#lf-w-' + i).value = (w === undefined || w === null) ? '' : w;
  row.querySelector('#lf-r-' + i).value = (r === undefined || r === null) ? '' : r;
  row.querySelector('.rm').addEventListener('click', function(){ row.remove(); numberSetRows(); });
  $('#lf-sets').appendChild(row); numberSetRows();
}
function numberSetRows(){ Array.from($('#lf-sets').children).forEach(function(r, i){ r.querySelector('.idx').textContent = i + 1; }); }
export function openLiftSheet(){
  $('#lf-ex').value = ''; $('#lf-date').value = state.selected <= todayKey() ? state.selected : todayKey(); $('#lf-rir').value = ''; $('#lf-notes').value = '';
  $('#lf-msg').textContent = ''; $('#lf-msg').className = 'lf-msg full';
  $('#lf-sets').innerHTML = ''; liftSetCount = 0; addSetRow(); addSetRow(); addSetRow();
  $('#lf-ex-list').innerHTML = Array.from(new Set(state.lifts.map(function(e){ return e.exercise; }))).map(function(x){ return '<option value="' + esc(x) + '"></option>'; }).join('');
  $('#lf-loc-list').innerHTML = Array.from(new Set(['Heights Fitness','Home'].concat(state.lifts.map(function(e){ return e.location || 'Home'; })))).map(function(x){ return '<option value="' + esc(x) + '"></option>'; }).join('');
  openSheet('#lift-sheet');
}
export function saveLift(){
  var msg = $('#lf-msg');
  var exercise = $('#lf-ex').value.trim();
  var sets = Array.from($('#lf-sets').children).map(function(r){ return {w: parseFloat(r.querySelector('input[id^="lf-w-"]').value), r: parseInt(r.querySelector('input[id^="lf-r-"]').value, 10)}; })
    .filter(function(s){ return Number.isFinite(s.r) && s.r > 0; }).map(function(s){ return {w: Number.isFinite(s.w) && s.w > 0 ? s.w : 0, r: s.r}; });
  if(!exercise){ msg.className = 'lf-msg full err'; msg.textContent = 'Add the exercise name.'; $('#lf-ex').focus(); return; }
  if(!sets.length){ msg.className = 'lf-msg full err'; msg.textContent = 'Add at least one set with reps.'; return; }
  var date = $('#lf-date').value || todayKey();
  if(date > todayKey()){ msg.className = 'lf-msg full err'; msg.textContent = 'That date is in the future.'; return; }
  var doc = {exercise:exercise, location:$('#lf-loc').value.trim() || 'Home', date:date, sets:sets, notes:$('#lf-notes').value.trim(), createdAt:Date.now(), source:'page'};
  if($('#lf-rir').value !== '') doc.rir = Number($('#lf-rir').value);
  var id = 'e' + uid();
  var prevA = state.liftStats;
  state.lifts.push(Object.assign({id:id}, doc));
  sync.liftOps[id] = 'set';
  recompute(); persistLocal(); flushLiftOps();
  closeSheets();
  sessOpen.set(date, true);
  var wk = habitById('workout'), day = state.days[date];
  if(wk && isActive(wk, date) && !(day && day.done.workout)){
    mutateDay(date, function(dd){ dd.done.workout = Date.now(); if(dd.rest) delete dd.rest.workout; }, {});
  } else render();
  celebrateLift(prevA, state.liftStats, id);
}
export function celebrateLift(prev, next, id){
  var e = next.entries.filter(function(x){ return x.id === id; })[0]; if(!e) return;
  var gained = next.xp - prev.xp;
  var prevBadges = new Set(liftBadges(prev).filter(function(b){ return b.got; }).map(function(b){ return b.name; }));
  var nb = liftBadges(next).filter(function(b){ return b.got && !prevBadges.has(b.name); })[0];
  var msg;
  if(next.level > prev.level) msg = 'Strength level ' + next.level + ' · ' + mooseRank(next.level);
  else if(e._status === 'pr') msg = 'New PR: ' + e.exercise + ', est. 1RM ' + Math.round(liftScore(e));
  else if(nb) msg = 'Badge unlocked: ' + nb.name;
  else if(e._cleared) msg = 'Quest cleared: ' + e.exercise;
  else msg = e.exercise + ' logged';
  if(next.level > prev.level || e._status === 'pr' || nb || e._cleared) burst();
  setTimeout(function(){ toast(msg + ' · +' + gained + ' strength XP'); }, 60);
}
export function deleteLift(id){
  if(liftArmed !== id){
    liftArmed = id; render();
    clearTimeout(liftArmTimer); liftArmTimer = setTimeout(function(){ liftArmed = null; render(); }, 4000);
    return;
  }
  liftArmed = null; clearTimeout(liftArmTimer);
  state.lifts = state.lifts.filter(function(l){ return l.id !== id; });
  sync.liftOps[id] = 'delete';
  recompute(); persistLocal(); flushLiftOps(); render();
  toast('Lift deleted');
}


/* actions app.js calls; the tab's own flags stay in this file */
export function setLiftFilter(loc){ liftFilter = loc; render(); }
export function toggleLadder(){ showLadder = !showLadder; render(); }
export function onExerciseChange(){
  var name = norm($('#lf-ex').value);
  var past = state.lifts.filter(function(e){ return norm(e.exercise) === name; }).sort(function(a, b){ return liftKey(a) < liftKey(b) ? 1 : -1; })[0];
  var empty = Array.from($('#lf-sets').querySelectorAll('input')).every(function(i){ return !i.value; });
  if(past){
    $('#lf-loc').value = past.location || 'Home';
    if(empty){ $('#lf-sets').innerHTML = ''; liftSetCount = 0; past.sets.forEach(function(s){ addSetRow(s.w, ''); }); }
    var tgt = past.target || autoTarget(past, past.location);
    $('#lf-msg').className = 'lf-msg full'; $('#lf-msg').textContent = 'Quest from last time: ' + tgt;
  }
}
registerTab('lifts', renderLifts);
