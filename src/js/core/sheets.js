// Bottom sheets: open/close, the rank sheet, the extras sheet, habit settings.
import { BELTS, EXTRA_XP, LIGHT_XP } from './config.js';
import { $, clone, esc, fmt, fmtShort, todayKey } from './utils.js';
import { activeHabits, capOf, habitById, habitTarget, isActive, state } from './state.js';
import { beltOf, CURVES, habitCurve, rankInfo, rankSub, rankTitle } from './xp.js';
import { habit30 } from './stats.js';
import { beltSVG, rankProgressHTML, testsListHTML } from './svg.js';
import { habitRankRow } from './render.js';

/* ---------- sheets ---------- */
export var extraFor = null, lastFocus = null;
export function openSheet(id){ lastFocus = document.activeElement; var el = $(id); el.hidden = false; var f = el.querySelector('button, input'); if(f) setTimeout(function(){ f.focus(); }, 30); }
export function closeSheets(){
  ['#extra-sheet','#settings-sheet','#rank-sheet','#lift-sheet','#checkin-sheet','#build-sheet','#chat-sheet'].forEach(function(s){ $(s).hidden = true; });
  if(lastFocus && document.contains(lastFocus)) try { lastFocus.focus(); } catch(e){}
}
function heldHTML(rk){
  var nb = Math.min(beltOf(rk.level).b + 1, 4), m = CURVES.overall.multi[nb - 1], st = state.stats;
  var list = activeHabits(todayKey()).map(function(h){ return {h:h, v:st.habits[h.id] ? st.habits[h.id].held : 0}; }).sort(function(a, b){ return b.v - a.v; });
  return '<p class="eyebrow">Held streaks · ' + BELTS[nb].name + ' needs ' + m.n + ' at ' + m.d + '+ days</p><div class="held">' +
    list.map(function(x){ return '<span class="held-chip' + (x.v >= m.d ? ' on' : '') + '" style="--hc:var(--h-' + x.h.color + ')"><i></i>' + esc(x.h.name) + ' <b>' + x.v + 'd</b></span>'; }).join('') + '</div>';
}
export function openRank(id){
  var st = state.stats, el = $('#rank-sheet'), wasOpen = !el.hidden, h = '';
  if(id === 'overall'){
    var rk = st.rank;
    h += '<div class="rk-head"><div><p class="eyebrow">Overall rank · Level ' + (rk.level+1) + '</p><h3 id="rk-title">' + esc(rankTitle(rk.level)) + '</h3><p class="rank-sub">' + esc(rankSub(rk.level)) + '</p></div>' +
      '<div class="total"><span class="n">' + fmt(rk.xp) + '</span><span class="l">Total XP</span></div></div>' +
      beltSVG(rk.level) + rankProgressHTML(rk) +
      '<div class="rk-stats"><div><b>' + st.sweepRun + 'd</b><span>Sweep streak</span></div><div><b>' + st.bestRun + 'd</b><span>Best streak</span></div><div><b>' + st.sweepDays + '</b><span>Clean sweeps</span></div></div>' +
      '<p class="eyebrow">Belt tests · habits held + time in</p>' + testsListHTML(rk) + heldHTML(rk) +
      '<p class="eyebrow">Habit ranks</p><div class="hb">';
    state.settings.habits.forEach(function(hb){ h += habitRankRow(hb); });
    h += '</div>';
  } else {
    var hb = habitById(id); if(!hb) return;
    var hs = st.habits[id] || {run:0, best:0, xp:0, days:0, extras:0};
    var hr = hs.rank || rankInfo(0, 0, 0, habitCurve(hb), 0), m = habit30(hb);
    h += '<button class="link-btn back" type="button" data-act="open-rank" data-h="overall">← Overall rank</button>' +
      '<div class="rk-head"><div><p class="eyebrow"><i class="dot" style="background:var(--h-' + hb.color + ')"></i>' + esc(hb.name) + ' · Level ' + (hr.level+1) + '</p><h3 id="rk-title">' + esc(rankTitle(hr.level)) + '</h3><p class="rank-sub">' + esc(rankSub(hr.level)) + ' · ' + esc(habitTarget(hb)) + '</p></div>' +
      '<div class="total"><span class="n">' + fmt(hr.xp) + '</span><span class="l">Habit XP</span></div></div>' +
      beltSVG(hr.level) + rankProgressHTML(hr, 'var(--h-' + hb.color + ')') +
      '<div class="rk-stats"><div><b>' + hs.run + (hb.restPerWeek ? '' : 'd') + '</b><span>' + (hb.restPerWeek ? 'Session streak' : 'Streak') + '</span></div><div><b>' + hs.best + (hb.restPerWeek ? '' : 'd') + '</b><span>Best</span></div><div><b>' + hs.days + '</b><span>Days done</span></div><div><b>' + (m.elig ? m.pct + '%' : '–') + '</b><span>Last 30</span></div></div>' +
      '<p class="eyebrow">Belt tests · streak + time in</p>' + testsListHTML(hr, hb) +
      (hb.restPerWeek ? '<p class="test-d">Up to ' + hb.restPerWeek + (hb.restPerWeek === 1 ? ' rest day' : ' rest days') + ' a week don’t break this streak or your clean sweep. A miss beyond that does.' + (hb.lightPerWeek ? ' Log one as a light day and it earns +' + LIGHT_XP + ' XP (' + hb.lightPerWeek + ' a week).' : '') + '</p>' : '');
  }
  $('#rk-body').innerHTML = h;
  if(!wasOpen) openSheet('#rank-sheet'); else { var sh = el.querySelector('.sheet'); if(sh) sh.scrollTop = 0; }
}
export function openExtra(hid){
  var hb = habitById(hid); if(!hb) return;
  extraFor = hid;
  var doc = state.days[state.selected], n = ((doc && doc.extras[hid]) || []).length;
  $('#ex-title').textContent = 'Extra · ' + hb.name;
  $('#ex-sub').textContent = 'Extra ' + (n+1) + ' of ' + capOf(hb) + (state.selected === todayKey() ? ' today' : ' for ' + fmtShort(state.selected)) + '. Pick one or describe it.';
  $('#ex-presets').innerHTML = hb.presets.map(function(p){ return '<button class="preset" type="button" data-act="log-preset" data-note="' + esc(p) + '"><span>' + esc(p) + '</span><em>+' + EXTRA_XP + '</em></button>'; }).join('');
  $('#ex-note').value = '';
  openSheet('#extra-sheet');
}
export var draft = null;
export function openSettings(){ draft = clone(state.settings); renderSettingsList(); $('#new-name').value = ''; $('#new-target').value = ''; openSheet('#settings-sheet'); }
export function renderSettingsList(){
  var today = todayKey();
  $('#st-list').innerHTML = draft.habits.map(function(h){
    var paused = !isActive(h, today) && h.since <= today;
    return '<div class="st-item' + (paused ? ' paused' : '') + '"><i style="background:var(--h-' + h.color + ')"></i>' +
      '<div class="st-fields">' + (paused ? '<span class="paused-tag">Paused</span>' : '') +
      '<input id="st-name-' + esc(h.id) + '" data-f="name" data-h="' + esc(h.id) + '" type="text" maxlength="40" value="' + esc(h.name) + '" aria-label="Habit name">' +
      (h.ladder ? '<p class="ladder-note">Target grows with belt: ' + h.ladder.join(' \u2192 ') + ' ' + esc(h.unit) + '</p>' : '<input id="st-target-' + esc(h.id) + '" data-f="target" data-h="' + esc(h.id) + '" type="text" maxlength="50" value="' + esc(h.target) + '" aria-label="Target">') +
      '<label class="rest-sel" for="st-rest-' + esc(h.id) + '">Rest days a week<select id="st-rest-' + esc(h.id) + '" data-f="restPerWeek" data-h="' + esc(h.id) + '">' +
        [0,1,2,3].map(function(n){ return '<option value="' + n + '"' + ((h.restPerWeek || 0) === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label></div>' +
      '<button class="ghost" type="button" data-act="' + (paused ? 'resume' : 'pause') + '" data-h="' + esc(h.id) + '">' + (paused ? 'Resume' : 'Pause') + '</button></div>';
  }).join('');
}
export function draftHabit(id){ return draft.habits.filter(function(h){ return h.id === id; })[0]; }

