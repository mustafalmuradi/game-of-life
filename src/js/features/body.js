// Body tab: WHOOP and Cal AI metrics, the check-in sheet, readiness, the weekly review.
import { DEFAULT_TARGETS } from '../core/config.js';
import { $, addDays, clone, esc, fmt, fmtShort, fmtWd, mondayOf, pad, parseKey, range7, todayKey } from '../core/utils.js';
import { habitById, isActive, normalizeSettings, state, T } from '../core/state.js';
import { recompute } from '../core/stats.js';
import { saveSettings } from '../core/store.js';
import { mutateDay } from './today.js';
import { toast } from '../core/effects.js';
import { registerTab, render } from '../core/render.js';
import { topRound } from './progress.js';
import { closeSheets, openSheet } from '../core/sheets.js';

/* ---------- body: health data, check-in, analysis ---------- */
/* Field names and units live in the data dictionary (data/users/me/tracker/meta/dictionary). */
export var SESS = [
  {k:'chest_biceps', n:'Chest + biceps'},
  {k:'back_triceps', n:'Back + triceps'},
  {k:'legs', n:'Legs'},
  {k:'ripright', n:'RipRight'},
  {k:'cardio', n:'Cardio'},
  {k:'rest', n:'Full rest'}
];
var ROTATION = ['chest_biceps', 'back_triceps', 'legs'];
export var TAGS = [
  {k:'sick', n:'Sick'},
  {k:'travel', n:'Travel'},
  {k:'early_wake', n:'Early wake'},
  {k:'band_issue', n:'Band issue'},
  {k:'alcohol_late', n:'Alcohol / late event'}
];
var FILTERABLE = ['travel', 'early_wake', 'alcohol_late'];
var STRENGTH_ACTS = /weightlifting|strength|powerlifting|functional fitness/i;
export var CI_NUMS = ['rec','hrv','rhr','rr','sleep','inbed','eff','deep','rem','strain','napMin','cal','pro','carb','fat','fib','sod','meals','weight','waist'];
export var CI_TIMES = ['bed','wake','napStart','first','meal'];
var BL_DAYS = 30, BL_MIN = 10, PAT_MIN = 5, PAT_DAYS = 90;
var ciDate = null, ciPick = null, bodyWeek = null, blCache = {};
export var bodyFilter = (function(){ try { var v = JSON.parse(localStorage.getItem('gol-body-filter') || '{}'); return v && typeof v === 'object' ? v : {}; } catch(e){ return {}; } })();
export function saveBodyFilter(){ try { localStorage.setItem('gol-body-filter', JSON.stringify(bodyFilter)); } catch(e){} }

export function tmin(t){ if(!t || !/^\d{1,2}:\d{2}/.test(t)) return null; var p = t.split(':').map(Number); return p[0]*60 + p[1]; }
function bedMin(t){ var m = tmin(t); if(m === null) return null; return m < 12*60 ? m + 1440 : m; }
function foodMin(t){ var m = tmin(t); if(m === null) return null; return m < 4*60 ? m + 1440 : m; }
export function fmtClock(mins){ mins = ((Math.round(mins) % 1440) + 1440) % 1440; var h = Math.floor(mins/60), mm = mins % 60; return (h % 12 || 12) + ':' + pad(mm) + (h >= 12 ? ' PM' : ' AM'); }
function fmtHour(t){ var m = tmin(t); if(m === null) return ''; return m === 0 ? 'midnight' : fmtClock(m).replace(':00', ''); }
function bedTargetMin(d){ var tg = T(); return (parseKey(d).getDay() === 6 && tg.satBed) ? bedMin(tg.satBed) : bedMin(tg.bed); }
export function metricsOf(d){ var doc = state.days[d]; return (doc && doc.m) || {}; }
function nightBed(d){ return metricsOf(addDays(d, 1)).bed; }
function avgOf(a){ return a.length ? a.reduce(function(x, y){ return x + y; }, 0)/a.length : null; }
export function daysBetween(a, b){ return Math.round((parseKey(b) - parseKey(a))/86400000); }
function zoneOf(rec){ if(rec === undefined || rec === null) return null; return rec >= 67 ? {k:'green', name:'Green', tip:'Train as planned'} : rec >= 34 ? {k:'yellow', name:'Yellow', tip:'Cut volume by a third, stop 2–3 reps short'} : {k:'red', name:'Red', tip:'Walk or rest'}; }
function lastNDays(n){ var t = todayKey(), a = []; for(var i=n-1;i>=0;i--) a.push(addDays(t, -i)); return a; }
export function tagsOf(d){ var t = metricsOf(d).tags; return Array.isArray(t) ? t : []; }
function hardExcluded(d){ var t = tagsOf(d); return t.indexOf('sick') >= 0 || t.indexOf('band_issue') >= 0; }
function excluded(d){ if(hardExcluded(d)) return true; var t = tagsOf(d); for(var i=0;i<t.length;i++) if(bodyFilter[t[i]]) return true; return false; }
function badData(d){ return tagsOf(d).indexOf('band_issue') >= 0; }
function pctDelta(v, b){ return b ? Math.round((v - b)/b*100) : 0; }

/* sessions and training load */
export function sessName(k){ var x = SESS.filter(function(s){ return s.k === k; })[0]; return x ? x.n : k === 'strength' ? 'Strength' : k === 'light' ? 'Light day' : k; }
export function sessOf(d){
  var m = metricsOf(d);
  if(Array.isArray(m.sess)) return m.sess.slice();
  var s = [];
  if(m.type === 'rest') s.push('rest');
  else if(m.type === 'cardio' || m.type === 'muaythai') s.push('cardio');
  else if(m.type === 'strength') s.push('strength');
  else if(m.type === 'light') s.push('light');
  if(m.rip === true) s.push('ripright');
  return s;
}
function isStrengthKey(k){ return k === 'strength' || ROTATION.indexOf(k) >= 0; }
function whoopStrength(d){ var w = metricsOf(d).wo; return Array.isArray(w) && w.some(function(x){ return STRENGTH_ACTS.test(x.a || '') && (x.min || 0) >= 15; }); }
function dayKind(d){
  var s = sessOf(d), doc = state.days[d], r = doc && doc.rest ? doc.rest.workout : null;
  if(s.some(isStrengthKey) || (doc && doc.done && doc.done.workout) || whoopStrength(d)) return 'strength';
  if(s.indexOf('rest') >= 0 || (r && r !== 'light')) return 'rest';
  if(s.indexOf('light') >= 0 || r === 'light' || s.indexOf('ripright') >= 0 || s.indexOf('cardio') >= 0) return 'light';
  return null;
}
function lastSplit(before){
  for(var i=1;i<=28;i++){ var d = addDays(before, -i), s = sessOf(d); for(var j=s.length-1;j>=0;j--) if(ROTATION.indexOf(s[j]) >= 0) return {k:s[j], d:d}; }
  return null;
}
function nextSplit(d){
  var s = sessOf(d).filter(function(k){ return ROTATION.indexOf(k) >= 0; });
  if(s.length) return {k:s[s.length-1], done:true};
  var l = lastSplit(d);
  return l ? {k:ROTATION[(ROTATION.indexOf(l.k) + 1) % ROTATION.length], after:l} : null;
}
function upperPress(name){ return /press|bench|dip|push-?up/i.test(name || '') && !/leg press/i.test(name || ''); }
function pressingDay(d){ return sessOf(d).indexOf('chest_biceps') >= 0 || state.lifts.some(function(l){ return l.date === d && upperPress(l.exercise); }); }
function strengthRun(d){ var n = 0; for(var i=1;i<=14;i++){ if(dayKind(addDays(d, -i)) === 'strength') n++; else break; } return n; }
export function weekTally(mon){
  var today = todayKey(), t = {strength:0, light:0, rest:0, rip:0, cardio:0, days:0};
  range7(mon).forEach(function(d){
    if(d > today) return;
    t.days++;
    var k = dayKind(d); if(k) t[k]++;
    var s = sessOf(d); if(s.indexOf('ripright') >= 0) t.rip++; if(s.indexOf('cardio') >= 0) t.cardio++;
  });
  return t;
}

/* baselines: rolling 30 days before the date, sick and band-issue days left out */
var blStats = null; // the cache is valid for one state.stats; recompute() replaces that object
function baselineAt(d, k){
  if(blStats !== state.stats){ blCache = {}; blStats = state.stats; }
  var key = d + '|' + k;
  if(key in blCache) return blCache[key];
  var vals = [];
  for(var i=1;i<=BL_DAYS;i++){ var dd = addDays(d, -i); if(hardExcluded(dd)) continue; var v = metricsOf(dd)[k]; if(Number.isFinite(v)) vals.push(v); }
  return (blCache[key] = vals.length >= BL_MIN ? {v:avgOf(vals), n:vals.length} : null);
}
function latestWith(d, k, back){ for(var i=0;i<=(back || 0);i++){ var dd = addDays(d, -i), v = metricsOf(dd)[k]; if(Number.isFinite(v) && !badData(dd)) return {d:dd, v:v}; } return null; }
function rhrElevRun(d){
  var run = 0, started = false, skipped = 0;
  for(var i=0;i<30;i++){
    var dd = addDays(d, -i), v = metricsOf(dd).rhr;
    if(!Number.isFinite(v) || badData(dd)){ if(!started && skipped < 2){ skipped++; continue; } break; }
    started = true;
    var b = baselineAt(dd, 'rhr');
    if(!b || v < b.v + 3) break;
    run++;
  }
  return run;
}

/* morning readiness */
export function readiness(d){
  var m = metricsOf(d), tags = tagsOf(d), rec = Number.isFinite(m.rec) ? m.rec : null, z = zoneOf(rec);
  var sRun = strengthRun(d), rhrRun = rhrElevRun(d), flags = [];
  var rrNow = latestWith(d, 'rr', 1), rrB = rrNow ? baselineAt(rrNow.d, 'rr') : null;
  var rrHigh = !!(rrNow && rrB && rrNow.v >= rrB.v + 1);
  var sick = tags.indexOf('sick') >= 0, early = tags.indexOf('early_wake') >= 0;
  if(sick) flags.push({sev:'alert', t:'Tagged sick', x:'Chest or body symptoms mean no training at all.'});
  if(rrHigh) flags.push({sev:'alert', t:'Respiratory rate ' + rrNow.v + ' vs ' + rrB.v.toFixed(1) + ' baseline', x:'Up 1+ breath a minute' + (rrNow.d !== d ? ' (' + fmtShort(rrNow.d) + ')' : '') + '. Possible illness. Watch for symptoms.'});
  if(rhrRun >= 5) flags.push({sev:'alert', t:'Resting HR 3+ over baseline ' + rhrRun + ' days running', x:'Drop to 4 training days this week.'});
  else if(rhrRun >= 2) flags.push({sev:'warn', t:'Resting HR 3+ over baseline ' + rhrRun + ' days running', x:'Recent load is catching up. Keep today moderate.'});
  if(sRun >= 3) flags.push({sev:'warn', t:sRun + ' strength days in a row', x:'Make today light or rest.'});
  else if(sRun === 2 && dayKind(d) === 'strength') flags.push({sev:'info', t:'3 strength days in a row, counting today', x:'Tomorrow is light or rest.'});
  if(early) flags.push({sev:'info', t:'Early wake day', x:'Default to rest or light.'});
  var call = null;
  if(sick) call = 'Rest. No training';
  else if(rrHigh || (z && z.k === 'red')) call = 'Walk or rest';
  else if(sRun >= 3 || early) call = 'Rest or light day';
  else if(z && (z.k === 'yellow' || rhrRun >= 2)) call = 'Moderate: cut volume by a third';
  else if(z) call = 'Train as planned';
  var order = {alert:0, warn:1, info:2};
  flags.sort(function(a, b){ return order[a.sev] - order[b.sev]; });
  return {d:d, rec:rec, z:z, call:call, flags:flags, next:nextSplit(d), sRun:sRun, rhrRun:rhrRun};
}

/* weekly review */
export function weekReview(mon){
  var tg = T(), today = todayKey(), days = range7(mon), prevDays = range7(addDays(mon, -7));
  function stat(ds, k){ var v = ds.filter(function(d){ return d <= today && !excluded(d); }).map(function(d){ return metricsOf(d)[k]; }).filter(Number.isFinite); return v.length ? {v:avgOf(v), n:v.length} : null; }
  var defs = [
    {k:'cal', n:'Calories', t:tg.cal, u:'', dir:1},
    {k:'pro', n:'Protein', t:tg.pro, u:'g', dir:1},
    {k:'carb', n:'Carbs', t:tg.carb, u:'g', dir:1},
    {k:'fib', n:'Fiber', t:tg.fib, u:'g', dir:1},
    {k:'sod', n:'Sodium', t:tg.sod, u:'mg', dir:-1},
    {k:'sleep', n:'Sleep', t:null, u:'h', dec:1},
    {k:'eff', n:'Sleep efficiency', t:null, u:'%'},
    {k:'rec', n:'Recovery', t:null, u:'%'}
  ];
  defs.forEach(function(r){ r.cur = stat(days, r.k); r.prev = stat(prevDays, r.k); });
  function foodNights(ds){ var v = ds.filter(function(d){ return d <= today && !excluded(d); }).map(function(d){ return foodMin(metricsOf(d).meal); }).filter(function(x){ return x !== null; }); return {n:v.length, late:v.filter(function(x){ return x > tmin(tg.lastMeal); }).length}; }
  function bedNights(ds){ var r = {n:0, late:0}; ds.forEach(function(d){ var nx = addDays(d, 1); if(nx > today || excluded(d) || excluded(nx)) return; var b = bedMin(nightBed(d)); if(b === null) return; r.n++; if(b > bedTargetMin(d)) r.late++; }); return r; }
  var out = {mon:mon, days:days, defs:defs, food:foodNights(days), foodPrev:foodNights(prevDays), bed:bedNights(days), bedPrev:bedNights(prevDays),
    tally:weekTally(mon), prevTally:weekTally(addDays(mon, -7)), complete:addDays(mon, 6) < today || (addDays(mon, 6) === today)};
  var cand = [], bedLbl = fmtHour(tg.bed) + (tg.satBed ? ' (Saturday ' + fmtHour(tg.satBed) + ')' : '');
  function add(key, gap, t, x){ if(gap > 0.001) cand.push({key:key, gap:gap, t:t, x:x}); }
  if(out.bed.n >= 3) add('bed', out.bed.late/out.bed.n, 'Be in bed by ' + bedLbl, out.bed.late + ' of ' + out.bed.n + ' nights ran late. Start winding down an hour before, phone out of the room.');
  if(out.food.n >= 3) add('food', out.food.late/out.food.n, 'Last food by ' + fmtHour(tg.lastMeal), out.food.late + ' of ' + out.food.n + ' nights had food after ' + fmtHour(tg.lastMeal) + '. Make dinner the last meal.');
  var fix = {cal:'The gap is mostly carbs: a bowl of rice or potatoes at lunch.', pro:'A 2-scoop shake closes it.', carb:'Oats at breakfast, bigger rice and potato portions.', fib:'Beans, lentils, fruit, oats.', sod:'Fewer restaurant and processed meals.'};
  defs.forEach(function(r){
    if(!r.t || !r.cur || r.cur.n < 3) return;
    var g = r.dir > 0 ? (r.t - r.cur.v)/r.t : (r.cur.v - r.t)/r.t;
    add(r.k, Math.min(g, 1), r.n + (r.dir > 0 ? ' short' : ' high'), 'Averaged ' + fmt(r.cur.v) + r.u + ' against ' + (r.dir < 0 ? '≤' : '') + fmt(r.t) + r.u + '. ' + fix[r.k]);
  });
  if(out.complete) add('strength', (tg.strengthPerWeek - out.tally.strength)/tg.strengthPerWeek, 'Strength sessions', out.tally.strength + ' of ' + tg.strengthPerWeek + '. Front-load the week so one missed day doesn’t cost the week.');
  cand.sort(function(a, b){ return b.gap - a.gap; });
  out.lever = cand[0] || null;
  return out;
}

/* weight: Sunday weigh-ins, 3-weigh-in rolling average, rate from a fit over the last 6 weeks */
export function weightTrend(){
  var all = Object.keys(state.days).filter(function(k){ return Number.isFinite(metricsOf(k).weight); }).sort().map(function(k){ return {d:k, w:metricsOf(k).weight}; });
  var ws = all.filter(function(x){ return parseKey(x.d).getDay() === 0; });
  ws.forEach(function(p, i){ var win = ws.slice(Math.max(0, i - 2), i + 1).filter(function(q){ return daysBetween(q.d, p.d) <= 21; }); p.avg = avgOf(win.map(function(q){ return q.w; })); p.navg = win.length; });
  var r = {all:all, ws:ws, last:ws[ws.length - 1] || null, rate:null, rec:null, need:null};
  if(!r.last){ r.need = 'No Sunday weigh-ins yet.'; return r; }
  var recent = ws.filter(function(p){ return daysBetween(p.d, r.last.d) <= 42; });
  var span = daysBetween(recent[0].d, r.last.d);
  if(recent.length < 3 || span < 21){ r.need = 'The calorie rule needs 3+ Sunday weigh-ins over 3+ weeks. You have ' + recent.length + ' in the last 6 weeks.'; return r; }
  var xs = recent.map(function(p){ return daysBetween(recent[0].d, p.d); }), ys = recent.map(function(p){ return p.w; });
  var mx = avgOf(xs), my = avgOf(ys), num = 0, den = 0;
  xs.forEach(function(x, i){ num += (x - mx)*(ys[i] - my); den += (x - mx)*(x - mx); });
  r.rate = den ? num/den*30.44 : 0; r.from = recent[0].d; r.n = recent.length;
  var cals = []; for(var d = recent[0].d; d <= r.last.d; d = addDays(d, 1)){ if(excluded(d)) continue; var mc = metricsOf(d).cal; if(Number.isFinite(mc)) cals.push(mc); }
  r.calAvg = cals.length >= 7 ? avgOf(cals) : null;
  var tgc = T().cal;
  if(r.rate < 1){
    r.rec = {delta:200, text:'Gaining under 1 lb a month. The rule says add 200 calories.'};
    if(r.calAvg !== null && r.calAvg < tgc*0.97){ r.rec.delta = 0; r.rec.caveat = 'But you averaged ' + fmt(r.calAvg) + ' calories against ' + fmt(tgc) + '. Hit the current target first. Raising it won’t fix a gap you aren’t eating.'; }
  }
  else if(r.rate > 3) r.rec = {delta:-200, text:'Gaining over 3 lb a month. The rule says cut 200 calories.'};
  else if(r.rate <= 2) r.rec = {delta:0, text:'Gaining 1–2 lb a month. Hold calories.'};
  else r.rec = {delta:0, text:'Gaining 2–3 lb a month, above the 1–2 lb pace. Hold calories and watch the waist.'};
  return r;
}

/* pattern checks: last 90 days, 5+ days in each group before anything is reported */
export function patternData(){
  var today = todayKey(), start = addDays(today, -PAT_DAYS), lm = tmin(T().lastMeal);
  var P = [
    {id:'food', t:'Sleep efficiency', q:'Last food by ' + fmtHour(T().lastMeal) + ' vs after', u:'%', max:100, a:{n:'By ' + fmtHour(T().lastMeal), v:[]}, b:{n:'After ' + fmtHour(T().lastMeal), v:[]}},
    {id:'patch', t:'Recovery', q:'Patch on overnight vs off', u:'%', max:100, a:{n:'Patch on', v:[]}, b:{n:'Patch off', v:[]}},
    {id:'load', t:'Next-day recovery', q:'After strength days vs full rest days', u:'%', max:100, a:{n:'After strength', v:[]}, b:{n:'After rest', v:[]}},
    {id:'nap', t:'Night sleep', q:'No nap vs a nap over 45 min or after 2 PM', u:'h', max:10, a:{n:'No nap', v:[]}, b:{n:'Long or late nap', v:[]}}
  ];
  for(var d = start; d <= today; d = addDays(d, 1)){
    var nx = addDays(d, 1), m = metricsOf(d), mn = metricsOf(nx), okD = !excluded(d), okN = nx <= today && !excluded(nx);
    if(okD && okN){ var f = foodMin(m.meal); if(f !== null && Number.isFinite(mn.eff)) (f > lm ? P[0].b : P[0].a).v.push(mn.eff); }
    if(okD && Number.isFinite(m.rec) && typeof m.patch === 'boolean') (m.patch ? P[1].a : P[1].b).v.push(m.rec);
    if(okD && okN && Number.isFinite(mn.rec)){ var k = dayKind(d); if(k === 'strength') P[2].a.v.push(mn.rec); else if(k === 'rest') P[2].b.v.push(mn.rec); }
    if(okD && okN && Number.isFinite(m.napMin) && Number.isFinite(mn.sleep)){
      var starts = Array.isArray(m.naps) ? m.naps.map(function(n){ return n.start; }) : [m.napStart];
      var late = starts.some(function(t){ var x = tmin(t); return x !== null && x >= 14*60; });
      if(m.napMin === 0) P[3].a.v.push(mn.sleep); else if(m.napMin > 45 || late) P[3].b.v.push(mn.sleep);
    }
  }
  P.forEach(function(p){ p.ready = p.a.v.length >= PAT_MIN && p.b.v.length >= PAT_MIN; p.a.m = avgOf(p.a.v); p.b.m = avgOf(p.b.v); });
  return P;
}

/* watch list: things to fix that aren't covered by the readiness call or the weekly lever */
export function watchList(){
  var tg = T(), today = todayKey(), F = [], d7 = lastNDays(7);
  function mv(d){ return metricsOf(d); }
  var vapes = d7.filter(function(d){ return mv(d).vape === true; }).length;
  if(vapes) F.push({sev:'alert', t:'Vaped on ' + vapes + (vapes === 1 ? ' day' : ' days') + ' this week', x:'Never on top of the patch. Gum or a lozenge for breakthrough cravings.'});
  var patchOff = d7.filter(function(d){ return mv(d).patch === false; }).length;
  if(patchOff) F.push({sev:'warn', t:'Patch off ' + patchOff + (patchOff === 1 ? ' night' : ' nights'), x:'You’re on 24h wear. Reassess daytime-only after 3–4 weeks, not before.'});
  var ripPress = d7.filter(function(d){ return sessOf(d).indexOf('ripright') >= 0 && pressingDay(d); });
  if(ripPress.length) F.push({sev:'alert', t:'RipRight on a pressing day (' + ripPress.map(fmtShort).join(', ') + ')', x:'That’s how the neck nerve flare happened. Light day or the start of leg day only.'});
  var tally = weekTally(mondayOf(today));
  if(tally.strength > tg.strengthPerWeek) F.push({sev:'alert', t:tally.strength + ' strength days this week', x:'Over your ' + tg.strengthPerWeek + '. At 6.6 a week your resting HR climbed. No stacking.'});
  var dow = (parseKey(today).getDay() + 6) % 7;
  if(dow >= 3 && tally.rip < tg.ripMin) F.push({sev:'warn', t:'RipRight ' + tally.rip + ' of ' + tg.ripMin + '–' + tg.ripMax + ' this week', x:'On the light day or at the start of leg day. Never after pressing.'});
  var proOver = d7.map(function(d){ return mv(d).pro; }).filter(function(v){ return Number.isFinite(v) && v > tg.proMax; }).length;
  if(proOver >= 2) F.push({sev:'info', t:'Protein over ' + tg.proMax + 'g on ' + proOver + ' days', x:'Wasted calories. Move them to carbs.'});
  var sunCheck = parseKey(today).getDay() === 0 ? today : addDays(mondayOf(today), -1);
  if(!Number.isFinite(mv(sunCheck).weight)) F.push({sev:'info', t:'No weigh-in on ' + fmtWd(sunCheck), x:'Sunday morning, after the bathroom, before food.'});
  if(!lastNDays(31).some(function(d){ return Number.isFinite(mv(d).waist); })) F.push({sev:'info', t:'Monthly waist measurement due', x:'Tells you whether the gain is lean.'});
  var order = {alert:0, warn:1, info:2};
  return F.sort(function(a, b){ return order[a.sev] - order[b.sev]; });
}

/* check-in sheet */
function renderCiChips(){
  function chip(group, v, label, on){ return '<button class="lchip" type="button" data-act="ci-chip" data-g="' + group + '" data-v="' + esc(String(v)) + '" aria-pressed="' + on + '">' + esc(label) + '</button>'; }
  $('#ci-sess').innerHTML = SESS.map(function(s){ return chip('sess', s.k, s.n, ciPick.sess.indexOf(s.k) >= 0); }).join('');
  $('#ci-tags').innerHTML = TAGS.map(function(t){ return chip('tags', t.k, t.n, ciPick.tags.indexOf(t.k) >= 0); }).join('');
  $('#ci-patch').innerHTML = chip('patch', 'true', 'Yes', ciPick.patch === true) + chip('patch', 'false', 'No', ciPick.patch === false);
  $('#ci-vape').innerHTML = chip('vape', 'false', 'None', ciPick.vape === false) + chip('vape', 'true', 'Vaped', ciPick.vape === true);
}
export function ciChip(group, v){
  if(!ciPick) return;
  if(group === 'patch' || group === 'vape'){ var b = v === 'true'; ciPick[group] = ciPick[group] === b ? null : b; }
  else {
    var list = ciPick[group], i = list.indexOf(v);
    if(i >= 0) list.splice(i, 1); else list.push(v);
    if(group === 'sess'){
      ciPick.sessDirty = true;
      if(v === 'rest' && i < 0) ciPick.sess = ['rest'];
      else if(i < 0) ciPick.sess = ciPick.sess.filter(function(k){ return k !== 'rest'; });
    }
  }
  renderCiChips();
}
export function openCheckin(){
  ciDate = state.selected <= todayKey() ? state.selected : todayKey();
  var m = metricsOf(ciDate);
  $('#ci-date').textContent = ciDate === todayKey() ? 'Today · ' + fmtShort(ciDate) : fmtWd(ciDate);
  CI_NUMS.concat(CI_TIMES).forEach(function(k){ var el = $('#ci-' + k); if(el) el.value = m[k] !== undefined && m[k] !== null ? m[k] : ''; });
  ciPick = {sess:sessOf(ciDate).filter(function(k){ return SESS.some(function(s){ return s.k === k; }); }), tags:tagsOf(ciDate).slice(), patch:typeof m.patch === 'boolean' ? m.patch : null, vape:typeof m.vape === 'boolean' ? m.vape : null, sessDirty:false};
  renderCiChips();
  var dow = parseKey(ciDate).getDay();
  $('#ci-weight-hint').textContent = dow === 0 ? 'Sunday: weigh after the bathroom, before food.' : 'Only Sunday morning weigh-ins count toward the trend.';
  $('#ci-bed-lbl').textContent = 'Bedtime, night of ' + fmtShort(addDays(ciDate, -1));
  openSheet('#checkin-sheet');
}
export function saveCheckin(){
  var date = ciDate || todayKey(), tg = T(), prev = addDays(date, -1);
  var old = metricsOf(date), m = clone(old);
  CI_NUMS.forEach(function(k){ var el = $('#ci-' + k); if(!el) return; var v = parseFloat(el.value); if(Number.isFinite(v)) m[k] = v; else delete m[k]; });
  CI_TIMES.forEach(function(k){ var el = $('#ci-' + k); if(!el) return; if(el.value) m[k] = el.value; else delete m[k]; });
  if(ciPick.sessDirty){ if(ciPick.sess.length) m.sess = ciPick.sess.slice(); else delete m.sess; delete m.type; delete m.rip; }
  if(ciPick.tags.length) m.tags = ciPick.tags.slice(); else delete m.tags;
  if(ciPick.patch !== null) m.patch = ciPick.patch; else delete m.patch;
  if(ciPick.vape !== null) m.vape = ciPick.vape; else delete m.vape;
  var notes = commitMetrics(date, m, old, ciPick.sessDirty);
  closeSheets();
  setTimeout(function(){ toast('Check-in saved' + (notes.length ? ' · ' + notes.join(', ') : '')); }, 60);
}
/* writes a day's metrics and auto-scores the linked habits; shared by the check-in sheet and the coach */
export function commitMetrics(date, m, old, sessDirty){
  var tg = T(), prev = addDays(date, -1);
  var notes = [], started = state.stats && state.stats.start;
  mutateDay(date, function(day){
    if(Object.keys(m).length) day.m = m; else delete day.m;
    day.rest = day.rest || {};
    var nh = habitById('nicotine');
    if(nh && isActive(nh, date) && m.vape !== old.vape && typeof m.vape === 'boolean'){
      if(m.vape){ if(day.done.nicotine){ delete day.done.nicotine; notes.push('Nicotine-free unchecked'); } }
      else if(!day.done.nicotine){ day.done.nicotine = Date.now(); notes.push('Nicotine-free checked'); }
    }
    var eh = habitById('eat');
    if(eh && isActive(eh, date) && Number.isFinite(m.cal) && m.cal !== old.cal){
      if(m.cal >= tg.cal){ if(!day.done.eat){ day.done.eat = Date.now(); notes.push('Eat enough checked'); } }
      else if(day.done.eat && date !== todayKey()){ delete day.done.eat; notes.push('Eat enough unchecked'); }
    }
    var wh = habitById('workout');
    if(wh && isActive(wh, date) && sessDirty && m.sess){
      var s = m.sess;
      if(s.some(isStrengthKey)){ if(!day.done.workout){ day.done.workout = Date.now(); notes.push('Train checked'); } delete day.rest.workout; }
      else if(s.indexOf('rest') >= 0){ delete day.done.workout; delete day.extras.workout; day.rest.workout = Date.now(); }
      else if(s.indexOf('ripright') >= 0 || s.indexOf('cardio') >= 0){ delete day.done.workout; delete day.extras.workout; day.rest.workout = 'light'; }
    }
    if(!Object.keys(day.rest).length) delete day.rest;
  }, {});
  var sh = habitById('sleep');
  if(m.bed && m.bed !== old.bed && sh && isActive(sh, prev) && started && prev >= started){
    var ontime = bedMin(m.bed) <= bedTargetMin(prev), pd = state.days[prev], was = !!(pd && pd.done && pd.done.sleep);
    if(ontime !== was){
      mutateDay(prev, function(day){ if(ontime) day.done.sleep = Date.now(); else { delete day.done.sleep; delete day.extras.sleep; } }, {});
      notes.push('Bed on time ' + (ontime ? 'checked' : 'unchecked') + ' for ' + fmtShort(prev));
    }
  }
  return notes;
}

/* charts */
function bulletRow(label, avg, target, unit, status, sub){
  var ratio = avg === null ? 0 : avg/target, w = Math.min(ratio, 1.5)/1.5*100;
  return '<div class="brow"><div class="brow-top"><span class="brow-l">' + esc(label) + '</span><span class="brow-v">' + (avg === null ? '–' : fmt(avg) + unit) + ' <small>/ ' + fmt(target) + unit + '</small></span>' +
    (status ? '<span class="st st-' + status[0] + '">' + status[1] + '</span>' : '') + '</div>' +
    '<div class="btrack"><span class="bfill st-bg-' + (status ? status[0] : 'none') + '" style="width:' + w.toFixed(1) + '%"></span><i class="btick" style="left:66.67%"></i></div>' +
    (sub ? '<p class="brow-sub">' + sub + '</p>' : '') + '</div>';
}
function weightChart(ws){
  var pts = ws.slice(-12);
  if(pts.length < 2) return '';
  var W = 340, H = 128, pl = 40, pr = 12, pt = 12, pb = 22;
  var vals = pts.map(function(p){ return p.w; }).concat(pts.map(function(p){ return p.avg; }));
  var min = Math.floor(Math.min.apply(null, vals) - 1), max = Math.ceil(Math.max.apply(null, vals) + 1);
  function x(i){ return pl + i*((W - pl - pr)/(pts.length - 1)); }
  function y(v){ return pt + (H - pt - pb) - (v - min)/(max - min)*(H - pt - pb); }
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Sunday weigh-ins with a 3-weigh-in rolling average">';
  [min, (min + max)/2, max].forEach(function(v){ s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" stroke="var(--line)" stroke-dasharray="2 3"/><text x="' + (pl - 5) + '" y="' + (y(v) + 3.5).toFixed(1) + '" text-anchor="end" font-size="10" fill="var(--muted)" font-family="var(--font-body)">' + (Math.round(v*10)/10) + '</text>'; });
  s += '<path d="' + pts.map(function(p, i){ return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.avg).toFixed(1); }).join(' ') + '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
  pts.forEach(function(p, i){ s += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.w).toFixed(1) + '" r="4" fill="var(--surface)" stroke="var(--muted)" stroke-width="2"><title>' + esc(fmtShort(p.d) + ': ' + p.w + ' lb · rolling avg ' + (Math.round(p.avg*10)/10) + ' lb') + '</title></circle>'; });
  s += '<text x="' + x(0).toFixed(1) + '" y="' + (H - 6) + '" font-size="10" fill="var(--muted)" font-family="var(--font-body)">' + esc(fmtShort(pts[0].d)) + '</text>';
  s += '<text x="' + x(pts.length - 1).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="end" font-size="10" fill="var(--muted)" font-family="var(--font-body)">' + esc(fmtShort(pts[pts.length - 1].d)) + '</text>';
  return s + '</svg><div class="legend"><span><i class="lg-dot"></i>Sunday weigh-in</span><span><i style="background:var(--accent)"></i>Rolling average (last 3 Sundays)</span></div>';
}
function recoveryBars(){
  var days = lastNDays(14), W = 340, H = 110, pl = 26, pr = 4, pt = 8, pb = 20, bw = (W - pl - pr)/days.length;
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="WHOOP recovery, last 14 days">';
  [0, 34, 67, 100].forEach(function(v){ var yy = pt + (H - pt - pb)*(1 - v/100); s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '" stroke="var(--line)"' + (v ? ' stroke-dasharray="2 3"' : '') + '/><text x="' + (pl - 5) + '" y="' + (yy + 3.5).toFixed(1) + '" text-anchor="end" font-size="9.5" fill="var(--muted)" font-family="var(--font-body)">' + v + '</text>'; });
  days.forEach(function(d, i){
    var v = metricsOf(d).rec, z = zoneOf(v), cx = pl + i*bw + bw/2, bwid = Math.min(12, bw*0.6);
    if(Number.isFinite(v)){ var top = pt + (H - pt - pb)*(1 - v/100), hh = H - pb - top; s += '<path d="' + topRound(+(cx - bwid/2).toFixed(2), +top.toFixed(2), bwid, +hh.toFixed(2), 3) + '" fill="var(--z-' + z.k + ')"><title>' + esc(fmtWd(d) + ': ' + v + '% (' + z.name + ')') + '</title></path>'; }
    s += '<text x="' + cx.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="9" fill="var(--muted)" font-family="var(--font-body)">' + parseKey(d).getDate() + '</text>';
  });
  return s + '</svg>';
}
function patternHTML(p){
  var h = '<div class="pat"><div class="pat-head"><b>' + esc(p.t) + '</b><span>' + esc(p.q) + '</span></div>';
  if(!p.ready){
    return h + '<p class="pat-wait">Needs ' + PAT_MIN + '+ days in each group. ' + esc(p.a.n) + ': <b>' + p.a.v.length + '</b> · ' + esc(p.b.n) + ': <b>' + p.b.v.length + '</b></p></div>';
  }
  function fv(v){ return p.u === 'h' ? (Math.round(v*10)/10) + 'h' : Math.round(v) + '%'; }
  function row(g, cls){ var w = Math.max(2, Math.min(100, g.m/p.max*100)); return '<div class="pat-row"><span class="pat-l">' + esc(g.n) + '</span><div class="pat-bar"><span class="' + cls + '" style="width:' + w.toFixed(1) + '%"></span></div><span class="pat-v">' + fv(g.m) + ' <small>n=' + g.v.length + '</small></span></div>'; }
  var diff = p.b.m - p.a.m, unit = p.u === 'h' ? (Math.round(Math.abs(diff)*10)/10) + 'h' : Math.round(Math.abs(diff)) + (p.u === '%' ? ' pts' : '');
  var verdict = Math.abs(diff) < (p.u === 'h' ? 0.15 : 2) ? 'No real difference yet.' : esc(p.b.n) + ' runs ' + unit + (diff < 0 ? ' lower.' : ' higher.');
  return h + row(p.a, 'pa') + row(p.b, 'pb') + '<p class="pat-v2">' + verdict + '</p></div>';
}
export var FLAG_ICON = {alert:'!', warn:'▲', info:'i', good:'✓'};
function flagsHTML(F){ return '<ul class="flags">' + F.map(function(f){ return '<li class="flag f-' + f.sev + '"><span class="fi" aria-hidden="true">' + FLAG_ICON[f.sev] + '</span><div><p class="ft">' + esc(f.t) + '</p><p class="fx">' + esc(f.x) + '</p></div></li>'; }).join('') + '</ul>'; }
function fmtVal(v, r){ return r.dec ? (Math.round(v*10)/10) + r.u : fmt(v) + r.u; }
function fmtDelta(dv, r){ var a = Math.abs(dv), shown = r.dec ? Math.round(a*10)/10 : Math.round(a); if(!shown) return 'same as last wk'; return (dv > 0 ? '+' : '−') + (r.dec ? shown + r.u : fmt(a) + (r.u === '%' ? ' pts' : r.u)) + ' vs last wk'; }

function renderBody(){
  blCache = {};
  var tg = T(), today = todayKey(), view = $('#view-body');
  if(!bodyWeek || bodyWeek > mondayOf(today)) bodyWeek = parseKey(today).getDay() === 0 ? mondayOf(today) : addDays(mondayOf(today), -7);
  var rd = readiness(today), nx = rd.next, tally = weekTally(mondayOf(today));
  var h = '<section class="card panel"><div class="panel-head"><h3>Today’s call</h3><button class="primary" type="button" data-act="open-checkin">Check-in</button></div>';
  if(rd.call) h += '<p class="rcall' + (rd.z ? ' z-' + rd.z.k : '') + '">' + (rd.z ? '<b>' + rd.rec + '%</b><span>' + rd.z.name + '</span>' : '') + '<em>' + esc(rd.call) + '</em></p>';
  else h += '<p class="empty">Log this morning’s WHOOP recovery for a readiness call.</p>';
  if(rd.flags.length) h += flagsHTML(rd.flags);
  var plan = [];
  if(nx) plan.push(nx.done ? 'Today: <b>' + esc(sessName(nx.k)) + '</b> · next up <b>' + esc(sessName(ROTATION[(ROTATION.indexOf(nx.k) + 1) % ROTATION.length])) + '</b>' : 'Next strength session: <b>' + esc(sessName(nx.k)) + '</b>');
  plan.push('Strength <b>' + tally.strength + '/' + tg.strengthPerWeek + '</b> · light <b>' + tally.light + '/' + tg.lightDays + '</b> · full rest <b>' + tally.rest + '/' + tg.restDays + '</b> · RipRight <b>' + tally.rip + '/' + tg.ripMin + '–' + tg.ripMax + '</b>');
  if(nx && nx.k === 'legs' && !nx.done && tally.rip < tg.ripMax) plan.push('RipRight goes at the start of leg day, never after pressing.');
  h += '<p class="rplan">' + plan.join('<br>') + '</p></section>';

  h += '<div class="bfilter" role="group" aria-label="Leave tagged days out of averages and patterns"><span>Leave out</span>' + FILTERABLE.map(function(k){ var t = TAGS.filter(function(x){ return x.k === k; })[0]; return '<button class="lchip" type="button" data-act="body-filter" data-tag="' + k + '" aria-pressed="' + !!bodyFilter[k] + '">' + esc(t.n) + '</button>'; }).join('') + '<small>Sick and band-issue days are always left out.</small></div>';

  var wr = weekReview(bodyWeek), isThis = bodyWeek === mondayOf(today);
  var wkLbl = fmtShort(bodyWeek) + ' – ' + fmtShort(addDays(bodyWeek, 6));
  h += '<section class="card panel"><div class="panel-head"><h3>Weekly review</h3><div class="wknav"><button class="pill-btn" type="button" data-act="body-week" data-dir="-1" aria-label="Previous week">‹</button><span>' + esc(wkLbl) + '</span><button class="pill-btn" type="button" data-act="body-week" data-dir="1" aria-label="Next week"' + (isThis ? ' disabled' : '') + '>›</button></div></div>';
  h += '<p class="muted small">' + (isThis && !wr.complete ? 'Week so far. The full review lands Sunday.' : 'Sunday review.') + ' Averages cover logged days only. Nothing is filled in.</p>';
  if(wr.lever) h += '<div class="lever"><span class="eyebrow">Fix next week</span><p><b>' + esc(wr.lever.t) + '.</b> ' + esc(wr.lever.x) + '</p></div>';
  wr.defs.forEach(function(r){
    if(!r.t) return;
    var c = r.cur ? r.cur.v : null, st = c === null ? null : r.dir > 0 ? (c >= r.t*0.95 ? ['ok','On target'] : ['short','Short']) : (c <= r.t ? ['ok','On target'] : ['over','Over']);
    var dv = r.cur && r.prev ? r.cur.v - r.prev.v : null;
    h += bulletRow(r.n, c, r.t, r.u, st, (r.cur ? r.cur.n + (r.cur.n === 1 ? ' day' : ' days') : 'No days logged') + (r.prev ? ' · last week ' + fmt(r.prev.v) + r.u + (dv !== null ? ' (' + (dv >= 0 ? '+' : '−') + fmt(Math.abs(dv)) + ')' : '') : ''));
  });
  h += '<div class="mtiles wk-tiles">';
  wr.defs.forEach(function(r){
    if(r.t) return;
    var dv = r.cur && r.prev ? r.cur.v - r.prev.v : null;
    h += '<div><b>' + (r.cur ? fmtVal(r.cur.v, r) : '–') + '</b><span>' + esc(r.n) + (dv !== null ? ' · ' + fmtDelta(dv, r) : '') + '</span></div>';
  });
  h += '<div><b>' + wr.food.late + '<small>/' + wr.food.n + '</small></b><span>Nights with food after ' + esc(fmtHour(tg.lastMeal)) + (wr.foodPrev.n ? ' · last wk ' + wr.foodPrev.late + '/' + wr.foodPrev.n : '') + '</span></div>';
  h += '<div><b>' + wr.bed.late + '<small>/' + wr.bed.n + '</small></b><span>Nights in bed after ' + esc(fmtHour(tg.bed)) + (tg.satBed ? ' (Sat ' + esc(fmtHour(tg.satBed)) + ')' : '') + (wr.bedPrev.n ? ' · last wk ' + wr.bedPrev.late + '/' + wr.bedPrev.n : '') + '</span></div>';
  h += '<div><b>' + wr.tally.strength + '<small>/' + tg.strengthPerWeek + '</small></b><span>Strength sessions · last wk ' + wr.prevTally.strength + '</span></div>';
  h += '<div><b>' + wr.tally.light + '<small>+' + wr.tally.rest + '</small></b><span>Light + full rest days · cardio ' + wr.tally.cardio + '</span></div>';
  var wt = weightTrend(), lastW = wt.last;
  h += '<div><b>' + (lastW ? (Math.round(lastW.avg*10)/10) + '<small> lb</small>' : '–') + '</b><span>Weight, rolling avg of ' + (lastW ? lastW.navg : 0) + (lastW && lastW.navg === 1 ? ' Sunday' : ' Sundays') + (wt.rate !== null ? ' · ' + (wt.rate >= 0 ? '+' : '−') + Math.abs(Math.round(wt.rate*10)/10) + ' lb/mo' : '') + '</span></div>';
  h += '</div></section>';

  var P = patternData();
  h += '<section class="card panel"><div class="panel-head"><h3>Patterns</h3><span class="muted" style="font-size:12px">Last ' + PAT_DAYS + ' days</span></div>' + P.map(patternHTML).join('') +
    '<p class="muted small">A pattern shows only once each side has ' + PAT_MIN + '+ days. Sleep and recovery count toward the night they follow.</p></section>';

  var tiles = ['hrv', 'rhr', 'rr'].map(function(k){
    var lw = latestWith(today, k, 2), b = lw ? baselineAt(lw.d, k) : baselineAt(today, k);
    var lbl = {hrv:'HRV ms', rhr:'Resting HR', rr:'Resp. rate'}[k];
    var dv = lw && b ? lw.v - b.v : null, warn = dv !== null && ((k === 'rhr' && dv >= 3) || (k === 'rr' && dv >= 1) || (k === 'hrv' && dv <= -b.v*0.15));
    return '<div' + (warn ? ' class="tile-warn"' : '') + '><b>' + (lw ? (k === 'rr' ? lw.v.toFixed(1) : Math.round(lw.v)) : '–') + '</b><span>' + lbl + (lw && lw.d !== today ? ' (' + fmtShort(lw.d) + ')' : '') + ' · base ' + (b ? (k === 'rr' ? b.v.toFixed(1) : Math.round(b.v)) : 'building') + (dv !== null ? ' (' + (dv >= 0 ? '+' : '−') + (k === 'rr' ? Math.abs(dv).toFixed(1) : Math.round(Math.abs(dv))) + ')' : '') + '</span></div>';
  }).join('');
  h += '<section class="card panel"><div class="panel-head"><h3>Recovery</h3><span class="muted" style="font-size:12px">30-day baselines</span></div><div class="mtiles">' + tiles + '</div>' +
    '<p class="eyebrow">Recovery, last 14 days</p><div class="chart-wrap">' + recoveryBars() + '</div>' +
    '<div class="legend"><span><i style="background:var(--z-green)"></i>Green 67+ train</span><span><i style="background:var(--z-yellow)"></i>Yellow cut volume</span><span><i style="background:var(--z-red)"></i>Red walk or rest</span></div>' +
    '<p class="muted small">Baselines are the average of the 30 days before each date, with sick and band-issue days left out. They need ' + BL_MIN + '+ days of data.</p></section>';

  var cur = wt.all.length ? wt.all[wt.all.length - 1] : null;
  var gpct = cur ? Math.max(0, Math.min(100, (cur.w - tg.startWeight)/(tg.goalWeight - tg.startWeight)*100)) : 0;
  h += '<section class="card panel"><div class="panel-head"><h3>Bodyweight</h3><span class="muted" style="font-size:12px">Sunday AM only</span></div>' +
    '<div class="bw-top"><div><span class="bw-n">' + (lastW ? (Math.round(lastW.avg*10)/10) : '–') + '</span><span class="bw-u">lb</span><p class="muted small">' + (lastW ? 'Rolling average of ' + lastW.navg + (lastW.navg === 1 ? ' Sunday' : ' Sundays') + ' · last ' + lastW.w + ' lb ' + esc(fmtShort(lastW.d)) : 'No Sunday weigh-ins yet') + '</p></div>' +
    '<div class="bw-goal"><p class="small"><b>' + tg.startWeight + '</b> → <b>' + tg.goalWeight + ' lean</b></p><div class="bar"><span style="width:' + gpct.toFixed(1) + '%"></span></div><p class="muted small">' + (cur ? Math.round(gpct) + '% of the way · ' + (Math.round((tg.goalWeight - cur.w)*10)/10) + ' lb to go' : '') + '</p></div></div>';
  h += weightChart(wt.ws);
  if(wt.rate !== null){
    var changed = tg.calChangedOn && daysBetween(tg.calChangedOn, today) < 28;
    h += '<div class="rule"><p><b>' + (wt.rate >= 0 ? '+' : '−') + Math.abs(Math.round(wt.rate*10)/10) + ' lb/month</b> across ' + wt.n + ' Sunday weigh-ins since ' + esc(fmtShort(wt.from)) + '. ' + esc(wt.rec.text) + (wt.rec.caveat ? ' ' + esc(wt.rec.caveat) : '') + '</p>' +
      (wt.rec.delta && !changed ? '<button class="primary" type="button" data-act="apply-cal" data-delta="' + wt.rec.delta + '">Set calories to ' + fmt(tg.cal + wt.rec.delta) + '</button>' : '') +
      (changed ? '<p class="muted small">Calories last changed ' + esc(fmtShort(tg.calChangedOn)) + '. Next review after ' + esc(fmtShort(addDays(tg.calChangedOn, 28))) + '.</p>' : '') + '</div>';
  } else {
    h += '<p class="muted small">' + esc(wt.need) + ' Under 1 lb a month: +200. 1–2: hold. Over 3: −200.</p>';
  }
  var waists = Object.keys(state.days).filter(function(k){ return Number.isFinite(metricsOf(k).waist); }).sort();
  h += '<p class="small">Waist: ' + (waists.length ? '<b>' + metricsOf(waists[waists.length-1]).waist + ' in</b> on ' + esc(fmtShort(waists[waists.length-1])) : 'not measured yet (monthly)') + '</p></section>';

  var W = watchList();
  if(W.length) h += '<section class="card panel"><div class="panel-head"><h3>Watch list</h3></div>' + flagsHTML(W) + '</section>';

  h += '<section class="card panel"><div class="panel-head"><h3>Targets</h3></div><ul class="rules">' +
    '<li><b>' + fmt(tg.cal) + '</b><span>Calories a day, training included</span></li>' +
    '<li><b>' + tg.pro + 'g</b><span>Protein daily (' + tg.proMax + 'g ceiling) · carbs ~' + tg.carb + 'g · fat ~' + tg.fat + 'g · fiber ' + tg.fib + 'g · sodium ≤' + fmt(tg.sod) + 'mg</span></li>' +
    '<li><b>' + esc(fmtHour(tg.bed)) + '</b><span>In bed (Saturdays: ' + esc(fmtHour(tg.satBed)) + '). Last food by ' + esc(fmtHour(tg.lastMeal)) + '. Naps under 45 min, before 2 PM. Caffeine cutoff noon.</span></li>' +
    '<li><b>' + tg.strengthPerWeek + '+' + tg.lightDays + '</b><span>Strength days plus a light day each week, ' + tg.restDays + ' full rest. Rotation: chest + biceps → back + triceps → legs. Double progression 8–12 reps. Cardio counts separately.</span></li>' +
    '<li><b>' + tg.ripMin + '–' + tg.ripMax + '×</b><span>RipRight a week, on the light day or at the start of leg day. Never after pressing.</span></li></ul></section>';
  view.innerHTML = h;
  view.style.display = 'flex'; view.style.flexDirection = 'column'; view.style.gap = '14px';
}
export function applyCalories(delta){
  var s2 = clone(state.settings);
  s2.targets.cal = (s2.targets.cal || DEFAULT_TARGETS.cal) + delta;
  s2.targets.calChangedOn = todayKey();
  state.settings = normalizeSettings(s2);
  recompute(); render();
  saveSettings().then(function(ok){ if(ok) toast('Calories set to ' + fmt(state.settings.targets.cal)); });
}


/* action app.js calls; bodyWeek stays in this file */
export function stepBodyWeek(dir){ var nwk = addDays(bodyWeek || mondayOf(todayKey()), 7*dir); if(nwk <= mondayOf(todayKey())){ bodyWeek = nwk; render(); } }
registerTab('body', renderBody);
