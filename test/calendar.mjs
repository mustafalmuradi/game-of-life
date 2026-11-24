// Unit check: the Progress month calendar (WHOOP-style). Day colors follow WHOOP's recovery bands on habits done %
// (red <34%, yellow 34-66%, green >66%, gold disc = clean sweep), Monday-first grid, future days and days before the
// first logged day are inert, the arrows stop at the first logged month and at this month, today is ringed.
// Runs the real stats engine in Node with stubbed browser globals and a frozen clock. Run: node test/calendar.mjs
globalThis.window = globalThis; globalThis.localStorage = { getItem(){ return null; }, setItem(){}, removeItem(){} };
globalThis.document = { querySelector(){ return null; }, querySelectorAll(){ return []; }, getElementById(){ return null; }, addEventListener(){}, documentElement:{ setAttribute(){}, removeAttribute(){}, style:{ setProperty(){} } } };
globalThis.matchMedia = () => ({ matches:false, addEventListener(){} });
const RealDate = Date, NOW = new RealDate(2026, 10, 24, 5, 50).getTime(); // Tue Nov 24 2026, 5:50 AM local
globalThis.Date = class extends RealDate { constructor(...a){ super(...(a.length ? a : [NOW])); } static now(){ return NOW; } };
const st = await import('../src/js/core/state.js');
const stats = await import('../src/js/core/stats.js');
const { dayBand, monthCalendarHTML } = await import('../src/js/features/progress.js');
const fails = [];

// bands: done / total, with the sweep flag the stats engine sets when every habit is done or rested
const band = (done, total) => dayBand({ done, total, sweep: total > 0 && done === total });
[[0,5,'red'],[1,5,'red'],[1,3,'red'],[2,5,'yellow'],[3,5,'yellow'],[2,3,'green'],[4,5,'green'],[5,5,'sweep'],[0,0,'']].forEach(([d, t, want]) => {
  if (band(d, t) !== want) fails.push('dayBand ' + d + '/' + t + ' should be ' + (want || 'empty') + ', got ' + band(d, t));
});
if (dayBand(null) !== '') fails.push('no stats for a day should give no band');

// five habits; first logged day Oct 31, so the calendar pages back to October and no further
const ids = ['a','b','c','d','e'];
st.state.settings = st.normalizeSettings({ version:1, habits: ids.map((id) => ({ id, name: id.toUpperCase(), target:'x', color:'read', since:'2000-01-01', pauses:[] })), targets:{} });
const plan = { '2026-10-31':5, '2026-11-01':5, '2026-11-02':4, '2026-11-03':3, '2026-11-04':2, '2026-11-05':1 };
st.state.days = {};
Object.keys(plan).forEach((k) => { const doc = { date:k, done:{}, extras:{}, rest:{} }; ids.slice(0, plan[k]).forEach((h) => { doc.done[h] = 1; }); st.state.days[k] = st.normalizeDay(doc, k); });
stats.recompute();
let html = monthCalendarHTML();
const cls = (day) => { const m = html.match(new RegExp('<(?:button|span) [^>]*class="mc-d ([^"]*)"[^>]*>' + day + '</(?:button|span)>')); return m ? m[1] : null; };
if (!/November 2026/.test(html)) fails.push('should open on this month (November 2026)');
if ((html.match(/mc-pad/g) || []).length !== 6) fails.push('Nov 1 2026 is a Sunday: a Monday-first grid needs 6 blank cells, got ' + (html.match(/mc-pad/g) || []).length);
const want = { 1:'b-sweep', 2:'b-green', 3:'b-yellow', 4:'b-yellow', 5:'b-red', 6:'b-red', 24:'b-red is-today', 25:'is-off', 30:'is-off' };
Object.keys(want).forEach((d) => { if (cls(d) !== want[d]) fails.push('Nov ' + d + ' should be "' + want[d] + '", got "' + cls(d) + '"'); });
if ((html.match(/data-act="mc-day"/g) || []).length !== 24) fails.push('Nov 1-24 should be tappable (24), got ' + (html.match(/data-act="mc-day"/g) || []).length);
if (!/aria-current="date"[^>]*>24</.test(html)) fails.push('today should carry aria-current="date"');
if (/data-act="mc-prev"[^>]*disabled/.test(html)) fails.push('prev should be open: Oct 31 is logged');
if (!/data-act="mc-next"[^>]*disabled/.test(html)) fails.push('next should be disabled on this month');
if (!/1 sweep · /.test(html)) fails.push('summary should count 1 sweep in November (today is not finished), got ' + (html.match(/<span class="muted"[^>]*>([^<]*)</) || [])[1]);
// avg covers finished days only (Nov 1-23): (5+4+3+2+1)/5 = 3 habit-days out of 23 days -> 13%
if (!/· 13% avg/.test(html)) fails.push('average should be 13% over Nov 1-23, got ' + (html.match(/<span class="muted"[^>]*>([^<]*)</) || [])[1]);
if (!/aria-label="Mon, Nov 2: 4 of 5 habits, 80%"/.test(html)) fails.push('day label should read "Mon, Nov 2: 4 of 5 habits, 80%"');

// a first logged day mid-month: earlier days are inert and the prev arrow is shut
st.state.stats.start = '2026-11-03';
html = monthCalendarHTML();
if (cls(1) !== 'is-off' || cls(2) !== 'is-off') fails.push('days before the first logged day should be inert, got ' + cls(1) + ' / ' + cls(2));
if (!/data-act="mc-prev"[^>]*disabled/.test(html)) fails.push('prev should be disabled in the first logged month');

console.log(fails.length ? 'calendar: FAIL\n  ' + fails.join('\n  ') : 'calendar: ok');
process.exit(fails.length ? 1 : 0);
