// Art: which emblems exist, which one a habit, trophy or lift gets, and the two-layer markup the page animates.
// Every emblem is two images of the same object: a "glass" one (not earned yet) and its "solid" twin (earned).
// Hero emblems (overall rank, power level) loop between the two. Files live in img/art; see docs/ASSETS.md.
import { reduceMotion } from './utils.js';

/* ---------- registry: id -> 1 (128 px only) or 2 (also a 384 px .lg file) ---------- */
var ART = {};
['read','meditate','workout','money','sleep','nicotine','eat','sunnah','dhikr','ice'].forEach(function(k){ ART['habit-' + k] = 1; });
for(var b = 0; b < 5; b++) ART['belt-' + b] = 2;
[['pillars',5],['house',5],['sweep',5],['sweeps',5],['streak',3]].forEach(function(f){ for(var t = 1; t <= f[1]; t++) ART['trophy-' + f[0] + '-' + t] = 2; });
['firstrep','cleansweep','doubleup','lightsout','deepreader','rainmaker','yearone'].forEach(function(k){ ART['badge-' + k] = 1; });
for(var p = 1; p <= 7; p++) ART['power-' + p] = 2;
['band','rope','kettlebell','abwheel','rings','row','plate','machine','bench','cable','curlbar','barbell'].forEach(function(k){ ART['lift-' + k] = 1; });
export var SKIES = ['dawn','day','afternoon','sunset','night'];

/* an image that failed to load (offline copy, a file missing from a publish) is remembered, so the next render
   goes straight to the old look instead of flashing a broken picture */
var failed = {};
export function hasArt(id){ return !!(id && ART[id] && !failed[id]); }
if(typeof document !== 'undefined'){
  document.addEventListener('error', function(e){
    var t = e.target, emb = t && t.tagName === 'IMG' && t.parentNode && t.parentNode.classList && t.parentNode.classList.contains('emb') ? t.parentNode : null;
    if(!emb) return;
    failed[emb.getAttribute('data-emb')] = 1;
    emb.classList.add('emb-fail');
    var host = emb.closest('.has-art'); if(host) host.classList.remove('has-art');
  }, true);
}

/* ---------- the markup ---------- */
/* state: 'glass' (not earned), 'solid' (earned) or 'loop' (hero: glass -> solid -> glass, forever).
   opts.lg: use the 384 px file when the emblem has one.
   opts.pop: it was earned on this render, so the glass-to-solid wave plays once.
   opts.key: what was earned, when one picture stands for several things (every dumbbell lift shares an icon).
   Returns '' when there is no art.

   The page rebuilds its cards on every tap and again when the save comes back from the account, which would
   restart a running animation from zero. So every animation starts where its clock already stands (--emb-at):
   a loop reads the shared 6-second clock, an earned wave remembers when it began and carries on from there
   (.emb-cont marks that second half, so nothing beside it replays).
   The images are small and cached after the first paint, so they decode in step with the render (no blank frame). */
export var LOOP_MS = 6000, POP_MS = 950;
var popAt = {};
export function emblem(id, state, opts){
  if(!hasArt(id)) return '';
  opts = opts || {};
  var sfx = opts.lg && ART[id] === 2 ? '.lg' : '', now = Date.now(), cls = 'emb is-' + state, at = -1;
  if(state === 'solid'){
    var key = opts.key || id;
    if(opts.pop) popAt[key] = now;
    var gone = popAt[key] === undefined ? POP_MS : now - popAt[key];
    if(gone >= 0 && gone < POP_MS && !reduceMotion){ cls += ' emb-pop' + (gone ? ' emb-cont' : ''); at = gone; }
    else delete popAt[key];
  } else if(!reduceMotion) at = now % LOOP_MS;
  return '<span class="' + cls + '" data-emb="' + id + '" aria-hidden="true"' + (at > 0 ? ' style="--emb-at:-' + (at/1000).toFixed(2) + 's"' : '') + '><i class="emb-glow"></i>' +
    '<img class="emb-g" alt="" decoding="sync" src="img/art/' + id + '.g' + sfx + '.webp">' +
    '<img class="emb-s" alt="" decoding="sync" src="img/art/' + id + '.s' + sfx + '.webp"><i class="emb-ring"></i></span>';
}

/* ---------- which emblem ---------- */
/* a habit: by id for the built-in ones, then by name so a habit he adds himself (Dhikr, Ice) still finds its art */
var HABIT_IDS = {read:1, meditate:1, workout:1, money:1, sleep:1, nicotine:1, eat:1, sunnah:1, ice:1, dhikr:1};
var HABIT_WORDS = [['dhikr', /dhikr|zikr|tasbih/], ['ice', /\bice\b|cold (shower|plunge)/], ['sunnah', /sunnah|rawatib/], ['nicotine', /nicotine|vap(e|ing)|smok/],
  ['meditate', /meditat/], ['workout', /\btrain|workout|\bgym\b/], ['sleep', /\bbed\b|sleep/], ['read', /\bread/], ['money', /money|income/], ['eat', /\beat\b|calorie/]];
export function habitArt(h){
  if(!h) return '';
  if(HABIT_IDS[h.id]) return 'habit-' + h.id;
  var n = String(h.name || '').toLowerCase();
  for(var i = 0; i < HABIT_WORDS.length; i++) if(HABIT_WORDS[i][1].test(n)) return 'habit-' + HABIT_WORDS[i][0];
  return '';
}
/* a trophy key from xp.js: 'pillars-3' (family-tier) or 'h:read-2' (a habit's streak cup, shared by every habit) */
export function trophyArt(k){
  var m = /^h:.+-(\d+)$/.exec(k || ''); if(m) return 'trophy-streak-' + m[1];
  return /^[a-z]+-\d+$/.test(k || '') ? 'trophy-' + k : '';
}
export function beltArt(b){ return 'belt-' + b; }
/* power forms: the index into the ladder (0-6), whatever the forms are called */
export function powerArt(i){ return 'power-' + (i + 1); }
/* a lift: the equipment its name points at. Order matters: the first rule that matches wins.
   A dumbbell lift reuses the Train habit's dumbbell, so the two never drift apart. */
var LIFT_RULES = [
  ['band', /\bband\b|ripright/],
  ['rope', /rope|pushdown|triceps?/],
  ['dumbbell', /\bdb\b|dumbbell|bowflex/],
  ['kettlebell', /kettlebell|\bkb\b/],
  ['abwheel', /crunch|leg raise|\babs?\b|plank|captain/],
  ['rings', /back extension|pull-?up|chin-?up|\bdips?\b|push-?up/],
  ['row', /\brow\b|pull-?down/],
  ['plate', /leg press|squat|lunge/],
  ['plate', /(leg curl|leg extension|calf).*plate|plate.*(leg curl|leg extension|calf)/],
  ['machine', /leg curl|leg extension|calf/],
  ['bench', /bench|chest press|incline|decline|shoulder press|overhead press/],
  ['cable', /\bfly\b|\bpec|rear delt|lateral|cable/],
  ['curlbar', /curl/],
  ['barbell', /deadlift|\brdl\b|barbell|clean|snatch/],
  ['machine', /machine|selectorized/]
];
export function liftArt(name){
  var n = String(name || '').toLowerCase();
  for(var i = 0; i < LIFT_RULES.length; i++) if(LIFT_RULES[i][1].test(n)) return LIFT_RULES[i][0] === 'dumbbell' ? 'habit-workout' : 'lift-' + LIFT_RULES[i][0];
  return 'lift-plate';
}
/* the sky behind the Salah card for the prayer window that is open now (index into PRAYERS: fajr, sunrise, dhuhr, asr,
   maghrib, isha; -1 or a "night" window = after Isha, before Fajr) */
export function skyFor(idx, night){
  if(night || idx < 0) return 'night';
  return ['dawn', 'day', 'day', 'afternoon', 'sunset', 'night'][idx] || 'night';
}
