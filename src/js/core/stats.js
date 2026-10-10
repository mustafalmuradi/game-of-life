// recompute(): walks every day and rebuilds state.stats and state.liftStats. Call it after any data change. Plus habit30(), the 30-day hit rate.
import { BASE_XP, EXTRA_XP, LIGHT_XP, SWEEP_MAX, SWEEP_STEP, SWEEP_XP } from './config.js';
import { addDays, mondayOf, todayKey } from './utils.js';
import { activeHabits, capOf, hasHabitData, isActive, lateXP, state } from './state.js';
import { checkMilestones, CURVES, habitCurve, rankInfo } from './xp.js';
import { analyzeLifts } from './strength.js';

export function recompute(){
  var today = todayKey();
  var keys = Object.keys(state.days).filter(function(k){ return k <= today && hasHabitData(state.days[k]); }).sort();
  var start = keys.length ? keys[0] : today;
  var byDate = {}, total = 0, run = 0, bestRun = 0, sweepDays = 0, baseChecks = 0, maxExtraHabits = 0;
  var hs = {};
  state.settings.habits.forEach(function(h){ hs[h.id] = {days:0, extras:0, run:0, best:0, xp:0, rest:0, light:0, age:0, held:0, heldBest:0}; });
  var multi = CURVES.overall.multi, multiBest = multi.map(function(){ return 0; }), earned = {}, msTotal = 0;
  var age = 0;
  var restUsed = {}, weekDone = {}, lightUsed = {};
  for(var d = start; d <= today; d = addDays(d, 1)){
    var act = activeHabits(d), doc = state.days[d], wk = mondayOf(d);
    var done = 0, required = 0, extraXP = 0, extraHabits = 0, excused = [], overCap = [], baseXP = 0, lightXP = 0, lightDays = [], restDone = [];
    age++;
    act.forEach(function(h){
      var s = hs[h.id];
      s.age++;
      var isDone = !!(doc && doc.done && doc.done[h.id]);
      var rk = h.id + '|' + wk, used = restUsed[rk] || 0, allow = h.restPerWeek || 0;
      var restMarked = !!(doc && doc.rest && doc.rest[h.id]);
      if(isDone){
        done++; required++; s.days++; s.run++; if(s.run > s.best) s.best = s.run;
        s.held++; if(s.held > s.heldBest) s.heldBest = s.held;
        var wc = weekDone[rk] = (weekDone[rk] || 0) + 1;
        if(h.maxPerWeek && wc > h.maxPerWeek){ overCap.push(h.id); return; }
        var n = Math.min(((doc.extras && doc.extras[h.id]) || []).length, capOf(h));
        extraXP += n*EXTRA_XP; s.extras += n; if(n > 0) extraHabits++;
        var bx = h.id === 'sleep' ? lateXP(d) : null; if(bx === null) bx = BASE_XP;
        baseXP += bx;
        s.xp += bx + n*EXTRA_XP;
      } else if(used < allow && (restMarked || d !== today)){
        restUsed[rk] = used + 1; s.rest++; excused.push(h.id);
        s.held++; if(s.held > s.heldBest) s.heldBest = s.held;
        if(restMarked){ done++; required++; restDone.push(h.id); }
        if(doc && doc.rest && doc.rest[h.id] === 'light' && (lightUsed[rk] || 0) < (h.lightPerWeek || 0)){
          lightUsed[rk] = (lightUsed[rk] || 0) + 1; s.light++; s.xp += LIGHT_XP; lightXP += LIGHT_XP; lightDays.push(h.id);
        }
      } else {
        required++;
        if(d !== today){ s.run = 0; s.held = 0; }
      }
    });
    var sweep = required > 0 && done === required;
    if(sweep){ run++; sweepDays++; if(run > bestRun) bestRun = run; }
    else if(d !== today){ run = 0; }
    var sweepBonus = sweep ? Math.min(SWEEP_XP + SWEEP_STEP*(run-1), SWEEP_MAX) : 0;
    var heldVals = act.map(function(h){ return hs[h.id].held; }).sort(function(a, b){ return b - a; });
    multi.forEach(function(m, i){ var c = heldVals.filter(function(v){ return v >= m.d; }).length; if(c > multiBest[i]) multiBest[i] = c; });
    var msXP = checkMilestones(d, {pillars:heldVals[4] || 0, house:heldVals.filter(function(v){ return v >= 7; }).length, sweep:run, sweeps:sweepDays}, act, hs, earned);
    msTotal += msXP;
    var xp = baseXP + lightXP + extraXP + sweepBonus + msXP;
    total += xp; baseChecks += done - restDone.length;
    if(extraHabits > maxExtraHabits) maxExtraHabits = extraHabits;
    byDate[d] = {done:done, total:required, excused:excused, restDone:restDone, overCap:overCap, light:lightDays, base:baseXP + lightXP, extra:extraXP, sweepBonus:sweepBonus, ms:msXP, bonus:extraXP+sweepBonus+msXP, xp:xp, sweep:sweep};
  }
  var todaySweep = byDate[today] && byDate[today].sweep;
  state.settings.habits.forEach(function(h){ var s = hs[h.id]; s.rank = rankInfo(s.xp, s.best, s.run, habitCurve(h), s.age); });
  var heldNow = activeHabits(today).map(function(h){ return hs[h.id].held; }).sort(function(a, b){ return b - a; });
  var multiNow = multi.map(function(m){ return heldNow.filter(function(v){ return v >= m.d; }).length; });
  state.stats = {
    start:start, age:age, byDate:byDate, total:total, restUsed:restUsed, lightUsed:lightUsed, weekDone:weekDone, rank:rankInfo(total, multiBest, multiNow, CURVES.overall, age),
    earned:earned, msTotal:msTotal, msNow:{pillars:heldNow[4] || 0, house:heldNow.filter(function(v){ return v >= 7; }).length, sweep:run, sweeps:sweepDays},
    sweepRun: run, sweepRunBeforeToday: todaySweep ? run-1 : run, bestRun:bestRun, sweepDays:sweepDays,
    baseChecks:baseChecks, maxExtraHabits:maxExtraHabits, habits:hs
  };
  state.liftStats = analyzeLifts(state.lifts);
}
export function habit30(hb){
  var st = state.stats, today = todayKey();
  var winStart = addDays(today, -29); if(st.start > winStart) winStart = st.start;
  var elig = 0, hits = 0, extras = 0;
  for(var d = winStart; d <= today; d = addDays(d, 1)){
    if(!isActive(hb, d)) continue;
    var bdx = st.byDate[d]; if(bdx && bdx.excused && bdx.excused.indexOf(hb.id) >= 0) continue;
    var doc = state.days[d], dn = !!(doc && doc.done[hb.id]);
    if(d === today && !dn) continue;
    elig++; if(dn){ hits++; extras += ((doc.extras[hb.id]) || []).length; }
  }
  return {elig:elig, hits:hits, extras:extras, pct: elig ? Math.round(hits/elig*100) : 0};
}
