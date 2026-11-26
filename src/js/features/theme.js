// Theme: the page follows the sun by default (light from sunrise to Maghrib, dark from Maghrib to sunrise, from the
// same prayer-time engine), with a manual override kept on this device: auto, light, dark, or the system setting.
// On top of that standing setting, the header button flips light and dark for now: the flip lasts until the sun
// next crosses the horizon (sunrise or Maghrib), then the standing setting takes over again.
// The stylesheets already honour data-theme on <html>; this file only decides what it should be.
import { $, addDays, esc, todayKey, timeOf } from '../core/utils.js';
import { salahTimes } from '../core/salah.js';
import { toast } from '../core/effects.js';
import { salahCfg } from './salah.js';

var KEY = 'gol-theme', FLIP = 'gol-theme-flip', MODES = ['auto', 'light', 'dark', 'system'];
export var THEME_LABELS = {auto:'Auto · sun', light:'Light', dark:'Dark', system:'System'};
export function themePref(){ var v = null; try { v = localStorage.getItem(KEY); } catch(e){} return MODES.indexOf(v) >= 0 ? v : 'auto'; }
/* picking a standing setting ends any flip: the newer, explicit choice wins */
export function setThemePref(v){ if(MODES.indexOf(v) < 0) return; try { localStorage.setItem(KEY, v); } catch(e){} writeFlip(null); applyTheme(); renderThemeRow(); }
/* daylight = from sunrise to Maghrib on the device's date */
export function isDaylight(){
  var n = new Date(), min = n.getHours()*60 + n.getMinutes(), t = salahTimes(todayKey(), salahCfg());
  return min >= t.sunrise && min < t.maghrib;
}
function systemDark(){ try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch(e){ return false; } }
/* what the standing setting shows right now, flip aside */
function standing(pref){ return pref === 'auto' ? (isDaylight() ? 'light' : 'dark') : pref === 'system' ? (systemDark() ? 'dark' : 'light') : pref; }

/* ---------- the flip: {mode, until, edge}, kept on this device (and in memory when storage is blocked) ---------- */
var memFlip = null;
function writeFlip(f){
  memFlip = f;
  try { if(f) localStorage.setItem(FLIP, JSON.stringify(f)); else localStorage.removeItem(FLIP); } catch(e){}
}
function readFlip(){
  var raw = null, f = memFlip, now = Date.now();
  try { raw = localStorage.getItem(FLIP); } catch(e){}
  if(raw){ try { f = JSON.parse(raw); } catch(e){ f = raw; } }   // text that is not JSON is "not a flip" below
  if(f && (f.mode === 'light' || f.mode === 'dark') && typeof f.until === 'number' && f.until > now && f.until - now < 36*3600000) return f;
  if(f) writeFlip(null);   // run out, or not a flip at all
  return null;
}
/* the next time the sun crosses the horizon: today's sunrise, today's Maghrib, or tomorrow's sunrise */
export function nextSunEdge(){
  var n = new Date(), y = n.getFullYear(), mo = n.getMonth(), d = n.getDate(), min = n.getHours()*60 + n.getMinutes();
  var key = todayKey(), cfg = salahCfg(), t = salahTimes(key, cfg), name, at;
  if(min < t.sunrise){ name = 'sunrise'; at = new Date(y, mo, d, 0, t.sunrise).getTime(); }
  else if(min < t.maghrib){ name = 'Maghrib'; at = new Date(y, mo, d, 0, t.maghrib).getTime(); }
  else { name = 'sunrise'; at = new Date(y, mo, d + 1, 0, salahTimes(addDays(key, 1), cfg).sunrise).getTime(); }
  if(!(at > n.getTime()) || at - n.getTime() > 36*3600000){ name = ''; at = n.getTime() + 12*3600000; }   // no usable sun times here: half a day
  return {name:name, at:at};
}
function edgeText(f){ return (f.edge ? f.edge + ', ' : '') + timeOf(f.until); }

export function applyTheme(){
  var pref = themePref(), root = document.documentElement, nat = standing(pref), flip = readFlip();
  if(flip && flip.mode === nat){ writeFlip(null); flip = null; }   // the standing setting caught up: nothing left to override
  var mode = flip ? flip.mode : pref === 'system' ? null : nat;
  if(mode) root.setAttribute('data-theme', mode); else root.removeAttribute('data-theme');
  root.setAttribute('data-theme-pref', pref);
  if(flip) root.setAttribute('data-theme-flip', flip.mode); else root.removeAttribute('data-theme-flip');
  var b = $('#btn-theme'); if(b) b.setAttribute('aria-label', 'Switch to ' + ((flip ? flip.mode : nat) === 'dark' ? 'light' : 'dark') + ' mode');
}
/* the header button: show the other one now. Tapping back to what the standing setting shows simply ends the flip. */
export function flipTheme(){
  var pref = themePref(), nat = standing(pref), flip = readFlip(), to = (flip ? flip.mode : nat) === 'dark' ? 'light' : 'dark';
  if(to === nat){ writeFlip(null); applyTheme(); renderThemeRow(); toast('Back to ' + THEME_LABELS[pref]); return; }
  var edge = nextSunEdge(), f = {mode:to, until:edge.at, edge:edge.name};
  writeFlip(f); applyTheme(); renderThemeRow();
  toast((to === 'dark' ? 'Dark' : 'Light') + ' until ' + edgeText(f));
}
export function renderThemeRow(){
  var el = $('#theme-row'); if(!el) return;
  var pref = themePref(), flip = readFlip();
  var line = flip ? (flip.mode === 'dark' ? 'Dark' : 'Light') + ' for now, until ' + edgeText(flip) + '. Then ' + THEME_LABELS[pref] + ' again.' :
    pref === 'auto' ? 'Follows the sun: light from sunrise to Maghrib, dark after.' : pref === 'system' ? 'Follows this device’s setting.' : 'Always ' + pref + ' on this device.';
  el.innerHTML = '<div><b>Theme</b><small>' + esc(line) + '</small></div>' +   // the flip's text comes back from storage: escaped
    '<div class="theme-picks" role="group" aria-label="Theme">' + MODES.map(function(m){ return '<button type="button" class="gchip" data-act="theme" data-v="' + m + '" aria-pressed="' + (m === pref) + '">' + THEME_LABELS[m] + '</button>'; }).join('') + '</div>';
}
/* every 30 s with the other tickers: the sun moves and the theme follows; a flip runs out the same way */
export function themeTick(){
  var had = document.documentElement.hasAttribute('data-theme-flip');
  if(themePref() === 'auto' || had) applyTheme();
  if(had && !document.documentElement.hasAttribute('data-theme-flip')) renderThemeRow();
}
