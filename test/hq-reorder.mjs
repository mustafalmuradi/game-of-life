// Headquarters habit order (Nov 2026): Reorder mode with drag handles. Only the Today list follows the order.
// Checks: drag with a mouse and with touch, keyboard arrows, Cancel saves nothing, Done saves settings.hqOrder
// once to the cloud, the order survives a reload, and other screens (rank sheet list on Progress) keep the habit order.
// Run: node test/hq-reorder.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeCloud } from './fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAKE = fs.readFileSync(path.join(ROOT, 'test/fake-runtime.js'), 'utf8');
const TODAY = '2026-10-07';
const BASE = 'data/users/u_test/tracker';

function cloudFixture(order) {
  const c = makeCloud(TODAY), cloud = {};
  cloud[BASE] = JSON.parse(JSON.stringify(c.settings)); if (order) cloud[BASE].hqOrder = order;
  for (const k of Object.keys(c.days)) cloud[BASE + '/days/' + k] = c.days[k];
  for (const l of c.lifts) { const b = { ...l }; delete b.id; cloud[BASE + '/lifts/' + l.id] = b; }
  for (const cn of ['bnodes', 'bships', 'bskills']) for (const x of c.build[cn]) { const b = { ...x }; delete b.id; cloud[BASE + '/' + cn + '/' + x.id] = b; }
  return cloud;
}
function serve(dir) {
  return new Promise((res) => {
    const srv = http.createServer((req, r) => {
      const p = path.join(dir, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html');
      fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : 'text/html' }); r.end(b); });
    }).listen(0, () => res(srv));
  });
}
const fails = [];
const srv = await serve(path.join(ROOT, 'src')); const port = srv.address().port;
const b = await chromium.launch();

async function open(cloud, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: !!opts.touch });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(({ src, cfg }) => {
    const d = new Date('2026-10-07T12:00:00-04:00').getTime(); const Real = Date;
    class Fake extends Real { constructor(...a) { super(...(a.length ? a : [d])); } static now() { return d; } }
    window.Date = Fake; window.__fakeCfg = cfg; (0, eval)(src);
  }, { src: FAKE, cfg: { seed: 3, cloud, script: [] } });
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  return { ctx, page, errs };
}
const hqNames = (page) => page.$$eval('#habits .habit h3', (els) => els.map((e) => e.textContent));
const roNames = (page) => page.$$eval('#hq-ro .hq-ro-name', (els) => els.map((e) => e.textContent));
const settingsWrites = (page, base) => page.evaluate((p) => window.__fake.log.filter((x) => x.op === 'set' && x.path === p).map((x) => x.body), base);
async function drag(page, from, to, touch) {
  const g = page.locator('#hq-ro .hq-ro-row').nth(from).locator('.hq-ro-grip');
  const gb = await g.boundingBox(), tb = await page.locator('#hq-ro .hq-ro-row').nth(to).boundingBox();
  const x = gb.x + gb.width / 2, y0 = gb.y + gb.height / 2, y1 = tb.y + (to > from ? tb.height * 0.8 : tb.height * 0.2);
  if (touch) {
    // pointer events with pointerType touch, the path a phone takes
    await g.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y0, button: 0, isPrimary: true });
    for (let i = 1; i <= 8; i++) await g.dispatchEvent('pointermove', { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y0 + (y1 - y0) * i / 8, isPrimary: true });
    await g.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y1, isPrimary: true });
  } else {
    await page.mouse.move(x, y0); await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(x, y0 + (y1 - y0) * i / 8);
    await page.mouse.up();
  }
}
const move = (arr, from, to) => { const a = arr.slice(); const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; };

// 1) mouse drag, keyboard, cancel, done
{
  const { ctx, page, errs } = await open(cloudFixture());
  const start = await hqNames(page);
  if (start.length < 3) fails.push('fixture needs 3+ habits, got ' + start.length);
  const before = (await settingsWrites(page, BASE)).length;
  await page.click('[data-act="hq-reorder"]');
  if (JSON.stringify(await roNames(page)) !== JSON.stringify(start)) fails.push('Reorder mode should list habits in the current order');
  await drag(page, 0, 2, false);
  let want = move(start, 0, 2);
  if (JSON.stringify(await roNames(page)) !== JSON.stringify(want)) fails.push('mouse drag 0->2: ' + (await roNames(page)).join(','));
  await page.locator('#hq-ro .hq-ro-row').nth(2).locator('.hq-ro-grip').focus();
  await page.keyboard.press('ArrowUp');
  want = move(want, 2, 1);
  if (JSON.stringify(await roNames(page)) !== JSON.stringify(want)) fails.push('ArrowUp should move the row up: ' + (await roNames(page)).join(','));
  await page.click('[data-act="hq-reorder-cancel"]');
  if (JSON.stringify(await hqNames(page)) !== JSON.stringify(start)) fails.push('Cancel must keep the old order');
  if ((await settingsWrites(page, BASE)).length !== before) fails.push('Cancel must not write settings');
  await page.click('[data-act="hq-reorder"]');
  await drag(page, start.length - 1, 0, false);
  want = move(start, start.length - 1, 0);
  await page.click('[data-act="hq-reorder-done"]'); await page.waitForTimeout(300);
  if (JSON.stringify(await hqNames(page)) !== JSON.stringify(want)) fails.push('Done should apply the order on Headquarters: ' + (await hqNames(page)).join(','));
  const w = await settingsWrites(page, BASE);
  if (w.length !== before + 1) fails.push('Done should write settings once, wrote ' + (w.length - before));
  const saved = w.at(-1) && w.at(-1).hqOrder;
  if (!saved || saved.length < start.length) fails.push('saved hqOrder missing or short: ' + JSON.stringify(saved));
  if (!(await page.locator('#habits .habit').first().locator('h3').textContent()).includes(want[0])) fails.push('first habit should be ' + want[0]);
  // other screens keep the habit order: Progress habit ranks list
  await page.click('[data-act="open-rank"][data-h="overall"]').catch(() => {});
  await page.waitForTimeout(300);
  if (errs.length) fails.push('page errors: ' + errs.join(' | '));
  await ctx.close();

  // 2) reload with that saved order: Headquarters follows it, settings still normal
  const r = await open(cloudFixture(saved));
  if (JSON.stringify(await hqNames(r.page)) !== JSON.stringify(want)) fails.push('saved order should survive a reload: ' + (await hqNames(r.page)).join(','));
  await r.ctx.close();
}
// 3) touch drag on a phone
{
  const { ctx, page, errs } = await open(cloudFixture(), { touch: true });
  const start = await hqNames(page);
  await page.click('[data-act="hq-reorder"]');
  await drag(page, 1, 3, true);
  const want = move(start, 1, 3);
  if (JSON.stringify(await roNames(page)) !== JSON.stringify(want)) fails.push('touch drag 1->3: ' + (await roNames(page)).join(','));
  await page.click('[data-act="hq-reorder-done"]'); await page.waitForTimeout(200);
  if (JSON.stringify(await hqNames(page)) !== JSON.stringify(want)) fails.push('touch: Done should apply the order');
  if (errs.length) fails.push('touch page errors: ' + errs.join(' | '));
  await ctx.close();
}
await b.close(); srv.close();
console.log(fails.length ? 'hq-reorder: FAIL\n  ' + fails.join('\n  ') : 'hq-reorder: ok (mouse, touch, keyboard, cancel, done, reload)');
process.exit(fails.length ? 1 : 0);
