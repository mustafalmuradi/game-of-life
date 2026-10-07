// Old-vs-new regression harness.
//   node test/harness.mjs --old legacy --new src [--shots] [--out test/out]
// Serves both directories, runs the same scripted scenario against each with an
// identical seeded fixture, frozen clock and fake Claude runtime, and compares
// the DOM, localStorage and cloud-write log after every step. With --shots it
// also screenshots every tab in light and dark and pixel-diffs them.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { steps } from './scenario.mjs';
import { TODAY, makeLocal, makeCloud, COACH_LOCAL, BODY_FILTER } from './fixture.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : []).filter(Boolean));
const OLD = path.resolve(args.old || 'legacy');
const NEW = path.resolve(args.new || 'src');
const OUT = path.resolve(args.out || 'test/out');
const SHOTS = !!args.shots;
const FROZEN = '2026-10-07T15:30:00-04:00';
const VIEW = { width: 390, height: 844 };
const PIXEL_NOISE = 10;

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
function serve(mounts) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      const m = Object.keys(mounts).find(k => url.pathname.startsWith('/' + k + '/'));
      if (!m) { res.writeHead(404); return res.end('no mount'); }
      let rel = url.pathname.slice(m.length + 2) || 'index.html';
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.join(mounts[m], rel);
      if (!file.startsWith(mounts[m]) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found: ' + rel); }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

function cloudDocs() {
  const c = makeCloud(TODAY), base = 'data/users/u_test/tracker', out = {};
  out[base] = c.settings;
  for (const k of Object.keys(c.days)) out[base + '/days/' + k] = c.days[k];
  for (const l of c.lifts) { const b = { ...l }; delete b.id; out[base + '/lifts/' + l.id] = b; }
  for (const cn of ['bnodes', 'bships', 'bskills']) for (const x of c.build[cn]) { const b = { ...x }; delete b.id; out[base + '/' + cn + '/' + x.id] = b; }
  return out;
}
const COACH_SCRIPT = [
  { text: 'Logged: bed 11:40 PM, recovery 64, chest + biceps. Late night, **recovery is yellow**: cut volume by a third.', tools: [
    { name: 'update_day', input: { date: TODAY, set: { bed: '23:40', rec: 64, sess: ['chest_biceps'] } } }
  ] },
  { text: 'Five of seven sweeps. Sleep is the leak: two nights past target. Fix bedtime before anything else.' }
];
const FAKE_SRC = fs.readFileSync(new URL('./fake-runtime.js', import.meta.url), 'utf8');
const KILL_MOTION = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';

async function openPage(browser, url, label) {
  const context = await browser.newContext({ viewport: VIEW, timezoneId: 'America/New_York', locale: 'en-US', colorScheme: 'light', deviceScaleFactor: 1 });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const page = await context.newPage();
  const console_ = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console_.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => console_.push('pageerror: ' + (e.stack || e.message)));
  await page.clock.install({ time: FROZEN });
  await page.clock.pauseAt(FROZEN); // time stands still; only clock.runFor() moves it
  const local = makeLocal(TODAY);
  await page.addInitScript(({ local, coach, filter }) => {
    // seed once per page; a reload must find what the app itself wrote, not a fresh fixture
    try { if (!localStorage.getItem('__seeded')) { localStorage.clear(); localStorage.setItem('dojo-log-v1', JSON.stringify(local)); localStorage.setItem('gol-coach-v1', JSON.stringify(coach)); localStorage.setItem('gol-body-filter', JSON.stringify(filter)); localStorage.setItem('__seeded', '1'); } } catch (e) { }
  }, { local, coach: COACH_LOCAL, filter: BODY_FILTER });
  await page.addInitScript(({ src, cfg }) => { window.__fakeCfg = cfg; (0, eval)(src); }, { src: FAKE_SRC, cfg: { seed: 20261007, cloud: cloudDocs(), script: COACH_SCRIPT } });
  await page.goto(url, { waitUntil: 'load' });
  return { context, page, console_, label };
}

const SNAP = () => {
  const parts = [];
  for (const sel of ['.app', '#extra-sheet', '#settings-sheet', '#rank-sheet', '#lift-sheet', '#checkin-sheet', '#promo', '#toast-host', '#build-sheet', '#chat-sheet', '#fx']) {
    const el = document.querySelector(sel); parts.push('<!-- ' + sel + ' -->\n' + (el ? el.outerHTML : 'MISSING'));
  }
  const vals = Array.from(document.querySelectorAll('input,select,textarea')).map(i => (i.id || i.name || i.className) + '=' + JSON.stringify(i.type === 'checkbox' ? i.checked : i.value));
  parts.push('<!-- values -->\n' + vals.join('\n'));
  parts.push('<!-- body attrs -->\n' + Array.from(document.body.attributes).map(a => a.name + '=' + a.value).join(' ') + ' | html: ' + Array.from(document.documentElement.attributes).map(a => a.name + '=' + a.value).join(' '));
  const ls = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k); }
  parts.push('<!-- localStorage -->\n' + JSON.stringify(ls, Object.keys(ls).sort(), 1));
  parts.push('<!-- cloud log -->\n' + JSON.stringify(window.__fake.log, null, 1));
  return parts.join('\n\n');
};

function diffText(a, b, fa, fb) {
  fs.writeFileSync(fa, a); fs.writeFileSync(fb, b);
  try { execFileSync('diff', ['-u', fa, fb]); return ''; } catch (e) { return String(e.stdout).split('\n').slice(0, 40).join('\n'); }
}

async function shots(run, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const out = {};
  await run.page.addStyleTag({ content: KILL_MOTION });
  for (const scheme of ['light', 'dark']) {
    await run.page.emulateMedia({ colorScheme: scheme });
    for (const t of ['today', 'lifts', 'body', 'progress', 'build']) {
      await run.page.locator('[data-tab="' + t + '"]').click({ force: true });
      await run.page.evaluate(() => window.scrollTo(0, 0));
      const f = path.join(dir, scheme + '-' + t + '.png');
      await run.page.screenshot({ path: f, fullPage: true });
      out[scheme + '-' + t] = f;
    }
  }
  await run.page.emulateMedia({ colorScheme: 'light' });
  return out;
}
function pixelDiff(fa, fb, fout) {
  const a = PNG.sync.read(fs.readFileSync(fa)), b = PNG.sync.read(fs.readFileSync(fb));
  if (a.width !== b.width || a.height !== b.height) return { differ: Math.max(a.width * a.height, b.width * b.height), size: a.width + 'x' + a.height + ' vs ' + b.width + 'x' + b.height };
  const d = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, d.data, a.width, a.height, { threshold: 0.1 });
  if (n) fs.writeFileSync(fout, PNG.sync.write(d));
  return { differ: n, size: a.width + 'x' + a.height };
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'old'), { recursive: true }); fs.mkdirSync(path.join(OUT, 'new'), { recursive: true });
  const { srv, port } = await serve({ old: OLD, new: NEW });
  const browser = await chromium.launch();
  const runs = { old: await openPage(browser, `http://127.0.0.1:${port}/old/index.html`, 'old'), new: await openPage(browser, `http://127.0.0.1:${port}/new/index.html`, 'new') };
  let failed = 0, i = 0;
  const rows = [];
  for (const step of steps) {
    i++;
    const id = String(i).padStart(2, '0');
    const res = {};
    for (const k of ['old', 'new']) {
      const r = runs[k];
      try { await step.run(r.page); res[k] = await r.page.evaluate(SNAP); }
      catch (e) {
        const info = await r.page.evaluate(() => ({ tab: (document.querySelector('[role=tab][aria-selected=true]') || {}).id, sheets: Array.from(document.querySelectorAll('.sheet-back')).filter(s => !s.hidden).map(s => s.id) })).catch(() => ({}));
        res[k] = 'STEP ERROR: ' + String(e.message || e).split('\n')[0] + ' | ' + JSON.stringify(info);
      }
    }
    const same = res.old === res.new;
    const err = /^STEP ERROR/.test(res.old) || /^STEP ERROR/.test(res.new);
    const d = same ? '' : diffText(res.old, res.new, path.join(OUT, 'old', id + '.txt'), path.join(OUT, 'new', id + '.txt'));
    if (same) { fs.writeFileSync(path.join(OUT, 'old', id + '.txt'), res.old); }
    const status = err ? 'ERROR' : same ? 'same' : 'DIFF';
    if (status !== 'same') failed++;
    rows.push({ id, name: step.name, status, bytes: res.old.length });
    console.log(`${status.padEnd(5)} ${id} ${step.name}${err ? '\n      ' + (res.old.startsWith('STEP') ? 'old: ' + res.old.slice(0, 200) : '') + (res.new.startsWith('STEP') ? ' new: ' + res.new.slice(0, 200) : '') : ''}${d ? '\n' + d.split('\n').map(l => '      ' + l).join('\n') : ''}`);
  }
  // console output
  for (const k of ['old', 'new']) {
    const real = runs[k].console_.filter(m => !/Failed to load resource/.test(m));
    fs.writeFileSync(path.join(OUT, k, 'console.txt'), runs[k].console_.join('\n'));
    console.log(`console ${k}: ${real.length} error/warning line(s)` + (real.length ? '\n  ' + real.slice(0, 10).join('\n  ') : ''));
    if (real.length) failed++;
  }
  const oldC = runs.old.console_.join('\n'), newC = runs.new.console_.join('\n');
  if (oldC !== newC) { failed++; console.log('console output differs between old and new (see test/out/*/console.txt)'); }
  // screenshots
  if (SHOTS) {
    const so = await shots(runs.old, path.join(OUT, 'old', 'shots')), sn = await shots(runs.new, path.join(OUT, 'new', 'shots'));
    fs.mkdirSync(path.join(OUT, 'diff'), { recursive: true });
    for (const k of Object.keys(so)) {
      const r = pixelDiff(so[k], sn[k], path.join(OUT, 'diff', k + '.png'));
      // identical renders of the same page can still differ by a pixel or two (blur + GPU rounding),
      // so a handful of pixels is noise; anything visible is hundreds.
      const ok = r.differ <= PIXEL_NOISE;
      if (!ok) failed++;
      console.log(`${ok ? 'same ' : 'DIFF '} shot ${k} (${r.size})${r.differ ? ' differing pixels: ' + r.differ + (ok ? ' (within noise)' : '') : ''}`);
    }
  }
  await browser.close(); srv.close();
  console.log(`\n${rows.length} steps, ${rows.filter(r => r.status === 'same').length} identical, ${failed} failure(s)`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
