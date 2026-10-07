// SVG builders: belt, rings, rank progress.
import { BELTS } from './config.js';
import { esc, fmt } from './utils.js';
import { capOf, ui } from './state.js';
import { beltOf, floorLabel, nextLabel, rankSub, rankTitle, testFor, testState } from './xp.js';

/* ---------- SVG builders ---------- */
export function beltSVG(L){
  var r = beltOf(L), B = BELTS[r.b];
  var W = 320, H = 34, tabX = 228, tabW = 64;
  var s = '<svg class="belt-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(rankTitle(L) + ', ' + rankSub(L)) + '">';
  s += '<rect x="0.5" y="0.5" width="' + (W-1) + '" height="' + (H-1) + '" rx="6" fill="' + B.fill + '" stroke="var(--belt-edge)"/>';
  s += '<path d="M8 9.5H' + (tabX-6) + 'M8 24.5H' + (tabX-6) + '" stroke="' + B.stitch + '" stroke-width="1" stroke-dasharray="3 3"/>';
  s += '<path d="M' + (tabX+tabW+8) + ' 9.5H' + (W-8) + 'M' + (tabX+tabW+8) + ' 24.5H' + (W-8) + '" stroke="' + B.stitch + '" stroke-width="1" stroke-dasharray="3 3"/>';
  s += '<rect x="' + tabX + '" y="0.5" width="' + tabW + '" height="' + (H-1) + '" fill="' + B.tab + '"/>';
  var slots = r.b < 4 ? 4 : 6, filled = r.b < 4 ? r.stripes : Math.min(r.stripes, 6);
  var sw = r.b < 4 ? 7 : 5, gap = r.b < 4 ? 7 : 4;
  var totalW = slots*sw + (slots-1)*gap, x0 = tabX + (tabW - totalW)/2;
  for(var i=0;i<slots;i++){
    s += '<rect x="' + (x0 + i*(sw+gap)).toFixed(1) + '" y="0.5" width="' + sw + '" height="' + (H-1) + '" fill="' + (i < filled ? '#F2F2EC' : 'rgba(255,255,255,.1)') + '"/>';
  }
  return s + '</svg>';
}
export function miniBelt(L){
  var r = beltOf(L), B = BELTS[r.b];
  var s = '<svg class="mini-belt" viewBox="0 0 44 12" aria-hidden="true"><rect x="0.5" y="0.5" width="43" height="11" rx="2.5" fill="' + B.fill + '" stroke="var(--belt-edge)"/>';
  s += '<rect x="29" y="0.5" width="11" height="11" fill="' + B.tab + '"/>';
  var slots = r.b < 4 ? 4 : 6, filled = r.b < 4 ? r.stripes : Math.min(r.stripes, 6);
  for(var i=0;i<slots;i++) if(i < filled) s += '<rect x="' + (30.2 + i*(r.b < 4 ? 2.4 : 1.6)).toFixed(2) + '" y="0.5" width="' + (r.b < 4 ? 1.3 : 0.9) + '" height="11" fill="#F2F2EC"/>';
  return s + '</svg>';
}
export function rankProgressHTML(rk, color){
  var r = beltOf(rk.level), c = rk.curve, h = '';
  if(rk.capped){
    var nb = r.b + 1, ts = testState(rk, nb), t = ts.t, pct = ts.streakOk ? 100 : Math.min(100, ts.ti.now/t*100), tp = Math.min(100, rk.age/ts.f*100);
    var left = !ts.streakOk && !ts.timeOk ? 'The streak and time in are what’s left.' : !ts.streakOk ? 'The streak is what’s left.' : (ts.f - rk.age) + (ts.f - rk.age === 1 ? ' more day' : ' more days') + ' of time in is what’s left.';
    h += '<div class="test-box"><p class="test-t">Belt test for ' + esc(BELTS[nb].name) + '</p>' +
      '<p class="test-d">' + esc(ts.ti.label) + '. ' + (ts.streakOk ? 'Passed · best <b>' + ts.ti.best + '</b>' : 'Now <b>' + ts.ti.now + '</b>' + (c.multi ? ' of ' + t : '') + ' · best <b>' + ts.ti.best + '</b>') + '</p>' +
      '<div class="bar gold"><span style="width:' + pct.toFixed(1) + '%"></span></div>' +
      '<p class="test-d">At least ' + floorLabel(ts.f) + ' in. ' + (ts.timeOk ? 'Passed' : 'Day <b>' + rk.age + '</b> of ' + ts.f) + '</p>' +
      '<div class="bar gold"><span style="width:' + tp.toFixed(1) + '%"></span></div>' +
      (rk.banked > 0 ? '<p class="test-d">XP for the belt is ready, plus ' + rk.banked + (rk.banked === 1 ? ' stripe' : ' stripes') + ' banked. ' + left + '</p>' : '<p class="test-d">Your XP is ready. ' + left + '</p>') + '</div>';
    return h;
  }
  var pct2 = Math.min(100, rk.into/rk.need*100);
  h += '<div class="next"><div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + rk.need + '" aria-valuenow="' + rk.into + '" aria-label="Progress to ' + esc(nextLabel(rk.level)) + '"><span style="width:' + pct2.toFixed(1) + '%' + (color ? ';background:' + color : '') + '"></span></div>' +
    '<p><b>' + fmt(rk.into) + '</b> / ' + fmt(rk.need) + ' XP to ' + esc(nextLabel(rk.level)) + '</p>';
  var nbi = r.b + 1, t2 = testFor(c, nbi);
  if(t2){
    var ts2 = testState(rk, nbi), ok = ts2.streakOk && ts2.timeOk;
    h += '<p class="test-line' + (ok ? ' ok' : '') + '">' + (ok ? '<svg viewBox="0 0 24 24">' + ICON.check + '</svg>' : '') + esc(BELTS[nbi].name) + ' belt test: ' + esc(ts2.ti.short) + ' + ' + floorLabel(ts2.f) + ' in' +
      (ok ? ' · passed' : c.multi ? (ts2.streakOk ? ' · habits passed, day ' + rk.age + ' of ' + ts2.f : ' · now ' + ts2.ti.now + ' of ' + ts2.ti.goal + ', day ' + rk.age) : ' · best ' + rk.best + ', day ' + rk.age) + '</p>';
  }
  return h + '</div>';
}
export function testsListHTML(rk, hb){
  var c = rk.curve, h = '<ul class="tests">';
  c.tests.forEach(function(t, i){
    var ts = testState(rk, i+1), ok = ts.streakOk && ts.timeOk;
    var pct = (Math.min(ts.ti.best/ts.t, 1) + Math.min(rk.age/ts.f, 1))/2*100;
    h += '<li class="' + (ok ? 'ok' : '') + '">' + miniBelt((i+1)*5) +
      '<div><p><b>' + esc(BELTS[i+1].name) + '</b> \u00b7 ' + esc(ts.ti.short) + ' + ' + floorLabel(ts.f) + ' in' + (hb && hb.ladder && hb.ladder[i+1] ? ' \u00b7 target becomes <b>' + hb.ladder[i+1] + ' ' + esc(hb.unit) + '</b>' : '') + '</p>' +
      (ok ? '<p class="tl-s">Passed</p>' : '<div class="bar gold"><span style="width:' + pct.toFixed(1) + '%"></span></div><p class="tl-s">' + (c.multi ? 'Habits ' : 'Streak ') + (ts.streakOk ? 'passed' : 'best ' + ts.ti.best + ' of ' + ts.t) + ' \u00b7 time ' + (ts.timeOk ? 'passed' : 'day ' + rk.age + ' of ' + ts.f) + '</p>') + '</div></li>';
  });
  return h + '</ul>';
}
function arcPath(cx, cy, r, a0, a1){
  function rad(a){ return a*Math.PI/180; }
  var x0 = cx + r*Math.cos(rad(a0)), y0 = cy + r*Math.sin(rad(a0));
  var x1 = cx + r*Math.cos(rad(a1)), y1 = cy + r*Math.sin(rad(a1));
  return 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + 'A' + r + ' ' + r + ' 0 ' + ((a1-a0) > 180 ? 1 : 0) + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2);
}
export function scoreRing(act, doc, stat){
  var n = Math.max(act.length, 1), span = 360/n, gap = n > 1 ? 5 : 0.01;
  var s = '<svg id="score-ring" viewBox="0 0 128 128" role="img" aria-label="' + stat.done + ' of ' + stat.total + ' habits done">';
  act.forEach(function(h, i){
    var a0 = -90 + i*span + gap/2, a1 = a0 + span - gap;
    var done = !!(doc && doc.done[h.id]);
    var logged = !done && stat.restDone && stat.restDone.indexOf(h.id) >= 0;
    if(logged){ s += '<path class="seg' + (ui.popSeg === h.id ? ' pop' : '') + '" d="' + arcPath(64,64,50,a0,a1) + '" fill="none" stroke-width="12" stroke="var(--h-' + h.color + ')"/>'; return; }
    var rest = !done && stat.excused && stat.excused.indexOf(h.id) >= 0;
    if(rest){ s += '<path d="' + arcPath(64,64,50,a0,a1) + '" fill="none" stroke-width="12" stroke="var(--h-' + h.color + ')" stroke-opacity=".3" stroke-dasharray="3 4"/>'; return; }
    s += '<path class="seg' + (ui.popSeg === h.id && done ? ' pop' : '') + '" d="' + arcPath(64,64,50,a0,a1) + '" fill="none" stroke-width="12" stroke="' + (done ? 'var(--h-' + h.color + ')' : 'var(--track)') + '"/>';
    var cap = capOf(h), ex = done && cap ? Math.min(((doc.extras[h.id]) || []).length, cap) : 0;
    if(ex > 0){
      var e1 = a0 + (a1 - a0)*(ex/cap);
      s += '<path d="' + arcPath(64,64,61,a0,e1) + '" fill="none" stroke-width="3.5" stroke-linecap="round" stroke="var(--gold)"/>';
    }
  });
  s += '<text x="64" y="66" text-anchor="middle" font-family="var(--font-display)" font-weight="800" font-size="34" fill="var(--ink)">' + stat.done + '<tspan fill="var(--muted)" font-size="22">/' + stat.total + '</tspan></text>';
  s += '<text x="64" y="84" text-anchor="middle" font-family="var(--font-body)" font-weight="700" font-size="9.5" letter-spacing="1.2" fill="var(--muted)">DONE</text>';
  return s + '</svg>';
}
export function miniRing(stat, dayNum){
  var C = 2*Math.PI*14, frac = stat && stat.total ? stat.done/stat.total : 0;
  var s = '<svg viewBox="0 0 38 38" aria-hidden="true">';
  s += '<circle cx="19" cy="19" r="14" fill="none" stroke="var(--track)" stroke-width="4"/>';
  if(stat && stat.sweep){
    s += '<circle cx="19" cy="19" r="14" fill="none" stroke="var(--accent)" stroke-width="4"/>';
    s += '<circle cx="19" cy="19" r="10" fill="var(--accent)"/>';
    s += '<text x="19" y="23.5" text-anchor="middle" font-family="var(--font-display)" font-weight="800" font-size="13" fill="var(--on-accent)">' + dayNum + '</text>';
  } else {
    if(frac > 0) s += '<circle cx="19" cy="19" r="14" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + (C*frac).toFixed(2) + ' ' + C.toFixed(2) + '" transform="rotate(-90 19 19)"/>';
    s += '<text x="19" y="23.5" text-anchor="middle" font-family="var(--font-display)" font-weight="700" font-size="13" fill="var(--ink)">' + dayNum + '</text>';
  }
  return s + '</svg>';
}
export var ICON = {
  check:'<path d="M5 12.5l4.2 4.2L19 7"/>',
  flame:'<path d="M12 2c1 3.5 5 5.5 5 10.5A5 5 0 0 1 7 12.5c0-2 1-3.5 2-4.5 0 1.8.8 3 2 3.5C11 8.5 10.5 5 12 2z"/>',
  x:'<path d="M6 6l12 12M18 6L6 18"/>',
  left:'<path d="M15 5l-7 7 7 7"/>',
  right:'<path d="M9 5l7 7-7 7"/>',
  sweep:'<path d="M12 2.5l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L3.4 8.8l6-.7z"/>'
};

