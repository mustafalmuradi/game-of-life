// Regression: a device whose localStorage cache is days old must not roll its stale "open" tasks into today
// and overwrite the real cloud docs. (Happened on 2026-10-21: a Mac browser with an Oct 19 cache replayed over Oct 19-21.)
// Run: node test/stale-cache.mjs [--old legacy | --new src]   (default: both)
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAKE = fs.readFileSync(path.join(ROOT, 'test/fake-runtime.js'), 'utf8');
const LS_KEY = 'dojo-log-v1';
const TODAY = '2026-10-21', YDAY = '2026-10-19';
const BASE = 'data/users/u_test/tracker';

function item(id, title, extra) {
  return Object.assign({ id, title, lane: 'Ock Spot', q: 2, block: 'am', est: null, actual: null, link: null, note: '', src: 'page', tpl: null, origin: YDAY, rolled: 0,
    createdAt: 1760000000000, doneAt: null, droppedAt: null, dropWhy: null, rolledTo: null, startedAt: null, updatedAt: null, sortedBy: null, timer: { on: null, ms: 0, log: [] } }, extra || {});
}
// Real cloud: yesterday's two tasks were handled (one done, one moved); today already has its own task.
const cloud = {};
cloud[BASE] = { habits: [{ id: 'read', n: 'Read', xp: 10 }], taskTemplates: [] };
cloud[BASE + '/tasks/' + YDAY] = { date: YDAY, schema: 1, items: [item('a1', 'Open the store', { doneAt: 1760900000000 }), item('a2', 'Call the ERP guy', { rolledTo: '2026-10-23' })] };
cloud[BASE + '/tasks/' + TODAY] = { date: TODAY, schema: 1, items: [item('c1', 'Visit Cindy', { origin: TODAY })] };
// Stale device cache: the same two tasks, still open; today does not exist yet.
const stale = { v: 1, settings: cloud[BASE], days: {}, unsynced: [], lifts: [], liftOps: {}, build: { bnodes: [], bships: [], bskills: [] }, notes: [], tasks: {} };
stale.tasks[YDAY] = { date: YDAY, schema: 1, items: [item('a1', 'Open the store'), item('a2', 'Call the ERP guy')] };

function serve(dir) {
  return new Promise((res) => {
    const srv = http.createServer((req, r) => {
      const p = path.join(dir, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html');
      fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : 'text/html' }); r.end(b); });
    }).listen(0, () => res(srv));
  });
}

async function run(variant) {
  const dir = path.join(ROOT, variant);
  const srv = await serve(dir); const port = srv.address().port;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(({ src, cfg, key, cache }) => {
    try { localStorage.setItem(key, JSON.stringify(cache)); } catch (e) { }
    const d = new Date('2026-10-21T20:26:00-04:00').getTime(); const Real = Date;
    class Fake extends Real { constructor(...a) { super(...(a.length ? a : [d])); } static now() { return d; } }
    window.Date = Fake;
    window.__fakeCfg = cfg; (0, eval)(src);
  }, { src: FAKE, cfg: { seed: 1, cloud, script: [] }, key: LS_KEY, cache: stale });
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const log = window.__fake.log.filter((x) => x.op === 'set' || x.op === 'delete').filter((x) => x.path.indexOf('/tasks/') > 0);
    const ls = JSON.parse(localStorage.getItem('dojo-log-v1') || '{}');
    return { taskWrites: log.map((x) => x.op + ' ' + x.path), today: (ls.tasks && ls.tasks['2026-10-21'] || { items: [] }).items.map((i) => i.title + ':' + i.src), yday: (ls.tasks && ls.tasks['2026-10-19'] || { items: [] }).items.map((i) => i.title + ':' + (i.doneAt ? 'done' : i.rolledTo ? 'to ' + i.rolledTo : 'open')) };
  });
  await b.close(); srv.close();
  const fails = [];
  if (errs.length) fails.push('page errors: ' + errs.join(' | '));
  if (r.taskWrites.length) fails.push('wrote task docs on load: ' + r.taskWrites.join(', '));
  if (r.today.join(',') !== 'Visit Cindy:page') fails.push('today is not the cloud doc: ' + JSON.stringify(r.today));
  if (r.yday.join(',') !== 'Open the store:done,Call the ERP guy:to 2026-10-23') fails.push('yesterday is not the cloud doc: ' + JSON.stringify(r.yday));
  console.log(`${variant}: ${fails.length ? 'FAIL' : 'ok'}${fails.length ? '\n  ' + fails.join('\n  ') : ''}`);
  return fails.length === 0;
}

const args = process.argv.slice(2);
const variants = args.includes('--old') ? ['legacy'] : args.includes('--new') ? ['src'] : ['legacy', 'src'];
let ok = true; for (const v of variants) ok = (await run(v)) && ok;
process.exit(ok ? 0 : 1);
