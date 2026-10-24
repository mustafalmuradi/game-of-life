// Theme: the page follows the sun by default (light from sunrise to Maghrib, dark from Maghrib to sunrise, from the
// same prayer-time engine), with a manual override kept on this device: auto, light, dark, or the system setting.
// The stylesheets already honour data-theme on <html>; this file only decides what it should be.
import { $, todayKey } from '../core/utils.js';
import { salahTimes } from '../core/salah.js';
import { salahCfg } from './salah.js';

var KEY = 'gol-theme', MODES = ['auto', 'light', 'dark', 'system'];
export var THEME_LABELS = {auto:'Auto · sun', light:'Light', dark:'Dark', system:'System'};
export function themePref(){ var v = null; try { v = localStorage.getItem(KEY); } catch(e){} return MODES.indexOf(v) >= 0 ? v : 'auto'; }
export function setThemePref(v){ if(MODES.indexOf(v) < 0) return; try { localStorage.setItem(KEY, v); } catch(e){} applyTheme(); renderThemeRow(); }
/* daylight = from sunrise to Maghrib on the device's date */
export function isDaylight(){
  var n = new Date(), min = n.getHours()*60 + n.getMinutes(), t = salahTimes(todayKey(), salahCfg());
  return min >= t.sunrise && min < t.maghrib;
}
export function applyTheme(){
  var pref = themePref(), root = document.documentElement;
  var mode = pref === 'auto' ? (isDaylight() ? 'light' : 'dark') : pref === 'system' ? null : pref;
  if(mode) root.setAttribute('data-theme', mode); else root.removeAttribute('data-theme');
  root.setAttribute('data-theme-pref', pref);
}
export function renderThemeRow(){
  var el = $('#theme-row'); if(!el) return;
  var pref = themePref();
  el.innerHTML = '<div><b>Theme</b><small>' + (pref === 'auto' ? 'Follows the sun: light from sunrise to Maghrib, dark after.' : pref === 'system' ? 'Follows this device’s setting.' : 'Always ' + pref + ' on this device.') + '</small></div>' +
    '<div class="theme-picks" role="group" aria-label="Theme">' + MODES.map(function(m){ return '<button type="button" class="gchip" data-act="theme" data-v="' + m + '" aria-pressed="' + (m === pref) + '">' + THEME_LABELS[m] + '</button>'; }).join('') + '</div>';
}
/* every 30 s with the other tickers: the sun moves, the theme follows */
export function themeTick(){ if(themePref() === 'auto') applyTheme(); }
