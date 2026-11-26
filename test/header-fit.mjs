// Header fit (Nov 2026): the name, the Coach button, the light/dark button and the settings button share one line.
// Sweeps every viewport width up to 600 px, twice: as a phone (touch, no scrollbar) from 280 px, and as a desktop
// browser that keeps its scrollbar on screen from 300 px (narrower than that, the scrollbar leaves no room for the
// name at its 12 px floor). At each width: the name stays on a single line, nothing overlaps or leaves the
// column, the page does not scroll sideways, the three buttons keep their order and their 42 px size, the Coach
// label shows from 372 px and the "Mustafa" pill from 561 px (the breakpoints in css/fx.css, "header fit"). On the
// phone the name is also 22 px from 416 px up and never under 16 px on a 320 px screen or wider.
//
// The widths only mean something with the real typefaces: Orbitron is far wider than any fallback font, and the main
// harness blocks the network, so it never sees it. Here the fonts load from Google Fonts, as in the live app. Offline,
// point GOL_FONT_CSS at a stylesheet that defines Orbitron, Space Grotesk and JetBrains Mono. If the fonts do not
// load, the test says so and checks nothing: a pass with a narrower font would prove nothing.
// Run: node test/header-fit.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeCloud } from './fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAKE = fs.readFileSync(path.join(ROOT, 'test/fake-runtime.js'), 'utf8');
const TODAY = '2026-10-07', BASE = 'data/users/u_test/tracker';
const FROM = { phone: 280, desktop: 300 }, TO = 600, LABEL_FROM = 372, PILL_FROM = 561, FULL_SIZE_FROM = 416;
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };
const FONT_CSS = process.env.GOL_FONT_CSS ? fs.readFileSync(process.env.GOL_FONT_CSS, 'utf8') : null;

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

// kind 'phone': touch screen, no hover, no scrollbar. kind 'desktop': mouse, and a scrollbar that stays on screen.
async function sweep(kind) {
  const phone = kind === 'phone';
  const browser = await chromium.launch(phone ? {} : { ignoreDefaultArgs: ['--hide-scrollbars'], args: ['--disable-features=OverlayScrollbar'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', isMobile: phone, hasTouch: phone });
  if (FONT_CSS) await ctx.route(/^https:\/\/fonts\.googleapis\.com\//, (r) => r.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: FONT_CSS }));
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(({ src, cfg }) => {
    const d = new Date('2026-10-07T12:00:00-04:00').getTime(); const Real = Date;
    class Fake extends Real { constructor(...a) { super(...(a.length ? a : [d])); } static now() { return d; } }
    window.Date = Fake; window.__fakeCfg = cfg; (0, eval)(src);
  }, { src: FAKE, cfg: { seed: 7, cloud: cloudFixture(), script: [] } });
  await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  // Reduced motion leaves every property a 0.01 ms transition, so a size read straight after a resize would still be
  // the old one. Same cure as the harness: no transitions at all.
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });

  // the name is Orbitron, the Coach label Space Grotesk, the pill JetBrains Mono
  const missing = await page.evaluate(async () => {
    const want = ['800 22px Orbitron', '800 14px "Space Grotesk"', '800 12px "JetBrains Mono"'];
    await Promise.race([Promise.all(want.map((f) => document.fonts.load(f).catch(() => null))), new Promise((r) => setTimeout(r, 8000))]);
    const loaded = (fam) => Array.from(document.fonts).some((f) => f.family.replace(/["']/g, '') === fam && f.status === 'loaded');
    return ['Orbitron', 'Space Grotesk', 'JetBrains Mono'].filter((f) => !loaded(f));
  });
  if (missing.length) { await browser.close(); return { missing }; }

  const fails = [], sizes = {}; let bar = 0;
  const touch = await page.evaluate(() => matchMedia('(hover:none)').matches);
  if (phone && !touch) fails.push('the phone pass did not get a touch screen (hover:none is false)');
  if (!phone && touch) fails.push('the desktop pass got a touch screen (hover:none is true)');
  for (let w = FROM[kind]; w <= TO; w++) {
    await page.setViewportSize({ width: w, height: 844 });
    const m = await page.evaluate(() => {
      const q = (s) => document.querySelector(s), r = (el) => el.getBoundingClientRect();
      const name = q('.brand b'), pill = q('.brand span'), coach = q('#btn-coach'), theme = q('#btn-theme'), settings = q('#btn-settings');
      const pillShown = getComputedStyle(pill).display !== 'none';
      return {
        room: document.documentElement.clientWidth, bar: innerWidth - document.documentElement.clientWidth, docW: document.documentElement.scrollWidth,
        size: parseFloat(getComputedStyle(name).fontSize), nameH: r(name).height, textRight: pillShown ? r(pill).right : r(name).right, pillShown,
        appLeft: r(q('.app')).left, appRight: r(q('.app')).right, nameLeft: r(name).left,
        coach: [r(coach).left, r(coach).right, r(coach).height], label: getComputedStyle(q('#btn-coach span')).display !== 'none',
        theme: [r(theme).left, r(theme).right, r(theme).width, r(theme).height], settings: [r(settings).left, r(settings).right, r(settings).width, r(settings).height]
      };
    });
    const bad = (msg) => fails.push(kind + ', ' + w + ' px: ' + msg);
    bar = Math.max(bar, m.bar);
    if (m.docW > m.room) bad('the page scrolls sideways (' + m.docW + ' px of content in ' + m.room + ' px)');
    if (m.nameH > m.size * 1.3) bad('the name wraps (' + m.nameH.toFixed(1) + ' px tall at ' + m.size.toFixed(1) + ' px)');
    if (m.coach[0] - m.textRight < 7.5) bad('the name and the buttons are ' + (m.coach[0] - m.textRight).toFixed(1) + ' px apart (8 px at least)');
    if (m.nameLeft < m.appLeft - 0.5 || m.settings[1] > m.appRight + 0.5) bad('the header leaves its column');
    if (!(m.coach[1] <= m.theme[0] && m.theme[1] <= m.settings[0])) bad('the buttons are out of order or overlap');
    if (Math.abs(m.theme[2] - 42) > 0.5 || Math.abs(m.theme[3] - 42) > 0.5) bad('the light/dark button is ' + m.theme[2] + ' x ' + m.theme[3]);
    if (Math.abs(m.settings[2] - 42) > 0.5 || Math.abs(m.settings[3] - 42) > 0.5) bad('the settings button is ' + m.settings[2] + ' x ' + m.settings[3]);
    if (Math.abs(m.coach[2] - 42) > 0.5) bad('the Coach button is ' + m.coach[2] + ' px tall');
    if (m.label !== (w >= LABEL_FROM)) bad('the Coach label is ' + (m.label ? 'shown' : 'hidden'));
    if (m.pillShown !== (w >= PILL_FROM)) bad('the pill is ' + (m.pillShown ? 'shown' : 'hidden'));
    if (m.size > 22.01 || m.size < 11.99) bad('the name is ' + m.size.toFixed(1) + ' px (12 to 22 px)');
    if (phone && w >= FULL_SIZE_FROM && Math.abs(m.size - 22) > 0.01) bad('the name should be 22 px, is ' + m.size);
    if (phone && w >= 320 && m.size < 16) bad('the name is only ' + m.size.toFixed(1) + ' px');
    sizes[w] = m.size;
  }
  if (errs.length) fails.push(kind + ', page errors: ' + errs.join(' | '));
  await browser.close();
  return { fails, sizes, bar };
}

const phone = await sweep('phone');
if (phone.missing) {
  srv.close();
  console.log('header-fit: SKIPPED, nothing was checked. These fonts did not load: ' + phone.missing.join(', ') + '. Run it online, or set GOL_FONT_CSS to a stylesheet that defines them.');
  process.exit(0);
}
const desktop = await sweep('desktop');
srv.close();
const fails = phone.fails.concat(desktop.missing ? ['desktop: the fonts did not load: ' + desktop.missing.join(', ')] : desktop.fails);
if (fails.length) { console.log('header-fit: FAIL (' + fails.length + ')\n  ' + fails.slice(0, 30).join('\n  ') + (fails.length > 30 ? '\n  …' : '')); process.exit(1); }
const at = (w) => w + ' → ' + (Math.round(phone.sizes[w] * 10) / 10);
console.log('header-fit: ok (real fonts; every width as a phone, ' + FROM.phone + ' to ' + TO + ' px, and as a desktop with a ' + desktop.bar + ' px scrollbar' + (desktop.bar ? '' : ' (this browser draws none)') + ', ' + FROM.desktop + ' to ' + TO + ' px; name size on a phone, px: ' + [320, 360, 375, 390, 393, 402, 430].map(at).join(', ') + ')');
