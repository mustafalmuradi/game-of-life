// The one state object, the normalizers that keep stored data well-formed, and the habit activity rules.
import { COLOR_SLOTS, DEFAULT_SETTINGS, DEFAULT_TARGETS, EXTRA_CAP } from './config.js';
import { clone, fmt, mondayOf, todayKey, uid } from './utils.js';
import { beltOf } from './xp.js';

/* ---------- state ---------- */
export var state = {
  settings: null,
  days: {},
  lifts: [],
  build: {bnodes:[], bships:[], bskills:[]},
  notes: [],
  liftStats: null,
  tab: 'today',
  selected: todayKey(),
  weekOf: mondayOf(todayKey()),
  mode: 'memory',
  stats: null,
  lastToday: todayKey()
};
export var ui = {popSeg:null}; // set by the Today tab, cleared by render()

export function normalizeSettings(s){
  var out = {version:1, habits:[], targets:Object.assign({}, DEFAULT_TARGETS, (s && s.targets) || {})};
  var list = (s && Array.isArray(s.habits)) ? s.habits : [];
  list.forEach(function(h, i){
    if(!h || !h.id || !h.name) return;
    out.habits.push({
      id: String(h.id), name: String(h.name), target: String(h.target || ''),
      color: COLOR_SLOTS.indexOf(h.color) >= 0 ? h.color : COLOR_SLOTS[i % COLOR_SLOTS.length],
      since: h.since || '2000-01-01',
      pauses: Array.isArray(h.pauses) ? h.pauses.filter(function(p){ return p && p.from; }).map(function(p){ return {from:p.from, to:p.to || null}; }) : [],
      restPerWeek: Math.max(0, Math.min(3, parseInt(h.restPerWeek, 10) || 0)),
      maxPerWeek: Math.max(0, Math.min(7, parseInt(h.maxPerWeek, 10) || 0)),
      lightPerWeek: h.lightPerWeek === undefined || h.lightPerWeek === null ? (String(h.id) === 'workout' ? 1 : 0) : Math.max(0, Math.min(2, parseInt(h.lightPerWeek, 10) || 0)),
      ladder: Array.isArray(h.ladder) ? h.ladder.map(Number).filter(function(n){ return n > 0; }).slice(0, 5) : null,
      unit: h.unit ? String(h.unit) : 'minutes',
      extraCap: h.extraCap === undefined || h.extraCap === null ? EXTRA_CAP : Math.max(0, Math.min(3, parseInt(h.extraCap, 10) || 0)),
      presets: Array.isArray(h.presets) && h.presets.length ? h.presets.slice(0,4).map(String) : ['Extra session']
    });
  });
  if(!out.habits.length){ var dflt = clone(DEFAULT_SETTINGS); dflt.targets = out.targets; return normalizeSettings(dflt); }
  out.rewards = {}; out.rewardsClaimed = {};
  if(s && s.rewards && typeof s.rewards === 'object') Object.keys(s.rewards).forEach(function(k){ var v = String(s.rewards[k] || '').trim().slice(0, 80); if(v) out.rewards[k] = v; });
  if(s && s.rewardsClaimed && typeof s.rewardsClaimed === 'object') Object.keys(s.rewardsClaimed).forEach(function(k){ if(s.rewardsClaimed[k]) out.rewardsClaimed[k] = String(s.rewardsClaimed[k]); });
  return out;
}
export function normalizeDay(d, k){
  var out = {date:k, done:{}, extras:{}, rest:{}};
  if(d && d.m && typeof d.m === 'object'){ var mm = {}; Object.keys(d.m).forEach(function(f){ var v = d.m[f]; if(v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return; mm[f] = v; }); if(Object.keys(mm).length) out.m = mm; }
  if(d && d.done && typeof d.done === 'object'){ Object.keys(d.done).forEach(function(h){ if(d.done[h]) out.done[h] = d.done[h]; }); }
  if(d && d.rest && typeof d.rest === 'object'){ Object.keys(d.rest).forEach(function(h){ if(d.rest[h] && !out.done[h]) out.rest[h] = d.rest[h]; }); }
  if(d && d.extras && typeof d.extras === 'object'){
    Object.keys(d.extras).forEach(function(h){
      if(Array.isArray(d.extras[h]) && d.extras[h].length) out.extras[h] = d.extras[h].filter(Boolean).map(function(x){ return {id: String(x.id || uid()), note: String(x.note || 'Extra session'), at: x.at || 0}; });
    });
  }
  return out;
}
export function hasHabitData(d){ return !!d && (Object.keys(d.done||{}).length > 0 || Object.keys(d.extras||{}).length > 0 || Object.keys(d.rest||{}).length > 0); }
export function isEmptyDay(d){ return !d || (!hasHabitData(d) && !Object.keys(d.m||{}).length); }
export function ladderStep(h, level){ if(!h || !h.ladder || !h.ladder.length) return null; var b = beltOf(level || 0).b; return h.ladder[Math.min(b, h.ladder.length - 1)]; }
export function habitTarget(h){
  if(h && h.id === 'eat'){ var tg0 = T(); return fmt(tg0.cal) + '+ calories in Cal AI'; }
  if(!h || !h.ladder || !h.ladder.length) return h ? h.target : '';
  var hs = state.stats && state.stats.habits && state.stats.habits[h.id];
  var lv = hs && hs.rank ? hs.rank.level : 0;
  var st = ladderStep(h, lv), un = h.unit || '';
  if(st === 1 && /s$/.test(un) && !/ss$/.test(un)) un = un.slice(0, -1);
  return st + ' ' + un;
}
export function capOf(h){ return h ? (h.extraCap === undefined ? EXTRA_CAP : h.extraCap) : EXTRA_CAP; }
export function isActive(h, d){
  if(h.since && d < h.since) return false;
  var ps = h.pauses || [];
  for(var i=0;i<ps.length;i++){ if(d >= ps[i].from && (!ps[i].to || d < ps[i].to)) return false; }
  return true;
}
export function activeHabits(d){ return state.settings.habits.filter(function(h){ return isActive(h, d); }); }
export function T(){ return state.settings.targets || DEFAULT_TARGETS; }
export function habitById(id){ return state.settings.habits.filter(function(h){ return h.id === id; })[0]; }

