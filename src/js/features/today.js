// Today tab: week strip, day card, habit list, and the habit mutations (toggle, rest, extras).
import { BASE_XP, LIGHT_XP, SWEEP_MAX, SWEEP_STEP, SWEEP_XP } from '../core/config.js';
import { $, addDays, clone, esc, fmt, fmtLong, fmtShort, hijri, mondayOf, parseKey, range7, reduceMotion, timeOf, todayKey, uid } from '../core/utils.js';
import { activeHabits, capOf, habitById, lightXPOf, habitTarget, isActive, isEmptyDay, ladderStep, LATE, lateOf, lateUsed, lateXP, state, T, ui } from '../core/state.js';
import { beltOf, habitCurve, msMeta, nextTrophy, rankInfo, rankTitle, rewardText, trophySVG } from '../core/xp.js';
import { recompute } from '../core/stats.js';
import { saveSettings, scheduleSave } from '../core/store.js';
import { burst, floatXP, queuePromos, toast } from '../core/effects.js';
import { ICON, miniBelt, miniRing, scoreRing } from '../core/svg.js';
import { registerTab, render, renderSync } from '../core/render.js';
import { FLAG_ICON, fmtClock, metricsOf, readiness, sessName, sessOf, TAGS, tagsOf, tmin } from './body.js';
import { ensureToday, renderTasksCard } from './tasks.js';
import { rawatibLine, rawatibOf, renderSalah, SUNNAH_ID } from './salah.js';
import { renderWind } from './winddown.js';
import { renderCal } from './calendar.js';

/* ---------- mutations ---------- */
export function mutateDay(date, fn, opts){
  opts = opts || {};
  var before = state.days[date] ? clone(state.days[date]) : null;
  var statsBefore = state.stats;
  var day = state.days[date] ? clone(state.days[date]) : {date:date, done:{}, extras:{}};
  fn(day);
  if(isEmptyDay(day)) delete state.days[date]; else state.days[date] = day;
  recompute();
  scheduleSave(date);
  render();
  var bb = statsBefore.byDate[date] || {xp:0, sweep:false}, ba = state.stats.byDate[date] || {xp:0, sweep:false};
  var delta = ba.xp - bb.xp;
  if(opts.anchor && delta > 0) floatXP(opts.anchor, '+' + delta + ' XP');
  if(ba.sweep && !bb.sweep){ burst(); setTimeout(function(){ toast('Clean sweep. +' + ba.sweepBonus + ' XP bonus'); }, reduceMotion ? 0 : 500); }
  else if(opts.undo){
    toast(opts.undo, {label:'Undo', fn:function(){
      if(before) state.days[date] = before; else delete state.days[date];
      recompute(); scheduleSave(date); render();
    }});
  }
  var promos = [];
  state.settings.habits.forEach(function(h){
    var a = state.stats.habits[h.id], b = statsBefore.habits[h.id];
    if(a && b && a.rank.level > b.rank.level){
      var nb = beltOf(a.rank.level).b, ob = beltOf(b.rank.level).b;
      promos.push({title:h.name, color:h.color, L:a.rank.level, note: h.ladder && nb > ob ? 'New target: ' + ladderStep(h, a.rank.level) + ' ' + h.unit + ' a day' : ''});
    }
  });
  if(state.stats.rank.level > statsBefore.rank.level){
    var ob2 = beltOf(statsBefore.rank.level).b, nb2 = beltOf(state.stats.rank.level).b, rnote = '';
    if(nb2 > ob2 && nb2 >= 1){ var rt = rewardText('belt-' + nb2); rnote = rt ? 'Reward unlocked: ' + rt + '. Go claim it.' : 'Reward unlocked. Name it in the Trophy Room.'; }
    promos.push({title:'Overall rank', L:state.stats.rank.level, note:rnote});
  }
  var eb = statsBefore.earned || {}, ea = state.stats.earned || {};
  Object.keys(ea).forEach(function(k){
    if(eb[k] || ea[k].d !== date) return;
    var mm = msMeta(k); if(!mm) return;
    var rt2 = mm.reward ? rewardText(k) : '';
    promos.push({trophy:true, title:mm.family, name:mm.name, desc:mm.desc, xp:mm.xp, i:mm.i, note: mm.reward ? (rt2 ? 'Reward unlocked: ' + rt2 + '. Go claim it.' : 'Reward unlocked. Name it in the Trophy Room.') : ''});
  });
  if(promos.length) setTimeout(function(){ queuePromos(promos); }, reduceMotion ? 0 : 700);
}
export function toggleHabit(hid, anchor){
  var date = state.selected; if(date > todayKey()) return;
  var h = habitById(hid); if(!h) return;
  var cur = state.days[date];
  var wasDone = !!(cur && cur.done[hid]);
  if(!wasDone) ui.popSeg = hid;
  mutateDay(date, function(day){
    if(wasDone){ delete day.done[hid]; delete day.extras[hid]; if(hid === SUNNAH_ID && day.m) delete day.m.rawatibAuto; }
    else { day.done[hid] = Date.now(); if(day.rest) delete day.rest[hid]; }
  }, {anchor: wasDone ? null : anchor, undo: wasDone ? h.name + ' unchecked' : null});
}
export function toggleRest(hid, kind, dateArg){
  var date = dateArg || state.selected, h = habitById(hid); if(!h || date > todayKey()) return;
  var cur = state.days[date], marked = !!(cur && cur.rest && cur.rest[hid]);
  if(!marked) ui.popSeg = hid;
  mutateDay(date, function(day){
    day.rest = day.rest || {};
    if(marked) delete day.rest[hid]; else { day.rest[hid] = kind === 'light' ? 'light' : kind === 'life' ? 'life' : Date.now(); delete day.done[hid]; delete day.extras[hid]; }
  }, {undo: marked ? null : kind === 'life' ? 'Life happens: today is excused, streak kept (0 XP)' : h.restManual && kind !== 'light' ? 'Life happens: ' + (hid === 'sleep' ? 'tonight' : 'today') + ' is excused, ' + (h.restFull ? 'full points kept' : 'streak kept') : h.name + ': ' + (kind === 'light' ? 'light day' : 'rest day') + ' logged'});
}
/* Bed on time's rest days are "life happens" passes: same engine, different words */
/* declared-only passes (restManual: Bed on time, Eat enough) are "Life happens"; the rest are rest days */
export function restWords(hb){ return hb.restManual ? {btn:'Life happens', tag:'Life happens', one:'pass', many:'passes', undo:'pass'} : {btn:'Rest day', tag:'Rest day', one:'rest day', many:'rest days', undo:'rest day'}; }
export function addExtra(hid, note, anchor){
  var date = state.selected; if(date > todayKey()) return;
  var cur = state.days[date];
  if(!cur || !cur.done[hid]) return;
  if(((cur.extras[hid]) || []).length >= capOf(habitById(hid))) return;
  mutateDay(date, function(day){
    day.extras[hid] = (day.extras[hid] || []).concat([{id:uid(), note:note || 'Extra session', at:Date.now()}]);
  }, {anchor:anchor});
}
export function removeExtra(hid, xid){
  mutateDay(state.selected, function(day){
    day.extras[hid] = (day.extras[hid] || []).filter(function(x){ return x.id !== xid; });
    if(!day.extras[hid].length) delete day.extras[hid];
  }, {undo:'Extra removed'});
}

function renderWeek(){
  var today = todayKey(), mon = state.weekOf, days = range7(mon), st = state.stats;
  var isThis = mon === mondayOf(today);
  var wxp = days.reduce(function(a, d){ return a + ((st.byDate[d] && st.byDate[d].xp) || 0); }, 0);
  var L = ['M','T','W','T','F','S','S'];
  var h = '<div class="week-head">' +
    '<button class="arrow" type="button" data-act="week-prev" aria-label="Previous week"><svg viewBox="0 0 24 24">' + ICON.left + '</svg></button>' +
    '<p class="t">' + (isThis ? 'This week' : fmtShort(days[0]) + ' – ' + fmtShort(days[6])) + '<span>' + fmt(wxp) + ' XP</span></p>' +
    '<button class="arrow" type="button" data-act="week-next" aria-label="Next week"' + (mon >= addDays(mondayOf(today), 28) ? ' disabled' : '') + '><svg viewBox="0 0 24 24">' + ICON.right + '</svg></button></div>';
  h += '<div class="week-grid">';
  days.forEach(function(d, i){
    var fut = d > today, stat = st.byDate[d];
    var tk = fut && state.tasks[d] ? state.tasks[d].items.filter(function(x){ return !x.rolledTo && !x.droppedAt; }).length : 0;
    var lbl = fmtLong(d) + (stat ? ', ' + stat.done + ' of ' + stat.total + ' done' : fut && tk ? ', ' + tk + ' planned' : '');
    h += '<button type="button" class="wday' + (d === state.selected ? ' is-sel' : '') + (d === today ? ' is-today' : '') + (fut ? ' is-fut' : '') + '" data-act="pick-day" data-d="' + d + '"' + (d === today ? ' aria-current="date"' : '') + ' aria-label="' + esc(lbl) + '">' +
      '<span class="wl">' + L[i] + '</span>' + miniRing(fut ? null : stat, parseKey(d).getDate()) + (fut && tk ? '<span class="wplan">' + tk + '</span>' : '') + '</button>';
  });
  $('#week').innerHTML = h + '</div>';
}
function renderDay(){
  var d = state.selected, today = todayKey(), st = state.stats;
  var act = activeHabits(d), doc = state.days[d];
  var stat = st.byDate[d] || {done:0, total:act.length, xp:0, bonus:0, sweep:false, sweepBonus:0};
  var left = stat.total - stat.done;
  var sweepHtml;
  if(stat.sweep) sweepHtml = '<span class="sweep on"><svg viewBox="0 0 24 24" fill="currentColor">' + ICON.sweep + '</svg>Clean sweep +' + stat.sweepBonus + '</span>';
  else if(d === today){
    var nb = Math.min(SWEEP_XP + SWEEP_STEP*st.sweepRunBeforeToday, SWEEP_MAX);
    sweepHtml = '<span class="sweep">' + left + ' to go for a clean sweep (+' + nb + ')</span>';
  } else sweepHtml = '<span class="sweep">' + (d > today ? 'Planned day' : 'No clean sweep') + '</span>';
  var streakLine = st.sweepRun > 0 ? '<p class="score-line">Sweep streak <b>' + st.sweepRun + (st.sweepRun === 1 ? ' day' : ' days') + '</b></p>' : '';
  var nt = d === today ? nextTrophy() : null;
  if(nt) streakLine += '<p class="score-line trophy-line">' + trophySVG(nt.i, true) + 'Next: <b>' + esc(nt.name) + '</b> · ' + nt.cur + '/' + nt.v + ' ' + esc(nt.unit) + ' · +' + nt.xp + '</p>';
  $('#day').innerHTML =
    '<div class="day-head"><div><h2>' + esc(d === today ? 'Today · ' + fmtLong(d) : fmtLong(d)) + '</h2><p class="hijri">' + esc(hijri(d)) + '</p></div>' +
    (d !== today ? '<button class="pill-btn" type="button" data-act="go-today">Back to today</button>' : '') + '</div>' +
    '<div class="score">' + scoreRing(act, doc, stat) +
    '<div class="score-meta"><p class="xp-big">' + fmt(stat.xp) + '<small>XP</small></p>' +
    '<p class="score-line"><b>' + fmt(stat.base || 0) + '</b> base · <b>' + fmt(stat.bonus || 0) + '</b> bonus</p>' + streakLine + sweepHtml + '</div></div>' + checkinRow(d);
}
function checkinRow(d){
  if(d > todayKey()) return '';
  var m = metricsOf(d), rd = readiness(d), bits = [];
  if(m.bed) bits.push('Slept ' + fmtClock(tmin(m.bed)) + (m.wake ? '–' + fmtClock(tmin(m.wake)) : ''));
  if(Number.isFinite(m.sleep)) bits.push((Math.round(m.sleep*10)/10) + 'h');
  if(m.meal) bits.push('Last food ' + fmtClock(tmin(m.meal)));
  if(Number.isFinite(m.cal)) bits.push(fmt(m.cal) + ' cal');
  if(Number.isFinite(m.pro)) bits.push(m.pro + 'g protein');
  var ss = sessOf(d); if(ss.length) bits.push(ss.map(sessName).join(' + '));
  var tg0 = tagsOf(d); if(tg0.length) bits.push(tg0.map(function(k){ var x = TAGS.filter(function(t){ return t.k === k; })[0]; return x ? x.n : k; }).join(', '));
  var nx = rd.next, chip = '';
  if(rd.call) chip = '<p class="zchip' + (rd.z ? ' z-' + rd.z.k : '') + '">' + (rd.z ? '<b>' + rd.rec + '%</b> ' + rd.z.name + ' \u00b7 ' : '') + esc(rd.call) + (nx && !nx.done ? ' \u00b7 ' + esc(sessName(nx.k)) + ' next' : '') + '</p>';
  var fl = rd.flags.slice(0, 2).map(function(f){ return '<p class="rflag f-' + f.sev + '"><span class="fi" aria-hidden="true">' + FLAG_ICON[f.sev] + '</span><span><b>' + esc(f.t) + '.</b> ' + esc(f.x) + '</span></p>'; }).join('');
  return '<div class="ci-row">' + chip + fl +
    '<div class="ci-line"><span class="muted small">' + (bits.length ? esc(bits.join(' \u00b7 ')) : 'No check-in yet. Recovery, bedtime, food, session, nicotine.') + '</span>' +
    '<button class="pill-btn" type="button" data-act="open-checkin">' + (Object.keys(m).length ? 'Edit check-in' : 'Check-in') + '</button></div></div>';
}
/* ---------- Headquarters habit order ---------- */
/* hqSort: the Today list in the saved order; habits missing from it (new ones) keep their place at the end */
export function hqSort(list){
  var ord = state.settings.hqOrder; if(!ord || !ord.length) return list;
  var pos = {}; ord.forEach(function(id, i){ pos[id] = i; });
  return list.map(function(h, i){ return {h:h, k:pos[h.id] !== undefined ? pos[h.id] : ord.length + i}; }).sort(function(a, b){ return a.k - b.k; }).map(function(x){ return x.h; });
}
var hqEdit = null, hqDrag = false; // hqEdit = the ids being arranged while Reorder mode is open
export function hqReorderOpen(){ hqEdit = hqSort(activeHabits(state.selected)).map(function(h){ return h.id; }); renderHabits(); var el = $('#habits'); if(el && el.scrollIntoView) el.scrollIntoView({block:'nearest', behavior: reduceMotion ? 'auto' : 'smooth'}); }
export function hqReorderCancel(){ hqEdit = null; hqDrag = false; renderHabits(); }
export function hqReorderDone(){
  if(!hqEdit) return;
  var ids = hqEdit.slice(), inList = {}; ids.forEach(function(id){ inList[id] = 1; });
  hqSort(state.settings.habits).forEach(function(h){ if(!inList[h.id]) ids.push(h.id); }); // paused habits keep their spot after the active ones
  var before = JSON.stringify(state.settings.hqOrder || []);
  hqEdit = null; hqDrag = false;
  if(before !== JSON.stringify(ids)){ state.settings.hqOrder = ids; saveSettings(); toast('Habit order saved'); }
  render();
}
function renderReorder(){
  var by = {}; state.settings.habits.forEach(function(h){ by[h.id] = h; });
  var h = '<div class="hq-ro-head"><div><b>Reorder habits</b><small>Drag the handle. Headquarters only.</small></div><span class="hq-ro-acts"><button class="rest-btn" type="button" data-act="hq-reorder-cancel">Cancel</button><button class="hq-ro-done" type="button" data-act="hq-reorder-done">Done</button></span></div><ol class="hq-ro" id="hq-ro">';
  hqEdit.forEach(function(id){
    var hb = by[id]; if(!hb) return;
    h += '<li class="hq-ro-row" data-id="' + esc(id) + '" style="--hc:var(--h-' + hb.color + ')"><i class="hq-ro-dot" aria-hidden="true"></i><span class="hq-ro-name">' + esc(hb.name) + '</span>' +
      '<button class="hq-ro-grip" type="button" aria-label="' + esc('Move ' + hb.name + '. Drag, or use the arrow keys') + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01"/></svg></button></li>';
  });
  $('#habits').innerHTML = h + '</ol>';
  bindReorder($('#hq-ro'));
}
function readOrder(ol){ hqEdit = Array.prototype.map.call(ol.querySelectorAll('.hq-ro-row'), function(li){ return li.getAttribute('data-id'); }); }
function bindReorder(ol){
  if(!ol) return;
  ol.querySelectorAll('.hq-ro-grip').forEach(function(g){
    g.addEventListener('keydown', function(e){ // keyboard: arrows move the row
      var li = g.closest('.hq-ro-row');
      if(e.key === 'ArrowUp' && li.previousElementSibling){ ol.insertBefore(li, li.previousElementSibling); }
      else if(e.key === 'ArrowDown' && li.nextElementSibling){ ol.insertBefore(li.nextElementSibling, li); }
      else return;
      e.preventDefault(); readOrder(ol); g.focus();
    });
    g.addEventListener('pointerdown', function(e){
      if(e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      var li = g.closest('.hq-ro-row'), startY = e.clientY, base = li.getBoundingClientRect().top;
      hqDrag = true; li.classList.add('is-lifted'); ol.classList.add('is-dragging');
      try { g.setPointerCapture(e.pointerId); } catch(x){}
      if(navigator.vibrate) try { navigator.vibrate(12); } catch(x){}
      function move(ev){
        if(ev.pointerId !== e.pointerId) return;
        var y = ev.clientY;
        if(y < 70) window.scrollBy(0, -12); else if(y > window.innerHeight - 70) window.scrollBy(0, 12); // edge auto-scroll for long lists
        var sibs = Array.prototype.filter.call(ol.children, function(c){ return c !== li; }), target = null;
        for(var i = 0; i < sibs.length; i++){ var r = sibs[i].getBoundingClientRect(); if(y < r.top + r.height / 2){ target = sibs[i]; break; } }
        if(target !== li.nextElementSibling || (!target && li !== ol.lastElementChild)){ if(target) ol.insertBefore(li, target); else ol.appendChild(li); }
        var now = li.getBoundingClientRect().top - (parseFloat(li.style.getPropertyValue('--dy')) || 0);
        li.style.setProperty('--dy', (y - startY - (now - base)) + 'px');
      }
      function up(ev){
        if(ev && ev.pointerId !== e.pointerId) return;
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
        li.classList.remove('is-lifted'); ol.classList.remove('is-dragging'); li.style.removeProperty('--dy');
        hqDrag = false; readOrder(ol);
      }
      // listen on window: moving the row in the DOM drops pointer capture, so events stop reaching the handle
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    });
  });
}

function renderHabits(){
  if(hqDrag) return; // a drag is in progress: don't rebuild the list under the finger
  if(hqEdit){ renderReorder(); return; }
  var d = state.selected, today = todayKey(), st = state.stats;
  var act = hqSort(activeHabits(d)), doc = state.days[d];
  var h = '';
  if(d > today){
    h = '<p class="nudge">Planning ahead: habits unlock on the day. Tasks below are open.</p>' + act.map(function(hb){ return '<article class="habit is-fut" style="--hc:var(--h-' + hb.color + ')"><span class="check" aria-hidden="true"></span><div class="habit-main"><div class="habit-top"><h3>' + esc(hb.name) + '</h3></div><p class="target">' + esc(habitTarget(hb)) + '</p></div><div class="habit-side"></div></article>'; }).join('');
    $('#habits').innerHTML = h; return;
  }
  act.forEach(function(hb){
    var done = !!(doc && doc.done[hb.id]);
    var ex = (doc && doc.extras[hb.id]) || [];
    var hs = st.habits[hb.id] || {run:0};
    var streak = hs.held || 0; // days held: done, or a planned rest / light day / Life happens pass (same count the trophies use)
    var hr = hs.rank || rankInfo(0, 0, 0, habitCurve(hb), 0);
    var bd = st.byDate[d], rested = !done && !!(bd && bd.excused && bd.excused.indexOf(hb.id) >= 0);
    var restMarked = !!(doc && doc.rest && doc.rest[hb.id]);
    var allow = hb.restPerWeek || 0, left = allow - ((st.restUsed || {})[hb.id + '|' + mondayOf(d)] || 0);
    var restDays = hb.restOn && hb.restOn.length ? hb.restOn.map(function(n){ return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][n]; }).join('/') : '';
    var rw = restWords(hb);
    var restText = !allow ? '' : restDays ? ' · ' + restDays + ' rest day' + (hb.restFull ? (hb.restFullMax ? ' (' + hb.restFullMax + ' a week at full points)' : ' (full points)') : '') : (mondayOf(d) === mondayOf(today) ? ' · ' + Math.max(left, 0) + ' of ' + allow + ' ' + rw.many + ' left this week' : ' · ' + allow + ' ' + rw.many + ' a week');
    var lifeAllow = hb.lifePerWeek || 0, lifeLeft = lifeAllow - ((st.lifeUsed || {})[hb.id + '|' + mondayOf(d)] || 0);
    if(lifeAllow) restText += mondayOf(d) === mondayOf(today) ? ' · ' + Math.max(lifeLeft, 0) + ' of ' + lifeAllow + ' Life happens left' : ' · ' + lifeAllow + ' Life happens a week';
    var restToday = !hb.restOn || !hb.restOn.length || hb.restOn.indexOf(parseKey(d).getDay()) >= 0;
    var restLogged = rested && !!(bd && bd.restDone && bd.restDone.indexOf(hb.id) >= 0);
    var isLife = !!(doc && doc.rest && doc.rest[hb.id] === 'life');
    var restKind = doc && doc.rest && doc.rest[hb.id] === 'light' ? 'light day' : isLife ? 'Life happens pass' : rw.undo;
    h += '<article class="habit' + (done || restLogged ? ' is-done' : '') + (rested && !restLogged ? ' is-rest' : '') + (ui.popSeg === hb.id && done ? ' just-done' : '') + '" style="--hc:var(--h-' + hb.color + ')">' +
      (restLogged ? '<button class="check" type="button" data-act="rest" data-h="' + esc(hb.id) + '" aria-pressed="true" aria-label="' + esc('Undo ' + restKind + ': ' + hb.name) + '">' :
      '<button class="check" type="button" data-act="toggle" data-h="' + esc(hb.id) + '" aria-pressed="' + done + '" aria-label="' + esc((done ? 'Undo ' : 'Mark done: ') + hb.name) + '">') + '<svg viewBox="0 0 24 24">' + ICON.check + '</svg></button>' +
      '<div class="habit-main"><div class="habit-top"><h3>' + esc(hb.name) + '</h3>' +
      '<button class="hrank" type="button" data-act="open-rank" data-h="' + esc(hb.id) + '" aria-label="' + esc(hb.name + ' rank: ' + rankTitle(hr.level) + ', level ' + (hr.level+1)) + '">' + miniBelt(hr.level) + '<span>Lv ' + (hr.level+1) + '</span>' + (hr.capped ? '<em>Test</em>' : '') + '</button>' +
      (streak > 0 ? '<span class="streak" title="Current streak"><svg viewBox="0 0 24 24">' + ICON.flame + '</svg>' + streak + 'd</span>' : '') + '</div>' +
      '<p class="target">' + esc(hb.id === SUNNAH_ID && rawatibOf(d).length ? rawatibLine(d) : hb.id === 'sleep' && lateOf(d) ? lateLine(d) : hb.id === 'sleep' && parseKey(d).getDay() === 6 ? 'In bed by midnight (Saturday)' : hb.id === 'sleep' && parseKey(d).getDay() === 5 && T().friBed ? 'In bed by ' + fmtClock(tmin(T().friBed)) + ' (Friday)' : habitTarget(hb)) + esc(restText) + (hb.ladder ? ' \u00b7 grows with belt' : '') + '</p>';
    if(ex.length){
      h += '<div class="extras">';
      ex.forEach(function(x){
        h += '<span class="chip"><span>' + esc(x.note) + (x.at && d === today ? ' · ' + esc(timeOf(x.at)) : '') + '</span><button type="button" data-act="rm-extra" data-h="' + esc(hb.id) + '" data-x="' + esc(x.id) + '" aria-label="Remove extra: ' + esc(x.note) + '"><svg viewBox="0 0 24 24">' + ICON.x + '</svg></button></span>';
      });
      h += '</div>';
    }
    h += '</div><div class="habit-side">';
    if(rested){
      var isLight = !!(doc && doc.rest && doc.rest[hb.id] === 'light'), lightPaid = !!(bd && bd.light && bd.light.indexOf(hb.id) >= 0), fullPaid = !!(bd && bd.full && bd.full.indexOf(hb.id) >= 0);
      h += isLife ? '<span class="rest-tag">Life happens \u00b7 0 XP</span>' : isLight ? '<span class="rest-tag' + (lightPaid ? ' light' : '') + '">Light day \u00b7 ' + (lightPaid ? '+' + lightXPOf(hb) : '0 XP') + '</span>' : '<span class="rest-tag' + (fullPaid ? ' light' : '') + '">' + rw.tag + (fullPaid ? ' · +' + BASE_XP : hb.restFull && restMarked && d <= today ? ' · 0 XP' : hb.restManual ? ' · excused' : '') + '</span>';
      if(restMarked && d === today) h += '<button class="rest-btn" type="button" data-act="rest" data-h="' + esc(hb.id) + '">Undo</button>';
    } else if(!done){
      var lx = hb.id === 'sleep' ? lateXP(d) : null;
      h += '<span class="xp-hint">+' + (lx === null ? BASE_XP : lx) + '</span>';
      if(hb.id === 'sleep' && lateOpen(d).ok) h += '<button class="rest-btn" type="button" data-act="plan-late">Late night</button>';
      if(allow && d === today && left > 0 && restToday){
        if(hb.id === 'workout') h += '<span class="rest-pair"><button class="rest-btn" type="button" data-act="light" data-h="' + esc(hb.id) + '">' + (((hb.lightPerWeek || 0) - ((st.lightUsed || {})[hb.id + '|' + mondayOf(d)] || 0)) > 0 ? 'Light +' + lightXPOf(hb) : 'Light day') + '</button><button class="rest-btn" type="button" data-act="rest" data-h="' + esc(hb.id) + '">Rest</button></span>';
        else h += '<button class="rest-btn" type="button" data-act="rest" data-h="' + esc(hb.id) + '">' + rw.btn + '</button>';
      } else if(lifeAllow && d === today && lifeLeft > 0){
        h += '<button class="rest-btn" type="button" data-act="life" data-h="' + esc(hb.id) + '">Life happens</button>';
      }
    } else if(bd && bd.overCap && bd.overCap.indexOf(hb.id) >= 0){
      h += '<span class="rest-tag warn">Over ' + hb.maxPerWeek + '/wk \u00b7 0 XP</span>';
    }
    else {
      var capH = capOf(hb), maxed = ex.length >= capH;
      if(capH === 0){ h += '</div></article>'; return; }
      h += '<button class="extra-btn" type="button" data-act="open-extra" data-h="' + esc(hb.id) + '"' + (maxed ? ' disabled' : '') + '>' + (maxed ? 'Maxed' : '+ Extra') + '</button>';
      h += '<span class="pips" aria-label="' + ex.length + ' of ' + capH + ' extras">';
      for(var i=0;i<capH;i++) h += '<i class="' + (i < ex.length ? 'on' : '') + '"></i>';
      h += '</span>';
    }
    h += '</div></article>';
  });
  if(!act.length) h = '<p class="nudge">No active habits. Tap the sliders at the top to add or resume one.</p>';
  if(act.length > 1) h += '<div class="hq-ro-foot"><button class="link-btn" type="button" data-act="hq-reorder">Reorder habits</button></div>';
  if(d === today){
    var y = addDays(today, -1), yd = state.days[y];
    var sleepH = habitById('sleep');
    var hour = new Date().getHours();
    if(sleepH && isActive(sleepH, y) && hour < 14 && !(yd && yd.done.sleep)){
      h += '<p class="nudge">Bedtime for last night isn’t logged. If you were in bed on time, tap <b>' + esc(parseKey(y).toLocaleDateString('en-US',{weekday:'short'})) + '</b> above and check it off.</p>';
    }
  }
  $('#habits').innerHTML = h;
}

/* the Today tab renders five parts; render() calls this through the registry */
function renderToday(){ ensureToday(); renderWind(); renderWeek(); renderDay(); renderSalah(); renderCal(); renderHabits(); renderTasksCard(); renderSync(); }
registerTab('today', renderToday);

/* planned late nights: the Bed on time line, and whether one can still be planned for d */
function lateLine(d){
  var lt = lateOf(d), x = lateXP(d);
  return 'Late night planned: in bed by ' + fmtClock(tmin(lt.bed)) + ' · ' + (Number.isFinite(lt.xp) ? '+' + x + ' XP' : 'points pending') + (lt.reason ? ' · “' + String(lt.reason).slice(0, 70) + '”' : '');
}
export function lateOpen(d){
  var today = todayKey(), now = new Date(), tg = T();
  if(d !== today) return {ok:false, why:'Late nights are planned for tonight only.'};
  if(parseKey(d).getDay() === 6) return {ok:false, why:'Saturday already runs to midnight.'};
  if(parseKey(d).getDay() === 5 && tg.friBed) return {ok:false, why:'Friday already runs to ' + fmtClock(tmin(tg.friBed)) + '.'};
  if(lateOf(d)) return {ok:false, why:'Tonight already has a plan.'};
  var used = lateUsed(d); if(used >= LATE.perWeek) return {ok:false, why:'Both late nights this week are used.'};
  if(d !== LATE.grandfather && now.getHours()*60 + now.getMinutes() >= tmin(tg.bed)) return {ok:false, why:'Too late: a late night has to be set before ' + fmtClock(tmin(tg.bed)) + '.'};
  return {ok:true, left:LATE.perWeek - used};
}

