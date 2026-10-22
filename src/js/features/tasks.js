// Daily tasks: one doc per day (tracker/tasks/YYYY-MM-DD), recurring templates in settings, the Today card, the Tasks tab, the task sheet.
import { TASK_BLOCKS, TASK_LANES, TASK_Q, TASK_ROLL_DAYS } from '../core/config.js';
import { $, addDays, clone, esc, fmt, fmtLong, fmtShort, fmtWd, mondayOf, pad, parseKey, range7, timeOf, todayKey, uid } from '../core/utils.js';
import { ICON, miniRing } from '../core/svg.js';
import { habitById, normalizeTask, normalizeTemplate, state, T } from '../core/state.js';
import { persistLocal, saveSettings, scheduleSaveTasks } from '../core/store.js';
import { burst, toast } from '../core/effects.js';
import { registerTab, render } from '../core/render.js';
import { closeSheets, openSheet } from '../core/sheets.js';
import { bNode } from './build.js';

/* ---------- daily tasks ---------- */
/* Pure data, no XP. Every item keeps: when it was created, planned, started (timer), done, dropped or pushed to another day, and what it was for. */
export var tkQA = {lane:null}, tkForm = null, tkArmed = false, tkHistOpen = {}, tkTplOpen = false;
export var tkSel = null, tkWeek = null; // the day the Tasks tab is showing, and its week (Monday)
var tkDay = null; // which "today" tkSel was last synced to, so a new day moves the tab forward
var tkTick = null, tkPop = null; // tkPop = the task just checked off, so its check can pop once

export function taskQ(k){ return TASK_Q.filter(function(x){ return x.k === Number(k); })[0] || TASK_Q[1]; }
export function taskBlock(k){ return TASK_BLOCKS.filter(function(x){ return x.k === k; })[0] || TASK_BLOCKS[0]; }
export function blockNow(){ var h = new Date().getHours(); return h < 12 ? 'am' : h < 17 ? 'pm' : 'eve'; }
export function taskDoc(d){ return state.tasks[d] || {date:d, schema:1, items:[]}; }
export function isOpen(it){ return !it.doneAt && !it.droppedAt && !it.rolledTo; }
export function taskMins(it){ return it.actual || it.est || 0; }
/* stop a running timer: close its log entry and add the run to the total */
export function stopTimer(it){
  if(!(it.timer && it.timer.on)) return false;
  var now = Date.now(); it.timer.ms += now - it.timer.on; it.timer.log = it.timer.log || [];
  var last = it.timer.log[it.timer.log.length - 1]; if(last && !last.e) last.e = now; else it.timer.log.push({s:it.timer.on, e:now});
  it.timer.on = null; return true;
}
export function timerMs(it){ return (it.timer ? it.timer.ms : 0) + (it.timer && it.timer.on ? Date.now() - it.timer.on : 0); }
export function fmtMin(n){ n = Math.round(n || 0); return n >= 60 ? Math.floor(n/60) + 'h' + (n % 60 ? ' ' + (n % 60) + 'm' : '') : n + 'm'; }
export function linkLabel(l){
  if(!l) return '';
  if(l.t === 'node'){ var n = bNode(l.id); return n ? n.name : (l.label || 'Project'); }
  if(l.t === 'habit'){ var h = habitById(l.id); return h ? h.name : (l.label || 'Habit'); }
  return l.label || (l.t === 'win' ? 'Weekly win' : '');
}
export function findTask(d, id){ var doc = state.tasks[d]; return doc ? doc.items.filter(function(x){ return x.id === id; })[0] : null; }
export function findTaskAnyDay(id){
  var out = null; Object.keys(state.tasks).forEach(function(d){ state.tasks[d].items.forEach(function(x){ if(x.id === id) out = {date:d, item:x}; }); }); return out;
}

/* ----- mutations: every change goes through here so it is saved and rendered the same way ----- */
export function mutateTasks(d, fn, opts){
  opts = opts || {};
  var doc = clone(taskDoc(d));
  var r = fn(doc);
  if(doc.items.length || doc.plannedAt || doc.closedAt) state.tasks[d] = doc; else delete state.tasks[d];
  scheduleSaveTasks(d);
  if(!opts.silent) render();
  return r;
}
export function newTask(f, src){
  var now = Date.now();
  return normalizeTask({id:'t' + uid(), title:f.title, lane:f.lane || tkQA.lane || TASK_LANES[0], q:f.q || 2, block:f.block || blockNow(), est:f.est, link:f.link || null, note:f.note || '',
    src:src || 'page', tpl:f.tpl || null, origin:f.origin || f.date || todayKey(), rolled:f.rolled || 0, createdAt:now});
}
export function addTask(d, f, src){
  var it = newTask(Object.assign({date:d}, f), src);
  mutateTasks(d, function(doc){ doc.items.push(it); });
  tkQA.lane = it.lane;
  return it;
}
export function updateTask(d, id, f){
  return mutateTasks(d, function(doc){
    var it = doc.items.filter(function(x){ return x.id === id; })[0]; if(!it) return null;
    ['title','lane','q','block','est','actual','link','note','sortedBy'].forEach(function(k){ if(f[k] !== undefined) it[k] = f[k]; });
    var n = normalizeTask(it); Object.assign(it, n); it.updatedAt = Date.now();
    return it;
  });
}
export function setDone(d, id, actual){
  return mutateTasks(d, function(doc){
    var it = doc.items.filter(function(x){ return x.id === id; })[0]; if(!it) return null;
    stopTimer(it);
    it.doneAt = Date.now(); it.droppedAt = null; it.dropWhy = null;
    if(Number.isFinite(actual) && actual > 0) it.actual = Math.round(actual);
    else if(!it.actual && it.timer && it.timer.ms >= 60000) it.actual = Math.round(it.timer.ms/60000);
    return it;
  });
}
export function undoDone(d, id){ return mutateTasks(d, function(doc){ var it = doc.items.filter(function(x){ return x.id === id; })[0]; if(it){ it.doneAt = null; } return it; }); }
export function dropTask(d, id, why){
  return mutateTasks(d, function(doc){
    var it = doc.items.filter(function(x){ return x.id === id; })[0]; if(!it) return null;
    stopTimer(it);
    it.droppedAt = Date.now(); it.dropWhy = why ? String(why).slice(0, 120) : null; it.doneAt = null; return it;
  });
}
export function undropTask(d, id){ return mutateTasks(d, function(doc){ var it = doc.items.filter(function(x){ return x.id === id; })[0]; if(it){ it.droppedAt = null; it.dropWhy = null; } return it; }); }
/* Move an open task to another day: the original stays on its day marked pushed, the copy lands on `to` with rolled + 1. */
export function moveTask(d, id, to){
  var it = findTask(d, id); if(!it || !isOpen(it) || !to || to === d) return null;
  var c = clone(it); c.id = 't' + uid(); c.rolled = (it.rolled || 0) + 1; c.src = 'moved'; c.rolledTo = null; c.createdAt = Date.now(); c.doneAt = null; c.timer = {on:null, ms:0, log:[]}; c.actual = null;
  mutateTasks(d, function(doc){ var x = doc.items.filter(function(y){ return y.id === id; })[0]; if(x){ stopTimer(x); x.rolledTo = to; } }, {silent:true});
  mutateTasks(to, function(doc){ doc.items.push(c); });
  return c;
}
export function deleteTask(d, id){ return mutateTasks(d, function(doc){ var n = doc.items.length; doc.items = doc.items.filter(function(x){ return x.id !== id; }); return doc.items.length < n; }); }
export function timerToggle(d, id){
  var started = false;
  mutateTasks(d, function(doc){
    var now = Date.now();
    doc.items.forEach(function(x){ if(x.id !== id) stopTimer(x); });
    var it = doc.items.filter(function(x){ return x.id === id; })[0]; if(!it) return;
    it.timer = it.timer || {on:null, ms:0, log:[]}; it.timer.log = it.timer.log || [];
    if(it.timer.on) stopTimer(it);
    else { it.timer.on = now; it.timer.log.push({s:now, e:null}); if(!it.startedAt) it.startedAt = now; started = true; }
  });
  return started;
}
export function lockPlan(d){ return mutateTasks(d, function(doc){ if(!doc.plannedAt) doc.plannedAt = Date.now(); return doc.plannedAt; }); }
/* Close the day: stamp it and push whatever is still open onto tomorrow. */
export function closeDay(d){
  var moved = 0, to = addDays(d, 1);
  mutateTasks(d, function(doc){ doc.closedAt = Date.now(); }, {silent:true});
  moved = rollInto(to, [d]);
  render();
  return {moved:moved, to:to};
}
/* Pull open items from earlier days into `d`. Each pushed item is marked rolledTo on its old day and copied with rolled+1, so nothing is pulled twice. Recurring tasks stay on their day: a miss is a miss. */
export function rollInto(d, fromDays){
  var moved = 0, today = todayKey();
  if(d > addDays(today, 1)) return 0;
  var src = fromDays || Object.keys(state.tasks).filter(function(k){ return k < d && k >= addDays(d, -TASK_ROLL_DAYS); }).sort();
  var copies = [];
  src.forEach(function(k){
    var doc = state.tasks[k]; if(!doc) return;
    var open = doc.items.filter(function(it){ return isOpen(it) && !it.tpl; }); if(!open.length) return;
    mutateTasks(k, function(od){
      od.items.forEach(function(it){
        if(!isOpen(it) || it.tpl) return;
        stopTimer(it);
        it.rolledTo = d;
        var c = clone(it); c.id = 't' + uid(); c.rolled = (it.rolled || 0) + 1; c.src = 'rollover'; c.rolledTo = null; c.createdAt = Date.now(); c.doneAt = null; c.timer = {on:null, ms:0, log:[]}; c.actual = null;
        copies.push(c);
      });
    }, {silent:true});
  });
  if(copies.length) mutateTasks(d, function(doc){ copies.forEach(function(c){ doc.items.push(c); moved++; }); }, {silent:true});
  return moved;
}
/* Recurring templates: put today's ones in place (once per template per day) */
export function materialize(d){
  var tpls = (state.settings.taskTemplates || []).filter(function(t){ return !t.paused && t.since <= d && t.days.indexOf(parseKey(d).getDay()) >= 0; });
  if(!tpls.length) return 0;
  var doc = taskDoc(d), have = {}; doc.items.forEach(function(x){ if(x.tpl) have[x.tpl] = 1; });
  var add = tpls.filter(function(t){ return !have[t.id]; }); if(!add.length) return 0;
  mutateTasks(d, function(dd){ add.forEach(function(t){ dd.items.push(newTask({title:t.title, lane:t.lane, q:t.q, block:t.block, est:t.est, link:t.link, tpl:t.id, date:d}, 'recur')); }); }, {silent:true});
  return add.length;
}
/* Called before rendering today: roll yesterday's leftovers in, then add today's recurring tasks. */
export function ensureToday(){
  var t = todayKey(), since = addDays(t, -TASK_ROLL_DAYS);
  var pending = Object.keys(state.tasks).some(function(k){ return k < t && k >= since && state.tasks[k].items.some(function(it){ return isOpen(it) && !it.tpl; }); });
  if(pending){
    var n = rollInto(t);
    if(n) setTimeout(function(){ toast(n + (n === 1 ? ' task' : ' tasks') + ' carried over from before'); }, 400);
  }
  materialize(t);
}
export function saveTemplate(t){
  var s = clone(state.settings); s.taskTemplates = s.taskTemplates || [];
  var i = s.taskTemplates.map(function(x){ return x.id; }).indexOf(t.id);
  if(i >= 0) s.taskTemplates[i] = t; else s.taskTemplates.push(t);
  state.settings.taskTemplates = s.taskTemplates.map(normalizeTemplate).filter(Boolean);
  persistLocal(); saveSettings(); materialize(todayKey()); render();
}
export function removeTemplate(id){
  state.settings.taskTemplates = (state.settings.taskTemplates || []).filter(function(x){ return x.id !== id; });
  persistLocal(); saveSettings(); render();
}

/* ----- stats, computed from the docs every time (nothing derived is stored) ----- */
export function taskStats(nDays){
  var today = todayKey(), since = addDays(today, -(nDays - 1)), tg = T();
  var days = Object.keys(state.tasks).filter(function(k){ return k >= since && k <= today; }).sort();
  var o = {days:days.length, created:0, done:0, dropped:0, rolled:0, open:0, q:{1:0, 2:0, 3:0, 4:0}, qDone:{1:0, 2:0, 3:0, 4:0}, lanes:{}, blocks:{am:0, pm:0, eve:0}, mins:0, estPairs:[], planned:0, plannedBy:0, closed:0, rec:{green:[0,0], yellow:[0,0], red:[0,0]}, pushed:[]};
  var planMin = tg.planBy ? Number(tg.planBy.split(':')[0])*60 + Number(tg.planBy.split(':')[1]) : null;
  days.forEach(function(k){
    var doc = state.tasks[k], dDone = 0, dAll = 0;
    if(doc.plannedAt){ o.planned++; var pd = new Date(doc.plannedAt); if(planMin !== null && pd.getHours()*60 + pd.getMinutes() <= planMin) o.plannedBy++; }
    if(doc.closedAt) o.closed++;
    doc.items.forEach(function(it){
      if(it.rolledTo){ o.rolled++; return; } // counted on the day it landed
      o.created++; dAll++;
      var L = o.lanes[it.lane] = o.lanes[it.lane] || {n:0, done:0, mins:0};
      L.n++; o.q[it.q]++;
      if(it.doneAt){ o.done++; dDone++; L.done++; o.qDone[it.q]++; o.blocks[it.block]++; var m = taskMins(it); L.mins += m; o.mins += m; if(it.est && it.actual) o.estPairs.push(it.actual/it.est); }
      else if(it.droppedAt) o.dropped++;
      else if(k === today) o.open++;
    });
    if(dAll){ var dm = state.days[k] && state.days[k].m, rec = dm ? dm.rec : null; if(Number.isFinite(rec)){ var z = rec >= 67 ? 'green' : rec >= 34 ? 'yellow' : 'red'; o.rec[z][0] += dDone; o.rec[z][1] += dAll; } }
  });
  var td = state.tasks[today];
  if(td) o.pushed = td.items.filter(function(it){ return isOpen(it) && it.rolled >= 2; }).sort(function(a, b){ return b.rolled - a.rolled; }).slice(0, 5);
  o.rate = o.created ? Math.round(o.done/o.created*100) : null;
  o.q2share = o.done ? Math.round(o.qDone[2]/o.done*100) : null;
  if(o.estPairs.length){ var s = o.estPairs.slice().sort(function(a, b){ return a - b; }); o.estMedian = s[Math.floor(s.length/2)]; }
  return o;
}

/* ----- Today card ----- */
function qaDefaults(){
  if(!tkQA.lane){ var last = null; Object.keys(state.tasks).sort().forEach(function(k){ state.tasks[k].items.forEach(function(it){ if(!last || it.createdAt > last.createdAt) last = it; }); }); tkQA.lane = last ? last.lane : TASK_LANES[0]; }
}
function chip(it){
  if(sorting[it.id]) return '<span class="tk-sorting">Claude is sorting\u2026</span>';
  var bits = ['<span class="tk-lane">' + esc(it.lane) + '</span>', '<span class="tk-q q' + it.q + '">Q' + it.q + '</span>', '<span class="tk-blk">' + esc(taskBlock(it.block).n) + '</span>'];
  if(it.est || it.actual) bits.push('<span class="tk-min">' + (it.actual ? fmtMin(it.actual) + (it.est ? ' / ' + fmtMin(it.est) : '') : '~' + fmtMin(it.est)) + '</span>');
  if(it.rolled) bits.push('<span class="tk-roll" title="Carried over ' + it.rolled + 'x">↻' + it.rolled + '</span>');
  var ll = linkLabel(it.link); if(ll) bits.push('<span class="tk-link">' + esc(ll) + '</span>');
  if(it.src === 'sched') bits.push('<span class="tk-win">One move</span>');
  return bits.join('');
}
function itemHTML(d, it, today){
  var on = it.timer && it.timer.on, ms = timerMs(it), state_ = it.doneAt ? 'done' : it.droppedAt ? 'dropped' : it.rolledTo ? 'rolled' : 'open';
  var h = '<li class="tk' + (state_ !== 'open' ? ' is-' + state_ : '') + (on ? ' is-timing' : '') + (tkPop === it.id && it.doneAt ? ' just-done' : '') + '" data-id="' + esc(it.id) + '">';
  if(state_ === 'open' || state_ === 'done') h += '<button class="tk-check" type="button" data-act="' + (it.doneAt ? 'tk-undone' : 'tk-done') + '" data-d="' + d + '" data-id="' + esc(it.id) + '" aria-pressed="' + !!it.doneAt + '" aria-label="' + esc((it.doneAt ? 'Undo: ' : 'Done: ') + it.title) + '"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></button>';
  else h += '<span class="tk-check tk-x" aria-hidden="true">' + (state_ === 'dropped' ? '✕' : '→') + '</span>';
  h += '<button class="tk-main" type="button" data-act="tk-open" data-d="' + d + '" data-id="' + esc(it.id) + '"><span class="tk-title">' + esc(it.title) + '</span><span class="tk-chips">' + chip(it) +
    (state_ === 'done' && it.doneAt ? '<span class="tk-at">' + esc(timeOf(it.doneAt)) + '</span>' : '') + (state_ === 'rolled' ? '<span class="tk-at">to ' + esc(fmtShort(it.rolledTo)) + '</span>' : '') + (state_ === 'dropped' && it.dropWhy ? '<span class="tk-at">' + esc(it.dropWhy) + '</span>' : '') + '</span>' +
    (it.note ? '<span class="tk-note">' + esc(it.note) + '</span>' : '') + '</button>';
  if(state_ === 'open' && d === today) h += '<button class="tk-timer' + (on ? ' on' : '') + '" type="button" data-act="tk-timer" data-d="' + d + '" data-id="' + esc(it.id) + '" aria-label="' + (on ? 'Stop timer' : 'Start timer') + '"><span data-timer="' + esc(it.id) + '">' + (ms >= 60000 || on ? fmtTimer(ms) : 'Timer') + '</span><i></i></button>';
  else if(ms >= 60000 && state_ === 'open') h += '<span class="tk-timer"><span>' + fmtTimer(ms) + '</span></span>';
  return h + '</li>';
}
export function fmtTimer(ms){ var s = Math.floor(ms/1000), m = Math.floor(s/60), hh = Math.floor(m/60); return hh ? hh + ':' + String(m % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') : m + ':' + String(s % 60).padStart(2, '0'); }
function sortOpen(a, b){ var bo = ['am','pm','eve']; return (a.q - b.q) || (bo.indexOf(a.block) - bo.indexOf(b.block)) || (a.createdAt - b.createdAt); }
export function tasksCardHTML(d){
  var today = todayKey(), doc = taskDoc(d), items = doc.items, open = items.filter(isOpen).sort(sortOpen), done = items.filter(function(x){ return x.doneAt; }).sort(function(a, b){ return b.doneAt - a.doneAt; });
  var gone = items.filter(function(x){ return x.droppedAt || x.rolledTo; });
  var tg = T(), h = '<div class="tk-head"><div><p class="eyebrow">Tasks' + (d !== today ? ' · ' + esc(fmtShort(d)) : '') + '</p><p class="tk-sum"><b>' + done.length + '</b> done · <b>' + open.length + '</b> open' +
    (doc.plannedAt ? ' · planned ' + esc(timeOf(doc.plannedAt)) : '') + (doc.closedAt ? ' · closed ' + esc(timeOf(doc.closedAt)) : '') + '</p></div>';
  if(d === today) h += '<div class="tk-head-acts">' + (!doc.plannedAt && items.length ? '<button class="pill-btn" type="button" data-act="tk-lock" data-d="' + d + '">Lock plan</button>' : '') + (!doc.closedAt && items.length ? '<button class="pill-btn" type="button" data-act="tk-close" data-d="' + d + '">Close day</button>' : '') + '</div>';
  h += '</div>';
  if(d >= today){
    qaDefaults();
    h += '<form class="tk-add tq-form" autocomplete="off" data-d="' + d + '"><input class="tq-title" type="text" maxlength="120" placeholder="Add a task… Claude sorts the rest" aria-label="New task"><button class="primary small" type="submit">Add</button></form>';
  }
  if(!items.length) h += '<p class="nudge">' + (d === today ? 'Nothing planned yet. Add what today is for, then lock the plan before deep work (' + esc(tg.planBy || '07:30') + ').' : d > today ? 'Nothing planned for ' + esc(fmtWd(d)) + ' yet. Add it here and it will be waiting.' : 'No tasks on this day.') + '</p>';
  if(open.length) h += '<ul class="tk-list">' + open.map(function(it){ return itemHTML(d, it, today); }).join('') + '</ul>';
  if(items.length) h += '<div class="tk-fin"><p class="tk-fin-h"><span>Finished' + (d === today ? ' today' : '') + ' \u00b7 ' + done.length + (open.length + done.length ? ' of ' + (open.length + done.length) : '') + '</span>' + (done.some(function(x){ return taskMins(x); }) ? '<em>' + fmtMin(done.reduce(function(a, x){ return a + taskMins(x); }, 0)) + '</em>' : '') + '</p>' +
    (done.length ? '<ul class="tk-list">' + done.map(function(it){ return itemHTML(d, it, today); }).join('') + '</ul>' : '<p class="tk-fin-empty">' + (d <= today ? 'Nothing checked off yet. Done tasks land here.' : 'Done tasks will land here on the day.') + '</p>') + '</div>';
  if(gone.length) h += '<details class="tk-done-wrap"><summary>Pushed or dropped · ' + gone.length + '</summary><ul class="tk-list">' + gone.map(function(it){ return itemHTML(d, it, today); }).join('') + '</ul></details>';
  return h;
}
/* re-render a container without losing what he is typing in its quick-add box */
function keepTyping(el, fn){
  var inp = el.querySelector('.tq-title'), keep = inp ? {v:inp.value, f:document.activeElement === inp} : null;
  fn();
  if(keep && keep.v){ var ni = el.querySelector('.tq-title'); if(ni){ ni.value = keep.v; if(keep.f) ni.focus(); } }
}
export function renderTasksCard(){
  var el = $('#tasks'); if(!el) return;
  keepTyping(el, function(){ el.innerHTML = tasksCardHTML(state.selected); });
  startTick();
}
function startTick(){
  if(tkTick) return;
  tkTick = setInterval(function(){
    var any = false;
    document.querySelectorAll('[data-timer]').forEach(function(sp){
      var f = findTaskAnyDay(sp.getAttribute('data-timer')); if(!f || !f.item.timer || !f.item.timer.on) return;
      any = true; sp.textContent = fmtTimer(timerMs(f.item)); var btn = sp.parentNode; if(btn && btn.style) btn.style.setProperty('--p', String(Math.round((timerMs(f.item)/60000 % 60)/60*100)));
    });
    if(!any){ clearInterval(tkTick); tkTick = null; }
  }, 1000);
}
export function quickAdd(form){
  var d = form.getAttribute('data-d') || todayKey(), inp = form.querySelector('.tq-title'), title = inp ? inp.value.trim() : '';
  if(!title){ if(inp) inp.focus(); return; }
  if(inp) inp.value = '';
  var it = addTask(d, {title:title, lane:tkQA.lane, q:2, block:blockNow()}, 'page');
  Array.prototype.forEach.call(document.querySelectorAll('.tq-form[data-d="' + d + '"] .tq-title'), function(x){ if(x.offsetParent) x.focus(); });
  autoSort(d, it.id);
  return it;
}

/* ----- Claude sorts a typed task: lane, quadrant, block, estimate, what it serves ----- */
export var sorting = {};
function sampleCap(){
  if(!(window.claude && typeof window.claude.use === 'function')) return Promise.resolve(null);
  return window.claude.use('sample').catch(function(){ return null; });
}
function sortPrompt(it){
  var nodes = state.build.bnodes.map(function(n){ return n.id + ' = ' + n.name + (n.venture ? ' (' + n.venture + ')' : ''); });
  var habits = state.settings.habits.map(function(h){ return h.id + ' = ' + h.name; });
  var now = new Date();
  return [
    'Sort one task for Moose (Mustafa): founder of Ock Spot (Brooklyn deli, with BOSS as its software arm building DMS) and Upsurge (web design for small businesses, sold door to door, built with Claude and Higgsfield). He also tracks his body, deen, family, home and money. Answer with JSON only.',
    'Task: "' + it.title.replace(/"/g, '\\"') + '"',
    'Now: ' + now.toLocaleDateString('en-US', {weekday:'long'}) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + '.',
    'lane, one of: Body (training, food, sleep, supplements, health), Islam (salah, Quran, dhikr, deen), Family (relatives, friends, messages, gifts), Home (household, errands, car, logistics), Money (bills, taxes, bank, admin, subscriptions), Ock Spot (the deli and its software arm BOSS/DMS: staff, inventory, suppliers, SNAP, the Adnan/Canarsie partnership, the Deli Management System, franchise work), Upsurge (clients, leads, sites, sales, Stripe, reps, Elderberry, Khokha, L.I. Finest, Bethpage), Build (building things with Claude: Game Of Life, skills, automations, scheduled tasks).',
    'q: Covey quadrant. 1 = urgent AND important (deadline today, money at risk, someone waiting, something broken). 2 = important, not urgent (builds the business, body, deen or relationships; the default). 3 = urgent, not important (interruptions, small favors, admin with a clock). 4 = neither.',
    'block: am = needs a sharp brain (building, writing, calls, planning, selling), pm = physical or out of the house (gym, errands, store visits, lake reading, driving), eve = quiet or family time (messages, light admin, reading, prep for tomorrow). Prefer am for anything mental.',
    'est: honest minutes for a focused person, integer, or null if unknowable.',
    'link: the ONE thing it most directly serves, or null. Map boxes (use the id): ' + (nodes.length ? nodes.join('; ') : 'none') + '. Habits (use the id): ' + habits.join('; ') + '. A task that IS a habit session (e.g. "read 25 min", "leg day") links the habit; work on a project links its box.',
    'Return exactly: {"lane":"...","q":1|2|3|4,"block":"am"|"pm"|"eve","est":number|null,"link":{"t":"node"|"habit","id":"..."}|null}'
  ].join('\n');
}
export function autoSort(d, id){
  var it = findTask(d, id); if(!it) return Promise.resolve(false);
  return sampleCap().then(function(sample){
    if(!sample || typeof sample.json !== 'function') return false;
    sorting[id] = true; render();
    return sample.json(sortPrompt(it), {modelTier:'complex', cache:false}).then(function(r){
      delete sorting[id];
      var cur = findTask(d, id); if(!cur || cur.doneAt || cur.updatedAt){ render(); return false; } // he already edited it
      var f = {};
      if(r && typeof r.lane === 'string' && r.lane.trim()) f.lane = r.lane.trim().slice(0, 30);
      if(r && [1,2,3,4].indexOf(Number(r.q)) >= 0) f.q = Number(r.q);
      if(r && ['am','pm','eve'].indexOf(r.block) >= 0) f.block = r.block;
      if(r && Number.isFinite(Number(r.est)) && Number(r.est) > 0) f.est = Math.round(Number(r.est));
      if(r && r.link && r.link.t === 'node' && bNode(r.link.id)) f.link = {t:'node', id:r.link.id, label:bNode(r.link.id).name};
      else if(r && r.link && r.link.t === 'habit' && habitById(r.link.id)) f.link = {t:'habit', id:r.link.id, label:habitById(r.link.id).name};
      else f.link = null;
      f.sortedBy = 'claude';
      var u = updateTask(d, id, f); if(u){ u.updatedAt = null; tkQA.lane = u.lane; }
      toast('Sorted: ' + (f.lane || cur.lane) + ' · Q' + (f.q || cur.q) + ' · ' + taskBlock(f.block || cur.block).n + (f.est ? ' · ~' + fmtMin(f.est) : '') + (f.link ? ' · ' + f.link.label : ''), {label:'Edit', fn:function(){ openTaskSheet(d, id); }});
      return true;
    }).catch(function(){ delete sorting[id]; render(); return false; });
  });
}
export function onDone(d, id, btn){
  tkPop = id;
  var it = setDone(d, id); tkPop = null; if(!it) return;
  if(it.doneAt && !it.droppedAt){
    var all = taskDoc(d).items.filter(function(x){ return !x.rolledTo && !x.droppedAt; }), left = all.filter(isOpen).length;
    if(!left && all.length > 1) burst();
    toast(left ? 'Done · ' + left + ' left' + (it.actual ? ' · ' + fmtMin(it.actual) : '') : 'All done for ' + (d === todayKey() ? 'today' : fmtShort(d)), it.actual ? null : {label:'Minutes?', fn:function(){ openTaskSheet(d, id, 'actual'); }});
  }
}

/* ----- the task sheet (edit one item, or a recurring template) ----- */
function linkOptions(cur){
  var o = '<option value="">Nothing specific</option><optgroup label="Projects">';
  state.build.bnodes.slice().sort(function(a, b){ return String(a.name).localeCompare(String(b.name)); }).forEach(function(n){ o += '<option value="node:' + esc(n.id) + '"' + (cur && cur.t === 'node' && cur.id === n.id ? ' selected' : '') + '>' + esc(n.name) + '</option>'; });
  o += '</optgroup><optgroup label="Habits">';
  state.settings.habits.forEach(function(h){ o += '<option value="habit:' + esc(h.id) + '"' + (cur && cur.t === 'habit' && cur.id === h.id ? ' selected' : '') + '>' + esc(h.name) + '</option>'; });
  o += '</optgroup><option value="win:"' + (cur && cur.t === 'win' ? ' selected' : '') + '>This week’s win</option>';
  return o;
}
function parseLink(v, label){ if(!v) return null; var p = v.split(':'); return {t:p[0], id:p.slice(1).join(':'), label:label || ''}; }
export function openTaskSheet(d, id, focus){
  tkArmed = false;
  var it = findTask(d, id); if(!it) return;
  tkForm = {mode:'item', date:d, id:id};
  $('#tk-h').textContent = 'Task';
  $('#tk-form').innerHTML = formFields(it, false) +
    '<p class="lf-msg full" id="tk-msg" role="status"></p><div class="sheet-actions full">' +
    (it.doneAt ? '' : it.droppedAt ? '<button class="ghost" type="button" data-act="tk-undrop">Bring back</button>' : '<button class="ghost" type="button" data-act="tk-drop">Drop</button>') +
    '<button class="ghost" type="button" data-act="tk-delete">Delete</button><button class="ghost" type="button" data-act="close-sheet">Cancel</button><button class="primary" type="submit">Save</button></div>';
  openSheet('#task-sheet');
  if(focus){ var f = $('#tk-' + focus); if(f) setTimeout(function(){ f.focus(); }, 60); }
}
export function openTemplateSheet(id){
  tkArmed = false;
  var t = id ? (state.settings.taskTemplates || []).filter(function(x){ return x.id === id; })[0] : null;
  tkForm = {mode:'tpl', id:t ? t.id : null};
  $('#tk-h').textContent = t ? 'Recurring task' : 'New recurring task';
  $('#tk-form').innerHTML = formFields(t || {title:'', lane:tkQA.lane || TASK_LANES[0], q:2, block:'am', days:[1,2,3,4,5]}, true) +
    '<p class="lf-msg full" id="tk-msg" role="status"></p><div class="sheet-actions full">' + (t ? '<button class="ghost" type="button" data-act="tk-tpl-' + (t.paused ? 'resume' : 'pause') + '">' + (t.paused ? 'Resume' : 'Pause') + '</button><button class="ghost" type="button" data-act="tk-delete">Delete</button>' : '') +
    '<button class="ghost" type="button" data-act="close-sheet">Cancel</button><button class="primary" type="submit">Save</button></div>';
  openSheet('#task-sheet');
}
function formFields(it, tpl){
  var f = '<label class="lf-field full" for="tk-title"><span>' + (tpl ? 'Task' : 'What') + '</span><input id="tk-title" maxlength="120" value="' + esc(it.title) + '" placeholder="Call Adnan about the lease"></label>' +
    '<label class="lf-field" for="tk-lane"><span>Lane</span><select id="tk-lane">' + TASK_LANES.map(function(l){ return '<option' + (l === it.lane ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + (TASK_LANES.indexOf(it.lane) < 0 && it.lane ? '<option selected>' + esc(it.lane) + '</option>' : '') + '</select></label>' +
    '<label class="lf-field" for="tk-block"><span>Block</span><select id="tk-block">' + TASK_BLOCKS.map(function(b){ return '<option value="' + b.k + '"' + (b.k === it.block ? ' selected' : '') + '>' + esc(b.n) + ' (' + b.t.toLowerCase() + ')</option>'; }).join('') + '</select></label>' +
    '<div class="lf-field full"><span>Quadrant</span><div class="tk-qgrid" id="tk-q">' + TASK_Q.map(function(q){ return '<button type="button" class="q' + q.k + (q.k === it.q ? ' on' : '') + '" data-act="tk-q" data-v="' + q.k + '"><b>' + q.n + '</b><span>' + esc(q.t) + '</span></button>'; }).join('') + '</div></div>' +
    '<label class="lf-field" for="tk-est"><span>Estimate (min)</span><input id="tk-est" type="number" inputmode="numeric" min="1" max="720" value="' + (it.est || '') + '"></label>' +
    (tpl ? '<div class="lf-field"><span>Days</span><div class="tk-days" id="tk-days">' + ['S','M','T','W','T','F','S'].map(function(l, i){ return '<button type="button" class="' + ((it.days || []).indexOf(i) >= 0 ? 'on' : '') + '" data-act="tk-day" data-v="' + i + '" aria-label="' + ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][i] + '">' + l + '</button>'; }).join('') + '</div></div>' :
      '<label class="lf-field" for="tk-actual"><span>Actual (min)</span><input id="tk-actual" type="number" inputmode="numeric" min="1" max="720" value="' + (it.actual || '') + '"></label>') +
    '<label class="lf-field full" for="tk-link"><span>For</span><select id="tk-link">' + linkOptions(it.link) + '</select></label>' +
    (!tpl && !it.doneAt && !it.droppedAt && !it.rolledTo ? '<div class="lf-field full tk-move"><span>Move to another day</span><div class="tk-move-row"><button type="button" class="ghost small" data-act="tk-move" data-to="' + addDays(todayKey(), 1) + '">Tomorrow</button><input id="tk-move-date" type="date" min="' + todayKey() + '" value="' + addDays(todayKey(), 1) + '" aria-label="Move to date"><button type="button" class="ghost small" data-act="tk-move">Move</button></div></div>' : '') +
    (!tpl ? '<label class="lf-field full" for="tk-note"><span>Outcome / note</span><input id="tk-note" maxlength="300" value="' + esc(it.note || '') + '" placeholder="What happened, what’s next"></label>' : '');
  if(!tpl && (it.rolled || it.src !== 'page' || it.createdAt)) f += '<p class="muted small full">' + [it.createdAt ? 'Added ' + fmtShort(it.origin || tkForm.date) + ' ' + timeOf(it.createdAt) : '', it.rolled ? 'carried over ' + it.rolled + (it.rolled === 1 ? ' time' : ' times') : '', it.src !== 'page' ? 'from ' + ({coach:'Coach', sched:'daily one move', recur:'recurring', rollover:'a previous day', moved:'moved by you'}[it.src] || it.src) : '', it.timer && it.timer.ms ? 'timer ' + fmtTimer(it.timer.ms) + (it.timer.log && it.timer.log.length > 1 ? ' over ' + it.timer.log.length + ' runs' : '') : ''].filter(Boolean).join(' · ') + '</p>';
  return f;
}
export function saveTaskForm(){
  var m = tkForm; if(!m) return;
  function val(id){ var el = $('#' + id); return el ? el.value.trim() : ''; }
  var msg = $('#tk-msg'), title = val('tk-title'); if(!title){ msg.className = 'lf-msg full err'; msg.textContent = 'Give it a name.'; $('#tk-title').focus(); return; }
  var qb = document.querySelector('#tk-q button.on'), q = qb ? Number(qb.getAttribute('data-v')) : 2;
  var link = parseLink(val('tk-link'), ''); if(link) link.label = linkLabel(link);
  var f = {title:title, lane:val('tk-lane'), block:val('tk-block'), q:q, est:parseInt(val('tk-est'), 10) || null, link:link};
  if(m.mode === 'tpl'){
    var days = Array.from(document.querySelectorAll('#tk-days button.on')).map(function(b){ return Number(b.getAttribute('data-v')); });
    if(!days.length){ msg.className = 'lf-msg full err'; msg.textContent = 'Pick at least one day.'; return; }
    var old = m.id ? (state.settings.taskTemplates || []).filter(function(x){ return x.id === m.id; })[0] : null;
    saveTemplate(Object.assign({}, old || {id:'r' + uid(), since:todayKey(), createdAt:Date.now(), paused:false}, f, {days:days}));
    closeSheets(); toast(old ? 'Recurring task updated' : 'Recurring task added');
    return;
  }
  f.actual = parseInt(val('tk-actual'), 10) || null; f.note = val('tk-note');
  updateTask(m.date, m.id, f);
  closeSheets(); toast('Saved');
}
export function sheetAct(act, t){
  var m = tkForm; if(!m) return;
  if(act === 'tk-q'){ document.querySelectorAll('#tk-q button').forEach(function(b){ b.classList.toggle('on', b === t); }); return; }
  if(act === 'tk-day'){ t.classList.toggle('on'); return; }
  if(act === 'tk-delete'){
    if(!tkArmed){ tkArmed = true; t.textContent = 'Tap again to delete'; t.classList.add('armed'); return; }
    if(m.mode === 'tpl'){ removeTemplate(m.id); } else deleteTask(m.date, m.id);
    closeSheets(); toast('Deleted'); return;
  }
  if(act === 'tk-drop'){ dropTask(m.date, m.id, $('#tk-note') ? $('#tk-note').value.trim() : ''); closeSheets(); toast('Dropped. It stays in the record.'); return; }
  if(act === 'tk-move'){
    var to = t.getAttribute('data-to') || ($('#tk-move-date') ? $('#tk-move-date').value : ''); if(!/^\d{4}-\d{2}-\d{2}$/.test(to)) return;
    if(to < todayKey()){ var mg = $('#tk-msg'); mg.className = 'lf-msg full err'; mg.textContent = 'Pick today or later.'; return; }
    var mv = moveTask(m.date, m.id, to); closeSheets(); if(mv) toast('Moved to ' + fmtWd(to) + ' \u00b7 pushed ' + mv.rolled + (mv.rolled === 1 ? ' time' : ' times')); return;
  }
  if(act === 'tk-undrop'){ undropTask(m.date, m.id); closeSheets(); toast('Back on the list'); return; }
  if(act === 'tk-tpl-pause' || act === 'tk-tpl-resume'){ var tp = (state.settings.taskTemplates || []).filter(function(x){ return x.id === m.id; })[0]; if(tp){ var c = clone(tp); c.paused = act === 'tk-tpl-pause'; saveTemplate(c); } closeSheets(); return; }
}

/* ----- Tasks tab ----- */
function pct(n, d){ return d ? Math.round(n/d*100) + '%' : '–'; }
function dayTally(d){ var doc = state.tasks[d]; if(!doc) return null; var all = doc.items.filter(function(x){ return !x.rolledTo; }), dn = all.filter(function(x){ return x.doneAt; }).length; return {done:dn, total:all.length, sweep:all.length > 0 && dn === all.length}; }
function tasksWeekHTML(){
  var today = todayKey(), mon = tkWeek, days = range7(mon), isThis = mon === mondayOf(today), L = ['M','T','W','T','F','S','S'];
  var wd = 0, wt = 0; days.forEach(function(d){ var t = dayTally(d); if(t){ wd += t.done; wt += t.total; } });
  var h = '<div class="week tk-week"><div class="week-head">' +
    '<button class="arrow" type="button" data-act="tk-week-prev" aria-label="Previous week"><svg viewBox="0 0 24 24">' + ICON.left + '</svg></button>' +
    '<p class="t">' + (isThis ? 'This week' : fmtShort(days[0]) + ' \u2013 ' + fmtShort(days[6])) + '<span>' + (wt ? wd + '/' + wt + ' done' : 'no tasks') + '</span></p>' +
    '<button class="arrow" type="button" data-act="tk-week-next" aria-label="Next week"' + (mon >= addDays(mondayOf(today), 28) ? ' disabled' : '') + '><svg viewBox="0 0 24 24">' + ICON.right + '</svg></button></div><div class="week-grid">';
  days.forEach(function(d, i){
    var t = dayTally(d), fut = d > today;
    var lbl = fmtLong(d) + (t ? ', ' + (fut ? t.total + ' planned' : t.done + ' of ' + t.total + ' done') : '');
    h += '<button type="button" class="wday' + (d === tkSel ? ' is-sel' : '') + (d === today ? ' is-today' : '') + (fut ? ' is-fut' : '') + '" data-act="tk-pick" data-d="' + d + '"' + (d === today ? ' aria-current="date"' : '') + ' aria-label="' + esc(lbl) + '">' +
      '<span class="wl">' + L[i] + '</span>' + miniRing(t, parseKey(d).getDate()) + (fut && t && t.total ? '<span class="wplan">' + t.total + '</span>' : '') + '</button>';
  });
  return h + '</div></div>';
}
export function pickTaskDay(d){ tkSel = d; tkWeek = mondayOf(d); render(); }
export function stepTaskWeek(n){ var today = todayKey(), nw = addDays(tkWeek || mondayOf(today), 7*n); if(nw > addDays(mondayOf(today), 28)) return; tkWeek = nw; tkSel = mondayOf(today) === nw ? today : nw; render(); }
function renderTasks(){
  ensureToday();
  var view = $('#view-tasks'), today = todayKey(), s30 = taskStats(30), s7 = taskStats(7), td = taskDoc(today);
  if(!tkSel || (tkSel === tkDay && tkDay !== today)){ tkSel = today; tkWeek = mondayOf(today); }
  tkDay = today; if(!tkWeek) tkWeek = mondayOf(tkSel);
  var h = tasksWeekHTML() + '<section class="card tasks-card">' + tasksCardHTML(tkSel) + '</section>';
  h += '<section class="card"><p class="eyebrow">Last 30 days · ' + s30.days + (s30.days === 1 ? ' day' : ' days') + ' with tasks</p><div class="tk-tiles">' +
    '<div><b>' + (s30.rate === null ? '–' : s30.rate + '%') + '</b><span>Done rate</span><em>7d ' + (s7.rate === null ? '–' : s7.rate + '%') + '</em></div>' +
    '<div><b>' + (s30.q2share === null ? '–' : s30.q2share + '%') + '</b><span>Q2 share of done</span><em>important, not urgent</em></div>' +
    '<div><b>' + pct(s30.rolled, s30.created + s30.rolled) + '</b><span>Pushed to another day</span><em>' + s30.rolled + ' of ' + (s30.created + s30.rolled) + '</em></div>' +
    '<div><b>' + (s30.estMedian ? Math.round(s30.estMedian*100) + '%' : '–') + '</b><span>Actual vs estimate</span><em>' + s30.estPairs.length + ' timed</em></div>' +
    '<div><b>' + pct(s30.plannedBy, s30.days) + '</b><span>Planned by ' + esc(T().planBy || '07:30') + '</span><em>locked ' + s30.planned + ' of ' + s30.days + '</em></div>' +
    '<div><b>' + pct(s30.closed, s30.days) + '</b><span>Days closed</span><em>' + fmtMin(s30.mins) + ' logged</em></div></div></section>';
  var lanes = Object.keys(s30.lanes).sort(function(a, b){ return s30.lanes[b].done - s30.lanes[a].done; }), maxL = Math.max.apply(null, [1].concat(lanes.map(function(l){ return s30.lanes[l].n; })));
  h += '<section class="card"><p class="eyebrow">By lane · 30 days</p>' + (lanes.length ? '<div class="tk-lanes">' + lanes.map(function(l){ var L = s30.lanes[l]; return '<div class="tk-lrow"><span class="tk-lname">' + esc(l) + '</span><div class="tk-lbar"><span style="width:' + (L.n/maxL*100).toFixed(1) + '%"><i style="width:' + (L.n ? L.done/L.n*100 : 0).toFixed(1) + '%"></i></span></div><span class="tk-lnum">' + L.done + '/' + L.n + (L.mins ? ' · ' + fmtMin(L.mins) : '') + '</span></div>'; }).join('') + '</div>' : '<p class="muted small">No tasks yet.</p>') + '</section>';
  h += '<section class="card"><p class="eyebrow">Quadrants · 30 days, done / added</p><div class="tk-qgrid big">' + TASK_Q.map(function(q){ return '<div class="q' + q.k + '"><b>' + s30.qDone[q.k] + '<small>/' + s30.q[q.k] + '</small></b><span>' + q.n + ' · ' + esc(q.t) + '</span></div>'; }).join('') + '</div>' +
    '<p class="muted small">Blocks: deep work ' + s30.blocks.am + ' · physical ' + s30.blocks.pm + ' · evening ' + s30.blocks.eve + ' done.</p></section>';
  var rz = ['green','yellow','red'].filter(function(z){ return s30.rec[z][1] >= 5; });
  if(rz.length) h += '<section class="card"><p class="eyebrow">Done rate by morning recovery · 30 days</p><div class="tk-tiles three">' + rz.map(function(z){ return '<div class="z-' + z + '"><b>' + pct(s30.rec[z][0], s30.rec[z][1]) + '</b><span>' + z.charAt(0).toUpperCase() + z.slice(1) + ' days</span><em>' + s30.rec[z][1] + ' tasks</em></div>'; }).join('') + '</div></section>';
  if(s30.pushed.length) h += '<section class="card"><p class="eyebrow">Most pushed · still open today</p><ul class="tk-list">' + s30.pushed.map(function(it){ return itemHTML(today, it, today); }).join('') + '</ul><p class="muted small">Pushed 2+ times means do it today, drop it, or admit it isn’t a task.</p></section>';
  var tpls = state.settings.taskTemplates || [];
  h += '<section class="card"><div class="tk-head"><p class="eyebrow">Recurring tasks · ' + tpls.length + '</p><button class="pill-btn" type="button" data-act="tk-tpl-new">Add</button></div>' +
    (tpls.length ? '<ul class="tk-list">' + tpls.map(function(t){ return '<li class="tk' + (t.paused ? ' is-dropped' : '') + '"><span class="tk-check tk-x" aria-hidden="true">↻</span><button class="tk-main" type="button" data-act="tk-tpl-edit" data-id="' + esc(t.id) + '"><span class="tk-title">' + esc(t.title) + (t.paused ? ' (paused)' : '') + '</span><span class="tk-chips"><span class="tk-lane">' + esc(t.lane) + '</span><span class="tk-q q' + t.q + '">Q' + t.q + '</span><span class="tk-blk">' + esc(taskBlock(t.block).n) + '</span><span class="tk-min">' + t.days.map(function(i){ return ['Su','Mo','Tu','We','Th','Fr','Sa'][i]; }).join(' ') + '</span></span></button></li>'; }).join('') + '</ul>' : '<p class="muted small">Things you do on set days (inventory check, invoices, weekly review). They show up on their day by themselves.</p>') + '</section>';
  var hist = Object.keys(state.tasks).filter(function(k){ return k < today; }).sort().reverse().slice(0, 14);
  if(hist.length) h += '<section class="card"><p class="eyebrow">History</p>' + hist.map(function(k){ var doc = state.tasks[k], dn = doc.items.filter(function(x){ return x.doneAt; }).length, n = doc.items.filter(function(x){ return !x.rolledTo; }).length; return '<details class="tk-day"' + (tkHistOpen[k] ? ' open' : '') + ' data-d="' + k + '"><summary><b>' + esc(fmtWd(k)) + '</b><span>' + dn + '/' + n + ' done' + (doc.plannedAt ? ' · planned ' + esc(timeOf(doc.plannedAt)) : '') + (doc.closedAt ? ' · closed' : '') + '</span></summary><ul class="tk-list">' + doc.items.slice().sort(sortOpen).map(function(it){ return itemHTML(k, it, today); }).join('') + '</ul></details>'; }).join('') + '</section>';
  keepTyping(view, function(){ view.innerHTML = h; });
  startTick();
}
registerTab('tasks', renderTasks);
