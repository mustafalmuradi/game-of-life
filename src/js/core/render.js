// render(): the belt, the tab bar, the sync line, the habit rank row, and the registry each tab adds its renderer to.
import { $, esc, fmt, todayKey } from './utils.js';
import { isActive, state, ui } from './state.js';
import { beltOf, habitCurve, nextLabel, rankInfo, rankSub, rankTitle, testState } from './xp.js';
import { habit30 } from './stats.js';
import { beltSVG, miniBelt, rankProgressHTML } from './svg.js';

/* ---------- render ---------- */
var tabs = {};
export function registerTab(name, fn){ tabs[name] = fn; }
export function render(){
  renderBelt();
  ['today','lifts','body','progress','build'].forEach(function(t){ $('#tab-' + t).setAttribute('aria-selected', state.tab === t); $('#view-' + t).hidden = state.tab !== t; });
  $('#view-today').style.display = state.tab === 'today' ? 'flex' : 'none';
  (tabs[state.tab] || tabs.progress)();
  ui.popSeg = null;
}
function renderBelt(){
  var st = state.stats, rk = st.rank;
  $('#belt').innerHTML =
    '<div class="belt-row"><div><p class="eyebrow">Overall rank · Level ' + (rk.level+1) + '</p><h1 class="rank">' + esc(rankTitle(rk.level)) + '</h1><p class="rank-sub">' + esc(rankSub(rk.level)) + '</p></div>' +
    '<div class="total"><span class="n">' + fmt(st.total) + '</span><span class="l">Total XP</span></div></div>' +
    beltSVG(rk.level) + rankProgressHTML(rk) +
    '<button class="link-btn" type="button" data-act="open-rank" data-h="overall">Belt tests and habit ranks</button>';
}
export function renderSync(){
  var el = $('#sync');
  var msg = state.mode === 'cloud' ? 'Synced to your Claude account. Open it on any device.' :
            state.mode === 'local' ? 'Saved in this browser only.' : 'Not saving in this view. Open the published page to keep your log.';
  el.className = 'sync' + (state.mode === 'cloud' ? ' cloud' : '');
  el.innerHTML = '<i></i>' + esc(msg);
}

export function habitRankRow(hb){
  var hs = state.stats.habits[hb.id] || {run:0, best:0, xp:0, days:0};
  var rk = hs.rank || rankInfo(0, 0, 0, habitCurve(hb), 0);
  var m = habit30(hb), paused = !isActive(hb, todayKey());
  var cts = rk.capped ? testState(rk, beltOf(rk.level).b + 1) : null;
  var pct = rk.capped ? (cts.streakOk ? Math.min(100, rk.age/cts.f*100) : Math.min(100, rk.run/cts.t*100)) : Math.min(100, rk.into/rk.need*100);
  var capTxt = rk.capped ? (cts.streakOk ? 'Belt test: day ' + rk.age + ' of ' + cts.f + ' in · ' : 'Belt test: ' + rk.run + ' of ' + cts.t + ' ' + rk.curve.unit + ' · ') : '';
  return '<button class="hb-row" type="button" data-act="open-rank" data-h="' + esc(hb.id) + '">' +
    '<div class="hb-top"><span class="hb-name"><i style="background:var(--h-' + hb.color + ')"></i><span>' + esc(hb.name) + (paused ? ' (paused)' : '') + '</span></span><span class="hb-pct">Lv ' + (rk.level+1) + '</span></div>' +
    '<div class="hb-rank">' + miniBelt(rk.level) + '<span>' + esc(rankTitle(rk.level)) + ' · ' + esc(rankSub(rk.level)) + '</span><em>' + fmt(rk.xp) + ' XP</em></div>' +
    '<div class="bar' + (rk.capped ? ' gold' : '') + '"><span style="width:' + pct.toFixed(1) + '%' + (rk.capped ? '' : ';background:var(--h-' + hb.color + ')') + '"></span></div>' +
    '<p class="hb-sub">' + (rk.capped ? esc(capTxt) : fmt(rk.into) + ' / ' + fmt(rk.need) + ' to ' + esc(nextLabel(rk.level)) + ' · ') +
    '30-day ' + (m.elig ? m.pct + '%' : '–') + ' · streak ' + hs.run + (hb.restPerWeek ? ' sessions' : 'd') + '</p></button>';
}
