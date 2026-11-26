// The header light/dark button (Nov 2026). One tap shows the other look right away; the flip ends when the sun next
// crosses the horizon (sunrise or Maghrib, from the app's own prayer times) and the standing Theme setting takes over.
// Checks, on a frozen clock that the test moves itself:
//   day and night flips and the edge each one runs to, the icon and the label, the toast and the Settings line,
//   the flip survives a reload, a second tap ends it, it runs out on the 30 s ticker and when the app wakes up,
//   a standing Light / Dark / System setting comes back after it, picking a setting ends it,
//   it still works when storage refuses to save, and junk in storage is ignored and cleared.
// Run: node test/theme-flip.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeCloud } from './fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAKE = fs.readFileSync(path.join(ROOT, 'test/fake-runtime.js'), 'utf8');
const TODAY = '2026-10-07', BASE = 'data/users/u_test/tracker', TZ = 'America/New_York';
const DAY = TODAY + 'T15:30:00-04:00', NIGHT = TODAY + 'T22:00:00-04:00', DAWN = TODAY + 'T03:00:00-04:00';
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
const port = srv.address().port;
const browser = await chromium.launch();
const fails = [];
const eq = (what, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(what + ': expected ' + JSON.stringify(want) + ', got ' + JSON.stringify(got)); };
const clock = (ts) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ }).format(ts);
const plain = (s) => (s == null ? s : s.replace(/\s/g, ' '));   // the browser may put a narrow space before AM/PM
// Reduced motion leaves every property a 0.01 ms transition, and a frozen page may not draw the frame that ends it, so
// a colour read straight after a change would still be the old one. Same cure as the harness: no transitions at all.
const KILL_MOTION = '*,*::before,*::after{animation:none!important;transition:none!important}';

// drain microtasks (fake cloud snapshots, promise chains) without needing timers
const settle = (page) => page.evaluate(() => new Promise((r) => { let i = 0; (function t() { if (++i > 20) return r(); Promise.resolve().then(t); })(); }));
async function open(at, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: TZ, locale: 'en-US', colorScheme: opts.scheme || 'light', reducedMotion: 'reduce' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.clock.install({ time: at }); await page.clock.pauseAt(at);   // time stands still; only the test moves it
  await page.addInitScript(({ src, cfg, seed }) => {
    try { if (!localStorage.getItem('__seeded')) { localStorage.clear(); for (const k of Object.keys(seed)) localStorage.setItem(k, seed[k]); localStorage.setItem('__seeded', '1'); } } catch (e) { }
    window.__fakeCfg = cfg; (0, eval)(src);
  }, { src: FAKE, cfg: { seed: 5, cloud: cloudFixture(), script: [] }, seed: opts.seed || {} });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await booted(page);
  return { ctx, page, errs };
}
async function booted(page) { await page.addStyleTag({ content: KILL_MOTION }); await page.clock.runFor(4000); await settle(page); }
// the frozen clock also freezes animation frames, which a real click waits on: dispatch it, as the harness does
const tap = async (page, sel) => { await page.locator(sel).first().dispatchEvent('click'); await settle(page); };
const jump = (page, ts) => page.clock.setSystemTime(ts);                     // moves the clock, fires no timer
const tick = async (page) => { await page.clock.runFor(30000); await settle(page); };   // the 30 s ticker runs once
// the edges, from the app's own prayer-time engine (it has its own test: test/salah.mjs)
const sunOf = (page) => page.evaluate(async () => {
  const [{ salahTimes }, { salahCfg }, { todayKey, addDays }] = await Promise.all([import('./js/core/salah.js'), import('./js/features/salah.js'), import('./js/core/utils.js')]);
  const k = todayKey(), cfg = salahCfg(), t = salahTimes(k, cfg), n = salahTimes(addDays(k, 1), cfg), d = new Date();
  const at = (plus, min) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + plus, 0, min).getTime();
  return { sunrise: at(0, t.sunrise), maghrib: at(0, t.maghrib), sunriseNext: at(1, n.sunrise), maghribNext: at(1, n.maghrib), now: Date.now() };
});
const look = (page) => page.evaluate(() => {
  const root = document.documentElement, b = document.querySelector('#btn-theme'), shown = (s) => getComputedStyle(b.querySelector(s)).display !== 'none';
  const rgb = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g).map(Number), lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  let flip = null, pref = null; try { flip = JSON.parse(localStorage.getItem('gol-theme-flip')); pref = localStorage.getItem('gol-theme'); } catch (e) { }
  const toast = document.querySelector('#toast-host .toast span');
  return {
    theme: root.getAttribute('data-theme'), flipAttr: root.getAttribute('data-theme-flip'), page: lum < 0.35 ? 'dark' : 'light',
    icon: shown('.ic-moon') && !shown('.ic-sun') ? 'moon' : shown('.ic-sun') && !shown('.ic-moon') ? 'sun' : 'both or none', label: b.getAttribute('aria-label'),
    flip, pref, toast: toast ? toast.textContent : null, line: document.querySelector('#theme-row small').textContent,
    pressed: Array.from(document.querySelectorAll('#theme-row [aria-pressed="true"]')).map((x) => x.getAttribute('data-v')).join(',')
  };
});
// one line per state: what the page shows, what the button offers, whether a flip is on
const brief = (s) => [s.theme, s.page, s.icon, s.label, s.flipAttr].map(String).join(' | ');
const LIGHT = 'light | light | moon | Switch to dark mode | ', DARK = 'dark | dark | sun | Switch to light mode | ';
const SYSTEM_DARK = 'null | dark | sun | Switch to light mode | null';   // System leaves data-theme off
async function pick(page, mode) {   // the standing setting, the way a person sets it: Settings, then the chip
  await tap(page, '#btn-settings'); await tap(page, '#theme-row [data-act="theme"][data-v="' + mode + '"]'); await page.keyboard.press('Escape'); await settle(page);
}

// 1) daytime, following the sun: flip to dark until Maghrib; it survives a reload; the sun takes over again
{
  const { ctx, page, errs } = await open(DAY);
  const sun = await sunOf(page);
  if (!(sun.sunrise < sun.now && sun.now < sun.maghrib && sun.maghrib < sun.sunriseNext)) fails.push('fixture: 3:30 PM should sit between sunrise and Maghrib: ' + JSON.stringify(sun));
  let s = await look(page);
  eq('day, before any tap', brief(s), LIGHT + null);
  eq('day, before any tap: nothing stored', [s.flip, s.pref, s.pressed], [null, null, 'auto']);
  eq('day, before any tap: Settings line', s.line, 'Follows the sun: light from sunrise to Maghrib, dark after.');

  await tap(page, '#btn-theme'); s = await look(page);
  eq('day, one tap', brief(s), DARK + 'dark');
  eq('day, one tap: the flip runs to Maghrib', s.flip, { mode: 'dark', until: sun.maghrib, edge: 'Maghrib' });
  eq('day, one tap: the standing setting is untouched', [s.pref, s.pressed], [null, 'auto']);
  eq('day, one tap: toast', plain(s.toast), 'Dark until Maghrib, ' + clock(sun.maghrib));
  eq('day, one tap: Settings line', plain(s.line), 'Dark for now, until Maghrib, ' + clock(sun.maghrib) + '. Then Auto · sun again.');

  await page.reload({ waitUntil: 'load' }); await booted(page); s = await look(page);
  eq('day, after a reload the flip is still on', brief(s), DARK + 'dark');
  eq('day, after a reload: Settings line', plain(s.line), 'Dark for now, until Maghrib, ' + clock(sun.maghrib) + '. Then Auto · sun again.');

  await jump(page, sun.maghrib - 45000); await tick(page); s = await look(page);
  eq('15 s before Maghrib the flip is still on', brief(s), DARK + 'dark');
  await tick(page); s = await look(page);   // 15 s past Maghrib
  eq('just past Maghrib the flip is over and the sun says dark', brief(s), DARK + null);
  eq('just past Maghrib: nothing stored, Settings line back', [s.flip, s.line], [null, 'Follows the sun: light from sunrise to Maghrib, dark after.']);
  await jump(page, sun.sunriseNext + 1000); await tick(page); s = await look(page);
  eq('next sunrise: light again, the sun is back in charge', brief(s), LIGHT + null);
  if (errs.length) fails.push('page errors (day): ' + errs.join(' | '));
  await ctx.close();
}

// 2) a second tap ends the flip
{
  const { ctx, page } = await open(DAY);
  await tap(page, '#btn-theme'); await tap(page, '#btn-theme');
  const s = await look(page);
  eq('two taps', brief(s), LIGHT + null);
  eq('two taps: nothing stored, toast', [s.flip, s.pref, s.toast], [null, null, 'Back to Auto · sun']);
  await ctx.close();
}

// 3) night: flip to light until tomorrow's sunrise; before dawn the edge is today's sunrise
{
  const { ctx, page } = await open(NIGHT);
  const sun = await sunOf(page);
  let s = await look(page);
  eq('night, before any tap', brief(s), DARK + null);
  await tap(page, '#btn-theme'); s = await look(page);
  eq('night, one tap', brief(s), LIGHT + 'light');
  eq('night, one tap: the flip runs to tomorrow\'s sunrise', s.flip, { mode: 'light', until: sun.sunriseNext, edge: 'sunrise' });
  eq('night, one tap: toast', plain(s.toast), 'Light until sunrise, ' + clock(sun.sunriseNext));
  await jump(page, sun.sunriseNext - 45000); await tick(page);
  eq('15 s before sunrise the flip is still on', brief(await look(page)), LIGHT + 'light');
  await tick(page); s = await look(page);
  eq('just past sunrise the flip is over and the sun says light', brief(s), LIGHT + null);
  await jump(page, sun.maghribNext + 1000); await tick(page);
  eq('the next Maghrib turns the page dark as usual', brief(await look(page)), DARK + null);
  await ctx.close();
}
{
  const { ctx, page } = await open(DAWN);
  const sun = await sunOf(page);
  await tap(page, '#btn-theme');
  const s = await look(page);
  eq('before dawn, one tap', brief(s), LIGHT + 'light');
  eq('before dawn: the flip runs to today\'s sunrise', s.flip, { mode: 'light', until: sun.sunrise, edge: 'sunrise' });
  await ctx.close();
}

// 4) a standing Dark setting: the button flips to light, Maghrib ends the flip, and Dark comes back
{
  const { ctx, page } = await open(DAY);
  const sun = await sunOf(page);
  await pick(page, 'dark');
  let s = await look(page);
  eq('standing Dark', brief(s), DARK + null);
  await tap(page, '#btn-theme'); s = await look(page);
  eq('standing Dark, one tap', brief(s), LIGHT + 'light');
  eq('standing Dark, one tap: setting kept', [s.pref, s.pressed, s.flip], ['dark', 'dark', { mode: 'light', until: sun.maghrib, edge: 'Maghrib' }]);
  eq('standing Dark, one tap: Settings line', plain(s.line), 'Light for now, until Maghrib, ' + clock(sun.maghrib) + '. Then Dark again.');
  await jump(page, sun.maghrib + 1000); await tick(page); s = await look(page);
  eq('standing Dark, past Maghrib: Dark again', brief(s), DARK + null);
  eq('standing Dark, past Maghrib: Settings line', s.line, 'Always dark on this device.');

  // picking a setting while a flip is on ends the flip: the newer, explicit choice wins
  await tap(page, '#btn-theme');
  eq('standing Dark at night, one tap', brief(await look(page)), LIGHT + 'light');
  await pick(page, 'dark'); s = await look(page);
  eq('picking Dark again ends the flip', [brief(s), s.flip], [DARK + null, null]);
  await ctx.close();
}

// 5) the phone slept through the edge: waking the app ends the flip at once, without waiting for the ticker
{
  const { ctx, page } = await open(DAY);
  const sun = await sunOf(page);
  await pick(page, 'light'); await tap(page, '#btn-theme');
  eq('standing Light, one tap', brief(await look(page)), DARK + 'dark');
  await jump(page, sun.maghrib + 3600000);
  const woke = await page.evaluate(() => { const r = document.documentElement, before = r.getAttribute('data-theme') + '/' + r.getAttribute('data-theme-flip'); document.dispatchEvent(new Event('visibilitychange')); return [before, r.getAttribute('data-theme') + '/' + r.getAttribute('data-theme-flip')]; });
  eq('asleep past Maghrib, then awake', woke, ['dark/dark', 'light/null']);
  eq('awake: Settings line', (await look(page)).line, 'Always light on this device.');
  await ctx.close();
}

// 6) System setting on a dark device: no data-theme of its own, the button still flips and flips back
{
  const { ctx, page } = await open(DAY, { scheme: 'dark', seed: { 'gol-theme': 'system' } });
  let s = await look(page);
  eq('System on a dark device', brief(s), SYSTEM_DARK);
  await tap(page, '#btn-theme'); s = await look(page);
  eq('System on a dark device, one tap', brief(s), LIGHT + 'light');
  await tap(page, '#btn-theme'); s = await look(page);
  eq('System on a dark device, two taps', [brief(s), s.flip, s.toast], [SYSTEM_DARK, null, 'Back to System']);
  await ctx.close();
}

// 7) storage that refuses to save: the flip still holds for this visit
{
  const { ctx, page } = await open(DAY);
  await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; });
  await tap(page, '#btn-theme'); await tick(page);
  let s = await look(page);
  eq('storage refuses: the flip holds across a tick', [brief(s), s.flip], [DARK + 'dark', null]);
  await tap(page, '#btn-theme'); s = await look(page);
  eq('storage refuses: a second tap still ends it', brief(s), LIGHT + null);
  await ctx.close();
}

// 8) junk under the flip's key is ignored and cleared: not a flip, a look that is not light or dark, an end years away
for (const junk of ['not json', '42', '{"mode":"blue","until":99999999999999}', '{"mode":"dark","until":"soon"}', JSON.stringify({ mode: 'dark', until: Date.parse(DAY) + 400 * 86400000, edge: 'Maghrib' }), JSON.stringify({ mode: 'dark', until: Date.parse(DAY) - 1000, edge: 'Maghrib' })]) {
  const { ctx, page, errs } = await open(DAY, { seed: { 'gol-theme-flip': junk } });
  const s = await look(page), raw = await page.evaluate(() => localStorage.getItem('gol-theme-flip'));
  eq('junk flip ' + junk.slice(0, 24) + ': the page follows the sun', brief(s), LIGHT + null);
  eq('junk flip ' + junk.slice(0, 24) + ': cleared', raw, null);
  if (errs.length) fails.push('page errors (junk ' + junk.slice(0, 24) + '): ' + errs.join(' | '));
  await ctx.close();
}

// 9) the flip's own text is shown as text: markup in the stored edge name does not become an element
{
  const until = Date.parse(DAY) + 3600000;
  const { ctx, page } = await open(DAY, { seed: { 'gol-theme-flip': JSON.stringify({ mode: 'dark', until, edge: '<img id="x9" src=x>' }) } });
  const got = await page.evaluate(() => [document.documentElement.getAttribute('data-theme-flip'), !!document.querySelector('#x9'), document.querySelector('#theme-row small').textContent]);
  eq('markup in a stored flip', [got[0], got[1], plain(got[2])], ['dark', false, 'Dark for now, until <img id="x9" src=x>, ' + clock(until) + '. Then Auto · sun again.']);
  await ctx.close();
}

await browser.close(); srv.close();
if (fails.length) { console.log('theme-flip: FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('theme-flip: ok (day and night flips, reload, second tap, ticker and wake-up expiry, standing Light/Dark/System, blocked storage, junk)');
