// Unit check: Train's one full rest a week pays full base XP (restFull + restFullMax 1), a second full rest
// that week keeps the streak but pays 0, the light day is untouched, and the next week gets a fresh pass.
// Runs the real stats engine in Node with stubbed browser globals. Run: node test/rest-full.mjs
globalThis.window = globalThis; globalThis.localStorage = { getItem(){ return null; }, setItem(){}, removeItem(){} };
globalThis.document = { querySelector(){ return null; }, querySelectorAll(){ return []; }, getElementById(){ return null; }, addEventListener(){}, documentElement:{ setAttribute(){}, removeAttribute(){}, style:{ setProperty(){} } } };
globalThis.matchMedia = () => ({ matches:false, addEventListener(){} });
const st = await import('../src/js/core/state.js');
const stats = await import('../src/js/core/stats.js');
const { BASE_XP } = await import('../src/js/core/config.js');
const { todayKey, addDays, mondayOf } = await import('../src/js/core/utils.js');

const mon = addDays(mondayOf(todayKey()), -14); // two full past weeks, Monday to Sunday
const habits = [{ id:'workout', name:'Train', target:'Lift', color:'workout', since:'2000-01-01', pauses:[], restPerWeek:3, lightPerWeek:1, maxPerWeek:5, restFull:true, restFullMax:1 }];
st.state.settings = st.normalizeSettings({ version:1, habits, targets:{} });
const plan = ['done','rest','done','rest','light','done','done', 'done','done','rest','done','light','done','done'];
st.state.days = {};
plan.forEach((p, i) => { const d = addDays(mon, i), doc = { date:d, done:{}, extras:{}, rest:{} };
  if (p === 'done') doc.done.workout = 1; else if (p === 'rest') doc.rest.workout = 1; else doc.rest.workout = 'light';
  st.state.days[d] = st.normalizeDay(doc, d); });
stats.recompute();
const s = st.state.stats, fails = [];
const paid = (i) => !!(s.byDate[addDays(mon, i)].full || []).includes('workout');
if (!paid(1)) fails.push('week 1, first full rest should pay');
if (paid(3)) fails.push('week 1, second full rest should NOT pay (cap 1)');
if (!paid(9)) fails.push('week 2, the full rest should pay (new week, new pass)');
if (s.byDate[addDays(mon, 1)].base !== BASE_XP) fails.push('paid rest base should be ' + BASE_XP + ', got ' + s.byDate[addDays(mon, 1)].base);
if (s.byDate[addDays(mon, 3)].base !== 0) fails.push('unpaid rest base should be 0');
if (!plan.every((p, i) => s.byDate[addDays(mon, i)].sweep)) fails.push('every day should still be a clean sweep (rests keep the streak)');
const hs = s.habits.workout; if (hs.heldBest < plan.length) fails.push('held streak should cover all ' + plan.length + ' days, best was ' + hs.heldBest);
// no cap set = every marked full rest pays (Money / Bed on time keep their behaviour)
habits[0].restFullMax = 0; st.state.settings = st.normalizeSettings({ version:1, habits, targets:{} }); stats.recompute();
if (!(st.state.stats.byDate[addDays(mon, 3)].full || []).includes('workout')) fails.push('without a cap, the second rest should pay');
console.log(fails.length ? 'rest-full: FAIL\n  ' + fails.join('\n  ') : 'rest-full: ok');
process.exit(fails.length ? 1 : 0);
