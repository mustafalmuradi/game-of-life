// Unit check: the Headquarters month view (the week strip expands into it). Day numbers are colored by habits missed
// (green = clean sweep, yellow = 1-3 missed, red = 4+), today stays neutral until it is a sweep, Monday-first grid, future days are tappable
// up to the week arrows' reach (planning), days before the first logged day are inert, the arrows stop at the first logged
// month and at the furthest plannable month, and picking a day selects it, moves the week and folds the view back.
// Runs the real stats engine in Node with stubbed browser globals and a frozen clock. Run: node test/month-view.mjs
globalThis.window = globalThis; globalThis.localStorage = { getItem(){ return null; }, setItem(){}, removeItem(){} };
globalThis.document = { querySelector(){ return null; }, querySelectorAll(){ return []; }, getElementById(){ return null; }, addEventListener(){}, documentElement:{ setAttribute(){}, removeAttribute(){}, style:{ setProperty(){} } } };
globalThis.matchMedia = () => ({ matches:false, addEventListener(){} });
const RealDate = Date, NOW = new RealDate(2026, 10, 24, 5, 50).getTime(); // Tue Nov 24 2026, 5:50 AM local
globalThis.Date = class extends RealDate { constructor(...a){ super(...(a.length ? a : [NOW])); } static now(){ return NOW; } };
const st = await import('../src/js/core/state.js');
const stats = await import('../src/js/core/stats.js');
const mv = await import('../src/js/features/month.js');
const fails = [];

const band = (done, total) => mv.dayBand({ done, total, sweep: total > 0 && done === total });
[[10,10,'green'],[9,10,'yellow'],[7,10,'yellow'],[6,10,'red'],[0,10,'red'],[5,5,'green'],[2,5,'yellow'],[1,5,'red'],[0,0,'']].forEach(([d, t, want]) => {
  if (band(d, t) !== want) fails.push('dayBand ' + d + '/' + t + ' should be ' + (want || 'empty') + ', got ' + band(d, t));
});

// five habits; first logged day Oct 31; one task planned on Nov 27
const ids = ['a','b','c','d','e'];
st.state.settings = st.normalizeSettings({ version:1, habits: ids.map((id) => ({ id, name: id.toUpperCase(), target:'x', color:'read', since:'2000-01-01', pauses:[] })), targets:{} });
const plan = { '2026-10-31':5, '2026-11-01':5, '2026-11-02':4, '2026-11-03':3, '2026-11-04':2, '2026-11-05':1 };
st.state.days = {};
Object.keys(plan).forEach((k) => { const doc = { date:k, done:{}, extras:{}, rest:{} }; ids.slice(0, plan[k]).forEach((h) => { doc.done[h] = 1; }); st.state.days[k] = st.normalizeDay(doc, k); });
st.state.tasks = { '2026-11-27': { date:'2026-11-27', schema:1, items:[{ id:'t1', title:'Plan', rolledTo:null, droppedAt:null }] } };
stats.recompute();
st.state.selected = '2026-11-24'; st.state.weekOf = '2026-11-23';

mv.openMonth();
if (!mv.month.open || mv.month.shown !== '2026-11') fails.push('openMonth should open on the selected day\'s month (2026-11), got ' + mv.month.shown);
let html = mv.monthHTML();
const cls = (day) => { const m = html.match(new RegExp('<(?:button|span) [^>]*class="mc-d ([^"]*)"[^>]*>' + day + '</(?:button|span)>')); return m ? m[1] : null; };
const taps = () => (html.match(/data-act="mv-day"/g) || []).length;
if (!/November 2026/.test(html)) fails.push('title should read November 2026');
if ((html.match(/mc-pad/g) || []).length !== 6) fails.push('Nov 1 2026 is a Sunday: a Monday-first grid needs 6 blank cells, got ' + (html.match(/mc-pad/g) || []).length);
// 5 habits: Nov 1 all done, Nov 2-4 miss 1-3, Nov 5 misses 4, Nov 6 has nothing logged; today (Nov 24) is still open
const want = { 1:'b-green', 2:'b-yellow', 3:'b-yellow', 4:'b-yellow', 5:'b-red', 6:'b-red', 24:'is-today is-sel', 25:'is-fut', 27:'is-fut has-plan', 30:'is-fut' };
Object.keys(want).forEach((d) => { if (cls(d) !== want[d]) fails.push('Nov ' + d + ' should be "' + want[d] + '", got "' + cls(d) + '"'); });
if (taps() !== 30) fails.push('every November day is tappable (past to review, future to plan): want 30, got ' + taps());
if (!/aria-current="date"[^>]*>24</.test(html)) fails.push('today should carry aria-current="date"');
if (!/aria-label="Mon, Nov 2: 1 habit missed"/.test(html)) fails.push('day label should read "Mon, Nov 2: 1 habit missed"');
if (!/aria-label="Sun, Nov 1: clean sweep"/.test(html)) fails.push('a sweep should read "clean sweep"');
if (!/aria-label="Tue, Nov 24: 0 of 5 habits so far"/.test(html)) fails.push('today should read "0 of 5 habits so far" while it is open');
if (/b-sweep|mc-sw/.test(html)) fails.push('no gold discs or sweep pill: the color lives on the number');
if (!/aria-label="Fri, Nov 27, 1 planned"/.test(html)) fails.push('a planned future day should say how many tasks are planned');
if (!/<span>1 sweep<\/span>/.test(html)) fails.push('title should count 1 sweep in November');
if (/data-act="mv-prev"[^>]*disabled/.test(html) || /data-act="mv-next"[^>]*disabled/.test(html)) fails.push('both arrows should be open in November (Oct 31 logged, planning reaches Dec 27)');

// forward: December is plannable up to Sunday Dec 27 (the week arrows reach 4 weeks ahead), then the arrow stops
if (!mv.stepMonth(1) || mv.month.shown !== '2026-12') fails.push('next should move to December');
html = mv.monthHTML();
if (cls(27) !== 'is-fut' || cls(28) !== 'is-off') fails.push('Dec 27 should be plannable and Dec 28 out of reach, got ' + cls(27) + ' / ' + cls(28));
if (!/data-act="mv-next"[^>]*disabled/.test(html)) fails.push('next should be disabled in December');
if (!/<span>plan ahead<\/span>/.test(html)) fails.push('a month still ahead should say plan ahead, not count sweeps');
if (mv.stepMonth(1)) fails.push('stepMonth past the plannable month should refuse');

// back: October is the first logged month; Oct 30 is before the first logged day
mv.stepMonth(-1); mv.stepMonth(-1);
html = mv.monthHTML();
if (mv.month.shown !== '2026-10' || cls(30) !== 'is-off' || cls(31) !== 'b-green') fails.push('October: Oct 30 inert, Oct 31 a sweep (green), got ' + mv.month.shown + ' ' + cls(30) + ' / ' + cls(31));
if (!/data-act="mv-prev"[^>]*disabled/.test(html)) fails.push('prev should be disabled in the first logged month');
if (mv.stepMonth(-1)) fails.push('stepMonth before the first logged month should refuse');

// today earns its color: sweep it and the number turns green
{ const doc = { date:'2026-11-24', done:{}, extras:{}, rest:{} }; ids.forEach((h) => { doc.done[h] = 1; }); st.state.days['2026-11-24'] = st.normalizeDay(doc, '2026-11-24'); stats.recompute();
  mv.stepMonth(1); html = mv.monthHTML();
  if (cls(24) !== 'is-today is-sel b-green') fails.push('a swept today should turn green, got "' + cls(24) + '"');
  if (!/<span>2 sweeps<\/span>/.test(html)) fails.push('title should count 2 sweeps once today is swept');
  mv.stepMonth(-1); }

// picking a day selects it, moves the week strip to it and folds the month back
mv.pickDay('2026-10-31');
if (st.state.selected !== '2026-10-31' || st.state.weekOf !== '2026-10-26' || mv.month.open) fails.push('pickDay should select Oct 31, show the week of Oct 26 and close, got ' + st.state.selected + ' ' + st.state.weekOf + ' open=' + mv.month.open);
mv.openMonth();
if (mv.month.shown !== '2026-10') fails.push('reopening should show the selected day\'s month (October), got ' + mv.month.shown);
mv.closeMonth();
if (mv.month.open) fails.push('closeMonth should close');

console.log(fails.length ? 'month-view: FAIL\n  ' + fails.join('\n  ') : 'month-view: ok');
process.exit(fails.length ? 1 : 0);
