// Prayer times, computed on the device: sun position → Fajr, sunrise, Dhuhr, Asr, Maghrib, Isha for a date and place.
// Pure maths (the standard solar equations, as in PrayTimes and adhan); imports nothing above utils. No network, no library.
import { addDays, pad, parseKey } from './utils.js';

/* ---------- method ----------
   ISNA (North America): Fajr and Isha at 15\u00b0 below the horizon, Maghrib at sunset, Dhuhr at solar noon.
   Asr: standard (shadow = object + its noon shadow; Shafi\u02bfi, Maliki, Hanbali) or Hanafi (shadow = 2\u00d7 object + noon shadow). */
export var SALAH_DEFAULTS = {lat:40.5795, lng:-74.1502, fajrAngle:15, ishaAngle:15, asrHanafi:0, place:'Staten Island'};
export var PRAYERS = [
  {k:'fajr', n:'Fajr'}, {k:'sunrise', n:'Shuruq'}, {k:'dhuhr', n:'Dhuhr'}, {k:'asr', n:'Asr'}, {k:'maghrib', n:'Maghrib'}, {k:'isha', n:'Isha'}
];
/* the 12 daily rawatib, as the Sunnah prayers habit counts them */
export var RAWATIB = [
  {k:'fajr', n:'Fajr', r:2, when:'before', p:'fajr'},
  {k:'dhuhr1', n:'Dhuhr', r:4, when:'before', p:'dhuhr'},
  {k:'dhuhr2', n:'Dhuhr', r:2, when:'after', p:'dhuhr'},
  {k:'maghrib', n:'Maghrib', r:2, when:'after', p:'maghrib'},
  {k:'isha', n:'Isha', r:2, when:'after', p:'isha'}
];
export var RAWATIB_TOTAL = 12;

/* ---------- degree trig ---------- */
var DR = Math.PI/180;
function dsin(d){ return Math.sin(d*DR); } function dcos(d){ return Math.cos(d*DR); } function dtan(d){ return Math.tan(d*DR); }
function darcsin(x){ return Math.asin(Math.max(-1, Math.min(1, x)))/DR; }
function darccos(x){ return Math.acos(Math.max(-1, Math.min(1, x)))/DR; }
function darctan2(y, x){ return Math.atan2(y, x)/DR; }
function darccot(x){ return Math.atan(1/x)/DR; }
function fixAngle(a){ a = a - 360*Math.floor(a/360); return a < 0 ? a + 360 : a; }
function fixHour(h){ h = h - 24*Math.floor(h/24); return h < 0 ? h + 24 : h; }

/* Julian day at 0h UT of a civil date */
function julian(y, m, d){ if(m <= 2){ y -= 1; m += 12; } var A = Math.floor(y/100), B = 2 - A + Math.floor(A/4); return Math.floor(365.25*(y + 4716)) + Math.floor(30.6001*(m + 1)) + d + B - 1524.5; }
/* declination (degrees) and equation of time (hours) at a Julian instant */
function sun(jd){
  var D = jd - 2451545.0;
  var g = fixAngle(357.529 + 0.98560028*D), q = fixAngle(280.459 + 0.98564736*D);
  var L = fixAngle(q + 1.915*dsin(g) + 0.020*dsin(2*g)), e = 23.439 - 0.00000036*D;
  var RA = darctan2(dcos(e)*dsin(L), dcos(L))/15;
  return {decl:darcsin(dsin(e)*dsin(L)), eqt:q/15 - fixHour(RA)};
}
/* The six times in local mean solar hours (noon ≈ 12). UTC = solar − lng/15. */
function computeSolar(y, m, d, cfg){
  var lat = cfg.lat, jd = julian(y, m, d) - cfg.lng/(15*24); // so that jd + hours/24 is the UTC instant of a solar time
  function noon(t){ return fixHour(12 - sun(jd + t/24).eqt); }
  function angleTime(angle, t, ccw){
    var s = sun(jd + t/24), h = darccos((-dsin(angle) - dsin(s.decl)*dsin(lat))/(dcos(s.decl)*dcos(lat)))/15;
    return noon(t) + (ccw ? -h : h);
  }
  function asrTime(factor, t){ var s = sun(jd + t/24); return angleTime(-darccot(factor + dtan(Math.abs(lat - s.decl))), t, false); }
  var rise = 0.833, t = {fajr:5, sunrise:6, dhuhr:12, asr:13, maghrib:18, isha:18}; // rough guesses, refined twice
  for(var i=0;i<2;i++){
    t = {fajr:angleTime(cfg.fajrAngle, t.fajr, true), sunrise:angleTime(rise, t.sunrise, true), dhuhr:noon(t.dhuhr),
         asr:asrTime(cfg.asrHanafi ? 2 : 1, t.asr), maghrib:angleTime(rise, t.maghrib, false), isha:angleTime(cfg.ishaAngle, t.isha, false)};
  }
  t.dhuhr += 1/60; // a minute past the zenith: the sun has to have started moving, as the published tables do
  return t;
}

var cache = {};
export function salahConfig(targets){
  var tg = targets || {}, c = {};
  ['lat','lng','fajrAngle','ishaAngle','asrHanafi'].forEach(function(k){ var raw = tg[k], v = raw === null || raw === undefined || raw === '' ? NaN : Number(raw); c[k] = Number.isFinite(v) ? v : SALAH_DEFAULTS[k]; });
  c.place = tg.place ? String(tg.place).slice(0, 40) : SALAH_DEFAULTS.place;
  return c;
}
/* Wall-clock minutes (hours×60 + minutes, rounded to the minute) of each prayer on the date `key`, in the device's
   time zone. Converting through Date makes daylight saving exact for every time. A time that falls on the next civil
   day carries +1440. */
export function salahTimes(key, cfg){
  var ck = key + '|' + cfg.lat + '|' + cfg.lng + '|' + cfg.fajrAngle + '|' + cfg.ishaAngle + '|' + (cfg.asrHanafi ? 1 : 0);
  if(cache[ck]) return cache[ck];
  var p = key.split('-').map(Number), y = p[0], mo = p[1], d = p[2];
  var solar = computeSolar(y, mo, d, cfg), base = new Date(y, mo - 1, d, 0, 0, 0, 0), out = {};
  Object.keys(solar).forEach(function(k){
    var utcMs = Date.UTC(y, mo - 1, d, 0, 0, 0, 0) + (solar[k] - cfg.lng/15)*3600000;
    var dt = new Date(utcMs + 30000); // round to the nearest minute
    var dayDiff = Math.round((new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()) - base)/86400000);
    out[k] = dayDiff*1440 + dt.getHours()*60 + dt.getMinutes();
  });
  if(Object.keys(cache).length > 400) cache = {};
  cache[ck] = out;
  return out;
}
/* Night facts for the night that starts on `key`: the next Fajr (minutes past this midnight, so > 1440),
   Islamic midnight and the start of the last third. */
export function salahNight(key, cfg){
  var t = salahTimes(key, cfg), n = salahTimes(addDays(key, 1), cfg), fajrNext = n.fajr + 1440, night = fajrNext - t.maghrib;
  return {fajrNext:fajrNext, midnight:Math.round(t.maghrib + night/2), lastThird:Math.round(t.maghrib + night*2/3)};
}
/* Where `nowMin` (wall-clock minutes on `key`) sits: cur = the prayer whose time has come, next = the one awaited.
   Before Fajr the current prayer is last night's Isha (night:true); after Isha, next is tomorrow's Fajr (tomorrow:true).
   pct = position on the Fajr\u2192Isha timeline, equal width per window; idx = index into PRAYERS (-1 before Fajr). */
export function salahNow(key, nowMin, cfg){
  var t = salahTimes(key, cfg), list = PRAYERS.map(function(p){ return {k:p.k, n:prayerName(p.k, key), min:t[p.k]}; });
  if(nowMin < t.fajr){
    var y = salahTimes(addDays(key, -1), cfg);
    return {cur:{k:'isha', n:'Isha', min:y.isha - 1440, night:true}, next:list[0], pct:0, idx:-1};
  }
  var idx = 0;
  for(var i=0;i<list.length;i++) if(nowMin >= list[i].min) idx = i;
  if(idx === list.length - 1){
    var n = salahTimes(addDays(key, 1), cfg);
    return {cur:list[idx], next:{k:'fajr', n:'Fajr', min:n.fajr + 1440, tomorrow:true}, pct:100, idx:idx};
  }
  var a = list[idx].min, b = list[idx + 1].min, frac = b > a ? Math.max(0, Math.min(1, (nowMin - a)/(b - a))) : 0;
  return {cur:list[idx], next:list[idx + 1], pct:(idx + frac)/(list.length - 1)*100, idx:idx};
}
export function isFriday(key){ return parseKey(key).getDay() === 5; }
export function prayerName(k, key){ var p = PRAYERS.filter(function(x){ return x.k === k; })[0]; return k === 'dhuhr' && key && isFriday(key) ? 'Jumu\u2019ah' : p ? p.n : k; }
/* 12-hour clock from wall-clock minutes (values past 1440 or below 0 wrap) */
export function fmtMin(min){
  var m = ((Math.round(min) % 1440) + 1440) % 1440, h = Math.floor(m/60), mm = m % 60, h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + ':' + pad(mm) + ' ' + (h < 12 ? 'AM' : 'PM');
}
export function fmtMin24(min){ var m = ((Math.round(min) % 1440) + 1440) % 1440; return pad(Math.floor(m/60)) + ':' + pad(m % 60); }
/* "1h 12m", "42m", "<1m" */
export function fmtLeft(min){ if(!(min >= 1)) return '<1m'; var m = Math.ceil(min), h = Math.floor(m/60), r = m % 60; return h ? h + 'h' + (r ? ' ' + pad(r) + 'm' : '') : r + 'm'; }
