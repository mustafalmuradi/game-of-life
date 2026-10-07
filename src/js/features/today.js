// Today tab: week strip, day card, habit list, and the habit mutations (toggle, rest, extras).
import { BASE_XP, LIGHT_XP, SWEEP_MAX, SWEEP_STEP, SWEEP_XP } from '../core/config.js';
import { $, addDays, clone, esc, fmt, fmtLong, fmtShort, hijri, mondayOf, parseKey, range7, reduceMotion, timeOf, todayKey, uid } from '../core/utils.js';
import { activeHabits, capOf, habitById, habitTarget, isActive, isEmptyDay, ladderStep, state, ui } from '../core/state.js';
import { beltOf, habitCurve, msMeta, nextTrophy, rankInfo, rankTitle, rewardText, trophySVG } from '../core/xp.js';
import { recompute } from '../core/stats.js';
import { scheduleSave } from '../core/store.js';
import { burst, floatXP, queuePromos, toast } from '../core/effects.js';
import { ICON, miniBelt, miniRing, scoreRing } from '../core/svg.js';
import { registerTab, render, renderSync } from '../core/render.js';
import { FLAG_ICON, fmtClock, metricsOf, readiness, sessName, sessOf, TAGS, tagsOf, tmin } from './body.js';

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
  var date = state.selected;
  var h = habitById(hid); if(!h) return;
  var cur = state.days[date];
  var wasDone = !!(cur && cur.done[hid]);
  if(!wasDone) ui.popSeg = hid;
  mutateDay(date, function(day){
    if(wasDone){ delete day.done[hid]; delete day.extras[hid]; }
    else { day.done[hid] = Date.now(); if(day.rest) delete day.rest[hid]; }
  }, {anchor: wasDone ? null : anchor, undo: wasDone ? h.name + ' unchecked' : null});
}
export function toggleRest(hid, kind){
  var date = state.selected, h = habitById(hid); if(!h) return;
  var cur = state.days[date], marked = !!(cur && cur.rest && cur.rest[hid]);
  if(!marked) ui.popSeg = hid;
  mutateDay(date, function(day){
    day.rest = day.rest || {};
    if(marked) delete day.rest[hid]; else { day.rest[hid] = kind === 'light' ? 'light' : Date.now(); delete day.done[hid]; delete day.extras[hid]; }
  }, {undo: marked ? null : h.name + ': ' + (kind === 'light' ? 'light day' : 'rest day') + ' logged'});
}
export function addExtra(hid, note, anchor){
  var date = state.selected;
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
    '<button class="arrow" type="button" data-act="week-next" aria-label="Next week"' + (isThis ? ' disabled' : '') + '><svg viewBox="0 0 24 24">' + ICON.right + '</svg></button></div>';
  h += '<div class="week-grid">';
  days.forEach(function(d, i){
    var fut = d > today, stat = st.byDate[d];
    var lbl = fmtLong(d) + (stat ? ', ' + stat.done + ' of ' + stat.total + ' done' : '');
    h += '<button type="button" class="wday' + (d === state.selected ? ' is-sel' : '') + (d === today ? ' is-today' : '') + '" data-act="pick-day" data-d="' + d + '"' + (fut ? ' disabled' : '') + (d === today ? ' aria-current="date"' : '') + ' aria-label="' + esc(lbl) + '">' +
      '<span class="wl">' + L[i] + '</span>' + miniRing(fut ? null : stat, parseKey(d).getDate()) + '</button>';
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
  } else sweepHtml = '<span class="sweep">No clean sweep</span>';
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
function renderHabits(){
  var d = state.selected, today = todayKey(), st = state.stats;
  var act = activeHabits(d), doc = state.days[d];
  var h = '';
  act.forEach(function(hb){
    var done = !!(doc && doc.done[hb.id]);
    var ex = (doc && doc.extras[hb.id]) || [];
    var hs = st.habits[hb.id] || {run:0};
    var streak = hs.run;
    var hr = hs.rank || rankInfo(0, 0, 0, habitCurve(hb), 0);
    var bd = st.byDate[d], rested = !done && !!(bd && bd.excused && bd.excused.indexOf(hb.id) >= 0);
    var restMarked = !!(doc && doc.rest && doc.rest[hb.id]);
    var allow = hb.restPerWeek || 0, left = allow - ((st.restUsed || {})[hb.id + '|' + mondayOf(d)] || 0);
    var restText = allow ? (mondayOf(d) === mondayOf(today) ? ' · ' + Math.max(left, 0) + ' of ' + allow + ' rest days left this week' : ' · ' + allow + ' rest days a week') : '';
    var restLogged = rested && !!(bd && bd.restDone && bd.restDone.indexOf(hb.id) >= 0);
    var restKind = doc && doc.rest && doc.rest[hb.id] === 'light' ? 'light day' : 'rest day';
    h += '<article class="habit' + (done || restLogged ? ' is-done' : '') + (rested && !restLogged ? ' is-rest' : '') + '" style="--hc:var(--h-' + hb.color + ')">' +
      (restLogged ? '<button class="check" type="button" data-act="rest" data-h="' + esc(hb.id) + '" aria-pressed="true" aria-label="' + esc('Undo ' + restKind + ': ' + hb.name) + '">' :
      '<button class="check" type="button" data-act="toggle" data-h="' + esc(hb.id) + '" aria-pressed="' + done + '" aria-label="' + esc((done ? 'Undo ' : 'Mark done: ') + hb.name) + '">') + '<svg viewBox="0 0 24 24">' + ICON.check + '</svg></button>' +
      '<div class="habit-main"><div class="habit-top"><h3>' + esc(hb.name) + '</h3>' +
      '<button class="hrank" type="button" data-act="open-rank" data-h="' + esc(hb.id) + '" aria-label="' + esc(hb.name + ' rank: ' + rankTitle(hr.level) + ', level ' + (hr.level+1)) + '">' + miniBelt(hr.level) + '<span>Lv ' + (hr.level+1) + '</span>' + (hr.capped ? '<em>Test</em>' : '') + '</button>' +
      (streak > 0 ? '<span class="streak" title="Current streak"><svg viewBox="0 0 24 24">' + ICON.flame + '</svg>' + streak + 'd</span>' : '') + '</div>' +
      '<p class="target">' + esc(hb.id === 'sleep' && parseKey(d).getDay() === 6 ? 'In bed by midnight (Saturday)' : habitTarget(hb)) + esc(restText) + (hb.ladder ? ' \u00b7 grows with belt' : '') + '</p>';
    if(ex.length){
      h += '<div class="extras">';
      ex.forEach(function(x){
        h += '<span class="chip"><span>' + esc(x.note) + (x.at && d === today ? ' · ' + esc(timeOf(x.at)) : '') + '</span><button type="button" data-act="rm-extra" data-h="' + esc(hb.id) + '" data-x="' + esc(x.id) + '" aria-label="Remove extra: ' + esc(x.note) + '"><svg viewBox="0 0 24 24">' + ICON.x + '</svg></button></span>';
      });
      h += '</div>';
    }
    h += '</div><div class="habit-side">';
    if(rested){
      var isLight = !!(doc && doc.rest && doc.rest[hb.id] === 'light'), lightPaid = !!(bd && bd.light && bd.light.indexOf(hb.id) >= 0);
      h += isLight ? '<span class="rest-tag' + (lightPaid ? ' light' : '') + '">Light day \u00b7 ' + (lightPaid ? '+' + LIGHT_XP : '0 XP') + '</span>' : '<span class="rest-tag">Rest day</span>';
      if(restMarked && d === today) h += '<button class="rest-btn" type="button" data-act="rest" data-h="' + esc(hb.id) + '">Undo</button>';
    } else if(!done){
      h += '<span class="xp-hint">+' + BASE_XP + '</span>';
      if(allow && d === today && left > 0){
        if(hb.id === 'workout') h += '<span class="rest-pair"><button class="rest-btn" type="button" data-act="light" data-h="' + esc(hb.id) + '">' + (((hb.lightPerWeek || 0) - ((st.lightUsed || {})[hb.id + '|' + mondayOf(d)] || 0)) > 0 ? 'Light +' + LIGHT_XP : 'Light day') + '</button><button class="rest-btn" type="button" data-act="rest" data-h="' + esc(hb.id) + '">Rest</button></span>';
        else h += '<button class="rest-btn" type="button" data-act="rest" data-h="' + esc(hb.id) + '">Rest day</button>';
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

/* the Today tab renders four parts; render() calls this through the registry */
function renderToday(){ renderWeek(); renderDay(); renderHabits(); renderSync(); }
registerTab('today', renderToday);
