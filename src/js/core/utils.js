// Small helpers: DOM query, escaping, date keys, formatting, ids.

/* ---------- utils ---------- */
export function $(s){ return document.querySelector(s); }
export function clone(o){ return JSON.parse(JSON.stringify(o)); }
export function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
export function fmt(n){ return Math.round(n).toLocaleString('en-US'); }
export function pad(n){ return String(n).padStart(2,'0'); }
function keyOf(d){ return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
export function parseKey(k){ var p = k.split('-').map(Number); return new Date(p[0], p[1]-1, p[2]); }
export function addDays(k, n){ var d = parseKey(k); d.setDate(d.getDate()+n); return keyOf(d); }
export function todayKey(){ return keyOf(new Date()); }
export function mondayOf(k){ var d = parseKey(k); var dow = (d.getDay()+6)%7; d.setDate(d.getDate()-dow); return keyOf(d); }
export function range7(mon){ var a=[]; for(var i=0;i<7;i++) a.push(addDays(mon,i)); return a; }
export function ord(n){ var s=['th','st','nd','rd'], v=n%100; return n + (s[(v-20)%10] || s[v] || s[0]); }
export function fmtLong(k){ return parseKey(k).toLocaleDateString('en-US',{weekday:'long', month:'short', day:'numeric'}); }
export function fmtShort(k){ return parseKey(k).toLocaleDateString('en-US',{month:'short', day:'numeric'}); }
export function fmtWd(k){ return parseKey(k).toLocaleDateString('en-US',{weekday:'short', month:'short', day:'numeric'}); }
export function hijri(k){ try { return new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn',{day:'numeric', month:'long', year:'numeric'}).format(parseKey(k)); } catch(e){ return ''; } }
export function timeOf(ts){ try { return new Date(ts).toLocaleTimeString('en-US',{hour:'numeric', minute:'2-digit'}); } catch(e){ return ''; } }
export function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
export function sleepMs(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
export function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
export var reduceMotion = false;
try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){}

