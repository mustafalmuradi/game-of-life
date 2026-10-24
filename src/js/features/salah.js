// Salah: the day's prayer times on Today with a live "next prayer" readout, the HUD countdown, and the rawatib
// tracker (five taps for the 12 daily sunnah rakʿāt) that checks the Sunnah prayers habit when all five are in.
import { $, esc, fmtShort, todayKey } from '../core/utils.js';
import { habitById, isActive, state, T, ui } from '../core/state.js';
import { fmtLeft, fmtMin, fmtMin24, PRAYERS, prayerName, RAWATIB, RAWATIB_TOTAL, salahConfig, salahNight, salahNow, salahTimes } from '../core/salah.js';
import { render } from '../core/render.js';
import { mutateDay } from './today.js';

export var SUNNAH_ID = 'sunnah';
export function salahCfg(){ return salahConfig(T()); }
function nowMin(){ var n = new Date(); return n.getHours()*60 + n.getMinutes() + n.getSeconds()/60; }
function rawDef(k){ return RAWATIB.filter(function(x){ return x.k === k; })[0]; }
/* the rawatib logged on a day: array of keys from RAWATIB, in RAWATIB order */
export function rawatibOf(d){ var doc = state.days[d], r = doc && doc.m && doc.m.rawatib; if(!Array.isArray(r)) return []; return RAWATIB.map(function(x){ return x.k; }).filter(function(k){ return r.indexOf(k) >= 0; }); }
/* rakʿāt logged on a day (out of 12) */
export function rawatibCount(d){ return rawatibOf(d).reduce(function(a, k){ return a + rawDef(k).r; }, 0); }
export function rawatibLeft(d){ var done = rawatibOf(d); return RAWATIB.filter(function(x){ return done.indexOf(x.k) < 0; }); }
/* the Sunnah prayers habit's target line while rawatib are being logged */
export function rawatibLine(d){
  var left = rawatibLeft(d);
  return rawatibCount(d) + ' of ' + RAWATIB_TOTAL + ' rak\u02bf\u0101t logged' + (left.length ? ' \u00b7 left: ' + left.map(function(x){ return x.n + ' ' + x.r; }).join(', ') : '');
}
/* Apply a full set of logged rawatib to a day. The fifth one checks the Sunnah prayers habit through the same path as
   the check button (XP float, sweep logic, promotions) and marks the check as automatic; dropping below five again
   unchecks it only if that automatic check is still what holds it. A habit he checked by hand is left alone. */
export function setRawatib(date, keys, opts){
  var next = RAWATIB.map(function(x){ return x.k; }).filter(function(k){ return keys.indexOf(k) >= 0; });
  var cur = rawatibOf(date), wasFull = cur.length === RAWATIB.length, full = next.length === RAWATIB.length;
  var h = habitById(SUNNAH_ID), active = !!(h && isActive(h, date));
  var doc = state.days[date], habitDone = !!(doc && doc.done[SUNNAH_ID]), auto = !!(doc && doc.m && doc.m.rawatibAuto);
  var completes = active && full && !habitDone, uncompletes = active && !full && wasFull && habitDone && auto;
  if(completes) ui.popSeg = SUNNAH_ID;
  mutateDay(date, function(day){
    day.m = day.m || {};
    if(next.length) day.m.rawatib = next; else delete day.m.rawatib;
    if(completes){ day.done[SUNNAH_ID] = Date.now(); if(day.rest) delete day.rest[SUNNAH_ID]; day.m.rawatibAuto = 1; }
    if(uncompletes){ delete day.done[SUNNAH_ID]; delete day.m.rawatibAuto; }
  }, opts || {});
  return {done:next, completes:completes, uncompletes:uncompletes};
}
/* one tap on a chip for the selected day */
export function toggleRawatib(key, anchor){
  var date = state.selected; if(date > todayKey()) return;
  var def = rawDef(key); if(!def) return;
  var cur = rawatibOf(date), was = cur.indexOf(key) >= 0;
  setRawatib(date, was ? cur.filter(function(k){ return k !== key; }) : cur.concat([key]), {anchor: was ? null : anchor, undo: was ? def.n + ' ' + def.r + ' ' + def.when + ' removed' : null});
}
/* a summary for the coach: the day's times (24h), the live position for today, and the rawatib logged */
export function salahBrief(d, live){
  var cfg = salahCfg(), t = salahTimes(d, cfg), night = salahNight(d, cfg), out = {date:d, place:cfg.place, method:'ISNA ' + cfg.fajrAngle + '/' + cfg.ishaAngle + ', Asr ' + (cfg.asrHanafi ? 'Hanafi' : 'standard'), times:{}};
  PRAYERS.forEach(function(p){ out.times[p.k === 'dhuhr' ? prayerName('dhuhr', d).toLowerCase().replace(/\W/g, '') : p.k] = fmtMin24(t[p.k]); });
  out.lastThirdFrom = fmtMin24(night.lastThird);
  if(live){ var now = nowMin(), w = salahNow(d, now, cfg); out.current = w.cur.n + (w.cur.night ? ' (last night)' : ''); out.next = w.next.n + ' at ' + fmtMin24(w.next.min) + (w.next.tomorrow ? ' tomorrow' : '') + ', in ' + fmtLeft(w.next.min - now); }
  var done = rawatibOf(d);
  out.rawatibDone = done; out.rawatibLeft = rawatibLeft(d).map(function(x){ return x.k; }); out.rakaatLogged = rawatibCount(d) + ' of ' + RAWATIB_TOTAL;
  var doc = state.days[d]; out.sunnahHabitChecked = !!(doc && doc.done[SUNNAH_ID]);
  return out;
}

/* ---------- the card ---------- */
var shownIdx = null; // which prayer window the card last rendered for today; a change re-renders the page
export function renderSalah(){
  var el = $('#salah'); if(!el) return;
  var d = state.selected, today = todayKey(), cfg = salahCfg(), t = salahTimes(d, cfg), night = salahNight(d, cfg);
  var isToday = d === today, fut = d > today, now = nowMin();
  var w = isToday ? salahNow(d, now, cfg) : null;
  shownIdx = w ? w.idx : null;
  var pct = w ? w.pct : 0;
  var h = '<div class="sl-head"><div><p class="eyebrow">Salah' + (isToday ? '' : ' \u00b7 ' + esc(fmtShort(d))) + '</p>';
  if(w) h += '<p class="sl-next"><b>' + esc(w.next.n) + '</b> in <span class="sl-left">' + esc(fmtLeft(w.next.min - now)) + '</span></p>';
  else h += '<p class="sl-next is-still">' + (fut ? 'Times for that day' : 'Logged day') + '</p>';
  h += '</div><div class="sl-side">' + (w ? '<span class="sl-at">' + esc(fmtMin(w.next.min)) + '</span>' : '') + '<span class="sl-method">' + esc(cfg.place) + ' \u00b7 ISNA</span></div></div>';
  h += '<div class="sl-line" aria-hidden="true"><span class="sl-fill" style="width:' + pct.toFixed(2) + '%"></span>' +
    PRAYERS.map(function(p, i){ return '<i class="sl-dot' + (w && i <= w.idx ? ' on' : '') + '" style="left:' + (i/(PRAYERS.length - 1)*100).toFixed(2) + '%"></i>'; }).join('') +
    (w ? '<span class="sl-now" style="left:' + pct.toFixed(2) + '%"></span>' : '') + '</div>';
  h += '<div class="sl-grid">' + PRAYERS.map(function(p, i){
    var cls = 'sl-p' + (w && w.idx === i ? ' is-cur' : w && i < w.idx ? ' is-past' : '') + (p.k === 'sunrise' ? ' is-sun' : '');
    return '<div class="' + cls + '"' + (w && w.idx === i ? ' aria-current="true"' : '') + '><span class="sl-n">' + esc(prayerName(p.k, d)) + '</span><span class="sl-t">' + esc(fmtMin(t[p.k]).replace(/ [AP]M$/, '')) + '</span></div>';
  }).join('') + '</div>';
  var done = rawatibOf(d), cnt = rawatibCount(d), hb = habitById(SUNNAH_ID), col = hb ? 'var(--h-' + hb.color + ')' : 'var(--accent)';
  var habitOn = !!(hb && isActive(hb, d));
  h += '<div class="sl-raw" style="--hc:' + col + '"><div class="sl-raw-head"><span class="eyebrow">Rawatib</span><span class="sl-raw-count"><b>' + cnt + '</b> / ' + RAWATIB_TOTAL + ' rak\u02bf\u0101t</span></div><div class="sl-chips">' +
    RAWATIB.map(function(r){
      var on = done.indexOf(r.k) >= 0, live = !!(w && w.cur.k === r.p && !w.cur.night);
      return '<button type="button" class="sl-chip' + (on ? ' on' : '') + (live ? ' now' : '') + '" data-act="rawatib" data-k="' + r.k + '" aria-pressed="' + on + '"' + (fut ? ' disabled' : '') +
        ' aria-label="' + esc(r.n + ': ' + r.r + ' ' + r.when + (on ? ', logged' : '')) + '"><b>' + esc(r.n) + '</b><span>' + r.r + ' ' + r.when + '</span></button>';
    }).join('') + '</div>';
  var foot = fut ? 'Rawatib unlock on the day' : done.length === RAWATIB.length ? 'All ' + RAWATIB_TOTAL + ' rak\u02bf\u0101t' + (habitOn ? ' \u00b7 Sunnah prayers checked' : '') :
    (RAWATIB.length - done.length) + ' to go' + (habitOn ? ' \u00b7 all five checks Sunnah prayers' : '');
  h += '<p class="sl-foot">' + esc(foot) + ' \u00b7 Last third of the night from <b>' + esc(fmtMin(night.lastThird)) + '</b></p></div>';
  el.innerHTML = h;
}
/* the HUD readout: the next prayer and the time left, compact so the readout stays on one line on a phone */
function hudLeft(min){ return fmtLeft(min).replace(/h (\d)/, 'h$1'); }
export function salahHud(){
  var w = salahNow(todayKey(), nowMin(), salahCfg());
  return '<span class="hud-salah"><b>' + esc(w.next.n) + '</b> ' + esc(hudLeft(w.next.min - nowMin())) + '</span>';
}
/* every 30 s: move the countdown, the marker and the HUD without a full render; a new prayer window re-renders */
export function salahTick(){
  var today = todayKey(), now = nowMin(), w = salahNow(today, now, salahCfg());
  var hud = $('.hud-salah'); if(hud) hud.innerHTML = '<b>' + esc(w.next.n) + '</b> ' + esc(hudLeft(w.next.min - now));
  if(state.selected !== today) return;
  if(shownIdx !== null && shownIdx !== w.idx){ render(); return; }
  var left = $('#salah .sl-left'); if(left) left.textContent = fmtLeft(w.next.min - now);
  var fill = $('#salah .sl-fill'); if(fill) fill.style.width = w.pct.toFixed(2) + '%';
  var mark = $('#salah .sl-now'); if(mark) mark.style.left = w.pct.toFixed(2) + '%';
}
