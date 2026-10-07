// Coach: rules, the tracker snapshot Claude sees, the tools it can call, the conversation, the chat UI.
import { DEFAULT_TARGETS } from '../core/config.js';
import { $, addDays, clone, esc, fmtShort, fmtWd, mondayOf, pad, parseKey, todayKey, uid } from '../core/utils.js';
import { activeHabits, capOf, habitById, habitTarget, isActive, normalizeSettings, state, T } from '../core/state.js';
import { rankTitle } from '../core/xp.js';
import { fmtW, LSTATUS, mooseRank, norm, workingText } from '../core/strength.js';
import { recompute } from '../core/stats.js';
import { flush, flushLiftOps, persistLocal, saveSettings, scheduleSave, sync } from '../core/store.js';
import { mutateDay } from './today.js';
import { burst, toast } from '../core/effects.js';
import { render } from '../core/render.js';
import { celebrateLift, sessOpen } from './lifts.js';
import { CI_NUMS, CI_TIMES, commitMetrics, daysBetween, metricsOf, patternData, readiness, SESS, TAGS, watchList, weekReview, weekTally, weightTrend } from './body.js';
import { BCOLS, bKind, BKINDS, bNode, bRank, bRemove, bSel, BSTATUS, bStatus, buildStats, bWrite, BXP, setSelected } from './build.js';
import { openSheet } from '../core/sheets.js';

/* ---------- coach: chat with Claude, which reads and writes this tracker ---------- */
/* Claude runs through the sample capability; every change goes through the same functions the page's own buttons use. */
var CHAT_KEY = 'gol-coach-v1', CHAT_KEEP = 40, CHAT_SEND = 16;
var coach = {sample:null, ready:false, off:'', busy:false, ctl:null, canImg:false, canTools:false, maxTools:20, imgMax:0, imgCount:1, imgTypes:[], imgs:[], turns:[], cur:null, undo:{}, status:''};
var COACH_SEND_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
var COACH_STOP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>';

var COACH_RULES = [
'You are Coach, the AI built into Moose’s "Game Of Life" tracker (Moose = Mustafa). Everything here is his own data. You see it in <live_tracker_data> (attached to his latest message, current as of that moment) and through the read tools, and you change it with the write tools. Changes show on his page instantly.',
'',
'HOW TO TALK',
'- Phone screen. Lead with the answer. 1-5 short lines unless he asks for depth. Plain text, **bold** for the key number or call, "- " bullets only for real lists. No tables, no headings, no emoji.',
'- Brutal honesty, no hand-holding, no hype, no filler. Name a miss plainly, then give the next move.',
'- When you must ask, ask ONE question with 2-4 specific numbered options he can answer with a number.',
'- You are not a doctor. Pain, odd symptoms or anything medical: tell him to see a professional.',
'',
'LOGGING',
'- When he tells you something that belongs in the tracker, write it right away with the tools. Don’t ask permission and don’t narrate the tools. Then confirm in one line exactly what you wrote. The page shows an Undo button, so never ask "are you sure" for normal logging.',
'- Never invent or estimate a value. Only log numbers he gave or that are clearly readable in a photo. If part of a photo is unclear, log what is clear and say what you could not read.',
'- Photos: a Cal AI screenshot gives food day totals (first/last meal times only if shown). A WHOOP screenshot gives that morning\u2019s sleep and recovery numbers, logged on the wake date. A gym log or whiteboard gives lifts. A plain meal photo has no real numbers: give a rough estimate in text only, label it an estimate, and never log it. If the photo\u2019s date isn\u2019t clear, assume today and say so.',
'- If the date, exercise or field is genuinely ambiguous, ask first (numbered options). Otherwise assume today.',
'- Do several writes in one round when a message needs them (call tools in parallel).',
'- If a tool returns an error, fix the input and retry once, or tell him what is blocking.',
'',
'DATA RULES',
'- Dates YYYY-MM-DD, times 24h HH:MM, America/New_York. "now" in the live data is the current date and time.',
'- WHOOP sleep and recovery numbers (rec, hrv, rhr, rr, sleep, inbed, eff, sperf, deep, rem, bed, wake) go on the date he WOKE UP. "Bed at 11:40 last night" = update_day on today with bed "23:40". Strain and naps go on the day they happened.',
'- Food day totals (cal, pro, carb, fat, fib, sod, first, meal, meals) go on the day eaten; food at 00:30 counts as the previous evening (meal "00:30" on yesterday).',
'- Weight in lb: Sunday morning weigh-ins drive the trend. Log other days but say they don’t count. Waist in inches, monthly.',
'- Auto-scoring happens on write, so don’t also call set_habit for these: a bedtime scores Bed on time for the previous night; vape false checks Nicotine-free (true unchecks it); calories at or over target check Eat enough; a strength sess or a logged lift checks Train; sess rest marks Train as a rest day; ripright or cardio alone marks a light day.',
'- sess values: chest_biceps, back_triceps, legs (strength), ripright, cardio (light), rest (alone). Rotation chest_biceps > back_triceps > legs. tags: sick, travel, early_wake, band_issue, alcohol_late. patch = nicotine patch worn overnight (night that ended this morning).',
'- set_habit covers the rest: Read, Meditate, Money-producing work, Sunnah prayers (all 12 rawatib; Witr doesn’t count), Bed on time, extras.',
'- Lifts in lb. Plate-loaded machines = total plates on both sides, bar or sled not counted. Dumbbells = per dumbbell. Bodyweight = 0. Reuse the exact exercise name from his history when it is the same lift. Default location Heights Fitness unless he says home.',
'',
'BUILD TAB (his AI-builder track, never feeds the belts)',
'- Log FINISHED things only. Never hours, never "worked on".',
'- Ship kinds: ship +50 (a new build exists and works), live +75 (real people can use it), connect +40 (two things now talk to each other), upgrade +25 (a real feature added), fix +10 (bug or polish). skill +30 = something he can now do on his own.',
'- Map boxes: kind source (apps and data), engine (Claude and pipes), build; status idea, building, live, paused. A new working connection = a connect ship AND a connect arrow. Going live = a live ship AND the box status live. Attach ships to their box when one fits.',
'',
'COACHING RULES (his plan)',
'- Readiness: recovery 67%+ green = train as planned; 34-66 yellow = cut volume a third, stop 2-3 reps short; under 34 red = walk or rest. 3+ strength days in a row = light or rest. Resting HR 3+ over baseline for 2+ days = moderate; 5+ days = 4 training days that week. Resp. rate 1+ over baseline = possible illness, walk or rest. sick tag = no training.',
'- Week: 5 strength + 1 light + 1 full rest. A 6th strength day earns nothing; stacking pushed his resting HR up. RipRight 2-3 a week, only on the light day or at the START of leg day, never after pressing (pressing then RipRight caused his neck nerve flare).',
'- Lifts: double progression 8-12 reps. Add weight when every set at the working weight hits 12. Stall = 3 sessions with no more weight or reps.',
'- Weight rule: gaining under 1 lb a month = +200 kcal, unless he is already eating 3%+ under target (then hit the target first). 1-3 lb a month hold, over 3 lb = -200. Goal 170 lb.',
'- Use the review tool for how a week went, trends and patterns. Base every claim on his numbers and say when there isn’t enough data.'
].join('\n');

function r1(x){ return Math.round(x*10)/10; }
function coachLoad(){
  if(!sync.lsOK) return;
  try {
    var v = JSON.parse(localStorage.getItem(CHAT_KEY) || '[]');
    if(Array.isArray(v)) coach.turns = v.filter(function(t){ return t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string'; }).slice(-CHAT_KEEP);
  } catch(e){}
}
function coachSave(){
  if(!sync.lsOK) return;
  try {
    localStorage.setItem(CHAT_KEY, JSON.stringify(coach.turns.filter(function(t){ return !t.pending; }).slice(-CHAT_KEEP).map(function(t){
      return {role:t.role, content:t.content, img:t.img || 0, err:t.err || '', acts:(t.acts || []).map(function(a){ return {label:a.label, undone:!!a.undone}; })};
    })));
  } catch(e){}
}

/* ----- what Claude sees ----- */
function dayBrief(d){
  var doc = state.days[d], st = state.stats.byDate[d], out = {date:d, day:fmtWd(d)};
  var act = activeHabits(d);
  if(!doc){ out.nothingLogged = true; out.open = act.map(function(h){ return h.id; }); return out; }
  var m = clone(doc.m || {});
  if(Array.isArray(m.wo)) m.wo = m.wo.map(function(w){ return (w.a || 'Workout') + ' ' + (w.start || '') + ' ' + (w.min || 0) + 'min' + (w.strain !== undefined ? ' strain ' + w.strain : ''); });
  if(Array.isArray(m.naps)) m.naps = m.naps.map(function(n){ return (n.start || '') + ' ' + (n.min || 0) + 'min'; });
  if(Object.keys(m).length) out.metrics = m;
  out.done = Object.keys(doc.done || {});
  if(doc.rest && Object.keys(doc.rest).length){ out.rest = {}; Object.keys(doc.rest).forEach(function(h){ out.rest[h] = doc.rest[h] === 'light' ? 'light' : 'rest'; }); }
  var ex = {}; Object.keys(doc.extras || {}).forEach(function(h){ ex[h] = doc.extras[h].map(function(x){ return x.note; }); });
  if(Object.keys(ex).length) out.extras = ex;
  out.open = act.filter(function(h){ return !doc.done[h.id] && !(doc.rest && doc.rest[h.id]); }).map(function(h){ return h.id; });
  if(st){ out.xp = st.xp; out.sweep = st.sweep; }
  return out;
}
function coachSnapshot(){
  var t = todayKey(), now = new Date(), st = state.stats, r = readiness(t), ls = state.liftStats, B = state.build;
  return {
    now: t + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ' (' + parseKey(t).toLocaleDateString('en-US', {weekday:'long'}) + ')',
    pageShowingDate: state.selected,
    habits: activeHabits(t).map(function(h){ var s = st.habits[h.id] || {}; return {id:h.id, name:h.name, target:habitTarget(h), streak:s.run || 0, restDaysPerWeek:h.restPerWeek || 0, extraCap:capOf(h)}; }),
    today: dayBrief(t),
    yesterday: dayBrief(addDays(t, -1)),
    readiness: {recovery:r.rec, zone:r.z ? r.z.name : null, call:r.call, nextSplit:r.next ? r.next.k + (r.next.done ? ' (done today)' : '') : null, strengthDaysInARow:r.sRun, flags:r.flags.map(function(f){ return f.t + '. ' + f.x; })},
    thisWeek: weekTally(mondayOf(t)),
    targets: T(),
    rank: {overall:rankTitle(st.rank.level), totalXP:st.rank.xp, sweepStreak:st.sweepRun, bestSweepStreak:st.bestRun},
    lifts: ls.groups.slice(0, 14).map(function(g){ return {exercise:g.name, location:g.location, last:g.last.date, working:workingText(g.prog.working), nextTarget:g.quest, addWeight:g.prog.addWeight || undefined, stalled:g.prog.stall || undefined}; }),
    strengthLevel: ls.level + ' (' + mooseRank(ls.level) + ')',
    build: {
      nodes: B.bnodes.map(function(n){ return {id:n.id, name:n.name, kind:n.kind, status:n.status, venture:n.venture || undefined, sendsTo:(n.links || []).map(function(l){ return l.to; })}; }),
      recentShips: B.bships.slice().sort(function(a, b){ return a.date < b.date ? 1 : -1; }).slice(0, 6).map(function(x){ return {id:x.id, date:x.date, kind:x.kind, title:x.title, node:x.node || undefined}; }),
      skills: B.bskills.map(function(x){ return x.name; }),
      level: buildStats().level
    }
  };
}

/* ----- helpers for the tools ----- */
function cDate(v){
  var s = String(v == null ? '' : v).trim().toLowerCase();
  if(!s || s === 'today') return todayKey();
  if(s === 'yesterday') return addDays(todayKey(), -1);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Dates are YYYY-MM-DD, got "' + v + '".');
  if(s > todayKey()) throw new Error(s + ' is in the future.');
  return s;
}
function cTime(v){
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(v == null ? '' : v).trim());
  if(!m || +m[1] > 23 || +m[2] > 59) throw new Error('Times are 24h HH:MM, got "' + v + '".');
  return pad(+m[1]) + ':' + m[2];
}
function cBool(v, k){ if(v === true || v === 'true') return true; if(v === false || v === 'false') return false; throw new Error(k + ' must be true or false.'); }
function snapDays(keys){ var s = {}; keys.forEach(function(k){ s[k] = state.days[k] ? clone(state.days[k]) : null; }); return s; }
function restoreDays(s){ Object.keys(s).forEach(function(k){ if(s[k]) state.days[k] = clone(s[k]); else delete state.days[k]; scheduleSave(k); }); recompute(); render(); }
function addAct(label, undoFn){
  var a = coach.cur; if(!a) return;
  var id = 'u' + uid();
  coach.undo[id] = undoFn;
  a.acts.push({id:id, label:label});
  coachRender();
}
function findNode(v){ if(!v) return null; var s = String(v); return bNode(s) || state.build.bnodes.filter(function(n){ return norm(n.name) === norm(s); })[0] || null; }
function findHabit(v){ var s = String(v || ''); return habitById(s) || state.settings.habits.filter(function(h){ return norm(h.name) === norm(s); })[0] || null; }
function shortVal(k, v){ return Array.isArray(v) ? v.join('+') : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v); }

/* ----- tools ----- */
var COACH_TOOLS = [
{name:'update_day', busy:'Logging',
 description:'Write check-in fields for one date: WHOOP numbers, food day totals, weight, waist, session, tags, patch, vape. Merges into what is already there; `clear` removes fields. Linked habits auto-score. Returns what was written and any habit changes.',
 schema:{type:'object', properties:{
   date:{type:'string', description:'YYYY-MM-DD'},
   set:{type:'object', description:'field: value. Numbers: rec hrv rhr rr sleep inbed eff deep rem strain napMin cal pro carb fat fib sod meals weight waist (sleep and inbed in hours, deep/rem/napMin in minutes). Times "HH:MM": bed wake napStart first meal. sess: array of session keys. tags: array of tag keys. patch, vape: true/false.'},
   clear:{type:'array', items:{type:'string'}, description:'Field names to remove.'}}, required:['date']},
 run:function(inp){
   var date = cDate(inp.date), set = inp.set && typeof inp.set === 'object' && !Array.isArray(inp.set) ? inp.set : {}, clear = Array.isArray(inp.clear) ? inp.clear.map(String) : [];
   var allowed = CI_NUMS.concat(CI_TIMES, ['sess', 'tags', 'patch', 'vape']);
   var old = metricsOf(date), m = clone(old), parts = [], sessDirty = false;
   Object.keys(set).forEach(function(k){
     if(allowed.indexOf(k) < 0) throw new Error('Unknown field "' + k + '". Allowed: ' + allowed.join(', '));
     var v = set[k];
     if(CI_NUMS.indexOf(k) >= 0){ var n = Number(v); if(v === '' || v === null || !Number.isFinite(n) || n < 0) throw new Error(k + ' must be a number.'); m[k] = n; }
     else if(CI_TIMES.indexOf(k) >= 0) m[k] = cTime(v);
     else if(k === 'patch' || k === 'vape') m[k] = cBool(v, k);
     else if(k === 'sess'){
       var a = (Array.isArray(v) ? v : [v]).map(String).filter(Boolean);
       a.forEach(function(x){ if(!SESS.some(function(s){ return s.k === x; })) throw new Error('Unknown session "' + x + '". Use: ' + SESS.map(function(s){ return s.k; }).join(', ')); });
       if(a.indexOf('rest') >= 0 && a.length > 1) throw new Error('rest can’t be combined with other sessions.');
       if(a.length) m.sess = a; else delete m.sess;
       delete m.type; delete m.rip; sessDirty = true;
     } else {
       var tg = (Array.isArray(v) ? v : [v]).map(String).filter(Boolean);
       tg.forEach(function(x){ if(!TAGS.some(function(t){ return t.k === x; })) throw new Error('Unknown tag "' + x + '". Use: ' + TAGS.map(function(t){ return t.k; }).join(', ')); });
       if(tg.length) m.tags = tg; else delete m.tags;
     }
     parts.push(k + ' ' + shortVal(k, m[k] === undefined ? 'none' : m[k]));
   });
   clear.forEach(function(k){
     if(allowed.indexOf(k) < 0) throw new Error('Unknown field "' + k + '".');
     delete m[k];
     if(k === 'sess'){ delete m.type; delete m.rip; sessDirty = true; }
     parts.push('cleared ' + k);
   });
   if(!parts.length) throw new Error('Nothing to write. Pass set and/or clear.');
   var snap = snapDays([date, addDays(date, -1)]);
   var notes = commitMetrics(date, m, old, sessDirty);
   addAct(fmtShort(date) + ' · ' + parts.join(', ') + (notes.length ? ' · ' + notes.join(', ') : ''), function(){ restoreDays(snap); });
   return {ok:true, date:date, wrote:parts, habitChanges:notes};
 }},
{name:'set_habit', busy:'Updating habits',
 description:'Check, uncheck or rest a habit on a date, or log an extra session. Statuses: done, undone, rest (full rest day), light (Train only: light day), extra (needs the habit done; `note` says what). Returns the day XP and whether the day is a clean sweep.',
 schema:{type:'object', properties:{
   date:{type:'string', description:'YYYY-MM-DD'},
   habit:{type:'string', description:'Habit id or name: read, meditate, workout (Train), money, sleep (Bed on time), nicotine, eat, sunnah.'},
   status:{type:'string', enum:['done', 'undone', 'rest', 'light', 'extra']},
   note:{type:'string', description:'For extra: what the extra session was.'}}, required:['date', 'habit', 'status']},
 run:function(inp){
   var date = cDate(inp.date), h = findHabit(inp.habit), status = String(inp.status || '');
   if(!h) throw new Error('Unknown habit. Ids: ' + state.settings.habits.map(function(x){ return x.id; }).join(', '));
   if(!isActive(h, date)) throw new Error(h.name + ' isn’t active on ' + date + '.');
   var cur = state.days[date], snap = snapDays([date]), label;
   if(status === 'done'){
     if(cur && cur.done[h.id]) return {ok:true, note:h.name + ' was already done.'};
     mutateDay(date, function(d){ d.done[h.id] = Date.now(); if(d.rest) delete d.rest[h.id]; }, {});
     label = h.name + ' done';
   } else if(status === 'undone'){
     if(!(cur && (cur.done[h.id] || (cur.rest && cur.rest[h.id])))) return {ok:true, note:'Nothing to undo.'};
     mutateDay(date, function(d){ delete d.done[h.id]; delete d.extras[h.id]; if(d.rest) delete d.rest[h.id]; }, {});
     label = h.name + ' unchecked';
   } else if(status === 'rest' || status === 'light'){
     if(!h.restPerWeek) throw new Error(h.name + ' has no rest days.');
     if(status === 'light' && !h.lightPerWeek) throw new Error(h.name + ' has no light days.');
     mutateDay(date, function(d){ d.rest = d.rest || {}; d.rest[h.id] = status === 'light' ? 'light' : Date.now(); delete d.done[h.id]; delete d.extras[h.id]; }, {});
     label = h.name + (status === 'light' ? ' light day' : ' rest day');
   } else if(status === 'extra'){
     if(!cur || !cur.done[h.id]) throw new Error('Mark ' + h.name + ' done first.');
     if(((cur.extras[h.id]) || []).length >= capOf(h)) throw new Error(h.name + ' is at its extra cap (' + capOf(h) + ').');
     var note = String(inp.note || 'Extra session').slice(0, 60);
     mutateDay(date, function(d){ d.extras[h.id] = (d.extras[h.id] || []).concat([{id:uid(), note:note, at:Date.now()}]); }, {});
     label = h.name + ' extra: ' + note;
   } else throw new Error('status must be done, undone, rest, light or extra.');
   addAct(fmtShort(date) + ' · ' + label, function(){ restoreDays(snap); });
   var bd = state.stats.byDate[date];
   return {ok:true, date:date, habit:h.id, status:status, dayXP:bd ? bd.xp : 0, cleanSweep:bd ? bd.sweep : false};
 }},
{name:'log_lift', busy:'Logging lift',
 description:'Log one exercise from a session. Also checks Train for that date. Returns PR or progress status, XP, and the next-session target.',
 schema:{type:'object', properties:{
   date:{type:'string', description:'YYYY-MM-DD'},
   exercise:{type:'string'},
   location:{type:'string', description:'Heights Fitness (default) or Home.'},
   sets:{type:'array', items:{type:'object', properties:{w:{type:'number', description:'lb; total plates for plate-loaded, per dumbbell for dumbbells, 0 = bodyweight'}, r:{type:'integer', description:'reps'}}, required:['w', 'r']}},
   rir:{type:'number', description:'Reps in reserve on the last set, if he said.'},
   notes:{type:'string'},
   target:{type:'string', description:'Only if he set his own next-session goal, e.g. "90 x 10, 10, 9".'}}, required:['date', 'exercise', 'sets']},
 run:function(inp){
   var date = cDate(inp.date), ex = String(inp.exercise || '').trim();
   if(!ex) throw new Error('Exercise name is required.');
   var sets = (Array.isArray(inp.sets) ? inp.sets : []).map(function(s){ return {w:Number(s && s.w), r:parseInt(s && s.r, 10)}; })
     .filter(function(s){ return Number.isFinite(s.r) && s.r > 0; }).map(function(s){ return {w:Number.isFinite(s.w) && s.w > 0 ? s.w : 0, r:s.r}; });
   if(!sets.length) throw new Error('Need at least one set with reps.');
   var known = state.lifts.filter(function(e){ return norm(e.exercise) === norm(ex); })[0]; if(known) ex = known.exercise;
   var loc = String(inp.location || '').trim() || 'Heights Fitness';
   var kl = state.lifts.filter(function(e){ return norm(e.location) === norm(loc); })[0]; if(kl) loc = kl.location;
   var doc = {exercise:ex, location:loc, date:date, sets:sets, notes:String(inp.notes || '').slice(0, 160), createdAt:Date.now(), source:'coach'};
   if(inp.rir !== undefined && inp.rir !== null && inp.rir !== '' && Number.isFinite(Number(inp.rir))) doc.rir = Number(inp.rir);
   if(inp.target) doc.target = String(inp.target).slice(0, 40);
   var id = 'e' + uid(), snap = snapDays([date]), prevA = state.liftStats;
   state.lifts.push(Object.assign({id:id}, doc));
   sync.liftOps[id] = 'set';
   recompute(); persistLocal(); flushLiftOps();
   sessOpen.set(date, true);
   var wk = habitById('workout'), day = state.days[date], trainChecked = false;
   if(wk && isActive(wk, date) && !(day && day.done.workout)){ mutateDay(date, function(dd){ dd.done.workout = Date.now(); if(dd.rest) delete dd.rest.workout; }, {}); trainChecked = true; }
   else render();
   celebrateLift(prevA, state.liftStats, id);
   var e = state.liftStats.entries.filter(function(x){ return x.id === id; })[0];
   var g = state.liftStats.groups.filter(function(gr){ return gr.entries.some(function(x){ return x.id === id; }); })[0];
   addAct(fmtShort(date) + ' · ' + ex + ' ' + sets.map(function(s){ return (s.w > 0 ? fmtW(s.w) : 'BW') + '×' + s.r; }).join(', ') + (e && e._status === 'pr' ? ' · PR' : ''), function(){
     state.lifts = state.lifts.filter(function(l){ return l.id !== id; });
     sync.liftOps[id] = 'delete'; persistLocal(); flushLiftOps(); restoreDays(snap);
   });
   return {ok:true, id:id, exercise:ex, location:loc, date:date, status:e ? LSTATUS[e._status][1] : '', lastTargetCleared:e ? e._cleared : false, strengthXP:e ? e._xp : 0,
     working:g ? workingText(g.prog.working) : '', nextTarget:g ? g.quest : '', addWeightNext:g ? g.prog.addWeight : false, stalled:g ? g.prog.stall : false, trainChecked:trainChecked};
 }},
{name:'build_log', busy:'Updating Build tab',
 description:'Build tab writes. action ship: log a finished ship (title, kind, date, node, note). action skill: log a skill learned (name, date, node, note). action node: add or update a map box (id to update, else name; kind, status, venture, url, note). action connect: add an arrow from one box to another (from, to, label). Boxes can be referenced by id or exact name.',
 schema:{type:'object', properties:{
   action:{type:'string', enum:['ship', 'skill', 'node', 'connect']},
   title:{type:'string'}, kind:{type:'string', description:'ship: ship|live|connect|upgrade|fix. node: source|engine|build.'},
   date:{type:'string'}, node:{type:'string', description:'Map box the ship or skill belongs to.'},
   note:{type:'string'}, name:{type:'string'}, id:{type:'string'},
   status:{type:'string', enum:['idea', 'building', 'live', 'paused']},
   venture:{type:'string'}, url:{type:'string'},
   from:{type:'string'}, to:{type:'string'}, label:{type:'string', description:'What flows along the arrow.'}}, required:['action']},
 run:function(inp){
   var a = String(inp.action || ''), now = Date.now(), B = state.build, prevL = buildStats().level, res, obj;
   if(a === 'ship'){
     var title = String(inp.title || '').trim().slice(0, 90); if(!title) throw new Error('title is required.');
     var kind = String(inp.kind || 'upgrade'); if(!BKINDS.some(function(k){ return k.k === kind; })) throw new Error('kind must be ship, live, connect, upgrade or fix.');
     var nd = inp.node ? findNode(inp.node) : null; if(inp.node && !nd) throw new Error('No map box "' + inp.node + '".');
     obj = {id:'b' + uid(), title:title, kind:kind, date:cDate(inp.date), node:nd ? nd.id : '', note:String(inp.note || '').slice(0, 160), createdAt:now, source:'coach'};
     bWrite('bships', obj);
     var sid = obj.id;
     addAct('Ship · ' + bKind(kind).n + ': ' + title + ' (+' + BXP[kind] + ' XP)', function(){ bRemove('bships', sid); render(); });
     res = {ok:true, id:sid, xp:BXP[kind]};
   } else if(a === 'skill'){
     var nm = String(inp.name || inp.title || '').trim().slice(0, 60); if(!nm) throw new Error('name is required.');
     var nd2 = inp.node ? findNode(inp.node) : null; if(inp.node && !nd2) throw new Error('No map box "' + inp.node + '".');
     obj = {id:'b' + uid(), name:nm, date:cDate(inp.date), node:nd2 ? nd2.id : '', note:String(inp.note || '').slice(0, 140), createdAt:now, source:'coach'};
     bWrite('bskills', obj);
     var kid = obj.id;
     addAct('Skill · ' + nm + ' (+' + BXP.skill + ' XP)', function(){ bRemove('bskills', kid); render(); });
     res = {ok:true, id:kid, xp:BXP.skill};
   } else if(a === 'node'){
     var ex = inp.id ? findNode(inp.id) : findNode(inp.name);
     if(inp.id && !ex) throw new Error('No map box "' + inp.id + '".');
     var old = ex ? clone(ex) : null;
     obj = ex ? clone(ex) : {id:'n' + uid(), name:'', kind:'build', status:'building', venture:'', url:'', note:'', links:[], order:B.bnodes.length + 1, createdAt:now, source:'coach'};
     if(inp.name) obj.name = String(inp.name).trim().slice(0, 40);
     if(!obj.name) throw new Error('name is required for a new box.');
     if(inp.kind){ if(!BCOLS.some(function(c){ return c.k === inp.kind; })) throw new Error('node kind must be source, engine or build.'); obj.kind = String(inp.kind); }
     if(inp.status){ if(!BSTATUS.some(function(s){ return s.k === inp.status; })) throw new Error('status must be idea, building, live or paused.'); obj.status = String(inp.status); }
     if(inp.venture !== undefined) obj.venture = String(inp.venture).slice(0, 30);
     if(inp.url !== undefined){ var u = String(inp.url).trim(); if(u && !/^https?:\/\//.test(u)) u = 'https://' + u; obj.url = u.slice(0, 200); }
     if(inp.note !== undefined) obj.note = String(inp.note).slice(0, 200);
     bWrite('bnodes', obj); setSelected(obj.id);
     var nid = obj.id;
     addAct('Map · ' + (old ? obj.name + (old.status !== obj.status ? ' → ' + bStatus(obj.status).n : ' updated') : 'added ' + obj.name + ' (' + bStatus(obj.status).n + ')'), function(){
       if(old) bWrite('bnodes', old); else { bRemove('bnodes', nid); if(bSel === nid) setSelected(null); }
       render();
     });
     res = {ok:true, id:nid, created:!old};
   } else if(a === 'connect'){
     var f = findNode(inp.from), t = findNode(inp.to);
     if(!f || !t) throw new Error('Both ends must already be boxes on the map. Add the missing one with action node first.');
     if(f.id === t.id) throw new Error('A box can’t connect to itself.');
     var oldF = clone(f), c = clone(f);
     c.links = (c.links || []).filter(function(l){ return l.to !== t.id; }).concat([{to:t.id, label:String(inp.label || '').slice(0, 40)}]);
     bWrite('bnodes', c);
     addAct('Map · ' + f.name + ' → ' + t.name, function(){ bWrite('bnodes', oldF); render(); });
     res = {ok:true};
   } else throw new Error('action must be ship, skill, node or connect.');
   render();
   var nb = buildStats();
   if(nb.level > prevL){ burst(); toast('Builder level ' + nb.level + ' · ' + bRank(nb.level)); }
   res.builderXP = nb.xp; res.builderLevel = nb.level;
   return res;
 }},
{name:'read_days', busy:'Reading your log',
 description:'Read logged days in a date range (max 45 days): metrics, habits done, rest marks, extras, open habits, XP. Use for anything older than today/yesterday.',
 schema:{type:'object', properties:{from:{type:'string', description:'YYYY-MM-DD'}, to:{type:'string', description:'YYYY-MM-DD, default today'}}, required:['from']},
 run:function(inp){
   var to = cDate(inp.to || 'today'), from = cDate(inp.from);
   if(from > to){ var x = from; from = to; to = x; }
   if(daysBetween(from, to) > 44) from = addDays(to, -44);
   var out = [], empty = [];
   for(var d = from; d <= to; d = addDays(d, 1)){ if(state.days[d]) out.push(dayBrief(d)); else empty.push(d); }
   return {from:from, to:to, days:out, nothingLogged:empty};
 }},
{name:'lift_history', busy:'Checking lifts',
 description:'Lift history. With `exercise` (partial name ok): recent sessions with sets, status, entry ids, working weight, next target, add-weight and stall flags. Without: one summary line per exercise.',
 schema:{type:'object', properties:{exercise:{type:'string'}, sessions:{type:'integer', description:'How many recent sessions, default 4, max 10.'}}},
 run:function(inp){
   var q = norm(inp.exercise || ''), n = Math.max(1, Math.min(10, parseInt(inp.sessions, 10) || 4)), ls = state.liftStats;
   var gs = ls.groups.filter(function(g){ return !q || norm(g.name).indexOf(q) >= 0; });
   if(!gs.length) return {found:0, exercises:ls.groups.map(function(g){ return g.name + ' @ ' + g.location; })};
   return {strengthLevel:ls.level, exercises:gs.slice(0, q ? 6 : 40).map(function(g){
     var o = {exercise:g.name, location:g.location, sessions:g.entries.length, last:g.last.date, best1RM:Math.round(g.best), gainPct:r1(g.gain), tier:g.tier[1], working:workingText(g.prog.working), nextTarget:g.quest, addWeight:g.prog.addWeight, stalled:g.prog.stall};
     if(q) o.recent = g.entries.slice(-n).map(function(e){ return {id:e.id, date:e.date, sets:e.sets.map(function(s){ return (s.w > 0 ? fmtW(s.w) : 'BW') + 'x' + s.r; }).join(', '), rir:e.rir, status:LSTATUS[e._status][1], cleared:e._cleared || undefined, notes:e.notes || undefined}; });
     return o;
   })};
 }},
{name:'review', busy:'Running the numbers',
 description:'Weekly review for a Monday-Sunday week: nutrition, sleep and recovery averages vs targets and last week, late food and late bed nights, training tally, habit completion, the one biggest lever, weight trend and calorie rule, watch list, and 90-day patterns.',
 schema:{type:'object', properties:{week:{type:'string', description:'Any date in the week, YYYY-MM-DD. Default: this week.'}}},
 run:function(inp){
   var mon = mondayOf(cDate(inp.week || 'today')), w = weekReview(mon), wt = weightTrend(), today = todayKey();
   function sv(s, dec){ return s ? (dec ? r1(s.v) : Math.round(s.v)) : null; }
   var habits = state.settings.habits.map(function(h){
     var days = w.days.filter(function(d){ return d <= today && isActive(h, d); }), done = 0, rest = 0;
     days.forEach(function(d){ var doc = state.days[d]; if(doc && doc.done[h.id]) done++; else if(doc && doc.rest && doc.rest[h.id]) rest++; });
     return days.length ? h.name + ': ' + done + '/' + days.length + (rest ? ' (+' + rest + ' rest)' : '') : null;
   }).filter(Boolean);
   return {
     week:mon + ' to ' + addDays(mon, 6), complete:w.complete,
     averages:w.defs.map(function(r){ return {name:r.n, avg:sv(r.cur, r.dec), days:r.cur ? r.cur.n : 0, lastWeek:sv(r.prev, r.dec), target:r.t, unit:r.u}; }),
     lateFood:w.food.late + ' of ' + w.food.n + ' nights (last week ' + w.foodPrev.late + ' of ' + w.foodPrev.n + ')',
     lateBed:w.bed.late + ' of ' + w.bed.n + ' nights (last week ' + w.bedPrev.late + ' of ' + w.bedPrev.n + ')',
     training:w.tally, trainingLastWeek:w.prevTally,
     habits:habits,
     lever:w.lever ? w.lever.t + '. ' + w.lever.x : null,
     weight:{lastSunday:wt.last ? wt.last.d + ' ' + wt.last.w + ' lb' : null, rollingAvg:wt.last && wt.last.avg ? r1(wt.last.avg) : null, lbPerMonth:wt.rate === null ? null : r1(wt.rate), calorieRule:wt.rec ? wt.rec.text + (wt.rec.caveat ? ' ' + wt.rec.caveat : '') : wt.need},
     watch:watchList().map(function(f){ return f.t + '. ' + f.x; }),
     patterns:patternData().filter(function(p){ return p.ready; }).map(function(p){ return p.t + ' (' + p.q + '): ' + p.a.n + ' ' + r1(p.a.m) + p.u + ' (n=' + p.a.v.length + ') vs ' + p.b.n + ' ' + r1(p.b.m) + p.u + ' (n=' + p.b.v.length + ')'; })
   };
 }},
{name:'set_targets', busy:'Changing targets',
 description:'Change his daily targets. Only when he explicitly asks to change one. Keys: cal pro proMax carb fat fib sod (numbers), lastMeal bed satBed ("HH:MM"), strengthPerWeek lightDays restDays trainPerWeek ripMin ripMax goalWeight startWeight. Returns all targets.',
 schema:{type:'object', properties:{changes:{type:'object', description:'key: new value'}}, required:['changes']},
 run:function(inp){
   var ch = inp.changes && typeof inp.changes === 'object' ? inp.changes : {}, keys = Object.keys(ch);
   if(!keys.length) throw new Error('Pass at least one change.');
   var old = clone(state.settings), s2 = clone(state.settings), labels = [];
   keys.forEach(function(k){
     if(!(k in DEFAULT_TARGETS)) throw new Error('Unknown target "' + k + '". Keys: ' + Object.keys(DEFAULT_TARGETS).join(', '));
     var v = ch[k];
     if(k === 'lastMeal' || k === 'bed' || k === 'satBed') v = cTime(v);
     else { v = Number(v); if(!Number.isFinite(v) || v < 0) throw new Error(k + ' must be a number.'); }
     s2.targets[k] = v; labels.push(k + ' ' + v);
   });
   if('cal' in ch) s2.targets.calChangedOn = todayKey();
   state.settings = normalizeSettings(s2); recompute(); render(); saveSettings();
   addAct('Targets · ' + labels.join(', '), function(){ state.settings = normalizeSettings(old); recompute(); render(); saveSettings(); });
   return {ok:true, targets:T()};
 }},
{name:'remove_entry', busy:'Removing',
 description:'Delete one entry he asked to delete or that was logged by mistake: a lift (id from lift_history), a ship, a skill, or a map box (ids from the live data). Undoable from the page.',
 schema:{type:'object', properties:{kind:{type:'string', enum:['lift', 'ship', 'skill', 'node']}, id:{type:'string'}}, required:['kind', 'id']},
 run:function(inp){
   var kind = String(inp.kind || ''), id = String(inp.id || '');
   if(kind === 'lift'){
     var l = state.lifts.filter(function(x){ return x.id === id; })[0]; if(!l) throw new Error('No lift with id ' + id + '.');
     var copy = clone(l);
     state.lifts = state.lifts.filter(function(x){ return x.id !== id; }); sync.liftOps[id] = 'delete';
     recompute(); persistLocal(); flushLiftOps(); render();
     addAct('Deleted lift · ' + l.exercise + ' ' + fmtShort(l.date), function(){ state.lifts.push(copy); sync.liftOps[id] = 'set'; recompute(); persistLocal(); flushLiftOps(); render(); });
     return {ok:true};
   }
   var cn = {ship:'bships', skill:'bskills', node:'bnodes'}[kind]; if(!cn) throw new Error('kind must be lift, ship, skill or node.');
   var rec = state.build[cn].filter(function(x){ return x.id === id; })[0]; if(!rec) throw new Error('No ' + kind + ' with id ' + id + '.');
   var first = clone(rec), others = [];
   bRemove(cn, id);
   if(cn === 'bnodes'){
     state.build.bnodes.forEach(function(n){ if((n.links || []).some(function(lk){ return lk.to === id; })){ others.push(clone(n)); var c = clone(n); c.links = c.links.filter(function(lk){ return lk.to !== id; }); bWrite('bnodes', c); } });
     if(bSel === id) setSelected(null);
   }
   render();
   addAct('Deleted ' + kind + ' · ' + (rec.title || rec.name), function(){ bWrite(cn, first); others.forEach(function(o){ bWrite('bnodes', o); }); render(); });
   return {ok:true};
 }}
];

function coachTools(){
  return COACH_TOOLS.slice(0, coach.maxTools).map(function(t){
    return {name:t.name, description:t.description, inputSchema:t.schema, execute:function(inp, ctx){
      if(ctx && ctx.signal && ctx.signal.aborted) throw new Error('Stopped by Moose.');
      coach.status = t.busy; coachRender();
      try { return t.run(inp && typeof inp === 'object' ? inp : {}); }
      finally { coach.status = ''; }
    }};
  });
}

/* ----- the conversation ----- */
function coachInput(){
  var hist = coach.turns.filter(function(t){ return !t.pending; }).slice(-CHAT_SEND).map(function(t){
    if(t.role === 'user') return {role:'user', content:(t.content || '') + (t.img ? '\n[' + (t.img > 1 ? t.img + ' photos' : 'Photo') + ' attached]' : '')};
    var acts = (t.acts || []).map(function(a){ return a.label + (a.undone ? ' (Moose undid this)' : ''); });
    return {role:'assistant', content:(t.content || '') + (acts.length ? '\n[Changes made: ' + acts.join('; ') + ']' : '')};
  }).filter(function(t){ return t.content.trim(); });
  while(hist.length && hist[0].role !== 'user') hist.shift();
  var last = hist[hist.length - 1];
  last.content += '\n\n<live_tracker_data>\n' + JSON.stringify(coachSnapshot()) + '\n</live_tracker_data>' +
    (coach.canTools ? '' : '\n[This view can’t run tools. You can answer, but you can’t change any data. Say so if he asks you to log something.]');
  return [{role:'user', content:COACH_RULES}].concat(hist);
}
var COACH_ERR = {
  not_granted:'You didn’t allow Claude for this page. Reload to be asked again.',
  sampling_disabled:'Claude isn’t available on this account.',
  not_declared:'Coach is switched off for this page.',
  capability_disabled:'Coach can’t run in this view.',
  capability_removed:'Update the Claude app to use Coach here.',
  rate_limited:'Usage limit or too many requests. Try again in a bit.',
  session_expired:'Sign in to Claude again.',
  refused:'Claude declined that one. Rephrase it.',
  empty_completion:'No answer came back. Try rewording it.',
  prompt_too_large:'This chat got too long. Start a new chat.',
  image_rejected:'That image didn’t work. Use a JPEG or PNG screenshot.',
  images_unavailable:'Photos aren’t available in this view.',
  tools_unavailable:'This view can’t change data, only answer.'
};
async function coachSend(text){
  text = String(text || '').trim();
  if(coach.busy || !coach.sample || (!text && !coach.imgs.length)) return;
  var imgs = coach.imgs.map(function(x){ return x.file; }); coachClearImg();
  coach.turns.push({role:'user', content:text || (imgs.length > 1 ? 'Log what’s in these photos.' : 'Log what’s in this photo.'), img:imgs.length});
  var a = {role:'assistant', content:'', acts:[], pending:true, uid:'t' + uid()};
  coach.turns.push(a); coach.cur = a; coach.busy = true; coach.status = '';
  Object.keys(coach.undo).forEach(function(k){ delete coach.undo[k]; });
  coachRender(true);
  var ctl = coach.ctl = new AbortController();
  var opts = {signal:ctl.signal, onText:function(u){ a.content = u.text; coachRender(); }};
  if(coach.canTools) opts.tools = coachTools(); else opts.cache = false;
  if(imgs.length) opts.images = imgs;
  try {
    var r = await coach.sample(coachInput(), opts);
    a.content = r.text;
    if(r.truncated) a.err = 'Cut short. Ask for less at a time.';
  } catch(e){
    var code = e && e.code;
    a.content = code === 'refused' ? '' : ((e && e.text) || a.content || '');
    if(code === 'cancelled') a.err = a.acts.length ? 'Stopped. Changes above were made.' : 'Stopped.';
    else a.err = COACH_ERR[code] || 'Connection dropped. Try again.';
    if(code === 'not_granted' || code === 'sampling_disabled' || code === 'not_declared' || code === 'capability_disabled' || code === 'capability_removed'){ coach.off = a.err; coach.ready = false; }
    if(code === 'tools_unavailable') coach.canTools = false;
    if(code === 'images_unavailable') coach.canImg = false;
  } finally {
    a.pending = false; coach.busy = false; coach.ctl = null; coach.status = ''; coach.cur = null;
    if(!a.content && !a.acts.length && !a.err) a.err = 'No answer came back. Try again.';
    coachSave(); coachRender(true);
  }
}
function coachUndoTurn(uidv){
  var t = coach.turns.filter(function(x){ return x.uid === uidv; })[0]; if(!t) return;
  var acts = (t.acts || []).filter(function(a){ return a.id && coach.undo[a.id] && !a.undone; });
  acts.slice().reverse().forEach(function(a){ try { coach.undo[a.id](); } catch(e){} delete coach.undo[a.id]; a.undone = true; });
  coachSave(); coachRender();
  if(acts.length) toast(acts.length === 1 ? 'Change undone' : acts.length + ' changes undone');
}

/* ----- rendering ----- */
function mdLite(s){
  var out = [], list = null, tag = 'ul';
  function inline(x){ return esc(x).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>'); }
  function flush(){ if(list){ out.push('<' + tag + '>' + list.join('') + '</' + tag + '>'); list = null; } }
  String(s || '').split('\n').forEach(function(line){
    var b = /^\s*[-*•]\s+(.*)$/.exec(line), n = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if(b || n){
      var t = b ? 'ul' : 'ol';
      if(list && t !== tag) flush();
      if(!list){ list = []; tag = t; }
      list.push('<li' + (n ? ' value="' + esc(n[1]) + '"' : '') + '>' + inline(b ? b[1] : n[2]) + '</li>');
      return;
    }
    flush();
    var h = /^\s*#{1,4}\s+(.*)$/.exec(line);
    if(h){ out.push('<p><b>' + inline(h[1]) + '</b></p>'); return; }
    if(line.trim()) out.push('<p>' + inline(line) + '</p>');
  });
  flush();
  return out.join('');
}
var COACH_SUGS = [
  {t:'What do I train today?', s:'Reads recovery + split', send:true},
  {t:'How’s my week?', s:'Review vs targets', send:'How is my week going? Give me the one lever.'},
  {t:'Log a lift', s:'Exercise, sets × reps', fill:'Hack squat 180×10, 180×10, 180×9'},
  {t:'Log a ship', s:'Something you finished', fill:'Shipped: '},
  {t:'Send a photo', s:'Cal AI or WHOOP screenshot, meal, gym log, whiteboard', photo:true}
];
function coachRender(force){
  var log = $('#ch-log'); if(!log) return;
  var near = log.scrollHeight - log.scrollTop - log.clientHeight < 90;
  var h = '', lastActs = null;
  coach.turns.forEach(function(t){ if(t.role === 'assistant' && !t.pending && (t.acts || []).some(function(a){ return a.id && coach.undo[a.id] && !a.undone; })) lastActs = t; });
  if(!coach.turns.length){
    h += '<div class="chat-intro"><b>Tell me what happened. I log it.</b><p>Sleep, food totals, sessions, lifts, habits, ships. I write it straight into your tracker, then coach you off your own numbers.' + ' Tap the camera to send photos: I pull the numbers out and log them.' + '</p>' +
      '<div class="sugs">' + COACH_SUGS.map(function(s, i){ return '<button class="sug' + (s.photo ? ' sug-photo' : '') + '" type="button" data-coach="sug" data-i="' + i + '">' + esc(s.t) + '<span>' + esc(s.s) + '</span></button>'; }).join('') + '</div></div>';
  }
  if(coach.off) h += '<p class="chat-off">' + esc(coach.off) + '</p>';
  coach.turns.forEach(function(t){
    if(t.role === 'user'){ h += '<div class="msg u">' + esc(t.content) + (t.img ? '<br><span class="tag-img">' + (t.img > 1 ? t.img + ' photos' : 'Photo') + ' attached</span>' : '') + '</div>'; return; }
    var b = '';
    if(t.content) b += mdLite(t.content);
    if(t.pending && (!t.content || coach.status)) b += '<div class="status"><span class="dots"><i></i><i></i><i></i></span>' + esc(coach.status ? coach.status + '…' : 'Thinking…') + '</div>';
    if(t.acts && t.acts.length){
      b += '<div class="acts">' + t.acts.map(function(a){ return '<div class="act' + (a.undone ? ' undone' : '') + '">' + esc(a.label) + '</div>'; }).join('') + '</div>';
      if(t === lastActs) b += '<div class="undo-row"><button type="button" data-coach="undo" data-u="' + esc(t.uid) + '">Undo ' + (t.acts.filter(function(a){ return !a.undone; }).length > 1 ? 'these changes' : 'this') + '</button></div>';
    }
    if(t.err) b += '<p class="err">' + esc(t.err) + '</p>';
    h += '<div class="msg a">' + b + '</div>';
  });
  log.innerHTML = h;
  if(force || near) log.scrollTop = log.scrollHeight;
  var send = $('#ch-send'), inp = $('#ch-in');
  send.innerHTML = coach.busy ? COACH_STOP_SVG : COACH_SEND_SVG;
  send.classList.toggle('stop', coach.busy);
  send.setAttribute('aria-label', coach.busy ? 'Stop' : 'Send');
  send.disabled = !coach.busy && !coach.ready;
  inp.disabled = !coach.ready && !coach.busy;
  $('#ch-photo').hidden = !coach.ready;
  $('#ch-sub').textContent = coach.busy ? (coach.status || 'Thinking') + '…' : coach.ready ? (coach.canTools ? 'Reads and updates this tracker' : 'Answers only in this view') : coach.off ? 'Unavailable here' : 'Connecting…';
}
function coachClearImg(){
  coach.imgs.forEach(function(x){ if(x.url) try { URL.revokeObjectURL(x.url); } catch(e){} });
  coach.imgs = [];
  coachRenderAttach();
  $('#ch-file').value = '';
}
function coachRemoveImg(i){
  var x = coach.imgs[i]; if(!x) return;
  if(x.url) try { URL.revokeObjectURL(x.url); } catch(e){}
  coach.imgs.splice(i, 1); coachRenderAttach();
}
function coachRenderAttach(){
  var at = $('#ch-attach');
  if(!coach.imgs.length){ at.hidden = true; at.innerHTML = ''; return; }
  at.innerHTML = coach.imgs.map(function(x, i){ return '<span class="thumb">' + (x.url ? '<img alt="" src="' + esc(x.url) + '">' : '<em>IMG</em>') + '<button type="button" data-coach="rm-img" data-i="' + i + '" aria-label="Remove photo ' + (i + 1) + '">×</button></span>'; }).join('') +
    '<span class="attach-note">' + coach.imgs.length + ' of ' + coach.imgCount + (coach.imgCount === 1 ? ' photo' : ' photos') + '</span>';
  at.hidden = false;
}
function coachPickPhotos(){
  if(!coach.canImg){ toast('Photos aren’t available in this view. Open Game Of Life in the Claude app or on claude.ai.'); return; }
  if(coach.imgs.length >= coach.imgCount){ toast('Max ' + coach.imgCount + (coach.imgCount === 1 ? ' photo' : ' photos') + ' per message. Remove one first.'); return; }
  $('#ch-file').click();
}
function coachAddFiles(list){
  var files = Array.prototype.slice.call(list || []).filter(function(f){ return f && /^image\//.test(f.type || ''); });
  if(!files.length) return;
  if(!coach.canImg){ toast('Photos aren’t available in this view.'); return; }
  var skipped = 0;
  files.forEach(function(f){
    if(coach.imgs.length >= coach.imgCount){ skipped++; return; }
    if(coach.imgTypes.length && coach.imgTypes.indexOf(f.type) < 0){ skipped++; return; }
    if(coach.imgMax && f.size > coach.imgMax){ skipped++; return; }
    var url = ''; try { url = URL.createObjectURL(f); } catch(e){}
    coach.imgs.push({file:f, url:url});
  });
  coachRenderAttach();
  $('#ch-file').value = '';
  if(skipped) toast(skipped + (skipped === 1 ? ' photo' : ' photos') + ' skipped: max ' + coach.imgCount + ' per message, JPEG/PNG/WebP/GIF only.');
  if(coach.imgs.length) try { $('#ch-in').focus({preventScroll:true}); } catch(e){}
}
function coachGrow(){ var el = $('#ch-in'); el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 132) + 'px'; }
function openCoach(){
  openSheet('#chat-sheet');
  coachRender(true);
  if(coach.ready) setTimeout(function(){ try { $('#ch-in').focus({preventScroll:true}); } catch(e){} }, 60);
}
function coachSubmit(){
  if(coach.busy){ if(coach.ctl) coach.ctl.abort(); return; }
  var el = $('#ch-in'), v = el.value;
  if(!v.trim() && !coach.imgs.length) return;
  el.value = ''; coachGrow();
  coachSend(v);
}
export function bindCoach(){
  $('#btn-coach').addEventListener('click', openCoach);
  $('#ch-form').addEventListener('submit', function(e){ e.preventDefault(); coachSubmit(); });
  $('#ch-in').addEventListener('input', coachGrow);
  $('#ch-in').addEventListener('keydown', function(e){ if(e.key === 'Enter' && !e.shiftKey && !e.isComposing){ e.preventDefault(); coachSubmit(); } });
  $('#ch-photo').addEventListener('click', coachPickPhotos);
  $('#ch-file').addEventListener('change', function(e){ coachAddFiles(e.target.files); });
  $('#ch-in').addEventListener('paste', function(e){ var f = e.clipboardData && e.clipboardData.files; if(f && f.length){ e.preventDefault(); coachAddFiles(f); } });
  var sheet = $('#chat-sheet .chat-sheet');
  sheet.addEventListener('dragover', function(e){ if(e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0){ e.preventDefault(); sheet.classList.add('drop'); } });
  sheet.addEventListener('dragleave', function(e){ if(e.target === sheet) sheet.classList.remove('drop'); });
  sheet.addEventListener('drop', function(e){ sheet.classList.remove('drop'); if(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length){ e.preventDefault(); coachAddFiles(e.dataTransfer.files); } });
  $('#chat-sheet').addEventListener('click', function(e){
    var t = e.target.closest('[data-coach]'); if(!t) return;
    var k = t.getAttribute('data-coach');
    if(k === 'new'){ if(coach.busy && coach.ctl) coach.ctl.abort(); coach.turns = []; coach.undo = {}; coach.off = coach.ready ? '' : coach.off; coachClearImg(); coachSave(); coachRender(true); }
    else if(k === 'undo') coachUndoTurn(t.getAttribute('data-u'));
    else if(k === 'rm-img') coachRemoveImg(parseInt(t.getAttribute('data-i'), 10));
    else if(k === 'photo') coachPickPhotos();
    else if(k === 'sug'){
      var s = COACH_SUGS[parseInt(t.getAttribute('data-i'), 10)]; if(!s) return;
      if(s.photo) coachPickPhotos();
      else if(s.send) coachSend(s.send === true ? s.t : s.send);
      else { var el = $('#ch-in'); el.value = s.fill; coachGrow(); el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch(e2){} }
    }
  });
}
export function initCoach(){
  coachLoad();
  coachRender();
  if(!(window.claude && typeof window.claude.use === 'function')){ coach.off = 'Coach runs inside Claude. Open this page in the Claude app or on claude.ai.'; coachRender(); return; }
  window.claude.use('sample').then(function(s){
    if(!s){ coach.off = 'Coach isn’t available in this view. Open the page in the Claude app or on claude.ai.'; coachRender(); return; }
    coach.sample = s;
    return s.limits().catch(function(){ return null; }).then(function(lim){
      coach.canTools = !!(lim && lim.tools);
      if(lim && lim.tools && lim.tools.maxCount) coach.maxTools = lim.tools.maxCount;
      coach.canImg = !!(lim && lim.images);
      if(coach.canImg){ coach.imgMax = lim.images.maxInputBytes || 0; coach.imgCount = Math.max(1, lim.images.maxCount || 1); coach.imgTypes = lim.images.mediaTypes || []; $('#ch-file').setAttribute('accept', coach.imgTypes.join(',') || 'image/*'); if(coach.imgCount === 1) $('#ch-file').removeAttribute('multiple'); }
      coach.ready = true; coach.off = '';
      coachRender();
    });
  }).catch(function(){ coach.off = 'Coach isn’t available in this view.'; coachRender(); });
}

