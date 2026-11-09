// UI check: a Medical Rest day (rest.workout = 'medical', set by the Coach) shows on Today as "Medical rest · 0 XP"
// with its reason, keeps the Train row checked, has no Undo or Medical button on the page (Coach-only), and the
// streak holds. Run: node test/medical-ui.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAKE = fs.readFileSync(path.join(ROOT, 'test/fake-runtime.js'), 'utf8');
const TODAY = '2026-11-09', BASE = 'data/users/u_test/tracker';
const train = { id:'workout', name:'Train', target:'5 strength + 1 light a week', color:'workout', since:'2000-01-01', pauses:[], restPerWeek:2, maxPerWeek:5, lightPerWeek:1, restFull:true, restFullMax:1 };
const cloud = {};
cloud[BASE] = { version:1, habits:[train, { id:'read', name:'Read', target:'25 minutes', color:'read', since:'2000-01-01', pauses:[] }], targets:{} };
['2026-11-06', '2026-11-07', '2026-11-08'].forEach((d) => { cloud[BASE + '/days/' + d] = { date:d, done:{ workout:1, read:1 }, extras:{}, rest:{} }; });
cloud[BASE + '/days/' + TODAY] = { date:TODAY, done:{ read:1 }, extras:{}, rest:{ workout:'medical' }, m:{ medical:{ why:'quad tightness, limping', at:1, by:'coach' } } };

function serve(dir) {
  return new Promise((res) => {
    const srv = http.createServer((req, r) => {
      const p = path.join(dir, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html');
      fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : 'text/html' }); r.end(b); });
    }).listen(0, () => res(srv));
  });
}

const srv = await serve(path.join(ROOT, 'src')); const port = srv.address().port;
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.addInitScript(({ src, cfg }) => {
  const d = new Date('2026-11-09T10:00:00-05:00').getTime(); const Real = Date;
  class Fake extends Real { constructor(...a) { super(...(a.length ? a : [d])); } static now() { return d; } }
  window.Date = Fake; window.__fakeCfg = cfg; (0, eval)(src);
}, { src: FAKE, cfg: { seed: 1, cloud, script: [] } });
await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
const r = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#view-today article.habit')];
  const t = rows.find((a) => /Train/.test(a.querySelector('h3') ? a.querySelector('h3').textContent : ''));
  return t ? { tag: (t.querySelector('.rest-tag') || {}).textContent || '', target: (t.querySelector('.target') || {}).textContent || '', done: t.classList.contains('is-done'),
    undo: !!t.querySelector('.rest-btn'), restAct: !!t.querySelector('[data-act="rest"]'), medBtn: !!document.querySelector('[data-act="medical"]'), streak: (t.querySelector('.streak') || {}).textContent || '' } : null;
});
await b.close(); srv.close();
const fails = [];
if (errs.length) fails.push('page errors: ' + errs.join(' | '));
if (!r) fails.push('Train row not found on Today');
else {
  if (!/Medical rest/.test(r.tag) || !/0 XP/.test(r.tag)) fails.push('tag should read "Medical rest · 0 XP", got ' + JSON.stringify(r.tag));
  if (!/Medical rest: quad tightness, limping/.test(r.target)) fails.push('target line should carry the reason, got ' + JSON.stringify(r.target));
  if (!r.done) fails.push('Train row should show as held (is-done)');
  if (r.undo || r.restAct) fails.push('no Undo / rest button on a Medical Rest day (Coach-only)');
  if (r.medBtn) fails.push('the page must not have a Medical Rest button');
  if (!/4d/.test(r.streak)) fails.push('streak should hold at 4d (3 trained + today), got ' + JSON.stringify(r.streak));
}
console.log('medical-ui: ' + (fails.length ? 'FAIL\n  ' + fails.join('\n  ') : 'ok'));
process.exit(fails.length ? 1 : 0);
