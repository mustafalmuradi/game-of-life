// Gym mode, inside the lift sheet: a rest timer (quick picks 1:30 / 2:00 / 3:00) that chimes and flashes at zero and
// floats as a pill when the sheet is closed, plate math for the loaded weight, and a screen wake lock while a session
// is on (the sheet is open or the timer is running) so the phone doesn't sleep between sets.
import { $, pad } from '../core/utils.js';
import { toast } from '../core/effects.js';

var rest = {end:0, dur:120, pausedLeft:0, tick:null, ctx:null, lock:null, wantLock:false};
export var REST_PICKS = [90, 120, 180];
export var PLATES = [45, 35, 25, 10, 5, 2.5];
function fmtSec(s){ s = Math.max(0, Math.ceil(s)); return Math.floor(s/60) + ':' + pad(s % 60); }

/* ----- rest timer ----- */
export function restStart(sec){
  if(sec) rest.dur = sec;
  rest.end = Date.now() + (rest.pausedLeft || rest.dur)*1000; rest.pausedLeft = 0;
  armAudio(); wakeAcquire();
  clearInterval(rest.tick); rest.tick = setInterval(restFrame, 250);
  renderRest();
}
export function restPause(){ if(!rest.end) return; rest.pausedLeft = Math.max(0, (rest.end - Date.now())/1000); rest.end = 0; clearInterval(rest.tick); renderRest(); }
export function restReset(){ rest.end = 0; rest.pausedLeft = 0; clearInterval(rest.tick); wakeRelease(); renderRest(); }
export function restPick(sec){ rest.dur = sec; if(rest.end || rest.pausedLeft){ rest.pausedLeft = 0; rest.end = Date.now() + sec*1000; } renderRest(); }
/* the big button: idle → start, running → pause, paused → resume */
export function restToggle(){ if(rest.end) restPause(); else restStart(); }
function restFrame(){ if(!rest.end) return; if(rest.end - Date.now() <= 0) restDone(); else renderRest(); }
function restDone(){
  rest.end = 0; rest.pausedLeft = 0; clearInterval(rest.tick);
  chime(); flash();
  if(navigator.vibrate) try { navigator.vibrate([120, 80, 120]); } catch(e){}
  toast('Rest done. Next set.', {label:'Again ' + fmtSec(rest.dur), fn:function(){ restStart(); }});
  if($('#lift-sheet') && $('#lift-sheet').hidden) wakeRelease();
  renderRest();
}
export function restState(){ return rest.end ? {on:true, left:(rest.end - Date.now())/1000, dur:rest.dur} : rest.pausedLeft ? {on:false, paused:true, left:rest.pausedLeft, dur:rest.dur} : {on:false, left:rest.dur, dur:rest.dur}; }
export function renderRest(){
  var s = restState(), time = fmtSec(s.left);
  var big = $('#rest-time'); if(big) big.textContent = time;
  var sub = $('#rest-sub'); if(sub) sub.textContent = s.on ? 'Resting · tap to pause' : s.paused ? 'Paused · tap to resume' : 'Rest timer · tap to start';
  var btn = $('#rest-big'); if(btn){ btn.classList.toggle('on', !!s.on); btn.classList.toggle('paused', !!s.paused); btn.style.setProperty('--p', (s.dur ? Math.max(0, Math.min(1, 1 - s.left/s.dur)) : 0).toFixed(4)); }
  document.querySelectorAll('[data-act="rest-pick"]').forEach(function(b){ b.setAttribute('aria-pressed', String(Number(b.getAttribute('data-s')) === s.dur)); });
  var pill = $('#rest-pill'); if(pill){ var show = (s.on || s.paused) && $('#lift-sheet') && $('#lift-sheet').hidden; pill.hidden = !show; if(show){ pill.querySelector('b').textContent = time; pill.classList.toggle('paused', !!s.paused); } }
}

/* ----- chime + flash ----- */
function armAudio(){
  try {
    var AC = window.AudioContext || window.webkitAudioContext; if(!AC) return;
    if(!rest.ctx) rest.ctx = new AC();
    if(rest.ctx.state === 'suspended') rest.ctx.resume();
  } catch(e){}
}
function chime(){
  try {
    var ctx = rest.ctx; if(!ctx) return;
    var t0 = ctx.currentTime;
    [[880, 0], [1175, 0.18], [1568, 0.36]].forEach(function(n){
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = n[0];
      g.gain.setValueAtTime(0.0001, t0 + n[1]); g.gain.exponentialRampToValueAtTime(0.25, t0 + n[1] + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + n[1] + 0.5);
      o.connect(g); g.connect(ctx.destination); o.start(t0 + n[1]); o.stop(t0 + n[1] + 0.55);
    });
  } catch(e){}
}
function flash(){
  var el = $('#rest-flash'); if(!el) return;
  el.hidden = false; el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  clearTimeout(flash.t); flash.t = setTimeout(function(){ el.hidden = true; el.classList.remove('go'); }, 1600);
}

/* ----- screen wake lock ----- */
function wakeAcquire(){
  rest.wantLock = true;
  if(rest.lock || !navigator.wakeLock || !navigator.wakeLock.request) return;
  try { navigator.wakeLock.request('screen').then(function(l){ rest.lock = l; l.addEventListener('release', function(){ rest.lock = null; }); if(!rest.wantLock) wakeRelease(); }).catch(function(){}); } catch(e){}
}
function wakeRelease(){ rest.wantLock = false; if(rest.lock){ try { rest.lock.release(); } catch(e){} rest.lock = null; } }
/* the sheet opening and closing drives the lock; a running timer keeps it after the sheet closes */
export function gymSheetOpened(){ wakeAcquire(); renderRest(); renderPlates(); }
export function gymSheetClosed(){ if(!rest.end) wakeRelease(); renderRest(); }
export function gymInit(){
  var sheet = $('#lift-sheet'); if(!sheet) return;
  try { new MutationObserver(function(){ if(sheet.hidden) gymSheetClosed(); else gymSheetOpened(); }).observe(sheet, {attributes:true, attributeFilter:['hidden']}); } catch(e){}
  document.addEventListener('visibilitychange', function(){ if(!document.hidden && rest.wantLock && !rest.lock) wakeAcquire(); });
  var w = $('#pl-w'); if(w) w.addEventListener('input', renderPlates);
  var b = $('#pl-bar'); if(b) b.addEventListener('change', renderPlates);
  renderRest();
}

/* ----- plate math: total loaded (his convention: both sides, bar not counted) → plates per side ----- */
export function plateMath(total, bar){
  total = Number(total) || 0; bar = Number(bar) || 0;
  var side = (total - bar)/2, out = [], left = side;
  if(side <= 0) return {side:0, plates:out, odd:0};
  PLATES.forEach(function(p){ while(left >= p - 1e-9){ out.push(p); left -= p; } });
  return {side:side, plates:out, odd:Math.round(left*100)/100};
}
export function renderPlates(){
  var out = $('#pl-out'); if(!out) return;
  var w = $('#pl-w'), bar = $('#pl-bar');
  var total = w && w.value !== '' ? Number(w.value) : heaviestSetWeight();
  if(w && w.value === '' && total) w.placeholder = String(total);
  if(!total){ out.innerHTML = '<span class="muted">Type the total loaded, or fill a set above.</span>'; return; }
  var r = plateMath(total, bar ? bar.value : 0), barLb = bar ? Number(bar.value) : 0;
  if(r.side <= 0){ out.innerHTML = '<span class="muted">' + (barLb ? 'That is the bar alone.' : 'Nothing to load.') + '</span>'; return; }
  var counts = {}; r.plates.forEach(function(p){ counts[p] = (counts[p] || 0) + 1; });
  out.innerHTML = '<span class="pl-side">' + Object.keys(counts).sort(function(a, b){ return b - a; }).map(function(p){ return '<b class="plate p' + String(p).replace('.', '_') + '">' + p + (counts[p] > 1 ? '<small>×' + counts[p] + '</small>' : '') + '</b>'; }).join('') + '</span>' +
    '<span class="pl-note">per side' + (barLb ? ' + ' + barLb + ' lb bar' : '') + ' = ' + total + ' lb' + (r.odd ? ' <em>(' + r.odd + ' lb a side left over: no plate for it)</em>' : '') + '</span>';
}
function heaviestSetWeight(){ var m = 0; document.querySelectorAll('#lf-sets input[id^="lf-w-"]').forEach(function(i){ var v = Number(i.value); if(v > m) m = v; }); return m; }
