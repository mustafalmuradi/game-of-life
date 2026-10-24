// Regression harness: the app is driven through the same scripted scenario with an
// identical seeded fixture, frozen clock and fake Claude runtime, and the DOM,
// localStorage and cloud-write log are compared after every step.
//
// Two modes:
//   golden master (default):   node test/harness.mjs [--new src] [--shots]
//     compares the run against the recorded baseline in test/baseline (hashes.json is
//     committed; full snapshots and screenshots live next to it, untracked, so a diff
//     is shown when they exist locally). Record a new baseline after reviewing a change:
//                              node test/harness.mjs --record [--shots]
//   lockstep:                  node test/harness.mjs --old legacy --new src [--shots]
//     serves two directories and runs them side by side (how the module split was proved).
// With --shots every tab is screenshotted in light and dark and pixel-diffed.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { steps } from './scenario.mjs';
import { TODAY, makeLocal, makeCloud, COACH_LOCAL, BODY_FILTER } from './fixture.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : []).filter(Boolean));
const LOCKSTEP = !!args.old;           // two live directories side by side
const RECORD = !!args.record;          // write the golden master instead of comparing against it
const OLD = path.resolve(args.old || 'legacy');
const NEW = path.resolve(args.new || 'src');
const OUT = path.resolve(args.out || 'test/out');
const BASE = path.resolve(args.baseline || 'test/baseline');
const FULL = path.join(BASE, 'full'), BSHOTS = path.join(BASE, 'shots'), HASHES = path.join(BASE, 'hashes.json');
const SHOTS = !!args.shots;
const NORUNTIME = !!args.noruntime; // no window.claude: the page runs in local mode
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
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
    { name: 'update_day', input: { date: TODAY, set: { bed: '23:40', rec: 64, sess: ['chest_biceps'] } } },
    { name: 'salah', input: { action: 'rawatib', date: TODAY, done: ['fajr'], undone: ['dhuhr1'] } },
    { name: 'salah', input: { action: 'times', date: '2026-10-09' } }
  ] },
  { text: 'Five of seven sweeps. Sleep is the leak: two nights past target. Fix bedtime before anything else.' }
];
const FAKE_SRC = fs.readFileSync(new URL('./fake-runtime.js', import.meta.url), 'utf8');
// today's Google Calendar, as the fake connector serves it (the frozen clock is 15:30: one event live, one earlier, two later)
const CAL_EVENTS = [
  { id: 'ev1', status: 'confirmed', summary: '🏋️ Gym', start: { dateTime: TODAY + 'T06:15:00-04:00' }, end: { dateTime: TODAY + 'T07:30:00-04:00' } },
  { id: 'ev2', status: 'confirmed', summary: '🕌 Dhuhr', start: { dateTime: TODAY + 'T12:45:00-04:00' }, end: { dateTime: TODAY + 'T13:00:00-04:00' } },
  { id: 'ev3', status: 'confirmed', summary: '🧠 GHL lessons (done by EOD)', start: { dateTime: TODAY + 'T15:00:00-04:00' }, end: { dateTime: TODAY + 'T16:00:00-04:00' }, location: 'Home office' },
  { id: 'ev4', status: 'confirmed', summary: '🕌 Maghrib', start: { dateTime: TODAY + 'T18:29:00-04:00' }, end: { dateTime: TODAY + 'T18:45:00-04:00' } },
  { id: 'ev5', status: 'confirmed', summary: '😴 Sleep', start: { dateTime: TODAY + 'T21:00:00-04:00' }, end: { dateTime: TODAY.replace(/\d+$/, d => String(+d + 1).padStart(2, '0')) + 'T05:15:00-04:00' } },
  { id: 'ev6', status: 'confirmed', summary: 'Rent due', start: { date: TODAY }, end: { date: TODAY.replace(/\d+$/, d => String(+d + 1).padStart(2, '0')) } },
  { id: 'ev7', status: 'cancelled', summary: 'Cancelled thing', start: { dateTime: TODAY + 'T17:00:00-04:00' }, end: { dateTime: TODAY + 'T17:30:00-04:00' } }
];
const KILL_MOTION = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}#boot,.stars{display:none!important}';

async function openPage(browser, url, label) {
  const context = await browser.newContext({ viewport: VIEW, timezoneId: 'America/New_York', locale: 'en-US', colorScheme: 'light', reducedMotion: 'reduce', deviceScaleFactor: 1 });
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
  await page.addInitScript(({ src, cfg }) => { window.__fakeCfg = cfg; (0, eval)(src); }, { src: FAKE_SRC, cfg: { seed: 20261007, cloud: cloudDocs(), script: COACH_SCRIPT, noClaude: NORUNTIME, mcpEvents: CAL_EVENTS } });
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
  parts.push('<!-- body attrs -->\n' + Array.from(document.body.attributes).map(a => a.name + '=' + a.value).join(' ') + ' | html: ' + Array.from(document.documentElement.attributes).map(a => a.name + '=' + a.value.replace(/--tab-[xw]: [^;]+;?\s*/g, '')).join(' '));
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
  // the theme follows the sun by default; the screenshots want the emulated scheme, so switch the device pref to system
  await run.page.evaluate(() => { try { localStorage.setItem('gol-theme', 'system'); } catch (e) { } document.documentElement.removeAttribute('data-theme'); });
  for (const scheme of ['light', 'dark']) {
    await run.page.emulateMedia({ colorScheme: scheme });
    for (const t of ['today', 'tasks', 'lifts', 'body', 'progress', 'build']) {
      await run.page.locator('[data-sec="' + ({ today:'hq', tasks:'hq', body:'body', lifts:'body', progress:'progress', build:'progress' })[t] + '"]').click({ force: true }); // section, then the view inside it
      if (!['today', 'body', 'progress'].includes(t)) await run.page.locator('[data-tab="' + t + '"]').click({ force: true });
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

function readBaseline() {
  if (!fs.existsSync(HASHES)) { console.error(`No baseline at ${HASHES}. Record one first: node test/harness.mjs --record --shots`); process.exit(2); }
  const b = JSON.parse(fs.readFileSync(HASHES, 'utf8'));
  if (Object.keys(b.steps).length !== steps.length) { console.error(`The baseline has ${Object.keys(b.steps).length} steps, the scenario has ${steps.length}. Re-record after changing the scenario: node test/harness.mjs --record --shots`); process.exit(2); }
  return b;
}
async function snapAfter(run, step) {
  try { await step.run(run.page); return await run.page.evaluate(SNAP); }
  catch (e) {
    const info = await run.page.evaluate(() => ({ tab: (document.querySelector('[role=tab][aria-selected=true]') || {}).id, sheets: Array.from(document.querySelectorAll('.sheet-back')).filter(s => !s.hidden).map(s => s.id) })).catch(() => ({}));
    return 'STEP ERROR: ' + String(e.message || e).split('\n')[0] + ' | ' + JSON.stringify(info);
  }
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'old'), { recursive: true }); fs.mkdirSync(path.join(OUT, 'new'), { recursive: true });
  const baseline = LOCKSTEP ? null : RECORD ? { recorded: new Date().toISOString(), frozenClock: FROZEN, steps: {}, console: null, shots: {} } : readBaseline();
  if (RECORD) { fs.rmSync(FULL, { recursive: true, force: true }); fs.mkdirSync(FULL, { recursive: true }); if (SHOTS) fs.rmSync(BSHOTS, { recursive: true, force: true }); }
  const { srv, port } = await serve({ old: OLD, new: NEW });
  const browser = await chromium.launch();
  const runs = { new: await openPage(browser, `http://127.0.0.1:${port}/new/index.html`, 'new') };
  if (LOCKSTEP) runs.old = await openPage(browser, `http://127.0.0.1:${port}/old/index.html`, 'old');
  const mode = LOCKSTEP ? `lockstep ${path.relative('.', OLD)} vs ${path.relative('.', NEW)}` : RECORD ? `recording ${path.relative('.', NEW)} into ${path.relative('.', BASE)}` : `${path.relative('.', NEW)} vs baseline${baseline.recorded ? ' recorded ' + baseline.recorded : ''}`;
  console.log(mode + (NORUNTIME ? ' (no runtime: local mode)' : ''));
  let failed = 0, i = 0;
  const rows = [];
  for (const step of steps) {
    i++;
    const id = String(i).padStart(2, '0');
    const res = { new: await snapAfter(runs.new, step) };
    let d = '', status;
    const err = /^STEP ERROR/.test(res.new);
    fs.writeFileSync(path.join(OUT, 'new', id + '.txt'), res.new);
    if (LOCKSTEP) {
      res.old = await snapAfter(runs.old, step);
      const same = res.old === res.new;
      d = same ? '' : diffText(res.old, res.new, path.join(OUT, 'old', id + '.txt'), path.join(OUT, 'new', id + '.txt'));
      if (same) fs.writeFileSync(path.join(OUT, 'old', id + '.txt'), res.old);
      status = err || /^STEP ERROR/.test(res.old) ? 'ERROR' : same ? 'same' : 'DIFF';
    } else if (RECORD) {
      fs.writeFileSync(path.join(FULL, id + '.txt'), res.new);
      baseline.steps[id] = { name: step.name, sha: sha(res.new), bytes: res.new.length };
      status = err ? 'ERROR' : 'rec';
    } else {
      const exp = baseline.steps[id];
      const same = !!exp && exp.sha === sha(res.new);
      const fullOld = path.join(FULL, id + '.txt');
      if (!same) d = fs.existsSync(fullOld) ? diffText(fs.readFileSync(fullOld, 'utf8'), res.new, path.join(OUT, 'old', id + '.txt'), path.join(OUT, 'new', id + '.txt')) : '(no full baseline snapshot on this machine to diff against; the recorded hash differs)';
      if (exp && exp.name !== step.name) d = `(baseline step was "${exp.name}")\n` + d;
      status = err ? 'ERROR' : same ? 'same' : 'DIFF';
    }
    if (status !== 'same' && status !== 'rec') failed++;
    rows.push({ id, name: step.name, status });
    console.log(`${status.padEnd(5)} ${id} ${step.name}${err ? '\n      new: ' + res.new.slice(0, 200) : ''}${d ? '\n' + d.split('\n').map(l => '      ' + l).join('\n') : ''}`);
  }
  // console output: no errors or warnings, and the same lines as the reference
  for (const k of Object.keys(runs)) {
    const real = runs[k].console_.filter(m => !/Failed to load resource/.test(m));
    fs.writeFileSync(path.join(OUT, k, 'console.txt'), runs[k].console_.join('\n'));
    console.log(`console ${k}: ${real.length} error/warning line(s)` + (real.length ? '\n  ' + real.slice(0, 10).join('\n  ') : ''));
    if (real.length) failed++;
  }
  const newC = runs.new.console_.join('\n');
  if (LOCKSTEP) { if (runs.old.console_.join('\n') !== newC) { failed++; console.log('console output differs between old and new (see test/out/*/console.txt)'); } }
  else if (RECORD) { fs.writeFileSync(path.join(FULL, 'console.txt'), newC); baseline.console = sha(newC); }
  else if (baseline.console !== sha(newC)) { failed++; console.log('console output differs from the baseline (see test/out/new/console.txt' + (fs.existsSync(path.join(FULL, 'console.txt')) ? ' vs test/baseline/full/console.txt' : '') + ')'); }
  // screenshots
  if (SHOTS) {
    const sn = await shots(runs.new, RECORD ? BSHOTS : path.join(OUT, 'new', 'shots'));
    if (RECORD) { for (const k of Object.keys(sn)) baseline.shots[k] = sha(fs.readFileSync(sn[k])); console.log(`${Object.keys(sn).length} screenshots recorded into ${path.relative('.', BSHOTS)}`); }
    else {
      const so = LOCKSTEP ? await shots(runs.old, path.join(OUT, 'old', 'shots')) : Object.fromEntries(Object.keys(sn).map(k => [k, path.join(BSHOTS, k + '.png')]));
      fs.mkdirSync(path.join(OUT, 'diff'), { recursive: true });
      for (const k of Object.keys(sn)) {
        if (!fs.existsSync(so[k])) { console.log(`skip  shot ${k} (no baseline screenshot on this machine; record with --record --shots)`); continue; }
        const r = pixelDiff(so[k], sn[k], path.join(OUT, 'diff', k + '.png'));
        // identical renders of the same page can still differ by a pixel or two (blur + GPU rounding),
        // so a handful of pixels is noise; anything visible is hundreds.
        const ok = r.differ <= PIXEL_NOISE;
        if (!ok) failed++;
        console.log(`${ok ? 'same ' : 'DIFF '} shot ${k} (${r.size})${r.differ ? ' differing pixels: ' + r.differ + (ok ? ' (within noise)' : '') : ''}`);
      }
    }
  }
  await browser.close(); srv.close();
  if (RECORD) {
    fs.mkdirSync(BASE, { recursive: true });
    fs.writeFileSync(HASHES, JSON.stringify(baseline, null, 1) + '\n');
    console.log(`\n${rows.length} steps recorded into ${path.relative('.', HASHES)} (full snapshots in ${path.relative('.', FULL)}, untracked), ${failed} error(s)`);
    process.exit(failed ? 1 : 0);
  }
  console.log(`\n${rows.length} steps, ${rows.filter(r => r.status === 'same').length} identical, ${failed} failure(s)`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
