// Injected into every test page before any page script runs.
// 1. Seeds Math.random so generated ids are identical across runs.
// 2. Installs a fake window.claude with db, user and sample namespaces,
//    enough for the tracker's sync and coach code paths to run headless.
// Config arrives as window.__fake = { seed, cloud: {docPath: data}, script: [...] }.
(function (cfg) {
  'use strict';
  cfg = cfg || {};
  // ---- seeded random (mulberry32) ----
  var s = (cfg.seed >>> 0) || 1;
  Math.random = function () {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  var log = [];
  var fake = { log: log, cfg: cfg, failNext: null };
  window.__fake = fake;
  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  function later(fn) { return Promise.resolve().then(fn); }

  // ---- in-memory document store ----
  // The store survives a reload (sessionStorage) so the fake cloud behaves like a real one across page loads.
  var store = new Map(), saved = null;
  try { saved = JSON.parse(sessionStorage.getItem('__fake_cloud') || 'null'); } catch (e) { }
  Object.keys(saved || cfg.cloud || {}).forEach(function (p) { store.set(p, clone((saved || cfg.cloud)[p])); });
  function persist() { try { var o = {}; store.forEach(function (v, k) { o[k] = v; }); sessionStorage.setItem('__fake_cloud', JSON.stringify(o)); } catch (e) { } }
  var docSubs = new Map(), colSubs = new Map();
  function parentCol(path) { return path.slice(0, path.lastIndexOf('/')); }
  function lastSeg(path) { return path.slice(path.lastIndexOf('/') + 1); }
  function docSnap(path) {
    var d = store.get(path);
    return { id: lastSeg(path), exists: d !== undefined, data: function () { return clone(d); }, metadata: { fromCache: false } };
  }
  function colSnap(path) {
    var docs = [];
    store.forEach(function (v, k) { if (parentCol(k) === path) docs.push({ id: lastSeg(k), data: function () { return clone(v); } }); });
    docs.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
    return { empty: !docs.length, size: docs.length, docs: docs, metadata: { fromCache: false } };
  }
  var pending = new Set();
  function emit(path) {
    pending.add(path);
    later(function () {
      var paths = Array.from(pending); pending.clear();
      paths.forEach(function (p) {
        (docSubs.get(p) || []).forEach(function (cb) { cb(docSnap(p)); });
        var c = parentCol(p);
        (colSubs.get(c) || []).forEach(function (cb) { cb(colSnap(c)); });
      });
    });
  }
  function write(path, body) {
    var op = body === null ? 'delete' : 'set';
    log.push({ op: op, path: path, body: clone(body) });
    if (fake.failNext) { var code = fake.failNext; fake.failNext = null; return Promise.reject({ code: code, message: 'fake ' + code }); }
    if (body === null) store.delete(path); else store.set(path, clone(body));
    persist();
    emit(path);
    return later(function () { });
  }
  function docRef(path) {
    return {
      path: path,
      collection: function (name) { return colRef(path + '/' + name); },
      set: function (body) { return write(path, body); },
      update: function (body) { return write(path, Object.assign({}, store.get(path) || {}, body)); },
      delete: function () { return write(path, null); },
      get: function () { return later(function () { return docSnap(path); }); },
      onSnapshot: function (cb) { if (!docSubs.has(path)) docSubs.set(path, []); docSubs.get(path).push(cb); later(function () { cb(docSnap(path)); }); return function () { }; }
    };
  }
  function colRef(path) {
    return {
      path: path,
      doc: function (id) { return docRef(path + '/' + id); },
      get: function () { return later(function () { return colSnap(path); }); },
      onSnapshot: function (cb) { if (!colSubs.has(path)) colSubs.set(path, []); colSubs.get(path).push(cb); later(function () { cb(colSnap(path)); }); return function () { }; }
    };
  }
  var db = Object.freeze({ doc: function (p) { return docRef(p); }, collection: function (p) { return colRef(p); } });
  var user = Object.freeze({
    id: function () { return later(function () { return 'u_test'; }); },
    me: function () { return later(function () { return { id: 'u_test', name: 'Moose' }; }); },
    isOwner: function () { return later(function () { return true; }); },
    canEdit: function () { return later(function () { return true; }); }
  });

  // ---- scripted sample() ----
  var script = (cfg.script || []).slice();
  function sample(input, opts) {
    opts = opts || {};
    var step = script.shift() || { text: 'ok' };
    log.push({ op: 'sample', turns: Array.isArray(input) ? input.length : 1, tools: (opts.tools || []).map(function (t) { return t.name; }), hasSignal: !!opts.signal, images: (opts.images || []).length });
    return later(function () { return runStep(step, opts); });
  }
  function runStep(step, opts) {
    var p = Promise.resolve();
    if (step.error) return Promise.reject({ code: step.error, message: 'fake ' + step.error, text: step.text || '' });
    (step.tools || []).forEach(function (call) {
      p = p.then(function () {
        var t = (opts.tools || []).filter(function (x) { return x.name === call.name; })[0];
        if (!t) throw { code: 'tool_error', message: 'no tool ' + call.name };
        return Promise.resolve().then(function () { return t.execute(clone(call.input), { signal: opts.signal }); })
          .then(function (r) { log.push({ op: 'tool', name: call.name, result: clone(r) }); }, function (e) { log.push({ op: 'tool_error', name: call.name, error: String(e && e.message || e) }); });
      });
    });
    return p.then(function () {
      if (opts.onText) { var acc = ''; step.text.split(' ').forEach(function (w) { acc += (acc ? ' ' : '') + w; opts.onText({ text: acc, delta: w }); }); }
      return { text: step.text, truncated: !!step.truncated };
    });
  }
  sample.limits = function () { return later(function () { return { tools: { maxCount: 20 }, images: { maxCount: 4, maxInputBytes: 5000000, mediaTypes: ['image/jpeg', 'image/png'] } }; }); };
  sample.json = function (input, opts) { return sample(input, opts).then(function (r) { return JSON.parse(r.text); }); };

  var caps = { db: db, user: user, sample: sample };
  // --noruntime: no window.claude at all, the page must fall back to local mode
  if (!cfg.noClaude) window.claude = { use: function (name) { return later(function () { return caps[name] || null; }); } };
})(window.__fakeCfg);
