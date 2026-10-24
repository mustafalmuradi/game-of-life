// Unit test for the prayer-time engine (core/salah.js). Reference values come from the adhan library
// (ISNA method, Staten Island, America/New_York) and from published tables; the engine must land within a minute.
// Run: node test/salah.mjs
process.env.TZ = 'America/New_York';
const { salahTimes, salahConfig, salahNow, salahNight, prayerName, fmtMin, fmtLeft, RAWATIB, RAWATIB_TOTAL } = await import('../src/js/core/salah.js');

const cfg = salahConfig({});
const M = (h, m) => h * 60 + m;
// date → [fajr, sunrise, dhuhr, asr, maghrib, isha] as wall-clock minutes
const REF = {
  '2026-01-01': [M(5, 59), M(7, 20), M(12, 1), M(14, 23), M(16, 40), M(18, 2)],
  '2026-03-08': [M(6, 5), M(7, 19), M(13, 8), M(16, 24), M(18, 56), M(20, 11)],   // clocks spring forward at 2 AM
  '2026-06-15': [M(3, 46), M(5, 25), M(12, 58), M(16, 57), M(20, 29), M(22, 8)],
  '2026-10-07': [M(5, 44), M(6, 59), M(12, 45), M(15, 56), M(18, 29), M(19, 43)], // the harness's frozen day
  '2026-10-24': [M(6, 2), M(7, 18), M(12, 42), M(15, 36), M(18, 3), M(19, 19)],
  '2026-11-01': [M(5, 10), M(6, 27), M(11, 41), M(14, 28), M(16, 53), M(18, 10)],  // clocks fall back at 2 AM
};
const KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
let fails = 0;
function check(name, ok, detail) { if (!ok) { fails++; console.log('FAIL ' + name + (detail ? ': ' + detail : '')); } else console.log('ok   ' + name); }

for (const [key, ref] of Object.entries(REF)) {
  const t = salahTimes(key, cfg);
  const bad = KEYS.map((k, i) => Math.abs(t[k] - ref[i]) > 1 ? `${k} ${fmtMin(t[k])} vs ${fmtMin(ref[i])}` : null).filter(Boolean);
  check('times ' + key, !bad.length, bad.join(', '));
}
// Hanafi Asr is later than standard Asr, by roughly an hour in autumn
check('hanafi asr later', salahTimes('2026-10-24', salahConfig({ asrHanafi: 1 })).asr - salahTimes('2026-10-24', cfg).asr > 40);
// another place: Kuala Lumpur (adhan: fajr 6:29, sunrise 7:27, dhuhr 13:28, asr 16:49, maghrib 19:28, isha 20:26 on 2027-02-10 local)
{
  process.env.TZ = 'Asia/Kuala_Lumpur';
  const kl = salahTimes('2027-02-10', salahConfig({ lat: 3.139, lng: 101.6869 }));
  const ref = [M(6, 29), M(7, 27), M(13, 28), M(16, 49), M(19, 28), M(20, 26)];
  const bad = KEYS.map((k, i) => Math.abs(kl[k] - ref[i]) > 1 ? `${k} ${fmtMin(kl[k])} vs ${fmtMin(ref[i])}` : null).filter(Boolean);
  check('times Kuala Lumpur', !bad.length, bad.join(', '));
  process.env.TZ = 'America/New_York';
}
// the night
const n = salahNight('2026-10-24', cfg);
check('next fajr past midnight', n.fajrNext > 1440 && Math.abs(n.fajrNext - 1440 - M(6, 3)) <= 1, fmtMin(n.fajrNext));
check('last third after islamic midnight', n.lastThird > n.midnight && n.midnight > salahTimes('2026-10-24', cfg).maghrib);
// where "now" sits
const t = salahTimes('2026-10-24', cfg);
let w = salahNow('2026-10-24', M(4, 30), cfg);
check('before fajr: current is last night\'s isha', w.cur.k === 'isha' && w.cur.night === true && w.next.k === 'fajr' && w.pct === 0);
w = salahNow('2026-10-24', t.fajr, cfg);
check('at fajr: fajr current, shuruq next', w.cur.k === 'fajr' && w.next.k === 'sunrise' && w.idx === 0);
w = salahNow('2026-10-24', M(14, 0), cfg);
check('2 PM: dhuhr current, asr next', w.cur.k === 'dhuhr' && w.next.k === 'asr' && w.pct > 40 && w.pct < 60, JSON.stringify(w));
w = salahNow('2026-10-24', M(22, 0), cfg);
check('late evening: isha current, tomorrow\'s fajr next', w.cur.k === 'isha' && w.next.k === 'fajr' && w.next.tomorrow === true && w.next.min > 1440 && w.pct === 100);
check('countdown wraps past midnight', fmtLeft(w.next.min - M(22, 0)) === '8h 03m', fmtLeft(w.next.min - M(22, 0)));
// names and formatting
check('friday dhuhr is jumu\'ah', prayerName('dhuhr', '2026-10-23') === 'Jumu’ah' && prayerName('dhuhr', '2026-10-24') === 'Dhuhr');
check('fmtMin', fmtMin(M(0, 5)) === '12:05 AM' && fmtMin(M(12, 0)) === '12:00 PM' && fmtMin(M(15, 36)) === '3:36 PM' && fmtMin(1803) === '6:03 AM');
check('fmtLeft', fmtLeft(0.4) === '<1m' && fmtLeft(42) === '42m' && fmtLeft(72) === '1h 12m' && fmtLeft(120) === '2h');
check('rawatib add up to 12', RAWATIB.reduce((a, r) => a + r.r, 0) === RAWATIB_TOTAL && RAWATIB.length === 5);
// config falls back to the defaults for anything missing or malformed
const c2 = salahConfig({ lat: 'x', lng: null, asrHanafi: '1' });
check('config defaults', c2.lat === cfg.lat && c2.lng === cfg.lng && c2.asrHanafi === 1 && c2.fajrAngle === 15);

console.log(fails ? `\n${fails} failure(s)` : '\nall good');
process.exit(fails ? 1 : 0);
