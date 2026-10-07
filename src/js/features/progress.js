// Progress tab: charts, heatmap, badges, trophy room, rewards.
import { BASE_XP, EXTRA_CAP, EXTRA_XP, LIGHT_XP, SWEEP_MAX, SWEEP_STEP, SWEEP_XP } from '../core/config.js';
import { $, addDays, clone, esc, fmt, fmtShort, fmtWd, mondayOf, parseKey, range7, todayKey } from '../core/utils.js';
import { activeHabits, habitById, normalizeSettings, state } from '../core/state.js';
import { HABIT_MS, habitCurve, MILESTONES, rewardSlots, rewardText, ROMAN, tierColor, trophySVG } from '../core/xp.js';
import { saveSettings } from '../core/store.js';
import { burst, toast } from '../core/effects.js';
import { ICON } from '../core/svg.js';
import { habitRankRow, registerTab, render } from '../core/render.js';

/* ---------- progress ---------- */
function niceStep(max){
  var steps = [25,50,75,100,125,150,200,250,300,400,500];
  for(var i=0;i<steps.length;i++) if(steps[i]*4 >= max) return steps[i];
  return Math.ceil(max/400)*100;
}
export function topRound(x, y, w, h, r){
  r = Math.min(r, h, w/2);
  return 'M' + x + ' ' + (y+h) + 'V' + (y+r) + 'Q' + x + ' ' + y + ' ' + (x+r) + ' ' + y + 'H' + (x+w-r) + 'Q' + (x+w) + ' ' + y + ' ' + (x+w) + ' ' + (y+r) + 'V' + (y+h) + 'Z';
}
function barChart(days){
  var st = state.stats, today = todayKey();
  var W = 340, H = 196, pl = 34, pr = 4, pt = 12, pb = 30;
  var vals = days.map(function(d){ return st.byDate[d] || {base:0, bonus:0, xp:0, done:0, total:0}; });
  var max = Math.max(100, Math.max.apply(null, vals.map(function(v){ return v.xp; })));
  var step = niceStep(max), yMax = step*4;
  var pw = W - pl - pr, ph = H - pt - pb, bw = pw/days.length, barW = Math.min(15, bw*0.6);
  function y(v){ return pt + ph - v/yMax*ph; }
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Daily XP for the last 14 days, split into base and bonus">';
  for(var t=0;t<=4;t++){
    var yy = y(t*step).toFixed(1);
    s += '<line x1="' + pl + '" x2="' + (W-pr) + '" y1="' + yy + '" y2="' + yy + '" stroke="var(--line)" stroke-width="1"' + (t === 0 ? '' : ' stroke-dasharray="2 3"') + '/>';
    s += '<text x="' + (pl-6) + '" y="' + (+yy + 3.5) + '" text-anchor="end" font-size="10" fill="var(--muted)" font-family="var(--font-body)">' + (t*step) + '</text>';
  }
  days.forEach(function(d, i){
    var v = vals[i], cx = pl + i*bw + bw/2, x = +(cx - barW/2).toFixed(2);
    var baseTop = y(v.base), baseH = ph + pt - baseTop;
    if(v.bonus > 0){
      if(v.base > 0) s += '<rect x="' + x + '" y="' + baseTop.toFixed(2) + '" width="' + barW + '" height="' + baseH.toFixed(2) + '" fill="var(--accent)"/>';
      var bTop = y(v.base + v.bonus), bH = baseTop - bTop - (v.base > 0 ? 2 : 0);
      if(bH > 0) s += '<path d="' + topRound(x, +bTop.toFixed(2), barW, +bH.toFixed(2), 4) + '" fill="var(--gold)"/>';
    } else if(v.base > 0){
      s += '<path d="' + topRound(x, +baseTop.toFixed(2), barW, +baseH.toFixed(2), 4) + '" fill="var(--accent)"/>';
    }
    var dd = parseKey(d);
    s += '<text x="' + cx.toFixed(1) + '" y="' + (H - 16) + '" text-anchor="middle" font-size="10" font-family="var(--font-body)" font-weight="' + (d === today ? 800 : 500) + '" fill="' + (d === today ? 'var(--ink)' : 'var(--muted)') + '">' + dd.getDate() + '</text>';
    s += '<text x="' + cx.toFixed(1) + '" y="' + (H - 4) + '" text-anchor="middle" font-size="8.5" font-family="var(--font-body)" fill="var(--muted)">' + 'SMTWTFS'.charAt(dd.getDay()) + '</text>';
    s += '<rect data-i="' + i + '" data-d="' + d + '" x="' + (pl + i*bw).toFixed(2) + '" y="' + pt + '" width="' + bw.toFixed(2) + '" height="' + ph + '" fill="transparent" style="cursor:pointer"/>';
  });
  return s + '</svg>';
}
function heatmap(){
  var st = state.stats, today = todayKey(), weeks = 12;
  var start = addDays(mondayOf(today), -7*(weeks-1));
  var cell = 18, gap = 3, pl = 20, pt = 16;
  var W = pl + weeks*(cell+gap) - gap, H = pt + 7*(cell+gap) - gap;
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Consistency over the last 12 weeks">';
  ['M','','W','','F','',''].forEach(function(l, r){ if(l) s += '<text x="0" y="' + (pt + r*(cell+gap) + 13) + '" font-size="10" font-family="var(--font-body)" fill="var(--muted)">' + l + '</text>'; });
  var lastMonth = -1;
  for(var w=0; w<weeks; w++){
    var mon = addDays(start, w*7), m = parseKey(mon).getMonth();
    if(m !== lastMonth){ s += '<text x="' + (pl + w*(cell+gap)) + '" y="10" font-size="10" font-family="var(--font-body)" fill="var(--muted)">' + parseKey(mon).toLocaleDateString('en-US',{month:'short'}) + '</text>'; lastMonth = m; }
    for(var r=0; r<7; r++){
      var d = addDays(start, w*7 + r);
      if(d > today) continue;
      var b = st.byDate[d], lvl = 0;
      if(b && b.total){ lvl = b.sweep ? 5 : (b.done ? Math.max(1, Math.min(4, Math.ceil(b.done/b.total*4))) : 0); }
      var x = pl + w*(cell+gap), y = pt + r*(cell+gap);
      s += '<rect data-d="' + d + '" x="' + x + '" y="' + y + '" width="' + cell + '" height="' + cell + '" rx="4" fill="var(--heat-' + lvl + ')"' + (d === today ? ' stroke="var(--ink)" stroke-width="1.5"' : '') + ' style="cursor:pointer"><title>' + esc(fmtWd(d) + (b ? ' · ' + b.done + '/' + b.total + ' · ' + b.xp + ' XP' : '')) + '</title></rect>';
    }
  }
  return s + '</svg>';
}
export function badgeSVG(earned, color, glyph){
  var fill = earned ? color : 'var(--track)', stroke = earned ? 'var(--on-hc)' : 'var(--muted)';
  return '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 2l16 9v18l-16 9-16-9V11z" fill="' + fill + '"/>' +
    '<g transform="translate(8 8)" fill="none" stroke="' + stroke + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + glyph + '</g></svg>';
}
function badgeText(earned, t){ return earned ? t : t; }
function trophyRoomHTML(){
  var st = state.stats, n = 0, tot = 0;
  var fam = MILESTONES.map(function(f){
    var cur = st.msNow[f.id] || 0, next = null;
    var cups = f.tiers.map(function(t, i){
      var k = f.id + '-' + (i+1), e = st.earned[k]; tot++; if(e) n++; else if(!next) next = {t:t, i:i};
      return '<span class="cup' + (e ? ' on' : '') + (t.reward ? ' gift' : '') + '" style="--tc:' + tierColor(i) + '" title="' + esc(f.name + ' ' + ROMAN[i] + ': ' + f.desc(t.v) + ' · +' + t.xp + ' XP' + (e ? ' · earned ' + fmtShort(e.d) : '')) + '">' + trophySVG(i, !!e) + '<small>' + ROMAN[i] + '</small></span>';
    }).join('');
    var pct = next ? Math.min(100, cur/next.t.v*100) : 100;
    return '<div class="tro"><div class="tro-head"><b>' + esc(f.name) + '</b>' + (next ? '<em>+' + next.t.xp + ' XP</em>' : '<em>Complete</em>') + '</div>' +
      '<p class="tro-sub">' + (next ? 'Next: ' + esc(f.desc(next.t.v)) + ' · now ' + cur : 'Every tier earned.') + '</p>' +
      (next ? '<div class="bar gold thin"><span style="width:' + pct.toFixed(1) + '%"></span></div>' : '') +
      '<div class="tro-cups">' + cups + '</div></div>';
  }).join('');
  var hab = activeHabits(todayKey()).map(function(h){
    var held = st.habits[h.id] ? st.habits[h.id].held : 0;
    var cups = HABIT_MS.map(function(t, i){ var k = 'h:' + h.id + '-' + (i+1), e = st.earned[k]; tot++; if(e) n++;
      return '<span class="cup' + (e ? ' on' : '') + '" style="--tc:' + tierColor(i) + '" title="' + esc(h.name + ' ' + ROMAN[i] + ': ' + t.v + ' days in a row · +' + t.xp + ' XP') + '">' + trophySVG(i, !!e) + '<small>' + t.v + '</small></span>'; }).join('');
    return '<div class="tro-hab"><span class="hn"><i style="background:var(--h-' + h.color + ')"></i><span>' + esc(h.name) + '</span><em>' + held + 'd</em></span><span class="tro-cups">' + cups + '</span></div>';
  }).join('');
  return '<section class="card panel"><div class="panel-head"><h3>Trophy Room</h3><span class="muted" style="font-size:12px">' + n + ' of ' + tot + ' · +' + fmt(st.msTotal) + ' XP</span></div>' + fam +
    '<p class="muted small"><i class="dot" style="background:var(--accent-2,var(--gold))"></i> Dot = unlocks a real reward you name below.</p>' +
    '<div class="tro"><div class="tro-head"><b>Habit streaks</b><em>30 · 75 · 250 days</em></div><p class="tro-sub">Days held in a row. Planned rest days count, a miss resets it.</p>' + hab + '</div></section>';
}
function rewardsHTML(){
  var claimed = state.settings.rewardsClaimed || {};
  var rows = rewardSlots().map(function(r){
    var txt = rewardText(r.k), cl = claimed[r.k];
    var status = cl ? 'Claimed ' + fmtShort(cl) : r.got ? 'Unlocked' : 'Locked';
    var body;
    if(cl) body = '<p class="rw-got">' + esc(txt || 'Reward') + '</p>';
    else if(r.got) body = (txt ? '<p class="rw-got">' + esc(txt) + '</p>' : '<input data-reward="' + esc(r.k) + '" maxlength="80" placeholder="Name your reward" aria-label="Reward for ' + esc(r.name) + '">') +
      '<button class="primary" type="button" data-act="claim-reward" data-k="' + esc(r.k) + '"' + (txt ? '' : ' disabled') + '>Claim it</button>';
    else body = '<input data-reward="' + esc(r.k) + '" maxlength="80" value="' + esc(txt) + '" placeholder="Pick it now, e.g. new gym shoes" aria-label="Reward for ' + esc(r.name) + '">';
    return '<div class="rw-row' + (r.got && !cl ? ' open' : '') + (cl ? ' done' : '') + '"><div class="rw-top"><b>' + esc(r.name) + '</b><span>' + status + '</span></div><p class="rw-req">' + esc(r.req) + '</p>' + body + '</div>';
  }).join('');
  return '<section class="card panel"><div class="panel-head"><h3>Rewards</h3><span class="muted" style="font-size:12px">Pick them before you earn them</span></div><div class="rw">' + rows + '</div>' +
    '<p class="muted small">Keep them halal and sized to the win. A belt is worth more than a trophy.</p></section>';
}
export function setReward(k, v){
  var s2 = clone(state.settings); s2.rewards = s2.rewards || {};
  v = String(v || '').trim(); if(v) s2.rewards[k] = v; else delete s2.rewards[k];
  state.settings = normalizeSettings(s2);
  saveSettings().then(function(ok){ if(ok) toast(v ? 'Reward set: ' + v : 'Reward cleared'); });
}
export function claimReward(k){
  var s2 = clone(state.settings); s2.rewardsClaimed = s2.rewardsClaimed || {}; s2.rewardsClaimed[k] = todayKey();
  state.settings = normalizeSettings(s2); render(); burst();
  saveSettings().then(function(ok){ if(ok) toast('Claimed. Enjoy it, you earned it.'); });
}
function renderProgress(){
  var st = state.stats, today = todayKey();
  var wkH = habitById('workout'), trainC = habitCurve(wkH), trainCap = (wkH && wkH.maxPerWeek) || 5;
  var mon = mondayOf(today), week = range7(mon).filter(function(d){ return d <= today; });
  var weekXP = week.reduce(function(a, d){ return a + ((st.byDate[d] && st.byDate[d].xp) || 0); }, 0);
  var lastXP = range7(addDays(mon, -7)).reduce(function(a, d){ return a + ((st.byDate[d] && st.byDate[d].xp) || 0); }, 0);
  var sweeps = week.filter(function(d){ return st.byDate[d] && st.byDate[d].sweep; }).length;
  var last14 = []; for(var i=13;i>=0;i--) last14.push(addDays(today, -i));

  var h = '<div class="stats">' +
    '<div class="card stat"><span class="k">This week</span><span class="v">' + fmt(weekXP) + '</span><span class="s">Last week ' + fmt(lastXP) + '</span></div>' +
    '<div class="card stat"><span class="k">Sweeps</span><span class="v">' + sweeps + '<small>/' + week.length + '</small></span><span class="s">Days this week</span></div>' +
    '<div class="card stat"><span class="k">Streak</span><span class="v">' + st.sweepRun + '<small>d</small></span><span class="s">Best ' + st.bestRun + 'd</span></div></div>';

  h += '<section class="card panel"><div class="panel-head"><h3>Daily XP</h3><div class="legend"><span><i style="background:var(--accent)"></i>Base</span><span><i style="background:var(--gold)"></i>Bonus</span></div></div>' +
    '<div class="chart-wrap" id="chart">' + barChart(last14) + '<div class="tip" id="tip" hidden></div></div></section>';

  h += '<section class="card panel"><div class="panel-head"><h3>Consistency</h3><span class="muted" style="font-size:12px">Last 12 weeks</span></div>' +
    '<div class="heat-wrap" id="heat">' + heatmap() + '</div>' +
    '<div class="heat-legend">Nothing<i style="background:var(--heat-0)"></i><i style="background:var(--heat-1)"></i><i style="background:var(--heat-2)"></i><i style="background:var(--heat-3)"></i><i style="background:var(--heat-4)"></i><i style="background:var(--heat-5)"></i>Clean sweep</div>' +
    '<p class="heat-cap" id="heat-cap">Tap a day to see it.</p></section>';

  h += trophyRoomHTML() + rewardsHTML();
  h += '<section class="card panel"><div class="panel-head"><h3>Habit ranks</h3><span class="muted" style="font-size:12px">Tap one for its belt tests</span></div><div class="hb">';
  state.settings.habits.forEach(function(hb){ h += habitRankRow(hb); });
  h += '</div></section>';

  var hsx = st.habits;
  function hv(id, k){ return (hsx[id] && hsx[id][k]) || 0; }
  var badges = [
    {n:'First Rep', d:'Complete any habit', goal:1, v:st.baseChecks, c:'var(--accent)', g:ICON.check},
    {n:'Clean Sweep', d:'Every habit in one day', goal:1, v:st.sweepDays, c:'var(--gold)', g:'<circle cx="12" cy="12" r="6"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>'},
    {n:'Double Up', d:'Extras in 3 habits in one day', goal:3, v:st.maxExtraHabits, c:'var(--gold)', g:'<path d="M6 13l6-5 6 5M6 18l6-5 6 5"/>'},
    {n:'Lights Out', d:'14 nights on time in a row', goal:14, v:hv('sleep','best'), c:'var(--h-sleep)', g:'<path d="M15 5.5a6.5 6.5 0 1 0 3.5 11 5.2 5.2 0 0 1-3.5-11z"/>'},
    {n:'Deep Reader', d:'30 reading days', goal:30, v:hv('read','days'), c:'var(--h-read)', g:'<path d="M4 6.5c3-1 5.5-.5 8 1.5v11c-2.5-2-5-2.5-8-1.5zM20 6.5c-3-1-5.5-.5-8 1.5v11c2.5-2 5-2.5 8-1.5z"/>'},
    {n:'Rainmaker', d:'25 extra money blocks', goal:25, v:hv('money','extras'), c:'var(--h-money)', g:'<path d="M12 19V6M7.5 10.5L12 6l4.5 4.5M6 20h12"/>'},
    {n:'Year One', d:'365 days in the game', goal:365, v:st.age || 0, c:'var(--accent)', g:'<rect x="5" y="6" width="14" height="13" rx="2"/><path d="M5 10.5h14M9 4v4M15 4v4"/>'}
  ];
  var earnedN = badges.filter(function(b){ return b.v >= b.goal; }).length;
  h += '<section class="card panel"><div class="panel-head"><h3>Badges</h3><span class="muted" style="font-size:12px">' + earnedN + ' of ' + badges.length + ' earned</span></div><div class="badges">';
  badges.forEach(function(b){
    var e = b.v >= b.goal;
    h += '<div class="badge' + (e ? ' earned' : '') + '">' + badgeSVG(e, b.c, b.g) + '<div><p class="bt">' + esc(b.n) + '</p><p class="bd">' + esc(b.d) + '</p><p class="bp">' + (e ? 'Earned' : Math.min(b.v, b.goal) + ' / ' + b.goal) + '</p></div></div>';
  });
  h += '</div></section>';

  h += '<section class="card panel"><div class="panel-head"><h3>How scoring works</h3></div><ul class="rules">' +
    '<li><b>+' + BASE_XP + '</b><span>Base habit done. The commitment itself.</span></li>' +
    '<li><b class="g">+' + EXTRA_XP + '</b><span>Each extra session, up to ' + EXTRA_CAP + ' per habit a day (Train: 1, recovery work only). Unlocks after the base is done.</span></li>' +
    '<li><b>' + trainCap + '/wk</b><span>Train earns XP on up to ' + trainCap + ' strength days a week. One more logs but earns nothing, so missed days can\u2019t be made up by stacking.</span></li>' +
    '<li><b class="g">+' + LIGHT_XP + '</b><span>Light day on Train (walk, RipRight, mobility, easy pads): 1 a week. It uses a rest slot, doesn\u2019t count toward the 5 sessions, and a 2nd light day that week earns 0. Full rest stays at 0 on purpose.</span></li>' +
    '<li><b class="g">+' + SWEEP_XP + '</b><span>Clean sweep: every habit done. Adds ' + SWEEP_STEP + ' more for each sweep day in a row, up to +' + SWEEP_MAX + '.</span></li>' +
    '<li><b>Rest</b><span>Habits like training can have up to 3 rest days a week (set in the habit editor). Log it and it counts as done for the day (ring and clean sweep). Full rest earns 0 XP but doesn’t break the streak. Unlogged misses use up rest days first, and those don’t count as done.</span></li>' +
    '<li><b>4</b><span>Stripes per belt, then the next one: White, Blue, Purple, Brown, then Black with degrees. Each degree costs three times a normal stripe.</span></li>' +
    '<li><b>Habit</b><span>Every habit has its own belt, fed by its own base and extra XP. First stripe at 80 XP, each one after costs 45 more. Train scales to ' + (7 - (wkH ? wkH.restPerWeek : 0)) + ' days a week (' + trainC.base + ', then +' + trainC.step + ') so its Black takes the same calendar time.</span></li>' +
    '<li><b>Overall</b><span>Fed by everything, including sweep bonuses and trophies. First stripe at 500 XP, each one after costs 300 more.</span></li>' +
    '<li><b>Test</b><span>XP earns stripes. A new belt also needs a streak and time in. Habit belts: 14, 30, 90, 180 days in a row (Train: ' + trainC.tests.join(', ') + ' sessions). Overall belts: hold habits on a streak at the same time, 5 for 14 days, 7 for 30, 9 for 90, 12 for 180. Rest days count as held, a miss resets that habit. Time in: Blue 1 month, Purple 3, Brown 6, Black 1 year. XP past the 4th stripe is banked until you pass.</span></li>' +
    '<li><b class="g">Cups</b><span>Trophies pay bonus XP to your overall belt: Pillars (5 habits held together), Full House (habits held 7+ days), Clean Streak, Sweep Count, and a streak trophy for every habit at 30, 75 and 250 days. Big ones unlock a real reward you name in advance.</span></li>' +
    '<li><b>1 yr</b><span>Black is never less than a year, for any habit or overall. At a solid pace it lands around 12\u201315 months. It should feel like it was earned.</span></li></ul>' +
    '<p class="principle">Extras are worth half a base on purpose. You can’t skip a habit and buy the points back with extra reps somewhere else.</p></section>';

  $('#view-progress').innerHTML = h;
  $('#view-progress').style.display = 'flex';
  $('#view-progress').style.flexDirection = 'column';
  $('#view-progress').style.gap = '14px';
}
export function showTip(i){
  var chart = $('#chart'), tip = $('#tip'); if(!chart || !tip) return;
  var rect = chart.querySelector('rect[data-i="' + i + '"]'); if(!rect) return;
  var d = rect.getAttribute('data-d'), v = state.stats.byDate[d] || {xp:0, base:0, bonus:0, done:0, total:activeHabits(d).length};
  tip.innerHTML = '<b>' + esc(fmtWd(d)) + '</b> · ' + fmt(v.xp) + ' XP<br>' + v.done + '/' + v.total + ' habits' + (v.light && v.light.length ? ' + light day' : '') + ' · base ' + fmt(v.base) + ' · bonus ' + fmt(v.bonus) + (v.ms ? ' (trophies ' + v.ms + ')' : '');
  tip.hidden = false;
  var cr = chart.getBoundingClientRect(), rr = rect.getBoundingClientRect();
  var x = rr.left - cr.left + rr.width/2, tw = tip.offsetWidth;
  x = Math.max(tw/2, Math.min(cr.width - tw/2, x));
  tip.style.left = x + 'px'; tip.style.top = '6px';
}


registerTab('progress', renderProgress);
