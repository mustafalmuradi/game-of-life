// Deterministic test data for the Game of Life tracker.
// Shapes mirror what the page's persistLocal() writes to localStorage
// and what the cloud db holds under data/users/<id>/tracker.
// Everything is derived from TODAY so the fixture ages correctly.

export const TODAY = '2026-10-07'; // a Wednesday; the harness freezes the clock here

function pad(n) { return String(n).padStart(2, '0'); }
function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function parseKey(k) { const p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function addDays(k, n) { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); }
function dow(k) { return parseKey(k).getDay(); } // 0 = Sunday
function ts(k, h = 12, m = 0) { const d = parseKey(k); d.setHours(h, m, 0, 0); return d.getTime(); }

const HABITS = [
  { id: 'read', name: 'Read', target: '25 minutes', color: 'read', since: '2000-01-01', pauses: [], presets: ['Extra reading session', 'Quran', 'Notes and review'] },
  { id: 'meditate', name: 'Meditate', target: '5 minutes', color: 'meditate', since: '2000-01-01', pauses: [], ladder: [5, 10, 15, 20, 25], unit: 'minutes', presets: ['Extra sit', 'Dhikr', 'Evening wind-down'] },
  { id: 'workout', name: 'Train', target: '5 strength + 1 light a week · 1 full rest', color: 'workout', since: '2000-01-01', pauses: [], restPerWeek: 2, maxPerWeek: 5, lightPerWeek: 1, extraCap: 1, presets: ['Mobility and stretching', 'Easy walk'] },
  { id: 'money', name: 'Money-producing work', target: 'One focused income block', color: 'money', since: '2000-01-01', pauses: [], presets: ['Extra call block', 'Outreach push', 'Deal or proposal work'] },
  { id: 'sleep', name: 'Bed on time', target: 'In bed by 9:00 PM', color: 'sleep', since: '2000-01-01', pauses: [], presets: ['Screens off by 8:30', 'Phone out of the room', 'Up for Fajr, no snooze'] },
  { id: 'nicotine', name: 'Nicotine-free', target: 'Patch on, zero vaping', color: 'x1', since: '2026-09-26', pauses: [], extraCap: 0, presets: ['Extra session'] },
  { id: 'eat', name: 'Eat enough', target: 'Hit your Cal AI calorie goal', color: 'x2', since: '2026-09-28', pauses: [], extraCap: 0, presets: ['Extra session'] },
  { id: 'sunnah', name: 'Sunnah prayers', target: '12 rawatib: Fajr 2, Dhuhr 4+2, Maghrib 2, Isha 2', color: 'x3', since: '2026-10-01', pauses: [], presets: ['Duha', '4 before Asr', 'Tahajjud'] },
  // a custom habit with a pause, to exercise the non-default paths
  { id: 'hcold1', name: 'Cold shower', target: 'Daily', color: 'x1', since: '2026-09-15', pauses: [{ from: '2026-09-29', to: '2026-10-03' }], restPerWeek: 0, presets: ['Extra session'] }
];

const TARGETS = { cal: 3274, pro: 190, proMax: 200, carb: 430, fat: 90, fib: 38, sod: 2300, lastMeal: '20:00', bed: '21:00', satBed: '00:00', trainPerWeek: 6, strengthPerWeek: 5, lightDays: 1, restDays: 1, ripMin: 2, ripMax: 3, goalWeight: 170, startWeight: 144 };

export function makeSettings() {
  return { version: 1, habits: HABITS, targets: TARGETS, rewards: { 'belt-1': 'New gi', 'pillars-2': 'Steak dinner' }, rewardsClaimed: {} };
}

function active(h, d) {
  if (h.since && d < h.since) return false;
  for (const p of h.pauses || []) if (d >= p.from && (!p.to || d < p.to)) return false;
  return true;
}

const ROT = ['chest_biceps', 'back_triceps', 'legs'];

export function makeDays(today = TODAY, span = 45) {
  const days = {};
  let weight = 149.6;
  for (let i = span - 1; i >= 0; i--) {
    const k = addDays(today, -i);
    if (i % 11 === 5) continue; // a few empty days
    const wd = dow(k);
    const day = { date: k, done: {}, extras: {}, rest: {} };
    const sweep = i % 4 === 1; // every fourth day is a clean sweep
    const act = HABITS.filter(h => active(h, k));
    const mark = (id, hour = 12) => { if (act.some(h => h.id === id)) day.done[id] = ts(k, hour, (i * 7) % 60); };
    if (sweep) {
      act.forEach(h => { if (h.id !== 'workout') mark(h.id, 9 + (h.id.length % 8)); });
      mark('workout', 17);
    } else {
      if (i % 7 !== 3) mark('read', 21);
      if (i % 5 !== 4) mark('meditate', 6);
      if (wd >= 1 && wd <= 5) mark('money', 14);
      if (i % 5 !== 0 && i % 5 !== 2) mark('sleep', 21);
      if (i % 9 !== 2) mark('nicotine', 22);
      if (i % 3 !== 1) mark('sunnah', 20);
      if (i % 2 === 0) mark('hcold1', 7);
      // Train: Mon Tue Thu Fri Sat strength, Wed light, Sun rest
      if (wd === 0) day.rest.workout = ts(k, 10);
      else if (wd === 3) day.rest.workout = 'light';
      else mark('workout', 17);
    }
    if (i % 6 === 0 && day.done.read) day.extras.read = [{ id: 'x' + i + 'r', note: 'Quran', at: ts(k, 22) }];
    if (i % 9 === 0 && day.done.workout) day.extras.workout = [{ id: 'x' + i + 'w', note: 'Easy walk', at: ts(k, 19) }];
    // metrics for the last 35 days
    if (i < 35) {
      const m = {};
      m.rec = 40 + ((i * 13) % 50);
      m.hrv = 52 + ((i * 7) % 38);
      m.rhr = 48 + ((i * 5) % 12);
      m.rr = 14 + ((i % 4) * 0.5);
      m.sleep = Number((5.6 + ((i * 3) % 27) / 10).toFixed(2));
      m.inbed = Number((m.sleep + 0.6).toFixed(2));
      m.eff = 84 + (i % 11);
      m.deep = 60 + ((i * 4) % 50);
      m.rem = 70 + ((i * 6) % 60);
      m.strain = Number((8 + ((i * 2) % 12)).toFixed(1));
      m.bed = ['21:05', '21:40', '22:30', '20:50', '23:45', '21:20', '22:05'][i % 7];
      m.wake = ['05:30', '05:45', '06:10', '05:20'][i % 4];
      if (i % 8 === 2) { m.napMin = 25; m.napStart = '14:30'; }
      m.cal = 2800 + ((i * 97) % 900);
      m.pro = 150 + ((i * 11) % 65);
      m.carb = 320 + ((i * 23) % 180);
      m.fat = 70 + ((i * 9) % 40);
      m.fib = 24 + ((i * 3) % 20);
      m.sod = 1800 + ((i * 131) % 1200);
      m.first = ['09:00', '10:30', '08:15', '12:00'][i % 4];
      m.meal = ['19:30', '21:00', '20:10', '22:40'][i % 4];
      m.meals = 3 + (i % 2);
      weight += (i % 3 === 0 ? 0.3 : -0.1);
      m.weight = Number(weight.toFixed(1));
      if (i === 30 || i === 1) m.waist = i === 30 ? 31.5 : 31.0;
      if (wd === 0) m.sess = ['rest'];
      else if (wd === 3) m.sess = i % 2 ? ['cardio'] : ['ripright'];
      else m.sess = [ROT[i % 3]].concat(i % 5 === 0 ? ['ripright'] : []);
      if (k >= '2026-09-26') { m.patch = i % 9 !== 2; m.vape = i % 9 === 2; }
      if (i === 12 || i === 20) m.tags = ['travel'];
      if (i === 7) m.tags = ['sick'];
      if (i === 3) m.tags = ['early_wake'];
      if (i === 15) m.tags = ['alcohol_late', 'early_wake'];
      if (sweep && m.cal < TARGETS.cal) m.cal = TARGETS.cal + 40; // keep sweeps honest
      if (!sweep && day.done.eat && m.cal < TARGETS.cal) delete day.done.eat;
      day.m = m;
    }
    if (!Object.keys(day.rest).length) delete day.rest;
    days[k] = day;
  }
  return days;
}

export function makeLifts(today = TODAY) {
  const L = [];
  const add = (daysAgo, exercise, location, sets, extra = {}) => {
    const date = addDays(today, -daysAgo);
    L.push(Object.assign({ id: 'e' + String(L.length).padStart(3, '0') + 'fix', exercise, location, date, sets, notes: '', createdAt: ts(date, 18, L.length), source: 'page' }, extra));
  };
  add(34, 'Hack squat (plate-loaded)', 'Heights Fitness', [{ w: 180, r: 10 }, { w: 180, r: 9 }, { w: 180, r: 8 }], { rir: 2 });
  add(33, 'Incline DB press', 'Heights Fitness', [{ w: 100, r: 10 }, { w: 100, r: 9 }, { w: 100, r: 8 }]);
  add(31, 'Lat pulldown', 'Heights Fitness', [{ w: 120, r: 12 }, { w: 130, r: 10 }, { w: 130, r: 9 }], { rir: 1, notes: 'Slow negatives' });
  add(27, 'Hack squat (plate-loaded)', 'Heights Fitness', [{ w: 200, r: 10 }, { w: 200, r: 9 }, { w: 200, r: 8 }], { rir: 2 });
  add(26, 'Romanian deadlift', 'Heights Fitness', [{ w: 155, r: 10 }, { w: 155, r: 10 }, { w: 165, r: 8 }]);
  add(24, 'Bowflex curl', 'Home', [{ w: 60, r: 12 }, { w: 60, r: 12 }], { notes: 'Bowflex' });
  add(20, 'Incline DB press', 'Heights Fitness', [{ w: 110, r: 10 }, { w: 110, r: 8 }, { w: 110, r: 8 }], { rir: 1 });
  add(19, 'Pull-ups', 'Home', [{ w: 0, r: 8 }, { w: 0, r: 7 }, { w: 0, r: 6 }]);
  add(13, 'Hack squat (plate-loaded)', 'Heights Fitness', [{ w: 220, r: 10 }, { w: 220, r: 9 }, { w: 220, r: 8 }, { w: 220, r: 6 }], { rir: 0, notes: 'PR day' });
  add(12, 'Lat pulldown', 'Heights Fitness', [{ w: 140, r: 10 }, { w: 140, r: 10 }, { w: 140, r: 8 }], { rir: 2 });
  add(6, 'Romanian deadlift', 'Heights Fitness', [{ w: 175, r: 10 }, { w: 175, r: 9 }, { w: 185, r: 6 }], { rir: 1 });
  add(5, 'Bowflex curl', 'Home', [{ w: 70, r: 12 }, { w: 70, r: 10 }]);
  add(1, 'Incline DB press', 'Heights Fitness', [{ w: 120, r: 8 }, { w: 120, r: 8 }, { w: 120, r: 7 }], { rir: 1, notes: 'Shoulder felt fine' });
  return L;
}

export function makeBuild(today = TODAY) {
  const d = n => addDays(today, -n);
  const nodes = [
    { id: 'n01fix', name: 'WHOOP', kind: 'source', status: 'live', venture: 'Life', url: '', note: 'Sleep and recovery', links: [{ to: 'n04fix', label: 'daily health records' }], order: 1, createdAt: ts(d(40)), source: 'page' },
    { id: 'n02fix', name: 'Higgsfield', kind: 'source', status: 'live', venture: 'Ock Spot', url: 'https://higgsfield.ai', note: 'Website builder and hosting', links: [{ to: 'n05fix', label: 'hosting' }], order: 2, createdAt: ts(d(38)), source: 'page' },
    { id: 'n03fix', name: 'Claude', kind: 'engine', status: 'live', venture: '', url: '', note: 'Builds and coaches', links: [{ to: 'n04fix', label: 'coach' }, { to: 'n05fix', label: 'pages' }, { to: 'n06fix', label: 'code' }], order: 3, createdAt: ts(d(37)), source: 'page' },
    { id: 'n04fix', name: 'Game of Life', kind: 'build', status: 'live', venture: 'Life', url: 'https://claude.ai/artifact/x', note: 'This tracker', links: [], order: 4, createdAt: ts(d(36)), source: 'page' },
    { id: 'n05fix', name: 'Ock Spot site', kind: 'build', status: 'live', venture: 'Ock Spot', url: 'https://ockspot.online', note: 'Deli website', links: [], order: 5, createdAt: ts(d(30)), source: 'page' },
    { id: 'n06fix', name: 'DMS', kind: 'build', status: 'building', venture: 'BOSS', url: '', note: 'Deli Management System', links: [], order: 6, createdAt: ts(d(20)), source: 'page' },
    { id: 'n07fix', name: 'Joe’s Barbershop site', kind: 'build', status: 'idea', venture: 'Web design', url: '', note: '', links: [], order: 7, createdAt: ts(d(4)), source: 'page' }
  ];
  const ships = [
    { id: 'b01fix', title: 'Game of Life: Today tab', kind: 'ship', date: d(36), node: 'n04fix', note: 'First version', createdAt: ts(d(36), 20), source: 'page' },
    { id: 'b02fix', title: 'WHOOP connected to the tracker', kind: 'connect', date: d(33), node: 'n04fix', note: '', createdAt: ts(d(33), 20), source: 'page' },
    { id: 'b03fix', title: 'Ock Spot site live on ockspot.online', kind: 'live', date: d(29), node: 'n05fix', note: 'Custom domain', createdAt: ts(d(29), 20), source: 'page' },
    { id: 'b04fix', title: 'Lifts tab with Iron ranks', kind: 'upgrade', date: d(22), node: 'n04fix', note: '', createdAt: ts(d(22), 20), source: 'page' },
    { id: 'b05fix', title: 'Fixed menu page typos', kind: 'fix', date: d(15), node: 'n05fix', note: '', createdAt: ts(d(15), 20), source: 'page' },
    { id: 'b06fix', title: 'Coach can log check-ins', kind: 'upgrade', date: d(8), node: 'n04fix', note: 'Nine tools', createdAt: ts(d(8), 20), source: 'page' },
    { id: 'b07fix', title: 'Build tab', kind: 'ship', date: d(2), node: 'n04fix', note: '', createdAt: ts(d(2), 20), source: 'page' }
  ];
  const skills = [
    { id: 'b08fix', name: 'Connecting apps to Claude', date: d(33), node: 'n04fix', note: 'Hook any app with a connector into a chat', createdAt: ts(d(33), 21), source: 'page' },
    { id: 'b09fix', name: 'Custom domains', date: d(29), node: 'n05fix', note: 'DNS records and SSL', createdAt: ts(d(29), 21), source: 'page' },
    { id: 'b10fix', name: 'Artifact databases', date: d(8), node: '', note: 'Shared state outside the page', createdAt: ts(d(8), 21), source: 'page' }
  ];
  return { bnodes: nodes, bships: ships, bskills: skills };
}

// What persistLocal() writes: the browser-side cache.
export function makeLocal(today = TODAY) {
  const lifts = makeLifts(today);
  return {
    v: 1,
    settings: makeSettings(),
    days: makeDays(today),
    unsynced: [addDays(today, -1)],           // one day waiting to sync
    lifts,
    liftOps: { [lifts[lifts.length - 1].id]: 'set' }, // the newest lift never reached the cloud
    build: makeBuild(today)
  };
}

// What the cloud holds: slightly behind the local cache, plus one day only it knows about.
export function makeCloud(today = TODAY) {
  const local = makeLocal(today);
  const days = JSON.parse(JSON.stringify(local.days));
  const stale = addDays(today, -1);
  if (days[stale]) { days[stale] = { date: stale, done: { read: ts(stale, 21) }, extras: {}, rest: {} }; } // older version of the unsynced day
  const only = addDays(today, -47);
  days[only] = { date: only, done: { read: ts(only, 21), meditate: ts(only, 6) }, extras: {}, rest: {}, updatedAt: ts(only, 23) };
  const lifts = local.lifts.slice(0, -1); // the pending one is missing
  return { settings: local.settings, days, lifts, build: local.build };
}

// gol-coach-v1: an array of turns, as coachSave() writes it
export const COACH_LOCAL = [
  { role: 'user', content: 'How did I sleep?', img: 0, err: '', acts: [] },
  { role: 'assistant', content: 'Bed at 9:40, **6.9 h**. Fine, not great.', img: 0, err: '', acts: [{ label: 'Oct 6 · sleep 6.9', undone: false }] }
];

export const BODY_FILTER = { travel: true };
