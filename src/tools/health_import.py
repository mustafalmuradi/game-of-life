#!/usr/bin/env python3
"""Game Of Life health importer.

Parses a WHOOP export (zip or folder of CSVs) and/or a Cal AI summary report
(PDF, or its `pdftotext -layout` text) into one record per calendar day, then
diffs those records against the day documents already stored in the Game Of
Life artifact database and emits the writes needed to upsert them.

Rules (see the data dictionary for field meanings):
  * Upsert by date. Never create duplicate days.
  * Sleep, recovery and day strain are credited to the date you WAKE UP
    (America/New_York). Naps are stored separately, on the date they start.
  * Timestamps are converted from WHOOP's per-cycle UTC offset to
    America/New_York.
  * Missing values stay missing. Nothing is estimated or filled.
  * Inside the date range an export covers, the fields that source owns are
    replaced (and removed when the export has no value). Outside that range
    nothing is touched. Manual fields (sessions, tags, patch, vape, weight,
    waist) are never removed by an import.

Usage:
  python3 health_import.py --whoop export.zip --calai report.pdf \
      --db-dir <dir of current day docs as JSON> --out plan.json
The plan holds the per-day documents to write plus a report of added,
updated, unchanged and failed dates.
"""
import argparse, csv, io, json, os, re, sys, zipfile, datetime as dt
from zoneinfo import ZoneInfo

NY = ZoneInfo('America/New_York')
FOOD_MIN_KCAL = 50          # items below this (coffee, tea, condiments) don't count for timing or meal counts
MEAL_GAP_MIN = 30           # a new eating occasion starts after a 30+ minute gap
NIGHT_END_MIN = 4 * 60      # items logged 00:00-03:59 belong to the previous evening for timing fields

WHOOP_FIELDS = ['rec', 'hrv', 'rhr', 'rr', 'sleep', 'inbed', 'eff', 'sperf', 'bed', 'wake', 'deep', 'rem',
                'napMin', 'napStart', 'naps', 'strain', 'wo']
CALAI_FIELDS = ['cal', 'pro', 'carb', 'fat', 'fib', 'sod', 'first', 'meal', 'meals']


# ---------------------------------------------------------------- helpers
def to_ny(ts, offset):
    """'2026-09-25 23:48:24' + 'UTC-04:00' -> aware datetime in America/New_York."""
    if not ts:
        return None
    naive = dt.datetime.strptime(ts.strip(), '%Y-%m-%d %H:%M:%S')
    m = re.match(r'UTC([+-])(\d{2}):(\d{2})', (offset or '').strip())
    if not m:
        raise ValueError('bad timezone %r' % offset)
    sign = 1 if m.group(1) == '+' else -1
    tz = dt.timezone(sign * dt.timedelta(hours=int(m.group(2)), minutes=int(m.group(3))))
    return naive.replace(tzinfo=tz).astimezone(NY)


def hhmm(t):
    return '%02d:%02d' % (t.hour, t.minute)


def num(v, kind=float):
    v = (v or '').strip()
    if v == '':
        return None
    x = float(v)
    return int(round(x)) if kind is int else x


# ---------------------------------------------------------------- WHOOP
def read_whoop(path):
    files = {}
    if os.path.isdir(path):
        for n in os.listdir(path):
            if n.endswith('.csv'):
                files[n] = open(os.path.join(path, n), encoding='utf-8').read()
    else:
        with zipfile.ZipFile(path) as z:
            for n in z.namelist():
                if n.endswith('.csv'):
                    files[os.path.basename(n)] = z.read(n).decode('utf-8')
    return {k: list(csv.DictReader(io.StringIO(v))) for k, v in files.items()}


def parse_whoop(path):
    tables = read_whoop(path)
    cycles = tables.get('physiological_cycles.csv', [])
    sleeps = tables.get('sleeps.csv', [])
    workouts = tables.get('workouts.csv', [])
    days, failed, notes = {}, [], []

    def day(d):
        return days.setdefault(d, {})

    # main sleep + recovery + strain, credited to the wake date
    by_wake = {}
    no_sleep = []
    for i, r in enumerate(cycles):
        try:
            tz = r['Cycle timezone']
            onset, wake = to_ny(r['Sleep onset'], tz), to_ny(r['Wake onset'], tz)
            if not onset or not wake:
                no_sleep.append(r)
                continue
            by_wake.setdefault(wake.date().isoformat(), []).append((r, onset, wake))
        except Exception as e:  # noqa
            failed.append({'source': 'whoop', 'row': 'physiological_cycles.csv line %d' % (i + 2), 'error': str(e)})

    extra_sleeps = {}  # date -> list of secondary main sleeps stored as naps
    for d, rows in by_wake.items():
        rows.sort(key=lambda x: -(num(x[0]['Asleep duration (min)']) or 0))
        r, onset, wake = rows[0]
        if len(rows) > 1:
            for r2, on2, wk2 in rows[1:]:
                extra_sleeps.setdefault(on2.date().isoformat(), []).append(
                    {'start': hhmm(on2), 'min': num(r2['Asleep duration (min)'], int),
                     'inbed': num(r2['In bed duration (min)'], int), 'whoopSleep': True})
            notes.append('%s: WHOOP logged %d sleeps ending that day. Kept the longest as main sleep; the other is stored as a nap.' % (d, len(rows)))
        m = day(d)
        m['rec'] = num(r['Recovery score %'], int)
        m['hrv'] = num(r['Heart rate variability (ms)'], int)
        m['rhr'] = num(r['Resting heart rate (bpm)'], int)
        rr = num(r['Respiratory rate (rpm)'])
        m['rr'] = round(rr, 1) if rr is not None else None
        asleep, inbed = num(r['Asleep duration (min)']), num(r['In bed duration (min)'])
        m['sleep'] = round(asleep / 60, 2) if asleep is not None else None
        m['inbed'] = round(inbed / 60, 2) if inbed is not None else None
        m['eff'] = num(r['Sleep efficiency %'], int)
        m['sperf'] = num(r['Sleep performance %'], int)
        m['bed'] = hhmm(onset)
        m['wake'] = hhmm(wake)
        m['deep'] = num(r['Deep (SWS) duration (min)'], int)
        m['rem'] = num(r['REM duration (min)'], int)
        st = num(r['Day Strain'])
        m['strain'] = round(st, 1) if st is not None else None

    # cycles with no recorded sleep: strain goes to the date holding the cycle midpoint
    for r in no_sleep:
        try:
            tz = r['Cycle timezone']
            a, b = to_ny(r['Cycle start time'], tz), to_ny(r['Cycle end time'], tz)
            st = num(r['Day Strain'])
            if st is None or not a or not b:
                continue
            mid = a + (b - a) / 2
            d = mid.date().isoformat()
            m = day(d)
            if m.get('strain') is None:
                m['strain'] = round(st, 1)
            notes.append('%s: WHOOP cycle with no sleep recorded. Only day strain was stored.' % d)
        except Exception as e:  # noqa
            failed.append({'source': 'whoop', 'row': 'cycle %s' % r.get('Cycle start time'), 'error': str(e)})

    # naps, credited to the date they start
    naps = {}
    for i, r in enumerate(sleeps):
        if (r.get('Nap') or '').strip().lower() != 'true':
            continue
        try:
            tz = r['Cycle timezone']
            on = to_ny(r['Sleep onset'], tz)
            if not on:
                continue
            naps.setdefault(on.date().isoformat(), []).append(
                {'start': hhmm(on), 'min': num(r['Asleep duration (min)'], int), 'inbed': num(r['In bed duration (min)'], int)})
        except Exception as e:  # noqa
            failed.append({'source': 'whoop', 'row': 'sleeps.csv line %d' % (i + 2), 'error': str(e)})
    for d, lst in extra_sleeps.items():
        naps.setdefault(d, []).extend(lst)

    # workouts, on the date they start
    wo = {}
    for i, r in enumerate(workouts):
        try:
            tz = r['Cycle timezone']
            s = to_ny(r['Workout start time'], tz)
            if not s:
                continue
            item = {'a': r['Activity name'].strip(), 'start': hhmm(s), 'min': num(r['Duration (min)'], int)}
            ws = num(r['Activity Strain'])
            if ws is not None:
                item['strain'] = round(ws, 1)
            wo.setdefault(s.date().isoformat(), []).append(item)
        except Exception as e:  # noqa
            failed.append({'source': 'whoop', 'row': 'workouts.csv line %d' % (i + 2), 'error': str(e)})

    # coverage: first to last date the export describes
    all_dates = set(days) | set(naps) | set(wo)
    if not all_dates:
        return {}, None, failed, notes
    lo, hi = min(all_dates), max(all_dates)
    covered = set(days)  # dates with a WHOOP main sleep or strain
    for d in sorted(all_dates):
        m = day(d)
        lst = sorted(naps.get(d, []), key=lambda n: n['start'])
        if lst:
            m['naps'] = lst
            m['napMin'] = sum(n['min'] or 0 for n in lst)
            m['napStart'] = lst[0]['start']
        elif d in covered:
            m['napMin'] = 0   # WHOOP tracked this day and recorded no nap
        if d in wo:
            m['wo'] = sorted(wo[d], key=lambda w: w['start'])
    # drop Nones
    for d in days:
        days[d] = {k: v for k, v in days[d].items() if v is not None}
    return days, (lo, hi), failed, notes


# ---------------------------------------------------------------- Cal AI
DATE_RE = re.compile(r'^\s*(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})\s*$')
ITEM_RE = re.compile(r'(?P<cal>\d[\d,]*)\s+(?P<pro>\d+(?:\.\d+)?)g\s+(?P<carb>\d+(?:\.\d+)?)g\s+(?P<fat>\d+(?:\.\d+)?)g\s+'
                     r'(?P<fib>\d+(?:\.\d+)?)g\s+(?P<sug>\d+(?:\.\d+)?)g\s+(?P<sod>\d[\d,]*(?:\.\d+)?)mg\s+(?P<time>\d{1,2}:\d{2}\s*[ap]m)\s*$', re.I)
TOTAL_RE = re.compile(r'TOTAL\s+Calories eaten:\s*(\d[\d,]*)', re.I)
RANGE_RE = re.compile(r'Start:\s*(\d{2}/\d{2}/\d{4})\s*\S\s*End:\s*(\d{2}/\d{2}/\d{4})')
WEIGHT_RE = re.compile(r'^\s*(\d{2,3}(?:\.\d+)?)\s*lbs\s+(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})\s*$')
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']


def calai_text(path):
    if path.lower().endswith('.pdf'):
        import subprocess
        return subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True, text=True, check=True).stdout
    return open(path, encoding='utf-8').read()


def clock_min(t):
    t = t.strip().lower().replace(' ', '')
    h, rest = t.split(':')
    mm, ap = int(rest[:2]), rest[2:]
    h = int(h) % 12 + (12 if ap == 'pm' else 0)
    return h * 60 + mm


def parse_calai(path):
    txt = calai_text(path)
    lines = txt.splitlines()
    failed, notes = [], []
    rng = RANGE_RE.search(txt)
    coverage = None
    if rng:
        a = dt.datetime.strptime(rng.group(1), '%m/%d/%Y').date().isoformat()
        b = dt.datetime.strptime(rng.group(2), '%m/%d/%Y').date().isoformat()
        coverage = (a, b)
    weights = {}
    raw = {}
    cur = None
    for ln in lines:
        wm = WEIGHT_RE.match(ln)
        if wm:
            d = dt.date(int(wm.group(4)), MONTHS.index(wm.group(2)) + 1, int(wm.group(3))).isoformat()
            weights[d] = float(wm.group(1))
            continue
        dm = DATE_RE.match(ln)
        if dm:
            cur = dt.date(int(dm.group(3)), MONTHS.index(dm.group(1)) + 1, int(dm.group(2))).isoformat()
            raw.setdefault(cur, {'items': [], 'total': None})
            continue
        if cur is None:
            continue
        im = ITEM_RE.search(ln)
        if im:
            g = im.groupdict()
            raw[cur]['items'].append({
                'cal': float(g['cal'].replace(',', '')), 'pro': float(g['pro']), 'carb': float(g['carb']),
                'fat': float(g['fat']), 'fib': float(g['fib']), 'sod': float(g['sod'].replace(',', '')),
                'min': clock_min(g['time'])})
            continue
        tm = TOTAL_RE.search(ln)
        if tm:
            raw[cur]['total'] = float(tm.group(1).replace(',', ''))
            cur = None

    days = {}
    late_spill = {}  # previous-date timing contributions from 00:00-03:59 items
    for d in sorted(raw):
        items, total = raw[d]['items'], raw[d]['total']
        s = sum(i['cal'] for i in items)
        if total is None:
            failed.append({'source': 'calai', 'date': d, 'error': 'no TOTAL line found'})
            continue
        if abs(s - total) > 1:
            failed.append({'source': 'calai', 'date': d, 'error': 'items add to %d kcal but the report total is %d. Skipped this day.' % (s, total)})
            continue
        m = {'cal': int(round(total))}
        for k in ('pro', 'carb', 'fat', 'fib', 'sod'):
            m[k] = int(round(sum(i[k] for i in items)))
        days[d] = m
        food = [i for i in items if i['cal'] >= FOOD_MIN_KCAL]
        early = [i for i in food if i['min'] < NIGHT_END_MIN]
        if early:
            prev = (dt.date.fromisoformat(d) - dt.timedelta(days=1)).isoformat()
            late_spill.setdefault(prev, []).extend(early)
        days[d]['_food'] = [i for i in food if i['min'] >= NIGHT_END_MIN]

    for d in days:
        food = sorted(days[d].pop('_food') + [dict(i, min=i['min'] + 1440) for i in late_spill.get(d, [])], key=lambda i: i['min'])
        if food:
            days[d]['first'] = '%02d:%02d' % divmod(food[0]['min'] % 1440, 60)
            days[d]['meal'] = '%02d:%02d' % divmod(food[-1]['min'] % 1440, 60)
            meals, last = 0, None
            for i in food:
                if last is None or i['min'] - last >= MEAL_GAP_MIN:
                    meals += 1
                last = i['min']
            days[d]['meals'] = meals
        elif days[d].get('cal', 0) > 0:
            notes.append('%s: nothing logged over %d kcal, so no meal times.' % (d, FOOD_MIN_KCAL))
    for d in late_spill:
        if d not in days:
            notes.append('%s: food logged after midnight belongs to this evening, but the day itself is outside the report.' % d)
    return days, coverage, weights, failed, notes


# ---------------------------------------------------------------- merge
def load_db(db_dir):
    docs = {}
    if not db_dir or not os.path.isdir(db_dir):
        return docs
    for n in os.listdir(db_dir):
        if n.endswith('.json'):
            d = json.load(open(os.path.join(db_dir, n)))
            docs[n[:-5]] = d
    return docs


def in_range(d, rng):
    return rng is not None and rng[0] <= d <= rng[1]


def plan(db_docs, versions, whoop=None, calai=None):
    """Return (writes, report). versions: date -> current version (None for new)."""
    wd, wr = (whoop or ({}, None))[:2]
    cd, cr, weights = (calai or ({}, None, {}))[:3]
    dates = set(wd) | set(cd) | set(weights)
    # dates inside a covered range whose stored source fields must be cleared
    for d, doc in db_docs.items():
        m = (doc or {}).get('m') or {}
        if in_range(d, wr) and any(k in m for k in WHOOP_FIELDS):
            dates.add(d)
        if in_range(d, cr) and any(k in m for k in CALAI_FIELDS):
            dates.add(d)
    writes, added, updated, unchanged = [], [], [], []
    for d in sorted(dates):
        old = db_docs.get(d)
        doc = json.loads(json.dumps(old)) if old else {'date': d}
        m = dict(doc.get('m') or {})
        if in_range(d, wr):
            for k in WHOOP_FIELDS:
                m.pop(k, None)
            m.update(wd.get(d, {}))
        if in_range(d, cr):
            for k in CALAI_FIELDS:
                m.pop(k, None)
            m.update(cd.get(d, {}))
        if d in weights:
            m['weight'] = weights[d]
        if m == ((old or {}).get('m') or {}):
            if old:
                unchanged.append(d)
            continue
        if not m and not old:
            continue
        doc['date'] = d
        if m:
            doc['m'] = m
        else:
            doc.pop('m', None)
        changed = sorted(set(k for k in set(m) | set((old or {}).get('m', {})) if m.get(k) != ((old or {}).get('m') or {}).get(k)))
        writes.append({'date': d, 'doc': doc, 'if_version': versions.get(d), 'changed': changed})
        (updated if old else added).append(d)
    report = {'added': added, 'updated': updated, 'unchanged': unchanged,
              'whoop_range': wr, 'calai_range': cr}
    return writes, report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--whoop')
    ap.add_argument('--calai')
    ap.add_argument('--db-dir', help='folder of current day docs (ArtifactData list with out_dir)')
    ap.add_argument('--versions', help='JSON file date -> version of current docs')
    ap.add_argument('--out', default='plan.json')
    a = ap.parse_args()
    failed, notes = [], []
    whoop = calai = None
    if a.whoop:
        wd, wr, wf, wn = parse_whoop(a.whoop)
        whoop = (wd, wr)
        failed += wf; notes += wn
    if a.calai:
        cd, cr, weights, cf, cn = parse_calai(a.calai)
        calai = (cd, cr, weights)
        failed += cf; notes += cn
    db = {}
    if a.db_dir:
        for d, doc in load_db(a.db_dir).items():
            db[d] = doc
    versions = json.load(open(a.versions)) if a.versions else {}
    writes, report = plan(db, versions, whoop, calai)
    report['failed'] = failed
    report['notes'] = notes
    json.dump({'writes': writes, 'report': report}, open(a.out, 'w'), indent=1)
    print(json.dumps({k: (v if k in ('failed', 'notes', 'whoop_range', 'calai_range') else len(v)) for k, v in report.items()}, indent=1))


if __name__ == '__main__':
    main()
