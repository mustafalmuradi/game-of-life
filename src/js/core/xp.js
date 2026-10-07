// XP curves, rank titles, belt tests, milestones and trophies.
import { BELTS } from './config.js';
import { ord, todayKey } from './utils.js';
import { activeHabits, habitById, state } from './state.js';

/* ---------- XP + ranks ---------- */
/* Black is built to take a year minimum: XP (~12-15 months at a solid pace) + an unbroken streak + time in. */
export var CURVES = {
  overall: {base:500, step:300, tests:[5,7,9,12], multi:[{n:5,d:14},{n:7,d:30},{n:9,d:90},{n:12,d:180}], floors:[30,90,180,365], unit:'habits held at once'},
  habit:   {base:80,  step:45,  tests:[14,30,90,180], floors:[30,90,180,365], unit:'days in a row'}
};
/* Habits with rest days (Train) scale XP and streak tests to their weekly frequency, so Black takes the same calendar time. */
export function habitCurve(h){
  var rest = Math.min((h && h.restPerWeek) || 0, 6), c = CURVES.habit;
  if(!rest) return c;
  var f = (7 - rest)/7;
  return {base:Math.round(c.base*f), step:Math.round(c.step*f), floors:c.floors, unit:'sessions in a row',
    tests:c.tests.map(function(t){ var v = t*f; return v >= 20 ? Math.round(v/5)*5 : Math.round(v); })};
}
/* Degrees past Black cost 3x, so they come every few months, not every few weeks. */
function levelCost(c, L){ return (c.base + c.step*L) * (L >= 20 ? 3 : 1); }
function levelFromXP(xp, c){ var L=0, cum=0; while(xp >= cum + levelCost(c, L)){ cum += levelCost(c, L); L++; } return {L:L, into:xp-cum, need:levelCost(c, L)}; }
export function rankInfo(xp, best, run, c, age){
  age = age || 0;
  var x = levelFromXP(xp, c);
  var passed = 0;
  while(passed < c.tests.length && testMet(c, best, passed) && age >= c.floors[passed]) passed++;
  var cap = passed >= c.tests.length ? Infinity : passed*5 + 4;
  var level = Math.min(x.L, cap);
  return {xp:xp, xpLevel:x.L, level:level, into:x.into, need:x.need, capped: x.L > cap, banked: Math.max(0, x.L - cap - 1), best:best, run:run, age:age, curve:c};
}
export function testFor(c, beltIdx){ return beltIdx >= 1 && beltIdx <= c.tests.length ? c.tests[beltIdx-1] : null; }
function floorFor(c, beltIdx){ return beltIdx >= 1 && beltIdx <= c.floors.length ? c.floors[beltIdx-1] : 0; }
export function floorLabel(f){ return ({30:'1 month', 90:'3 months', 180:'6 months', 365:'1 year'})[f] || (f + ' days'); }
function testMet(c, best, i){ return c.multi ? ((best && best[i]) || 0) >= c.multi[i].n : best >= c.tests[i]; }
/* overall belts: hold N habits on a D-day streak at the same time. Habit belts: one habit's streak. */
function testInfo(rk, beltIdx){
  var c = rk.curve, i = beltIdx - 1;
  if(c.multi){ var m = c.multi[i]; return {goal:m.n, now:(rk.run && rk.run[i]) || 0, best:(rk.best && rk.best[i]) || 0, d:m.d, label:m.n + ' habits held ' + m.d + ' days at the same time', short:m.n + ' habits \u00d7 ' + m.d + ' days'}; }
  var t = c.tests[i]; return {goal:t, now:rk.run, best:rk.best, label:t + ' ' + c.unit, short:t + ' ' + c.unit};
}
export function testState(rk, beltIdx){
  var ti = testInfo(rk, beltIdx), f = floorFor(rk.curve, beltIdx);
  return {t:ti.goal, f:f, ti:ti, streakOk: ti.best >= ti.goal, timeOk: rk.age >= f};
}
export function beltOf(L){ var b = Math.min(Math.floor(L/5), 4); return {b:b, stripes: b < 4 ? L % 5 : L - 20}; }
export function rankTitle(L){ var r = beltOf(L); return BELTS[r.b].name + ' belt'; }
export function rankSub(L){
  var r = beltOf(L);
  if(r.b < 4) return r.stripes === 0 ? 'No stripes yet' : r.stripes + (r.stripes === 1 ? ' stripe' : ' stripes');
  return r.stripes === 0 ? 'First day on the black belt' : ord(r.stripes) + ' degree';
}
export function nextLabel(L){
  var r = beltOf(L);
  if(r.b < 4) return r.stripes < 4 ? ord(r.stripes+1) + ' stripe' : BELTS[r.b+1].name + ' belt';
  return ord(r.stripes+1) + ' degree';
}

/* ---------- milestones: trophies, XP, real rewards ---------- */
/* "Held" = done or a planned rest day. A miss resets it. Milestone XP feeds the overall belt only. */
export var ROMAN = ['I','II','III','IV','V','VI','VII'];
export var MILESTONES = [
  {id:'pillars', name:'Pillars', unit:'days', desc:function(v){ return '5 habits held ' + v + ' days at the same time'; },
    tiers:[{v:7,xp:40},{v:14,xp:75},{v:30,xp:150,reward:true},{v:60,xp:250},{v:100,xp:400}]},
  {id:'house', name:'Full House', unit:'habits', desc:function(v){ return v + ' habits held 7+ days at the same time'; },
    tiers:[{v:6,xp:60},{v:8,xp:100},{v:10,xp:150},{v:12,xp:250,reward:true},{v:15,xp:400}]},
  {id:'sweep', name:'Clean Streak', unit:'in a row', desc:function(v){ return v + ' clean sweeps in a row'; },
    tiers:[{v:3,xp:25},{v:7,xp:60},{v:14,xp:120},{v:40,xp:300,reward:true},{v:100,xp:600}]},
  {id:'sweeps', name:'Sweep Count', unit:'total', desc:function(v){ return v + ' clean sweeps, all time'; },
    tiers:[{v:10,xp:30},{v:25,xp:60},{v:50,xp:120},{v:100,xp:250},{v:250,xp:500}]}
];
export var HABIT_MS = [{v:30,xp:50},{v:75,xp:120},{v:250,xp:400}];
var BELT_REWARDS = [1,2,3,4].map(function(b){ return {k:'belt-' + b, b:b}; });
export function tierColor(i){ return ['var(--t-bronze)','var(--t-silver)','var(--t-gold)','var(--t-platinum)','var(--t-diamond)','var(--t-diamond)','var(--t-diamond)'][i] || 'var(--t-diamond)'; }
export function trophySVG(i, on, cls){
  var c = on ? tierColor(i) : 'var(--muted)';
  return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="' + c + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M7 4h10v4.5a5 5 0 0 1-10 0z" fill="' + (on ? c : 'none') + '" fill-opacity="' + (on ? '.35' : '0') + '"/><path d="M7 6H4.5a3 3 0 0 0 3 4M17 6h2.5a3 3 0 0 1-3 4M12 13.5V17M8.5 20.5h7M9.5 17h5"/></svg>';
}
export function checkMilestones(d, v, act, hs, earned){
  var xp = 0;
  MILESTONES.forEach(function(f){ f.tiers.forEach(function(t, i){ var k = f.id + '-' + (i+1); if(earned[k] || (v[f.id] || 0) < t.v) return; earned[k] = {d:d, xp:t.xp}; xp += t.xp; }); });
  act.forEach(function(h){ HABIT_MS.forEach(function(t, i){ var k = 'h:' + h.id + '-' + (i+1); if(earned[k] || hs[h.id].held < t.v) return; earned[k] = {d:d, xp:t.xp}; xp += t.xp; }); });
  return xp;
}
export function msMeta(k){
  var m = /^h:(.+)-(\d+)$/.exec(k);
  if(m){ var hb = habitById(m[1]), i = +m[2] - 1, t = HABIT_MS[i]; if(!t) return null; var nm = hb ? hb.name : m[1];
    return {key:k, family:'Habit streak', name:nm + ' ' + ROMAN[i], desc:nm + ' held ' + t.v + ' days in a row', xp:t.xp, i:i, v:t.v, color:hb ? hb.color : null}; }
  var p = /^(\w+)-(\d+)$/.exec(k); if(!p) return null;
  var f = MILESTONES.filter(function(x){ return x.id === p[1]; })[0], j = +p[2] - 1, tt = f && f.tiers[j];
  if(!tt) return null;
  return {key:k, family:f.name, name:f.name + ' ' + ROMAN[j], desc:f.desc(tt.v), xp:tt.xp, i:j, v:tt.v, reward:!!tt.reward};
}
export function rewardText(k){ var r = state.settings.rewards || {}; return r[k] || ''; }
export function rewardSlots(){
  var st = state.stats, out = [];
  BELT_REWARDS.forEach(function(r){ out.push({k:r.k, name:BELTS[r.b].name + ' belt', req:'Earn the overall ' + BELTS[r.b].name + ' belt: ' + testInfo(st.rank, r.b).short + ' + ' + floorLabel(CURVES.overall.floors[r.b-1]) + ' in', got:st.rank.level >= r.b*5}); });
  MILESTONES.forEach(function(f){ f.tiers.forEach(function(t, i){ if(!t.reward) return; var k = f.id + '-' + (i+1); out.push({k:k, name:f.name + ' ' + ROMAN[i], req:f.desc(t.v), got:!!st.earned[k]}); }); });
  return out;
}
export function nextTrophy(){
  var st = state.stats, best = null;
  function consider(c){ if(c.cur >= c.v) return; var fr = c.cur/c.v; if(!best || fr > best.fr) best = Object.assign({fr:fr}, c); }
  MILESTONES.forEach(function(f){
    for(var i=0;i<f.tiers.length;i++){ var k = f.id + '-' + (i+1); if(st.earned[k]) continue; consider({name:f.name + ' ' + ROMAN[i], v:f.tiers[i].v, cur:st.msNow[f.id] || 0, unit:f.unit, xp:f.tiers[i].xp, i:i}); break; }
  });
  activeHabits(todayKey()).forEach(function(h){
    for(var i=0;i<HABIT_MS.length;i++){ var k = 'h:' + h.id + '-' + (i+1); if(st.earned[k]) continue; consider({name:h.name + ' ' + ROMAN[i], v:HABIT_MS[i].v, cur:st.habits[h.id].held, unit:'days', xp:HABIT_MS[i].xp, i:i}); break; }
  });
  return best;
}

