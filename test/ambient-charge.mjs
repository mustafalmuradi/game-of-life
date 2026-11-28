// Ambient charge (Nov 2026): the backdrop charges up with today's habits, and a habit that lands sends a ring across
// the screen. Checks, with live motion on a phone-sized page:
//   --charge on <html> is today's habits done out of those due, and follows every check and uncheck;
//   the motes and meteors on show are exactly those whose --at the charge has reached (6 and 1 at 0, 16 and 2 at one
//   half, 26 and 5 at 1); the second aurora and the orbit rings follow the charge; a clean sweep turns it gold;
//   a check makes one ring while under two thirds of that day is done and two from there, centred on the habit's own
//   button, gold on the check that completes the day, and gone again within a second and a half; an uncheck makes none;
//   a past day's checks leave today's charge alone; Calm mode hides the backdrop and keeps the ring;
//   reduced motion hides the backdrop and makes no ring.
// Run: node test/ambient-charge.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeCloud } from './fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAKE = fs.readFileSync(path.join(ROOT, 'test/fake-runtime.js'), 'utf8');
const TODAY = '2026-10-07', PAST = '2026-10-05', BASE = 'data/users/u_test/tracker';
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };

function cloudFixture() {
  const c = makeCloud(TODAY), cloud = {};
  cloud[BASE] = JSON.parse(JSON.stringify(c.settings));
  for (const k of Object.keys(c.days)) cloud[BASE + '/days/' + k] = c.days[k];
  for (const l of c.lifts) { const b = { ...l }; delete b.id; cloud[BASE + '/lifts/' + l.id] = b; }
  for (const cn of ['bnodes', 'bships', 'bskills']) for (const x of c.build[cn]) { const b = { ...x }; delete b.id; cloud[BASE + '/' + cn + '/' + x.id] = b; }
  return cloud;
}
const srv = await new Promise((res) => {
  const dir = path.join(ROOT, 'src');
  const s = http.createServer((req, r) => {
    const p = path.join(dir, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html');
    fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); });
  }).listen(0, '127.0.0.1', () => res(s));
});
const browser = await chromium.launch();
const fails = [];
const eq = (what, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(what + ': expected ' + JSON.stringify(want) + ', got ' + JSON.stringify(got)); };
const near = (what, got, want, tol) => { if (!(Math.abs(got - want) <= (tol || 0.002))) fails.push(what + ': expected about ' + want + ', got ' + got); };

async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark', reducedMotion: opts.reduce ? 'reduce' : 'no-preference' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(({ src, cfg, calm }) => {
    const d = new Date('2026-10-07T12:00:00-04:00').getTime(); const Real = Date;
    class Fake extends Real { constructor(...a) { super(...(a.length ? a : [d])); } static now() { return d; } }
    window.Date = Fake;
    try { if (calm) localStorage.setItem('gol-calm', '1'); } catch (e) { }
    window.__fakeCfg = cfg; (0, eval)(src);
  }, { src: FAKE, cfg: { seed: 11, cloud: cloudFixture(), script: [] }, calm: !!opts.calm });
  await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  // the levels are read the moment they change, so their fades are switched off; the ring's animation is left alone
  await page.addStyleTag({ content: '.ki i,.meteors i,.orbit,.ambient::before,.ambient::after{transition:none!important}' });
  return { ctx, page, errs };
}
// what the backdrop shows now, next to what today's numbers say it should show
const read = (page) => page.evaluate(async () => {
  const [{ state }, { todayKey }] = await Promise.all([import('./js/core/state.js'), import('./js/core/utils.js')]);
  const root = document.documentElement, amb = document.querySelector('.ambient'), td = state.stats.byDate[todayKey()] || { done: 0, total: 0 };
  const c = parseFloat(root.style.getPropertyValue('--charge'));
  const shown = (sel) => Array.from(document.querySelectorAll(sel)).filter((e) => getComputedStyle(e).scale !== '0').length;
  const due = (sel) => Array.from(document.querySelectorAll(sel)).filter((e) => (parseFloat(e.style.getPropertyValue('--at')) || 0) <= c + 1e-9).length;
  return {
    charge: root.style.getPropertyValue('--charge'), done: td.done, total: td.total, sweep: root.getAttribute('data-sweep'), ambient: getComputedStyle(amb).display,
    motes: shown('#ki i'), motesDue: due('#ki i'), meteors: shown('#meteors i'), meteorsDue: due('#meteors i'),
    glow: +getComputedStyle(amb, '::before').opacity, gold: +getComputedStyle(amb, '::after').opacity, orbit: +getComputedStyle(document.querySelector('.orbit')).opacity,
    glowMax: +getComputedStyle(root).getPropertyValue('--charge-glow'), goldMax: +getComputedStyle(root).getPropertyValue('--charge-gold'), rings: document.querySelectorAll('.shock').length
  };
});
function agrees(what, s) {   // the backdrop matches the day's own numbers
  near(what + ': charge is done out of due (' + s.done + ' of ' + s.total + ')', parseFloat(s.charge), s.total ? s.done / s.total : 0);
  eq(what + ': motes on show are those the charge has reached', s.motes, s.motesDue);
  eq(what + ': meteors on show are those the charge has reached', s.meteors, s.meteorsDue);
  const c = parseFloat(s.charge), full = s.sweep === '1';
  near(what + ': orbit rings', s.orbit, 0.2 + 0.35 * c);
  near(what + ': second aurora', s.glow, full ? s.glowMax * 0.18 : c * s.glowMax);
  near(what + ': gold aurora', s.gold, full ? s.goldMax : 0);
}
// tap a habit's own button and report the rings that exist straight after, next to the centre of that button
const tapHabit = (page, pick) => page.evaluate((pick) => {
  const all = Array.from(document.querySelectorAll('#habits [data-act="toggle"]'));
  const b = typeof pick === 'string' ? all.filter((x) => x.getAttribute('data-h') === pick)[0] : all.filter((x) => x.getAttribute('aria-pressed') === String(pick))[0];
  if (!b) return null;
  b.scrollIntoView({ block: 'center' });
  const q = b.getBoundingClientRect(), before = document.querySelectorAll('.shock').length;
  b.click();
  const rings = Array.from(document.querySelectorAll('.shock')).slice(before).map((e) => { const cs = getComputedStyle(e); return { x: parseFloat(e.style.left), y: parseFloat(e.style.top), gold: e.classList.contains('gold'), so: e.style.getPropertyValue('--so'), anim: cs.animationName, touch: cs.pointerEvents, z: cs.zIndex }; });
  return { id: b.getAttribute('data-h'), at: [q.left + q.width / 2, q.top + q.height / 2], rings };
}, pick);
const ringsOk = (what, t, n, gold) => {
  eq(what + ': rings made', t.rings.length, n);
  t.rings.forEach((r, i) => {
    near(what + ': ring ' + (i + 1) + ' starts on the button, x', r.x, t.at[0], 0.6); near(what + ': ring ' + (i + 1) + ' starts on the button, y', r.y, t.at[1], 0.6);
    eq(what + ': ring ' + (i + 1) + ' look', [r.gold, r.anim, r.touch, r.z], [gold, 'shock', 'none', '45']);
  });
};

// 1) the levels themselves, with the charge set by hand: who shows at 0, one half and 1
{
  const { ctx, page } = await open();
  for (const [c, motes, meteors] of [['0', 6, 1], ['0.5', 16, 2], ['0.778', 21, 3], ['1', 26, 5]]) {
    const got = await page.evaluate((c) => {
      document.documentElement.style.setProperty('--charge', c);
      const shown = (sel) => Array.from(document.querySelectorAll(sel)).filter((e) => getComputedStyle(e).scale !== '0').length;
      return [shown('#ki i'), shown('#meteors i')];
    }, c);
    eq('charge ' + c + ': motes and meteors on show', got, [motes, meteors]);
  }
  await ctx.close();
}

// 2) a real day: the fixture opens at 7 of 9. Uncheck one, check it back, then finish the day
{
  const { ctx, page, errs } = await open();
  let s = await read(page);
  eq('on load: today in the fixture', [s.done, s.total, s.sweep, s.ambient, s.rings], [7, 9, '0', 'block', 0]);
  agrees('on load', s);

  let t = await tapHabit(page, true);   // a done habit: uncheck it
  ringsOk('uncheck', t, 0, false);
  s = await read(page);
  eq('uncheck: one fewer done', [s.done, s.total], [6, 9]); agrees('uncheck', s);
  const fewer = s.motes;

  t = await tapHabit(page, t.id);       // check it back: 7 of 9 is past two thirds, so two rings
  ringsOk('check at 7 of 9', t, 2, false);
  s = await read(page);
  eq('check: back to 7 of 9', [s.done, s.total], [7, 9]); agrees('check at 7 of 9', s);
  if (!(s.motes > fewer)) fails.push('check: more motes than before it (' + fewer + ' then ' + s.motes + ')');
  await page.waitForTimeout(1600);
  eq('a second and a half later the rings are gone', (await read(page)).rings, 0);

  t = await tapHabit(page, false);      // 8 of 9
  ringsOk('check at 8 of 9', t, 2, false);
  s = await read(page); eq('8 of 9', [s.done, s.sweep], [8, '0']); agrees('8 of 9', s);
  t = await tapHabit(page, false);      // 9 of 9: the clean sweep
  ringsOk('the check that completes the day', t, 2, true);
  s = await read(page);
  eq('clean sweep', [s.done, s.total, s.charge, s.sweep, s.motes, s.meteors], [9, 9, '1', '1', 26, 5]); agrees('clean sweep', s);

  // a ring with nowhere to start from takes the middle of the screen
  const mid = await page.evaluate(async () => { document.querySelectorAll('.shock').forEach((e) => e.remove()); const fx = await import('./js/core/effects.js'); fx.shockwave(null, 0, false); const e = document.querySelector('.shock'); return [parseFloat(e.style.left), parseFloat(e.style.top), innerWidth / 2, innerHeight * 0.4]; });
  eq('a ring with no starting point', [mid[0], mid[1]], [mid[2], mid[3]]);
  if (errs.length) fails.push('page errors: ' + errs.join(' | '));
  await ctx.close();
}

// 3) low charge: one ring, and weaker than a late one
{
  const { ctx, page } = await open();
  const ids = await page.evaluate(() => Array.from(document.querySelectorAll('#habits [data-act="toggle"][aria-pressed="true"]')).map((b) => b.getAttribute('data-h')));
  for (const id of ids) await tapHabit(page, id);   // uncheck everything that a tap can uncheck
  let s = await read(page); agrees('after unchecking', s);
  if (!(s.done / s.total < 0.5)) fails.push('low charge: expected under half done, got ' + s.done + ' of ' + s.total);
  await page.waitForTimeout(1500);
  const t = await tapHabit(page, false);
  ringsOk('check at low charge', t, 1, false);
  s = await read(page); agrees('low charge, one more', s);
  const low = parseFloat(t.rings[0].so), late = 0.42 + 0.3 * 1;
  if (!(low < late && low >= 0.42)) fails.push('low charge: the ring should be weaker than a late one (' + low + ' against ' + late + ')');
  await ctx.close();
}

// 4) a past day's checks are that day's business: today's charge does not move
{
  const { ctx, page } = await open();
  const before = (await read(page)).charge;
  await page.locator('#week button.week-grid').dispatchEvent('click');
  await page.locator('[data-act="mv-day"][data-d="' + PAST + '"]').dispatchEvent('click');
  await page.waitForTimeout(100);
  const first = await page.evaluate(() => document.querySelector('#habits [data-act="toggle"]').getAttribute('aria-pressed'));
  await tapHabit(page, first === 'true');
  const flipped = await page.evaluate(() => document.querySelector('#habits [data-act="toggle"]').getAttribute('aria-pressed'));
  if (flipped === first) fails.push('past day: the habit did not flip');
  eq('past day: today\'s charge is unchanged', (await read(page)).charge, before);
  await ctx.close();
}

// 5) Calm mode: the backdrop is off, the ring is a tap effect and stays
{
  const { ctx, page } = await open({ calm: true });
  let s = await read(page);
  eq('Calm mode: the backdrop is hidden and the charge is still kept', [s.ambient, s.charge], ['none', '0.778']);
  const t = await tapHabit(page, false);
  ringsOk('Calm mode: a check', t, 2, false);
  await ctx.close();
}

// 6) reduced motion: no backdrop, no ring
{
  const { ctx, page } = await open({ reduce: true });
  const s = await read(page);
  eq('reduced motion: the backdrop is hidden and the charge is still kept', [s.ambient, s.charge], ['none', '0.778']);
  const t = await tapHabit(page, false);
  ringsOk('reduced motion: a check', t, 0, false);
  eq('reduced motion: the check itself still lands', (await read(page)).done, 8);
  await ctx.close();
}

await browser.close(); srv.close();
if (fails.length) { console.log('ambient-charge: FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('ambient-charge: ok (levels, a real day to a clean sweep, rings on the button, low charge, a past day, Calm mode, reduced motion)');
