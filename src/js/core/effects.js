// Floating XP, toasts, confetti, promotion screens.
import { $, cssVar, esc, reduceMotion } from './utils.js';
import { state } from './state.js';
import { beltOf, rankSub, rankTitle, trophySVG } from './xp.js';
import { beltSVG } from './svg.js';

/* ---------- effects ---------- */
export function floatXP(anchor, text){
  var r = anchor.getBoundingClientRect();
  var el = document.createElement('div');
  el.className = 'float-xp'; el.textContent = text;
  el.style.left = (r.left + r.width/2) + 'px'; el.style.top = (r.top + r.height/2) + 'px';
  document.body.appendChild(el);
  setTimeout(function(){ el.remove(); }, 1000);
}
var toastTimer = null;
export function toast(msg, action){
  var host = $('#toast-host');
  host.innerHTML = '';
  var el = document.createElement('div');
  el.className = 'toast'; el.setAttribute('role','status');
  var sp = document.createElement('span'); sp.textContent = msg; el.appendChild(sp);
  if(action){
    var b = document.createElement('button'); b.type = 'button'; b.textContent = action.label;
    b.addEventListener('click', function(){ host.innerHTML = ''; action.fn(); });
    el.appendChild(b);
  }
  host.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ host.innerHTML = ''; }, action ? 5000 : 3200);
}
export function burst(){
  if(reduceMotion) return;
  var ring = $('#score-ring');
  var r = ring && ring.getClientRects().length ? ring.getBoundingClientRect() : {left:innerWidth/2 - 1, top:innerHeight*0.38, width:2, height:2};
  var cx = r.left + r.width/2, cy = r.top + r.height/2;
  var c = $('#fx'), dpr = window.devicePixelRatio || 1;
  c.width = innerWidth*dpr; c.height = innerHeight*dpr;
  var ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
  var cols = state.settings.habits.map(function(h){ return cssVar('--h-' + h.color); }).concat([cssVar('--gold')]);
  var ps = [];
  for(var i=0;i<80;i++){
    var a = Math.random()*Math.PI*2, sp = 3 + Math.random()*6;
    ps.push({x:cx, y:cy, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp - 2, s:3 + Math.random()*4, c:cols[i % cols.length], rot:Math.random()*6, vr:(Math.random()-.5)*.4});
  }
  var t0 = performance.now();
  (function frame(t){
    var k = (t - t0)/1100;
    ctx.clearRect(0,0,innerWidth,innerHeight);
    if(k >= 1){ ctx.clearRect(0,0,innerWidth,innerHeight); return; }
    ps.forEach(function(p){
      p.vy += 0.22; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save(); ctx.globalAlpha = 1 - k; ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.c; ctx.fillRect(-p.s/2, -p.s/2, p.s, p.s*1.6); ctx.restore();
    });
    requestAnimationFrame(frame);
  })(t0);
}
var promoQueue = [];
export function queuePromos(items){ promoQueue = promoQueue.concat(items); if($('#promo').hidden) nextPromo(); }
export function nextPromo(){
  var it = promoQueue.shift(), el = $('#promo');
  if(!it){ el.hidden = true; return; }
  if(it.trophy){
    el.innerHTML = '<div class="promo" role="dialog" aria-modal="true" aria-labelledby="promo-t">' +
      '<p class="eyebrow">' + esc(it.title) + ' · Trophy unlocked</p>' + trophySVG(it.i, true, 'promo-cup') +
      '<h2 id="promo-t">' + esc(it.name) + '</h2>' +
      '<p class="muted">' + esc(it.desc) + ' · <b>+' + it.xp + ' XP</b></p>' +
      (it.note ? '<p class="promo-note">' + esc(it.note) + '</p>' : '') +
      '<button class="primary" type="button" data-act="close-promo">' + (promoQueue.length ? 'Next' : 'Keep going') + '</button></div>';
    el.hidden = false; burst();
    var tb = el.querySelector('button'); if(tb) tb.focus();
    return;
  }
  var L = it.L, r = beltOf(L);
  var isBelt = r.stripes === 0;
  el.innerHTML = '<div class="promo" role="dialog" aria-modal="true" aria-labelledby="promo-t">' +
    '<p class="eyebrow">' + esc(it.title) + ' · ' + (isBelt ? 'Promoted' : (r.b < 4 ? 'Stripe earned' : 'Degree earned')) + '</p>' +
    (it.color ? '<span class="promo-dot" style="background:var(--h-' + it.color + ')"></span>' : '') +
    '<h2 id="promo-t">' + esc(rankTitle(L)) + '</h2>' +
    '<p class="muted">' + esc(rankSub(L)) + ' · Level ' + (L+1) + '</p>' +
    (it.note ? '<p class="promo-note">' + esc(it.note) + '</p>' : '') +
    beltSVG(L) +
    '<button class="primary" type="button" data-act="close-promo">' + (promoQueue.length ? 'Next' : 'Keep going') + '</button></div>';
  el.hidden = false;
  var b = el.querySelector('button'); if(b) b.focus();
}


export function clearPromos(){ promoQueue = []; $('#promo').hidden = true; }
