import { twice, answer } from './core/math.js';
var set = function(id, text, cls){ var el = document.getElementById(id); el.textContent = text; el.className = cls; };
set('c-entry', 'OK', 'ok');
set('c-import', twice(answer) === 42 ? 'OK (twice(21) = 42)' : 'FAILED', twice(answer) === 42 ? 'ok' : 'bad');
var cssOn = getComputedStyle(document.getElementById('c-css'), '::after').content;
set('c-css', cssOn && cssOn !== 'none' && cssOn !== 'normal' ? 'OK' : 'FAILED (no ::after content)', cssOn && cssOn !== 'none' && cssOn !== 'normal' ? 'ok' : 'bad');
if (window.claude && typeof window.claude.use === 'function') {
  window.claude.use('user').then(function(u){ set('c-user', u ? 'OK (namespace resolved)' : 'null (no viewer, or not granted)', u ? 'ok' : 'wait'); }).catch(function(e){ set('c-user', 'rejected: ' + (e && e.code), 'bad'); });
} else set('c-user', 'no window.claude in this view', 'wait');
