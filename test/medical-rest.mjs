// Unit check: Medical Rest (Nov 9 2026). Train only, set by Claude/Coach only. A day marked rest.workout = 'medical'
// holds the streak and the sweep, pays 0 XP, does not spend a weekly rest, and is capped at medicalPer30 (3) in any
// rolling 30 days; a 4th inside the window breaks the day. Also checks the Coach tool's guards.
// Runs the real stats engine in Node with stubbed browser globals. Run: node test/medical-rest.mjs
globalThis.window = globalThis; globalThis.localStorage = { getItem(){ return null; }, setItem(){}, removeItem(){} };
globalThis.document = { querySelector(){ return null; }, querySelectorAll(){ return []; }, getElementById(){ return null; }, addEventListener(){}, documentElement:{ setAttribute(){}, removeAttribute(){}, style:{ setProperty(){} } } };
globalThis.matchMedia = () => ({ matches:false, addEventListener(){} });
const st = await import('../src/js/core/state.js');
const stats = await import('../src/js/core/stats.js');
const { addDays, mondayOf, todayKey } = await import('../src/js/core/utils.js');

const fails = [];
const mon = addDays(mondayOf(todayKey()), -21); // three full past weeks
const train = { id:'workout', name:'Train', target:'Lift', color:'workout', since:'2000-01-01', pauses:[], restPerWeek:2, lightPerWeek:1, maxPerWeek:5, restFull:true, restFullMax:1 };
st.state.settings = st.normalizeSettings({ version:1, habits:[train], targets:{} });
if (st.state.settings.habits[0].medicalPer30 !== 3) fails.push('Train should get medicalPer30 = 3 by default, got ' + st.state.settings.habits[0].medicalPer30);
const other = st.normalizeSettings({ version:1, habits:[{ id:'read', name:'Read', since:'2000-01-01' }], targets:{} }).habits[0];
if (other.medicalPer30) fails.push('Other habits should have no Medical Rest');

// week 1: rest + light + medical + 4 done: the medical day must NOT use one of the 2 weekly rests
const plan = ['done','rest','light','med','done','done','done',  'done','med','done','med','done','done','rest',  'done','done','done','done','done','done','done'];
function load(p){ st.state.days = {}; p.forEach((x, i) => { const d = addDays(mon, i), doc = { date:d, done:{}, extras:{}, rest:{} };
  if (x === 'done') doc.done.workout = 1; else if (x === 'rest') doc.rest.workout = 1; else if (x === 'light') doc.rest.workout = 'light'; else if (x === 'med') { doc.rest.workout = 'medical'; doc.m = { medical:{ why:'quad strain, limping', at:1, by:'coach' } }; }
  st.state.days[d] = st.normalizeDay(doc, d); }); stats.recompute(); return st.state.stats; }
let s = load(plan);
const bd = (i) => s.byDate[addDays(mon, i)];
if (!plan.every((p, i) => bd(i).sweep)) fails.push('every day should be a clean sweep (3 medical days in the window are allowed)');
if (bd(3).base !== 0 || !(bd(3).medical || []).includes('workout')) fails.push('medical day pays 0 XP and is listed in byDate.medical, got base ' + bd(3).base);
if (!(bd(1).full || []).includes('workout')) fails.push('the full rest the same week should still pay (medical did not use it)');
if (s.habits.workout.heldBest < plan.length) fails.push('held streak should cover all ' + plan.length + ' days, best ' + s.habits.workout.heldBest);
if (s.habits.workout.medical !== 3) fails.push('3 medical days should be counted, got ' + s.habits.workout.medical);
if (s.restUsed['workout|' + mon] !== 2) fails.push('week 1 should show 2 rests used (rest + light), got ' + s.restUsed['workout|' + mon]);

// a 4th medical inside 30 days breaks the day (cap), even with a weekly rest unused
const p4 = plan.slice(); p4[16] = 'med';
s = load(p4);
if (s.byDate[addDays(mon, 16)].sweep) fails.push('a 4th Medical Rest inside 30 days must not hold the day');

// medicalLeft (what the Coach checks): 3 used in the window -> 0 left; outside the window they free up
s = load(plan);
const h = st.state.settings.habits[0];
if (st.medicalLeft(h, addDays(mon, 16)) !== 0) fails.push('medicalLeft should be 0 with 3 in the window, got ' + st.medicalLeft(h, addDays(mon, 16)));
if (st.medicalLeft(h, addDays(mon, 3 + 30 + 10)) !== 3) fails.push('40+ days later all 3 should be free again');

// Coach guards: Train only, needs a reason, refuses past the cap; writes rest + reason; undone clears both
// the Coach tool renders after writing: give the DOM stub a forgiving element so render() is a no-op in Node
const el = new Proxy(function(){}, { get:(t, k) => k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : k === 'textContent' || k === 'innerHTML' || k === 'value' ? '' : el, set:() => true, apply:() => el });
document.querySelector = () => el; document.getElementById = () => el; document.querySelectorAll = () => []; document.createElement = () => el; document.body = el;
const coach = await import('../src/js/features/coach.js');
const tool = coach.coachToolForTest('set_habit');
const today = todayKey();
st.state.days = {}; stats.recompute();
const tryRun = (inp) => { try { tool.run(inp); return null; } catch (e) { return String(e.message || e); } };
if (!tryRun({ date:today, habit:'read', status:'medical', why:'hurt' })) fails.push('Coach must refuse Medical Rest on a habit other than Train');
st.state.settings = st.normalizeSettings({ version:1, habits:[train, { id:'read', name:'Read', since:'2000-01-01' }], targets:{} });
if (!tryRun({ date:today, habit:'workout', status:'medical' })) fails.push('Coach must refuse Medical Rest without a reason');
const err = tryRun({ date:today, habit:'workout', status:'medical', why:'quad tightness, limping, sharp pain bearing weight' });
if (err) fails.push('Coach should set Medical Rest on Train with a reason, got: ' + err);
const doc = st.state.days[today];
if (!doc || doc.rest.workout !== 'medical' || !(doc.m && doc.m.medical && /quad/.test(doc.m.medical.why))) fails.push('Coach should write rest.workout = medical and m.medical.why');
if (!(st.state.stats.byDate[today].medical || []).includes('workout')) fails.push('today should count as a Medical Rest in stats');
tryRun({ date:today, habit:'workout', status:'undone' });
const doc2 = st.state.days[today];
if (doc2 && ((doc2.rest && doc2.rest.workout) || (doc2.m && doc2.m.medical))) fails.push('undone should clear the Medical Rest and its reason');
// cap: 3 already inside the window -> refused
st.state.days = {}; [3, 10, 20].forEach((n) => { const d = addDays(today, -n); st.state.days[d] = st.normalizeDay({ date:d, rest:{ workout:'medical' }, m:{ medical:{ why:'x' } } }, d); }); stats.recompute();
if (!tryRun({ date:today, habit:'workout', status:'medical', why:'another injury here' })) fails.push('Coach must refuse a 4th Medical Rest inside 30 days');
console.log(fails.length ? 'medical-rest: FAIL\n  ' + fails.join('\n  ') : 'medical-rest: ok');
process.exit(fails.length ? 1 : 0);
