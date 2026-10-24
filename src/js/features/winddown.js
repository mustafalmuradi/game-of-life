// Wind-down: from Isha (or an hour before the bed target, whichever comes first) until the night's bedtime is logged,
// the top of Today counts down to bed, marks the screens-off checkpoint, shows the sleep he can still get before Fajr,
// and logs "in bed" with one tap. The bedtime lands on the wake date (m.bed), where the check-in and Coach put it,
// so Bed on time scores through the same code as always.
import { $, addDays, clone, esc, mondayOf, pad, parseKey, todayKey } from '../core/utils.js';
import { habitById, isActive, lateOf, state } from '../core/state.js';
import { fmtLeft, fmtMin, salahTimes } from '../core/salah.js';
import { recompute } from '../core/stats.js';
import { scheduleSave } from '../core/store.js';
import { toast } from '../core/effects.js';
import { render } from '../core/render.js';
import { bedMin, bedTargetMin, commitMetrics, metricsOf } from './body.js';
import { salahCfg } from './salah.js';
import { toggleRest } from './today.js';

var SCREENS_OFF = 30, EARLY_START = 60; // minutes before the bed target
function nowParts(){ var n = new Date(); return {min:n.getHours()*60 + n.getMinutes() + n.getSeconds()/60, hm:pad(n.getHours()) + ':' + pad(n.getMinutes())}; }
/* The night in progress, in "night minutes" (past midnight = 1440+): tonight once its window opens, last night until Fajr. */
export function nightNow(){
  var today = todayKey(), cfg = salahCfg(), now = nowParts().min, t = salahTimes(today, cfg);
  var tStart = Math.min(t.isha, bedTargetMin(today) - EARLY_START);
  if(now >= tStart) return {date:today, nowNight:now, start:tStart, isha:t.isha, fajr:salahTimes(addDays(today, 1), cfg).fajr + 1440};
  if(now < t.fajr){ var y = addDays(today, -1), yt = salahTimes(y, cfg); return {date:y, nowNight:now + 1440, start:Math.min(yt.isha, bedTargetMin(y) - EARLY_START), isha:yt.isha, fajr:t.fajr + 1440}; }
  return null;
}
export function windState(){
  var n = nightNow(); if(!n) return null;
  n.wake = addDays(n.date, 1); n.bed = metricsOf(n.wake).bed || null; n.logged = !!n.bed;
  n.target = bedTargetMin(n.date); n.late = lateOf(n.date);
  n.left = n.target - n.nowNight; n.screensAt = n.target - SCREENS_OFF; n.fajrLeft = n.fajr - n.nowNight;
  /* "life happens" passes: Bed on time's rest days (full points, streak and sweep kept), two a week by default */
  var sh = habitById('sleep'), doc = state.days[n.date];
  n.passOn = !!(doc && doc.rest && doc.rest.sleep);
  n.passes = sh && isActive(sh, n.date) ? (sh.restPerWeek || 0) : 0;
  n.passesLeft = Math.max(0, n.passes - (((state.stats && state.stats.restUsed) || {})['sleep|' + mondayOf(n.date)] || 0));
  n.passFull = !!(sh && sh.restFull);
  return n;
}
var shownKey = null; // what the card last rendered (night date + logged), so the tick knows when a full render is due
export function renderWind(){
  var el = $('#wind'); if(!el) return;
  var w = state.selected === todayKey() ? windState() : null;
  shownKey = w ? w.date + (w.logged ? ':logged' : '') + (w.passOn ? ':pass' : '') : 'none';
  if(!w || w.logged){ el.hidden = true; el.innerHTML = ''; return; }
  var past = w.left < 0 && !w.passOn, pct = Math.max(0, Math.min(100, (w.nowNight - w.start)/Math.max(1, w.target - w.start)*100));
  var who = w.passOn ? 'Life happens' : w.late ? 'Late night planned' : ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][parseKey(w.date).getDay()] + ' night';
  var h = '<div class="wd-head"><div><p class="eyebrow">Wind-down · ' + esc(who) + '</p>' +
    (w.passOn ? '<p class="wd-big is-pass"><span class="wd-left">Pass used · points kept</span></p>' :
    '<p class="wd-big' + (past ? ' is-past' : '') + '"><span class="wd-left">' + esc(past ? fmtLeft(-w.left) + ' past bedtime' : fmtLeft(w.left) + ' to bed') + '</span></p>') + '</div>' +
    '<div class="wd-side"><span class="wd-target">' + esc(fmtMin(w.target)) + '</span><span class="wd-sub">' + (w.passOn ? 'was the target' : 'in bed by' + (w.late && Number.isFinite(w.late.xp) ? ' · +' + w.late.xp + ' XP' : '')) + '</span></div></div>';
  if(!w.passOn) h += '<div class="wd-bar" aria-hidden="true"><span class="wd-fill' + (past ? ' is-past' : '') + '" style="width:' + pct.toFixed(2) + '%"></span><i class="wd-tick" style="left:' + Math.max(0, Math.min(100, (w.screensAt - w.start)/Math.max(1, w.target - w.start)*100)).toFixed(2) + '%"></i></div>';
  var so = w.passOn ? 'Tonight doesn’t count against Bed on time' + (w.passFull ? ': the full +20 is yours' : '') + '. Still log the bedtime for your sleep data.' :
    w.nowNight < w.screensAt ? 'Screens off by ' + fmtMin(w.screensAt) + ' · <span class="wd-so">' + esc(fmtLeft(w.screensAt - w.nowNight)) + '</span>' : w.nowNight < w.target ? '<b>Screens off now</b> · phone out of the room' : '<b>Screens off</b> · lights out';
  h += '<div class="wd-facts"><p class="wd-fact">' + so + '</p>' +
    '<p class="wd-fact">Fajr ' + esc(fmtMin(w.fajr)) + ' · <b class="wd-sleep">' + esc(fmtLeft(w.fajrLeft)) + '</b> of sleep if you lie down now</p></div>';
  h += '<div class="wd-actions"><button class="primary wd-btn" type="button" data-act="in-bed">In bed now</button>';
  if(w.passes){
    if(w.passOn) h += '<button class="ghost wd-pass" type="button" data-act="life-happens">Undo pass</button>';
    else if(w.passesLeft > 0) h += '<button class="ghost wd-pass" type="button" data-act="life-happens"><b>Life happens</b><span>' + w.passesLeft + ' of ' + w.passes + ' left this week</span></button>';
    else h += '<span class="wd-pass is-out"><b>No passes left</b><span>' + w.passes + ' a week · resets Monday</span></span>';
  }
  h += '</div>';
  el.innerHTML = h; el.hidden = false;
}
/* the pass: Bed on time's rest day for the night in progress, toggled from the card */
export function lifeHappens(){ var w = windState(); if(!w || !w.passes) return; if(!w.passOn && w.passesLeft <= 0) return; toggleRest('sleep', null, w.date); }
/* the one write: tonight's bedtime, as the wake date's m.bed (this minute). Bed on time scores itself. */
export function logInBed(){
  var w = windState(); if(!w || w.logged) return;
  var hm = nowParts().hm, old = clone(metricsOf(w.wake)), m = clone(old); m.bed = hm;
  var snap = {}; [w.date, w.wake].forEach(function(k){ snap[k] = state.days[k] ? clone(state.days[k]) : null; });
  var notes = commitMetrics(w.wake, m, old, false);
  var late = bedMin(hm) - w.target;
  toast('In bed ' + fmtMin(bedMin(hm)) + (late > 0 ? ' · ' + fmtLeft(late) + ' past target' : ' · on time') + (notes.length ? ' · ' + notes.join(', ') : ''), {label:'Undo', fn:function(){
    Object.keys(snap).forEach(function(k){ if(snap[k]) state.days[k] = snap[k]; else delete state.days[k]; scheduleSave(k); });
    recompute(); render();
  }});
}
/* every 30 s: countdown, bar and the two facts; a window opening or closing re-renders the page */
export function windTick(){
  if(state.selected !== todayKey()) return;
  var w = windState(), key = w ? w.date + (w.logged ? ':logged' : '') + (w.passOn ? ':pass' : '') : 'none';
  if(key !== shownKey){ render(); return; }
  if(!w || w.logged) return;
  if(w.passOn) return;
  var past = w.left < 0, left = $('#wind .wd-left'); if(left) left.textContent = past ? fmtLeft(-w.left) + ' past bedtime' : fmtLeft(w.left) + ' to bed';
  var big = $('#wind .wd-big'); if(big) big.classList.toggle('is-past', past);
  var fill = $('#wind .wd-fill'); if(fill){ fill.style.width = Math.max(0, Math.min(100, (w.nowNight - w.start)/Math.max(1, w.target - w.start)*100)).toFixed(2) + '%'; fill.classList.toggle('is-past', past); }
  var so = $('#wind .wd-so'); if(so){ if(w.nowNight < w.screensAt) so.textContent = fmtLeft(w.screensAt - w.nowNight); else { render(); return; } }
  var sl = $('#wind .wd-sleep'); if(sl) sl.textContent = fmtLeft(w.fajrLeft);
}
