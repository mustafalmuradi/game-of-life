// The scripted walk through the app. Every step runs on both versions in lockstep;
// after each one the harness snapshots the DOM, localStorage and the fake-cloud log.
// Steps only use selectors the page renders; a missing selector fails the step loudly.

// The harness freezes the clock, which also freezes requestAnimationFrame; Playwright's
// actionability checks wait on animation frames, so every action runs with force: true
// and targets the first VISIBLE match (the same selector can exist in a hidden tab panel).
function vis(page, sel) { return page.locator(sel).filter({ visible: true }).first(); }
async function click(page, sel) {
  const n = await page.locator(sel).filter({ visible: true }).count();
  if (!n) throw new Error('missing: ' + sel);
  // a dispatched click reaches the page's delegated handlers even when a frozen toast overlaps the button
  await vis(page, sel).dispatchEvent('click');
}
async function fill(page, sel, value) {
  const n = await page.locator(sel).filter({ visible: true }).count();
  if (!n) throw new Error('missing: ' + sel);
  await vis(page, sel).fill(String(value), { force: true });
}
async function select(page, sel, value) {
  const n = await page.locator(sel).filter({ visible: true }).count();
  if (!n) throw new Error('missing: ' + sel);
  await vis(page, sel).selectOption(value, { force: true });
}
async function submit(page, formSel) { await page.locator(formSel).dispatchEvent('submit'); }
async function undoRest(page, id) {
  for (let i = 0; i < 3; i++) {
    const u = page.locator('.rest-btn[data-act="rest"][data-h="' + id + '"]').filter({ hasText: 'Undo' }).filter({ visible: true });
    if (await u.count()) { await u.first().dispatchEvent('click'); await settle(page); } else break;
  }
}
async function settle(page) {
  // drain microtasks (fake cloud snapshots, promise chains) without needing timers
  await page.evaluate(() => new Promise(r => { let i = 0; (function tick() { if (++i > 20) return r(); Promise.resolve().then(tick); })(); }));
}
async function escape(page) { await page.keyboard.press('Escape'); await settle(page); }
async function tab(page, name) { await click(page, '[data-tab="' + name + '"]'); await settle(page); }

export const steps = [
  { name: 'load (cloud connected)', run: async (page) => {
    await page.waitForFunction(() => /Synced/.test((document.querySelector('#sync') || {}).textContent || ''), null, { timeout: 10000 });
    await settle(page);
  } },
  { name: 'tab: lifts', run: async (page) => tab(page, 'lifts') },
  { name: 'tab: body', run: async (page) => tab(page, 'body') },
  { name: 'tab: progress', run: async (page) => tab(page, 'progress') },
  { name: 'tab: build', run: async (page) => tab(page, 'build') },
  { name: 'tab: today', run: async (page) => tab(page, 'today') },

  // ---- Today ----
  { name: 'toggle Read', run: async (page) => { await click(page, '[data-act="toggle"][data-h="read"]'); await settle(page); await escape(page); } },
  { name: 'toggle Read back', run: async (page) => { await click(page, '[data-act="toggle"][data-h="read"]'); await settle(page); await escape(page); } },
  { name: 'make sure Read is done', run: async (page) => {
    if (await page.locator('[data-act="toggle"][data-h="read"][aria-pressed="false"]').count()) { await click(page, '[data-act="toggle"][data-h="read"]'); await settle(page); await escape(page); }
  } },
  { name: 'open extra sheet (Read)', run: async (page) => { await click(page, '[data-act="open-extra"][data-h="read"]'); await settle(page); } },
  { name: 'log preset extra', run: async (page) => { await click(page, '[data-act="log-preset"]'); await settle(page); await escape(page); } },
  { name: 'open extra sheet, type a note', run: async (page) => { await click(page, '[data-act="open-extra"][data-h="read"]'); await fill(page, '#ex-note', 'Tafsir session'); await submit(page, '#ex-form'); await settle(page); await escape(page); } },
  { name: 'remove an extra', run: async (page) => { await click(page, '[data-act="rm-extra"][data-h="read"]'); await settle(page); } },
  { name: 'Train: rest day', run: async (page) => { await undoRest(page, 'workout'); await click(page, '.rest-btn[data-act="rest"][data-h="workout"]'); await settle(page); await escape(page); } },
  { name: 'Train: light day', run: async (page) => { await undoRest(page, 'workout'); await click(page, '[data-act="light"][data-h="workout"]'); await settle(page); await escape(page); } },
  { name: 'Train: done', run: async (page) => { await undoRest(page, 'workout'); await click(page, '[data-act="toggle"][data-h="workout"]'); await settle(page); await escape(page); } },
  { name: 'toggle every remaining habit (clean sweep)', run: async (page) => {
    const ids = await page.evaluate(() => Array.from(document.querySelectorAll('[data-act="toggle"][aria-pressed="false"]')).map(b => b.getAttribute('data-h')));
    for (const id of ids) { await click(page, '[data-act="toggle"][data-h="' + id + '"]'); await settle(page); }
    await escape(page);
  } },
  { name: 'open rank sheet (overall)', run: async (page) => { await click(page, '[data-act="open-rank"][data-h="overall"]'); await settle(page); } },
  { name: 'close rank sheet', run: async (page) => escape(page) },
  { name: 'open rank sheet (habit)', run: async (page) => { await click(page, '[data-act="open-rank"][data-h="meditate"]'); await settle(page); await escape(page); } },
  { name: 'week prev', run: async (page) => { await click(page, '[data-act="week-prev"]'); await settle(page); } },
  { name: 'pick a day', run: async (page) => { await click(page, '[data-act="pick-day"]:not([disabled])'); await settle(page); } },
  { name: 'toggle a habit on a past day', run: async (page) => { await click(page, '[data-act="toggle"]'); await settle(page); await escape(page); } },
  { name: 'back to today', run: async (page) => { await click(page, '[data-act="go-today"]'); await settle(page); } },
  { name: 'week next is disabled on this week', run: async (page) => { await click(page, '[data-act="week-prev"]'); await settle(page); await click(page, '[data-act="week-next"]'); await settle(page); } },

  // ---- Settings sheet ----
  { name: 'open settings', run: async (page) => { await click(page, '#btn-settings'); await settle(page); } },
  { name: 'rename a habit, add one, pause one', run: async (page) => {
    await fill(page, '#st-list input[data-f="name"]', 'Read (books)');
    await fill(page, '#new-name', 'Walk');
    await fill(page, '#new-target', '20 minutes');
    await click(page, '#btn-add');
    await click(page, '[data-act="pause"]');
    await settle(page);
  } },
  { name: 'save habits', run: async (page) => { await click(page, '#btn-save'); await settle(page); await escape(page); } },
  { name: 'reopen settings, resume, cancel', run: async (page) => { await click(page, '#btn-settings'); await settle(page); await click(page, '[data-act="resume"]'); await settle(page); await escape(page); } },

  // ---- Lifts ----
  { name: 'lifts: open sheet', run: async (page) => { await tab(page, 'lifts'); await click(page, '[data-act="open-lift"]'); await settle(page); } },
  { name: 'lifts: choose a past exercise (prefill)', run: async (page) => {
    await fill(page, '#lf-ex', 'Lat pulldown');
    await page.locator('#lf-ex').dispatchEvent('change');
    await settle(page);
  } },
  { name: 'lifts: fill sets and save', run: async (page) => {
    await click(page, '#lf-add-set');
    const ids = await page.evaluate(() => Array.from(document.querySelectorAll('#lf-sets input[id^="lf-w-"]')).map(i => i.id.slice(5)));
    const weights = [150, 150, 150, 140], reps = [10, 9, 8, 10];
    for (let i = 0; i < ids.length; i++) { await fill(page, '#lf-w-' + ids[i], weights[i] || 140); await fill(page, '#lf-r-' + ids[i], reps[i] || 8); }
    await select(page, '#lf-rir', '1');
    await fill(page, '#lf-notes', 'Harness lift');
    await click(page, '#lf-save');
    await settle(page);
  } },
  { name: 'lifts: celebrate timers fire', run: async (page) => { await page.clock.runFor(200); await settle(page); } },
  { name: 'lifts: filter by location', run: async (page) => { await click(page, '[data-act="lift-filter"][data-loc="Home"]'); await settle(page); } },
  { name: 'lifts: filter All, toggle ladder', run: async (page) => { await click(page, '[data-act="lift-filter"][data-loc="All"]'); await click(page, '[data-act="toggle-ladder"]'); await settle(page); } },
  { name: 'lifts: open lift progress', run: async (page) => { await page.evaluate(() => { document.querySelector('details.sx-more').open = true; }); await settle(page); } },
  { name: 'lifts: arm delete', run: async (page) => { await click(page, '[data-act="del-lift"]'); await settle(page); } },
  { name: 'lifts: arm expires', run: async (page) => { await page.clock.runFor(4100); await settle(page); } },
  { name: 'lifts: delete for real', run: async (page) => {
    await page.evaluate(() => { document.querySelector('details.sx-more').open = true; });
    await click(page, '[data-act="del-lift"]'); await settle(page);
    await page.evaluate(() => { document.querySelector('details.sx-more').open = true; });
    await click(page, '[data-act="del-lift"]'); await settle(page);
  } },
  { name: 'lifts: save with a validation error', run: async (page) => { await click(page, '[data-act="open-lift"]'); await click(page, '#lf-save'); await settle(page); await escape(page); } },

  // ---- Body ----
  { name: 'body: open check-in', run: async (page) => { await tab(page, 'body'); await click(page, '[data-act="open-checkin"]'); await settle(page); } },
  { name: 'body: fill and save check-in', run: async (page) => {
    await click(page, '[data-act="ci-chip"][data-g="sess"][data-v="legs"]');
    await click(page, '[data-act="ci-chip"][data-g="patch"][data-v="true"]');
    await click(page, '[data-act="ci-chip"][data-g="vape"][data-v="false"]');
    await click(page, '[data-act="ci-chip"][data-g="tags"][data-v="early_wake"]');
    await fill(page, '#ci-rec', 71); await fill(page, '#ci-hrv', 88); await fill(page, '#ci-rhr', 51); await fill(page, '#ci-sleep', 7.4);
    await fill(page, '#ci-bed', '21:35'); await fill(page, '#ci-wake', '05:40');
    await fill(page, '#ci-cal', 3400); await fill(page, '#ci-pro', 195); await fill(page, '#ci-carb', 410); await fill(page, '#ci-fat', 88);
    await fill(page, '#ci-weight', 152.4); await fill(page, '#ci-meal', '19:45');
    await submit(page, '#ci-form');
    await settle(page);
    await page.clock.runFor(100); await settle(page);
  } },
  { name: 'body: toggle filter', run: async (page) => { await click(page, '[data-act="body-filter"]'); await settle(page); } },
  { name: 'body: previous week', run: async (page) => { await click(page, '[data-act="body-week"][data-dir="-1"]'); await settle(page); } },
  { name: 'body: next week', run: async (page) => { await click(page, '[data-act="body-week"][data-dir="1"]'); await settle(page); } },
  { name: 'body: apply calorie suggestion', run: async (page) => {
    const n = await page.locator('[data-act="apply-cal"]').count();
    if (n) { await click(page, '[data-act="apply-cal"]'); await settle(page); }
    else await page.evaluate(() => { document.body.setAttribute('data-step-note', 'no apply-cal button'); });
  } },

  // ---- Progress ----
  { name: 'progress: hover chart bar', run: async (page) => { await tab(page, 'progress'); await page.locator('#chart rect[data-i]').first().dispatchEvent('pointermove'); await settle(page); } },
  { name: 'progress: click heatmap cell', run: async (page) => { await click(page, '#heat rect[data-d]'); await settle(page); } },
  { name: 'progress: set a reward', run: async (page) => {
    await fill(page, 'input[data-reward]', 'Steak at Peter Luger');
    await page.locator('input[data-reward]').first().dispatchEvent('input');
    await page.locator('input[data-reward]').first().dispatchEvent('change');
    await settle(page);
  } },
  { name: 'progress: open day from heatmap', run: async (page) => { await click(page, '[data-act="open-day"]'); await settle(page); } },

  // ---- Build ----
  { name: 'build: select a node', run: async (page) => { await tab(page, 'build'); await click(page, '[data-act="bnode"]'); await settle(page); } },
  { name: 'build: new ship from node', run: async (page) => {
    await click(page, '[data-act="bnew-ship"]');
    await fill(page, '#bd-title', 'Split into modules');
    await select(page, '#bd-kind', 'upgrade');
    await page.locator('#bd-kind').dispatchEvent('change');
    await fill(page, '#bd-note', 'Harness ship');
    await submit(page, '#bd-form');
    await settle(page);
  } },
  { name: 'build: new node with a link', run: async (page) => {
    await click(page, '[data-act="bnew-node"]');
    await fill(page, '#bd-name', 'GitHub');
    await select(page, '#bd-col', 'source');
    await select(page, '#bd-status', 'live');
    await fill(page, '#bd-venture', 'BOSS');
    await fill(page, '#bd-url', 'github.com/moose/game-of-life');
    const opts = await page.evaluate(() => Array.from(document.querySelectorAll('#bd-to option')).map(o => o.value).filter(Boolean));
    await select(page, '#bd-to', opts[0]);
    await fill(page, '#bd-label', 'code');
    await submit(page, '#bd-form');
    await settle(page);
  } },
  { name: 'build: new skill', run: async (page) => {
    await click(page, '[data-act="bnew-skill"]');
    await fill(page, '#bd-name', 'ES modules');
    await fill(page, '#bd-note', 'import and export between files');
    await submit(page, '#bd-form');
    await settle(page);
  } },
  { name: 'build: edit a ship, delete it', run: async (page) => {
    await click(page, '[data-act="bedit-ship"]');
    await click(page, '[data-act="bdelete"]'); await click(page, '[data-act="bdelete"]');
    await settle(page);
  } },
  { name: 'build: unlink, show all, ladder', run: async (page) => {
    const n = await page.locator('[data-act="bunlink"]').count();
    if (n) await click(page, '[data-act="bunlink"]');
    await click(page, '[data-act="bshow-all"]');
    await click(page, '[data-act="toggle-bladder"]');
    await settle(page);
  } },
  { name: 'build: clear selection', run: async (page) => { await click(page, '[data-act="bsel-clear"]'); await settle(page); } },

  // ---- Coach ----
  { name: 'coach: open', run: async (page) => { await click(page, '#btn-coach'); await settle(page); } },
  { name: 'coach: send a message (scripted tool call)', run: async (page) => {
    await fill(page, '#ch-in', 'Bed 11:40, rec 64, chest day');
    await submit(page, '#ch-form');
    await settle(page); await settle(page);
  } },
  { name: 'coach: undo the change', run: async (page) => { await click(page, '[data-coach="undo"]'); await settle(page); } },
  { name: 'coach: send another (plain answer)', run: async (page) => {
    await fill(page, '#ch-in', 'How was my week?');
    await submit(page, '#ch-form');
    await settle(page); await settle(page);
  } },
  { name: 'coach: new chat, close', run: async (page) => { await click(page, '[data-coach="new"]'); await settle(page); await escape(page); } },

  // ---- Sync edge cases ----
  { name: 'cloud write fails once, then retries', run: async (page) => {
    await tab(page, 'today');
    await page.evaluate(() => { window.__fake.failNext = 'unavailable'; });
    await click(page, '[data-act="toggle"][data-h="meditate"]');
    await settle(page);
    await page.clock.runFor(500); await settle(page);   // the 400 ms debounce fires, write fails
    await page.clock.runFor(2000); await settle(page);  // the backoff sleep fires, retry succeeds
    await escape(page);
  } },
  { name: 'midnight rollover', run: async (page) => {
    await page.clock.setSystemTime('2026-10-08T00:00:30-04:00');
    await page.clock.runFor(60000);
    await settle(page);
  } },
  { name: 'reload: cache round-trip', run: async (page) => {
    await page.reload();
    await page.waitForFunction(() => /Synced/.test((document.querySelector('#sync') || {}).textContent || ''), null, { timeout: 10000 });
    await settle(page);
  } },
  { name: 'visibility change flushes', run: async (page) => {
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await settle(page);
  } }
];
