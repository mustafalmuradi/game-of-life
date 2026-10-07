// Persistence: the localStorage cache, the cloud database sync, the retry queues. The only file that talks to the db.
import { LS_KEY } from './config.js';
import { clone, sleepMs } from './utils.js';
import { isEmptyDay, normalizeDay, normalizeSettings, state } from './state.js';
import { recompute } from './stats.js';
import { toast } from './effects.js';
import { render, renderSync } from './render.js';

/* ---------- persistence ---------- */
export var sync = {lsOK:false, cloud:null, flushedOnce:false, settingsWriting:false, liftOps:{}};
var dirty = new Map(), writing = new Set(), timers = {}, unsynced = new Set();
export function testLS(){ try { localStorage.setItem('__dl','1'); localStorage.removeItem('__dl'); return true; } catch(e){ return false; } }
export function persistLocal(){
  if(!sync.lsOK) return;
  try { localStorage.setItem(LS_KEY, JSON.stringify({v:1, settings:state.settings, days:state.days, unsynced:Array.from(unsynced), lifts:state.lifts.map(cleanLift), liftOps:sync.liftOps, build:state.build})); } catch(e){}
}
export function loadLocal(){
  if(!sync.lsOK) return;
  try {
    var raw = localStorage.getItem(LS_KEY); if(!raw) return;
    var c = JSON.parse(raw);
    if(c.settings) state.settings = normalizeSettings(c.settings);
    if(c.days) Object.keys(c.days).forEach(function(k){ var nd = normalizeDay(c.days[k], k); if(!isEmptyDay(nd)) state.days[k] = nd; });
    (c.unsynced || []).forEach(function(k){ unsynced.add(k); });
    if(Array.isArray(c.lifts)) state.lifts = c.lifts.filter(function(l){ return l && l.id && Array.isArray(l.sets); });
    if(c.liftOps && typeof c.liftOps === 'object') sync.liftOps = c.liftOps;
    if(c.build && typeof c.build === 'object') ['bnodes','bships','bskills'].forEach(function(k){ if(Array.isArray(c.build[k])) state.build[k] = c.build[k].filter(function(x){ return x && x.id; }); });
  } catch(e){}
}

export function connectCloud(){
  if(!(window.claude && typeof window.claude.use === 'function')) return;
  Promise.all([window.claude.use('db'), window.claude.use('user')]).then(function(r){
    var db = r[0], user = r[1];
    if(!db || !user) return;
    return user.id().then(function(id){
      if(!id) return;
      var settingsRef, daysCol;
      try { settingsRef = db.doc('data/users/' + id + '/tracker'); daysCol = settingsRef.collection('days'); } catch(e){ return; }
      sync.cloud = {settingsRef:settingsRef, daysCol:daysCol};
      state.mode = 'cloud';
      renderSync();
      var liftsCol = settingsRef.collection('lifts');
      sync.cloud.liftsCol = liftsCol;
      ['bnodes','bships','bskills'].forEach(function(cn){
        var col = settingsRef.collection(cn); sync.cloud[cn] = col;
        col.onSnapshot(function(snap){
          if(snap.metadata.fromCache && snap.empty) return;
          state.build[cn] = snap.docs.map(function(doc){ return Object.assign({id:doc.id}, doc.data()); });
          persistLocal(); if(state.tab === 'build') render();
        }, onCloudError);
      });
      var liftsFlushed = false;
      liftsCol.onSnapshot(function(snap){
        if(snap.metadata.fromCache && snap.empty) return;
        var local = {}; state.lifts.forEach(function(l){ local[l.id] = l; });
        var next = [];
        snap.docs.forEach(function(doc){ if(sync.liftOps[doc.id]) return; var d = doc.data(); if(d && Array.isArray(d.sets)) next.push(Object.assign({id:doc.id}, d)); });
        Object.keys(sync.liftOps).forEach(function(id){ if(sync.liftOps[id] === 'set' && local[id]) next.push(local[id]); });
        state.lifts = next;
        if(!snap.metadata.fromCache && !liftsFlushed){ liftsFlushed = true; flushLiftOps(); }
        persistLocal(); recompute(); render();
      }, onCloudError);
      settingsRef.onSnapshot(function(snap){
        if(sync.settingsWriting) return;
        if(snap.exists){
          var d = snap.data();
          if(d && Array.isArray(d.habits) && d.habits.length){ state.settings = normalizeSettings(d); persistLocal(); recompute(); render(); }
        }
      }, onCloudError);
      daysCol.onSnapshot(function(snap){
        if(snap.metadata.fromCache && snap.empty) return;
        var next = {};
        snap.docs.forEach(function(doc){ var d = doc.data(); if(d){ var nd = normalizeDay(d, doc.id); if(!isEmptyDay(nd)) next[doc.id] = nd; } });
        var keep = Array.from(dirty.keys()).concat(Array.from(unsynced));
        keep.forEach(function(k){ if(state.days[k]) next[k] = state.days[k]; else delete next[k]; });
        state.days = next;
        if(!snap.metadata.fromCache && !sync.flushedOnce){ sync.flushedOnce = true; flushUnsynced(); }
        persistLocal(); recompute(); render();
      }, onCloudError);
    });
  }).catch(function(){});
}
function onCloudError(e){
  if(e && (e.code === 'revoked' || e.code === 'not_granted' || e.code === 'capability_disabled' || e.code === 'capability_removed')){
    sync.cloud = null; state.mode = sync.lsOK ? 'local' : 'memory'; renderSync();
  }
}
function cleanLift(l){ var o = {}; Object.keys(l).forEach(function(k){ if(k.charAt(0) !== '_') o[k] = l[k]; }); return o; }
export function flushLiftOps(){
  if(!sync.cloud || !sync.cloud.liftsCol) return;
  Object.keys(sync.liftOps).forEach(function(id){
    var op = sync.liftOps[id], lift = state.lifts.filter(function(l){ return l.id === id; })[0];
    var ref = sync.cloud.liftsCol.doc(id), body;
    if(op === 'set'){ if(!lift){ delete sync.liftOps[id]; return; } body = cleanLift(lift); delete body.id; }
    (op === 'delete' ? ref.delete() : ref.set(body)).then(function(){
      if(sync.liftOps[id] === op) delete sync.liftOps[id];
      persistLocal();
    }).catch(function(e){
      toast(e && e.code === 'quota_exceeded' ? 'Your log is full. Tell Claude so it can archive old entries.' : 'Couldn\u2019t reach your account. The lift is saved on this device and will retry.');
    });
  });
}
export function flushUnsynced(){
  flushLiftOps();
  if(!sync.cloud) return;
  Array.from(unsynced).forEach(function(k){ dirty.set(k, (dirty.get(k)||0)+1); flush(k); });
}
export function scheduleSave(date){
  if(!sync.cloud){ unsynced.add(date); persistLocal(); return; }
  dirty.set(date, (dirty.get(date)||0)+1);
  persistLocal();
  clearTimeout(timers[date]);
  timers[date] = setTimeout(function(){ flush(date); }, 400);
}
function writeDay(date){
  var ref = sync.cloud.daysCol.doc(date);
  var doc = state.days[date];
  if(!doc || isEmptyDay(doc)) return ref.delete();
  var body = clone(doc); body.updatedAt = Date.now();
  return ref.set(body);
}
export function flush(date){
  if(!sync.cloud || writing.has(date)) return;
  writing.add(date);
  var v = dirty.get(date);
  writeDay(date).catch(function(e){
    if(e && e.code === 'unavailable') return sleepMs(700 + Math.random()*900).then(function(){ return writeDay(date); });
    throw e;
  }).then(function(){
    unsynced.delete(date);
  }).catch(function(e){
    unsynced.add(date);
    if(e && e.code === 'quota_exceeded') toast('Your log is full. Tell Claude so it can archive old days.');
    else toast('Couldn’t reach your account. Saved on this device and will retry.');
  }).then(function(){
    writing.delete(date);
    if(dirty.get(date) !== v && !unsynced.has(date)) flush(date);
    else dirty.delete(date);
    persistLocal();
  });
}
export function saveSettings(){
  persistLocal();
  if(!sync.cloud) return Promise.resolve(true);
  sync.settingsWriting = true;
  return sync.cloud.settingsRef.set(clone(state.settings)).then(function(){ return true; }).catch(function(){
    toast('Couldn’t save habits to your account. They’re saved on this device.'); return false;
  }).then(function(r){ sync.settingsWriting = false; return r; });
}

