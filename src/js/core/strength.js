// Lift maths: estimated 1RM, lift scoring, Iron ranks, quests, the strength analysis.
import { addDays, mondayOf, todayKey } from './utils.js';

/* ---------- lifts: strength log (ported from Iron Log) ---------- */
var BOWFLEX_MAX = 52.5;
export var LXP = {set:10, base:20, pr:50, up:25, same:5, dip:0, quest:40, day:25};
export var MOOSE_RANKS = [[1,'Saiyan Warrior',[1,2,3]],[4,'Kaioken',[4,5,7]],[9,'Super Saiyan',[9,11,13]],[15,'Super Saiyan 2',[15,17,20]],[22,'Super Saiyan 3',[22,25,28]],[30,'Super Saiyan Blue',[30,33,37]],[40,'Ultra Instinct',[40,45,50]]];
export var TIERS = [['bronze','Weighted Gi',0],['silver','Gravity Room',5],['gold','Time Chamber',10],['platinum','King Kai’s Planet',20],['diamond','Over 9,000',35]];
export var LSTATUS = {pr:['pr','PR'], up:['up','Up'], same:['same','Matched'], dip:['dip','Dip'], base:['base','New lift']};
export function norm(s){ return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
export function fmtW(w){ return (Math.round(w*10)/10).toString(); }
function e1rm(w, r){ return w <= 0 ? 0 : r <= 1 ? w : w*(1 + r/30); }
/* Resistance bands (RipRight etc.): a set can be a band instead of pounds, stored as {w:0, r, b:'thick'}.
   BANDS runs lightest to heaviest. A heavier band outranks any reps on a lighter one; within a band, more reps is progress.
   Scores multiply reps by the band's place on the ladder (light 1x, thick 2x), so moving up a band reads as a jump. */
export var BANDS = [['light','Light band'],['thick','Thick band']];
export function bandIx(b){ for(var i=0;i<BANDS.length;i++) if(BANDS[i][0] === b) return i; return -1; }
export function bandName(b){ var i = bandIx(b); return i >= 0 ? BANDS[i][1] : 'Band'; }
export function cleanBand(b){ var k = String(b || '').toLowerCase().replace(/\bband\b/, '').trim(); return bandIx(k) >= 0 ? k : null; }
export function isBandEntry(e){ var s = e.sets || []; return s.length > 0 && s.some(function(x){ return x.b; }) && s.every(function(x){ return !(x.w > 0); }); }
function bandMult(s){ return s.b ? bandIx(s.b) + 1 : 1; }
/* the comparable "load" of a set: pounds, or a tiny ordinal for a band so a heavier band sorts above a lighter one */
function wv(s){ return s.w > 0 ? s.w : s.b ? (bandIx(s.b) + 1)/1000 : 0; }
export function setText(s, sep){ return (s.b ? bandName(s.b) : s.w > 0 ? fmtW(s.w) : 'BW') + (sep === undefined ? ' \u00d7 ' : sep) + s.r; }
export function isBW(e){ return (e.sets || []).every(function(s){ return !(s.w > 0); }); }
export function liftScore(e){ var s = e.sets || []; return isBW(e) ? Math.max.apply(null, [0].concat(s.map(function(x){ return (x.r || 0)*bandMult(x); }))) : Math.max.apply(null, [0].concat(s.map(function(x){ return e1rm(x.w || 0, x.r || 0); }))); }
export function liftVolume(e){ return (e.sets || []).reduce(function(t, s){ return t + (s.w || 0)*(s.r || 0); }, 0); }
export function topSet(e){ var b = null; (e.sets || []).forEach(function(s){ var v = isBW(e) ? s.r*bandMult(s) : e1rm(s.w, s.r); if(!b || v > b.v) b = {w:s.w, r:s.r, b:s.b || null, v:v}; }); return b; }
/* a target the quest card can read as "load × reps" (pounds, BW or a band name) */
export function isLoadTarget(t){ return new RegExp('^\\s*([\\d.]+|BW|' + BANDS.map(function(x){ return x[0]; }).join('|') + ')(\\s+band)?\\s*[\u00d7xX*]', 'i').test(String(t || '')); }
export function liftKey(e){ return (e.date || '') + '|' + String(e.createdAt || 0).padStart(15, '0'); }
export function ironXPFor(L){ return 50*L*(L-1); }
export function ironLevel(xp){ var L = 1; while(ironXPFor(L+1) <= xp) L++; return L; }
export function mooseRank(L){ var r = MOOSE_RANKS[0][1]; MOOSE_RANKS.forEach(function(x){ if(L >= x[0]) r = x[1]; }); return r; }
/* each form has 3 stages; mooseStage gives {form, stage (1-3), next: {level, label} or null at the very top} */
export function mooseStage(L){
  var i = 0; MOOSE_RANKS.forEach(function(x, k){ if(L >= x[0]) i = k; });
  var r = MOOSE_RANKS[i], st = 1; r[2].forEach(function(m, k){ if(L >= m) st = k + 1; });
  var next = st < 3 ? {level:r[2][st], label:'Stage ' + (st + 1)} : MOOSE_RANKS[i+1] ? {level:MOOSE_RANKS[i+1][0], label:MOOSE_RANKS[i+1][1]} : null;
  return {form:r[1], stage:st, next:next};
}
function tierFor(gain){ var t = TIERS[0]; TIERS.forEach(function(x){ if(gain >= x[2] - 1e-9) t = x; }); return t; }
export function autoTarget(e, location){
  var sets = e.sets || []; if(!sets.length) return '';
  var W = Math.max.apply(null, sets.map(wv)), top = sets.filter(function(s){ return wv(s) === W; })[0];
  var atW = sets.filter(function(s){ return wv(s) === W; }).map(function(s){ return s.r; });
  /* high-rep band work moves in steps of about 5% (220 -> 230), not one rep at a time */
  function bump(){ var a = atW.slice(), i = a.indexOf(Math.min.apply(null, a)); a[i] += top.b && a[i] >= 40 ? 5*Math.max(1, Math.round(a[i]*0.05/5)) : 1; return a; }
  if(top.b) return bandName(top.b) + ' × ' + bump().join(', ');
  if(W <= 0) return 'BW × ' + bump().join(', ');
  if(norm(location) === 'home' && W >= BOWFLEX_MAX) return fmtW(W) + ' × ' + bump().join(', ');
  if(atW.length >= 2 && atW.every(function(r){ return r >= 12; })) return 'Add weight × 8+';
  return fmtW(W) + ' × ' + bump().join(', ');
}
function meetsTarget(target, prev, e){
  var bm = new RegExp('^\\s*(' + BANDS.map(function(x){ return x[0]; }).join('|') + ')(?:\\s+band)?\\s*[\u00d7xX*]\\s*([\\d,\\s]+)', 'i').exec(String(target || ''));
  if(bm){
    var bi = bandIx(bm[1].toLowerCase()), want = bm[2].split(',').map(function(x){ return parseInt(x, 10); }).filter(Number.isFinite);
    var ok = (e.sets || []).filter(function(s){ return s.b && bandIx(s.b) >= bi; });
    return want.length > 0 && ok.length >= want.length && want.every(function(r, i){ return (ok[i].r || 0) >= r; });
  }
  var bwm = /^\s*BW\s*[×xX*]\s*([\d,\s]+)/i.exec(String(target || ''));
  if(bwm){
    var need = bwm[1].split(',').map(function(x){ return parseInt(x, 10); }).filter(Number.isFinite), got = e.sets || [];
    return need.length > 0 && got.length >= need.length && need.every(function(r, i){ return (got[i].r || 0) >= r; });
  }
  var m = /^\s*([\d.]+)\s*(?:lb)?\s*[×xX*]\s*([\d+,\s]+)/.exec(String(target || ''));
  if(!m) return liftScore(e) > liftScore(prev) + 1e-9;
  var W = parseFloat(m[1]);
  var reps = m[2].split(',').map(function(x){ return parseInt(x, 10); }).filter(Number.isFinite);
  var heavy = (e.sets || []).filter(function(s){ return (s.w || 0) >= W - 1e-9; });
  if(!reps.length || heavy.length < reps.length) return false;
  return reps.every(function(r, i){ return heavy[i].r >= r; });
}
/* double progression: the working weight is the one with the most sets (ties go to the heavier one) */
export var REP_TOP = 12, STALL_N = 3;
function workingSet(e){
  var by = {}, best = null;
  var band = {};
  (e.sets || []).forEach(function(s){ var w = wv(s); (by[w] = by[w] || []).push(s.r || 0); if(s.b) band[w] = s.b; });
  Object.keys(by).forEach(function(k){ var w = parseFloat(k), n = by[k].length; if(!best || n > best.n || (n === best.n && w > best.W)) best = {W:w, b:band[k] || null, n:n, reps:by[k].slice().sort(function(a, b){ return b - a; })}; });
  return best;
}
function beats(p, rec){
  if(!rec) return true;
  if(p.W > rec.W + 1e-9) return true;
  if(p.W < rec.W - 1e-9) return false;
  var k = Math.min(p.reps.length, rec.reps.length), ge = true, gt = false;
  for(var i=0;i<k;i++){ if(p.reps[i] < rec.reps[i]) ge = false; else if(p.reps[i] > rec.reps[i]) gt = true; }
  if(p.reps.length > rec.reps.length) gt = true;
  return ge && gt;
}
function liftProgress(g){
  var rec = null, since = 0, lastUp = false;
  g.entries.forEach(function(e, i){ var p = workingSet(e); if(!p) return; if(beats(p, rec)){ rec = p; since = 0; lastUp = i > 0; } else { since++; lastUp = false; } });
  var w = workingSet(g.last);
  return {working:w, addWeight:!!(w && !w.b && w.reps.length && w.reps.every(function(r){ return r >= REP_TOP; })), stall:g.entries.length > STALL_N && since >= STALL_N, since:since, up:lastUp};
}
export function workingText(w){ return w ? (w.b ? bandName(w.b) : w.W > 0 ? fmtW(w.W) : 'BW') + ' \u00d7 ' + w.reps.join(', ') : ''; }
export function analyzeLifts(entries){
  var sorted = entries.slice().sort(function(a, b){ return liftKey(a) < liftKey(b) ? -1 : 1; });
  var groups = new Map();
  sorted.forEach(function(e){
    var key = norm(e.exercise) + '|' + norm(e.location || 'Home');
    if(!groups.has(key)) groups.set(key, {key:key, name:e.exercise, location:e.location || 'Home', entries:[]});
    var g = groups.get(key); g.name = e.exercise; g.location = e.location || 'Home'; g.entries.push(e);
  });
  var prs = 0, quests = 0, sets = 0, vol = 0, maxGain = 0, homeMax = 0, days = new Map();
  groups.forEach(function(g){
    var best = -Infinity;
    g.entries.forEach(function(e, i){
      var s = liftScore(e); e._cleared = false;
      if(i === 0) e._status = 'base';
      else {
        var prev = g.entries[i-1], ps = liftScore(prev);
        if(s > best + 1e-9){ e._status = 'pr'; prs++; }
        else if(s > ps + 1e-9) e._status = 'up';
        else if(Math.abs(s - ps) < 1e-9) e._status = 'same';
        else e._status = 'dip';
        if(meetsTarget(prev.target || autoTarget(prev, g.location), prev, e)){ e._cleared = true; quests++; }
      }
      e._xp = (e.sets || []).length*LXP.set + LXP[e._status] + (e._cleared ? LXP.quest : 0);
      best = Math.max(best, s);
      sets += (e.sets || []).length; vol += liftVolume(e);
      if(norm(g.location) === 'home') homeMax = Math.max.apply(null, [homeMax].concat((e.sets || []).map(function(x){ return x.w || 0; })));
      var d = days.get(e.date) || {date:e.date, lifts:0, xp:LXP.day, vol:0, locs:new Set(), prs:0};
      d.lifts++; d.xp += e._xp; d.vol += liftVolume(e); d.locs.add(g.location); if(e._status === 'pr') d.prs++;
      days.set(e.date, d);
    });
    g.base = liftScore(g.entries[0]); g.best = best; g.last = g.entries[g.entries.length-1];
    g.gain = g.base > 0 ? (best - g.base)/g.base*100 : 0;
    g.tier = tierFor(g.gain);
    g.quest = g.last.target || autoTarget(g.last, g.location);
    g.prog = liftProgress(g);
    maxGain = Math.max(maxGain, g.gain);
  });
  var xp = 0; days.forEach(function(d){ xp += d.xp; });
  var level = ironLevel(xp);
  var weeks = new Set(Array.from(days.keys()).map(mondayOf));
  var ws = mondayOf(todayKey()); if(!weeks.has(ws)) ws = addDays(ws, -7);
  var streak = 0; while(weeks.has(ws)){ streak++; ws = addDays(ws, -7); }
  var dayList = Array.from(days.values());
  var maxLiftsDay = Math.max.apply(null, [0].concat(dayList.map(function(d){ return d.lifts; })));
  var lastDay = dayList.sort(function(a, b){ return a.date < b.date ? 1 : -1; })[0] || null;
  var glist = Array.from(groups.values()).sort(function(a, b){ return liftKey(a.last) < liftKey(b.last) ? 1 : -1; });
  return {groups:glist, prs:prs, quests:quests, sets:sets, vol:vol, xp:xp, level:level, streak:streak, days:days, maxLiftsDay:maxLiftsDay, lastDay:lastDay, maxGain:maxGain, homeMax:homeMax, entries:sorted};
}
export function liftBadges(a){
  return [
    ['First Lift','Log your first lift', a.entries.length, 1],
    ['Full Session','3+ lifts in one day', a.maxLiftsDay, 3],
    ['PR Hunter','Set your first PR', a.prs, 1],
    ['PR Machine','Set 10 PRs', a.prs, 10],
    ['Quest Cleared','Hit a next-session target', a.quests, 1],
    ['Questmaster','Clear 10 quests', a.quests, 10],
    ['Locked In','Lift 4 weeks in a row', a.streak, 4],
    ['Fight Camp','Lift 12 weeks in a row', a.streak, 12],
    ['Five Tons','Move 10,000 lb total', Math.round(a.vol), 10000],
    ['Fifty Tons','Move 100,000 lb total', Math.round(a.vol), 100000],
    ['Century','100 working sets', a.sets, 100],
    ['Regular','Lift on 20 days', a.days.size, 20],
    ['Time Chamber','Any lift +10% est. 1RM', Math.round(a.maxGain*10)/10, 10],
    ['Maxed the Bowflex','52.5 lb dumbbells at home', a.homeMax, BOWFLEX_MAX],
    ['Super Saiyan 2','Reach power level 15', a.level, 15]
  ].map(function(b){ return {name:b[0], desc:b[1], cur:b[2], goal:b[3], got:b[2] >= b[3]}; });
}

