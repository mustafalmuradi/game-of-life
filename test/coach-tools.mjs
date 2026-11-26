// Regression: the runtime caps how many tools one Coach call may offer (limits().tools.maxCount). With 20 tools and a
// lower cap, the old plain slice dropped the last four (late_night, tasks, task_templates, salah) on every call, and on
// Nov 25 2026 the Coach told Mustafa "I have no late-night planning tool". Now each call routes: the tools his message
// cues first, then the core, then what the last exchange cues, then the rest by daily use; the Coach is told what was
// left out. Part 1 checks the routing in Node; part 2 drives the real Coach UI on a fake runtime capped at 16.
// Run: node test/coach-tools.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fails = [];

// ---- part 1: routing in Node ----
globalThis.window = globalThis; globalThis.localStorage = { getItem(){ return null; }, setItem(){}, removeItem(){} };
globalThis.document = { querySelector(){ return null; }, querySelectorAll(){ return []; }, getElementById(){ return null; }, addEventListener(){}, createElement(){ return { style:{}, setAttribute(){}, appendChild(){} }; }, documentElement:{ setAttribute(){}, removeAttribute(){}, style:{ setProperty(){} } } };
globalThis.matchMedia = () => ({ matches:false, addEventListener(){} });
const { pickTools } = await import('../src/js/features/coach.js');
const names = (r) => r.tools.map((t) => t.name);
const all = pickTools(99, '', '');
if (all.tools.length !== 20 || all.left.length) fails.push('with room for every tool, all 20 should go and none be left, got ' + all.tools.length + '/' + all.left.length);
const cases = [
  ['Late night tonight, in bed by 11:30 PM. Reason: thanksgiving eve, no work tomorrow', '', 'late_night'],
  ['Add a task: call Adnan tomorrow at 10', '', 'tasks'],
  ['Make "review the P&L" recurring every Monday', '', 'task_templates'],
  ['Prayed all 12 rawatib today', '', 'salah'],
  ['Export my data', '', 'export_data'],
  ['yes', 'Want me to plan the late night for 23:30?', 'late_night'], // a follow-up rides on the last exchange
];
for (const [cur, recent, want] of cases) {
  for (const cap of [16, 8]) {
    const r = pickTools(cap, cur, recent);
    if (r.tools.length !== cap) fails.push('cap ' + cap + ' should offer exactly ' + cap + ' tools, got ' + r.tools.length);
    if (!names(r).includes(want)) fails.push('cap ' + cap + ', "' + cur + '" should load ' + want + ', got ' + names(r).join(' '));
    ['update_day', 'set_habit', 'read_days'].forEach((core) => { if (!names(r).includes(core)) fails.push('cap ' + cap + ' should always keep core ' + core); });
  }
}
const plain = pickTools(16, 'how was my day', '');
if (names(plain).slice(-1)[0] === 'tasks' || !names(plain).includes('tasks') || !names(plain).includes('late_night')) fails.push('with no cue, daily tools (tasks, late night) should outrank rare ones');
if (!plain.left.map((t) => t.name).every((n) => ['rewards', 'navigate', 'data_status', 'export_data'].includes(n))) fails.push('with no cue, only the rare tools should sit out, got ' + plain.left.map((t) => t.name).join(' '));

// ---- part 2: the real Coach UI on a fake runtime capped at 16 tools ----
const FAKE = fs.readFileSync(path.join(ROOT, 'test/fake-runtime.js'), 'utf8');
const BASE = 'data/users/u_test/tracker', TODAY = '2026-11-25';
const habits = [{ id: 'sleep', name: 'Bed on time', target: 'In bed by 9:00 PM', color: 'sleep', since: '2000-01-01', pauses: [] }, { id: 'read', name: 'Read', target: '25 minutes', color: 'read', since: '2000-01-01', pauses: [] }];
function serve(dir) { return new Promise((res) => { const srv = http.createServer((req, r) => { const p = path.join(dir, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : 'text/html' }); r.end(b); }); }).listen(0, () => res(srv)); }); }
async function run(cap, script, messages) {
  const srv = await serve(path.join(ROOT, 'src')), b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', timezoneId: 'America/New_York' });
  const page = await ctx.newPage(), errs = []; page.on('pageerror', (e) => errs.push(e.message));
  const cloud = {}; cloud[BASE] = { version: 1, habits, targets: { bed: '21:00' } };
  await page.addInitScript(({ src, cfg }) => {
    const d = new Date('2026-11-25T19:30:00-05:00').getTime(), Real = Date;
    class Fake extends Real { constructor(...a) { super(...(a.length ? a : [d])); } static now() { return d; } }
    window.Date = Fake; window.__fakeCfg = cfg; (0, eval)(src);
  }, { src: FAKE, cfg: { seed: 1, cloud, script, toolCap: cap, logInput: true } });
  await page.goto(`http://localhost:${srv.address().port}/index.html`); await page.waitForTimeout(800);
  await page.click('#btn-coach'); await page.waitForTimeout(300);
  for (const m of messages) { await page.fill('#ch-in', m); await page.evaluate(() => document.querySelector('#ch-form').requestSubmit()); await page.waitForTimeout(900); }
  const out = await page.evaluate((t) => ({ log: window.__fake.log.filter((x) => x.op === 'sample' || x.op === 'tool' || x.op === 'tool_error'), late: ((JSON.parse(localStorage.getItem('dojo-log-v1') || '{}').days || {})[t] || { m: {} }).m.late || null }), TODAY);
  await b.close(); srv.close(); out.errs = errs; return out;
}
const capped = await run(16, [
  { tools: [{ name: 'late_night', input: { action: 'plan', bed: '23:30', reason: 'Thanksgiving eve, no work tomorrow', xp: 10, verdict: 'Social night out, so 10.' } }], text: 'Planned: in bed by 23:30, +10 XP if you make it.' },
  { text: 'Added.' }
], ['Late night tonight, in bed by 11:30 PM. Reason: Thanksgiving eve, no work tomorrow', 'Add a task: call Adnan tomorrow at 10']);
const calls = capped.log.filter((x) => x.op === 'sample');
if (capped.errs.length) fails.push('page errors: ' + capped.errs.join(' | '));
if (calls.length !== 2) fails.push('expected 2 Coach calls, got ' + calls.length);
else {
  if (calls[0].tools.length !== 16 || !calls[0].tools.includes('late_night')) fails.push('call 1 should offer 16 tools with late_night, got ' + calls[0].tools.length + ': ' + calls[0].tools.join(' '));
  if (!calls[1].tools.includes('tasks')) fails.push('call 2 should offer tasks, got ' + calls[1].tools.join(' '));
  if (!/not loaded for this one: /.test(calls[0].tail || '') || /Late night/.test((calls[0].tail || '').split('not loaded for this one: ')[1] || '')) fails.push('call 1 should tell the Coach what was left out (and late night is not among them), got: ' + (calls[0].tail || '').slice(0, 300));
}
const planned = capped.log.filter((x) => x.op === 'tool' && x.name === 'late_night')[0];
if (!planned || !planned.result || !planned.result.ok) fails.push('late_night plan should run and succeed, got ' + JSON.stringify(capped.log.filter((x) => x.op !== 'sample')));
if (!capped.late || capped.late.bed !== '23:30' || capped.late.xp !== 10) fails.push('Nov 25 should carry the planned late night (23:30, 10 XP), got ' + JSON.stringify(capped.late));

const roomy = await run(20, [{ text: 'ok' }], ['Late night tonight, in bed by 11:30 PM. Reason: test']);
const rc = roomy.log.filter((x) => x.op === 'sample')[0];
if (!rc || rc.tools.length !== 20 || /not loaded/.test(rc.tail || '')) fails.push('with room for all 20, every tool goes and no notice is added, got ' + (rc ? rc.tools.length : 'no call'));

console.log(fails.length ? 'coach-tools: FAIL\n  ' + fails.join('\n  ') : 'coach-tools: ok (routing at caps 16 and 8; real Coach UI plans a late night at cap 16)');
process.exit(fails.length ? 1 : 0);
