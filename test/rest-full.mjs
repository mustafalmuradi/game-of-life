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
// light days: LIGHT_XP by default, full base XP with lightFull (Train's light day is programmed rehab), still capped by lightPerWeek
const { LIGHT_XP } = await import('../src/js/core/config.js');
habits[0].restFullMax = 1; habits[0].lightFull = false; st.state.settings = st.normalizeSettings({ version:1, habits, targets:{} }); stats.recompute();
if (st.state.stats.byDate[addDays(mon, 4)].base !== LIGHT_XP) fails.push('light day without lightFull should pay ' + LIGHT_XP);
habits[0].lightFull = true; st.state.settings = st.normalizeSettings({ version:1, habits, targets:{} }); stats.recompute();
if (st.state.stats.byDate[addDays(mon, 4)].base !== BASE_XP) fails.push('light day with lightFull should pay ' + BASE_XP + ', got ' + st.state.stats.byDate[addDays(mon, 4)].base);
if (st.state.stats.byDate[addDays(mon, 11)].base !== BASE_XP) fails.push('week 2 light day with lightFull should pay ' + BASE_XP);
// belt ladder: only unpaid passes shrink it (Train 3 - 1 paid rest - 1 paid light = 1 -> 6 days a week); others unchanged
const xp = await import('../src/js/core/xp.js');
const train = { restPerWeek:3, lightPerWeek:1, restFull:true, restFullMax:1, lightFull:true }, c6 = xp.habitCurve(train);
if (xp.unpaidPasses(train) !== 1 || c6.base !== 51 || c6.step !== 26 || c6.tests[0] !== 12) fails.push('Train ladder should be 6 days a week (51+26, Blue 12 sessions), got ' + JSON.stringify(c6));
const bed = { restPerWeek:2, restFull:true }, money = { restPerWeek:1, restFull:true }, cb = xp.habitCurve(bed), cm = xp.habitCurve(money);
if (cb.base !== 60 || cm.base !== 60 || xp.unpaidPasses(bed) !== 0) fails.push('Bed on time / Money passes all pay, so their ladders are the full 7-day one (60), got ' + cb.base + ', ' + cm.base);
const ice = { restPerWeek:1 }; if (xp.habitCurve(ice).base !== 51) fails.push('an unpaid pass still shrinks the ladder (Ice 6/7 -> 51), got ' + xp.habitCurve(ice).base);
// belt floor: a kept belt holds, XP shown against the next stripe on the new ladder, and real XP takes over once it passes
const low = xp.floorRank(xp.rankInfo(300, 14, 14, c6, 40), 5);
if (low.level !== 5 || !low.floored || low.capped) fails.push('floor should hold Blue (level 5) at 300 XP, got level ' + low.level);
if (low.need <= 300) fails.push('floored bar should point at the next stripe cost on the new ladder, got need ' + low.need);
const high = xp.floorRank(xp.rankInfo(1100, 14, 14, c6, 40), 5);
if (high.floored || high.level < 6) fails.push('once XP passes the floor, the real level should show, got ' + high.level);
// Life happens on Eat enough: 1 declared pass a week keeps streak + sweep at 0 XP; a silent miss still breaks it
const eatH = [{ id:'eat', name:'Eat enough', target:'Cal AI goal', color:'x2', since:'2000-01-01', pauses:[], restPerWeek:1, restManual:true }];
st.state.settings = st.normalizeSettings({ version:1, habits:eatH, targets:{} });
const eplan = ['done','done','pass','done','done','miss','done'];
st.state.days = {}; eplan.forEach((p, i) => { const d = addDays(mon, i), doc = { date:d, done:{}, extras:{}, rest:{} }; if (p === 'done') doc.done.eat = 1; if (p === 'pass') doc.rest.eat = 1; st.state.days[d] = st.normalizeDay(doc, d); });
stats.recompute();
const eb = (i) => st.state.stats.byDate[addDays(mon, i)];
if (!eb(2).sweep || eb(2).base !== 0) fails.push('declared Life happens pass should keep the sweep and pay 0, got sweep ' + eb(2).sweep + ' base ' + eb(2).base);
if (eb(5).sweep) fails.push('an undeclared miss must still break the day (restManual)');
const { restWords } = await import('../src/js/features/today.js').catch(() => ({}));
if (restWords && restWords(st.state.settings.habits[0]).btn !== 'Life happens') fails.push('Eat enough pass button should read Life happens');
console.log(fails.length ? 'rest-full: FAIL\n  ' + fails.join('\n  ') : 'rest-full: ok');
process.exit(fails.length ? 1 : 0);
