/* Axiom. Every byte of progress is one localStorage record on this device. */
const Store = (function () {
  'use strict';
  const KEY = 'axiom.v1';
  const DEFAULTS = {
    onboarded: false,
    installed: null,
    solved: {},        // theoremId -> { len, par, crown, hints, ms, at, proof }
    daily: {},         // 'YYYY-MM-DD' -> { id, len, par, crown, hints, ms, shape }
    forge: {},         // moveType -> { done, lastAt }
    rigor: 1000,
    seen: {},          // vignette ids already read
    settings: { sound: true, haptics: true, notify: false, notifyTime: '19:00' }
  };

  /* A record is only trusted field by field: a string where a map belongs would make
     Object.keys count its letters, and the map would then claim proofs nobody made. */
  const asMap = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  const clean = (m, ok) => {
    const out = {};
    Object.keys(asMap(m)).forEach(k => { const v = m[k]; if (ok(v)) out[k] = v; });
    return out;
  };

  /* The settings block was the one part copied over whole. Restore reads any file a user
     hands it, and a notifyTime that is not a time reaches scheduleNotifications, where it
     is split on a colon. Check each field against its own type. */
  const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
  function cleanSettings(s) {
    s = asMap(s);
    const d = DEFAULTS.settings;
    return {
      sound: typeof s.sound === 'boolean' ? s.sound : d.sound,
      haptics: typeof s.haptics === 'boolean' ? s.haptics : d.haptics,
      notify: typeof s.notify === 'boolean' ? s.notify : d.notify,
      notifyTime: typeof s.notifyTime === 'string' && TIME.test(s.notifyTime) ? s.notifyTime : d.notifyTime
    };
  }

  function sanitize(d) {
    d = asMap(d);
    return {
      onboarded: !!d.onboarded,
      installed: typeof d.installed === 'string' ? d.installed : null,
      solved: clean(d.solved, v => v && typeof v === 'object' && typeof v.len === 'number'),
      daily: clean(d.daily, v => v && typeof v === 'object' && typeof v.len === 'number'),
      forge: clean(d.forge, v => v && typeof v === 'object' && typeof v.done === 'number'),
      rigor: typeof d.rigor === 'number' && isFinite(d.rigor) ? d.rigor : 1000,
      seen: clean(d.seen, () => true),
      settings: cleanSettings(d.settings)
    };
  }

  let db = load();
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULTS));
      return sanitize(JSON.parse(raw));
    } catch (e) { return JSON.parse(JSON.stringify(DEFAULTS)); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }

  /* ---------- dates ---------- */
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseYmd = s => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const today = () => ymd(new Date());
  const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
  const EPOCH = '2026-01-01';
  const dayNumber = s => Math.round((parseYmd(s || today()) - parseYmd(EPOCH)) / 86400000) + 1;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                  'August', 'September', 'October', 'November', 'December'];
  const longDate = s => { const d = parseYmd(s); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); };
  const shortDate = s => { const d = parseYmd(s); return d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3); };

  /* ---------- the daily theorem ----------
     Derived from the date alone, so every player gets the same one without a server. */
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const WEEK = [7, 3, 3, 5, 5, 6, 8];   // Sunday first: gentle midweek, spicy Saturday
  function dailyTheorem(date) {
    date = date || today();
    const want = WEEK[parseYmd(date).getDay()];
    const all = Content.THEOREMS.filter(t => t.par);
    let pool = all.filter(t => Math.abs(t.par - want) <= 1);
    if (pool.length < 4) pool = all;
    pool = pool.slice().sort((a, b) => a.id < b.id ? -1 : 1);
    return pool[hash('axiom' + date) % pool.length];
  }

  /* ---------- progress ---------- */
  const solved = id => db.solved[id] || null;
  const solvedCount = () => Object.keys(db.solved).length;
  const crowns = tier => Object.keys(db.solved).filter(k => db.solved[k].crown === tier).length;
  function regionOpen(region) {
    const r = Content.REGIONS.filter(x => x.id === region)[0];
    if (!r) return true;
    // a daily can hand you a theorem from a region you have not reached yet; having
    // proved one there opens the pass, because you have plainly already crossed it
    return solvedCount() >= r.gate || regionSolved(region) > 0;
  }
  function regionSolved(region) {
    return Content.THEOREMS.filter(t => t.region === region && db.solved[t.id]).length;
  }

  function crownFor(len, par, hints) {
    if (hints === 0 && len <= par) return 'gold';
    if (len <= par + 2) return 'silver';
    return 'none';
  }
  const CROWN_RANK = { none: 0, silver: 1, gold: 2 };

  /** Record a finished proof. Returns { crown, improved, gain }. */
  function record(thm, len, hints, ms, proof) {
    const par = thm.par || len;
    const crown = crownFor(len, par, hints);
    const prev = db.solved[thm.id];
    const improved = !prev || len < prev.len || CROWN_RANK[crown] > CROWN_RANK[prev.crown];
    if (improved) {
      db.solved[thm.id] = { len: len, par: par, crown: crown, hints: hints, ms: ms, at: Date.now(), proof: proof };
    }
    let gain = 0;
    if (!prev) {
      gain = 14 + Math.max(0, (par - len)) * 8 - hints * 4 - Math.max(0, len - par) * 3;
      gain = Math.max(3, gain);
    } else if (improved) {
      gain = 5;
    }
    db.rigor += gain;
    if (!db.installed) db.installed = today();
    save();
    return { crown: crown, improved: improved, gain: gain };
  }

  /* ---------- daily ---------- */
  function recordDaily(date, thm, len, hints, ms, shape) {
    db.daily[date] = { id: thm.id, len: len, par: thm.par, hints: hints, ms: ms,
                       crown: crownFor(len, thm.par, hints), shape: shape };
    save();
  }
  const dailyResult = date => db.daily[date || today()] || null;

  /** Consecutive days ending today or yesterday. */
  function streak() {
    let n = 0, d = today();
    if (!db.daily[d]) { d = addDays(d, -1); if (!db.daily[d]) return 0; }
    while (db.daily[d]) { n++; d = addDays(d, -1); }
    return n;
  }
  function archive(n) {
    const out = [];
    for (let i = 0; i < (n || 30); i++) {
      const d = addDays(today(), -i);
      out.push({ date: d, day: dayNumber(d), result: db.daily[d] || null, theorem: dailyTheorem(d) });
    }
    return out;
  }

  /* ---------- forge ---------- */
  function forgeDone(kind) {
    const f = db.forge[kind] || { done: 0, lastAt: 0 };
    f.done++; f.lastAt = Date.now();
    db.forge[kind] = f;
    db.rigor += 3;
    save();
  }
  /** Mastery fades over three weeks, which is what makes the forge worth revisiting. */
  function mastery(kind) {
    const f = db.forge[kind];
    if (!f) return 0;
    const weeks = (Date.now() - f.lastAt) / (7 * 86400000);
    const base = Math.min(1, f.done / 6);
    return Math.max(0, Math.min(1, base - weeks * 0.33));
  }

  /* ---------- settings, export, erase ---------- */
  function settings(patch) { if (patch) { db.settings = cleanSettings(Object.assign({}, db.settings, patch)); save(); } return db.settings; }
  function onboarded(v) {
    if (v !== undefined) { db.onboarded = !!v; if (!db.installed) db.installed = today(); save(); }
    return db.onboarded;
  }
  function seen(id, v) { if (v !== undefined) { db.seen[id] = !!v; save(); } return !!db.seen[id]; }
  const rigor = () => db.rigor;
  function exportJson() {
    return JSON.stringify({ app: 'axiom', version: 1, exported: today(), data: db }, null, 2);
  }
  /** Read an exported file back. Returns { ok, reason, proofs } and never half-applies. */
  function inspectJson(text) {
    let f = null;
    try { f = JSON.parse(text); } catch (e) { return { ok: false, reason: 'That file is not readable as JSON.' }; }
    if (!f || typeof f !== 'object') return { ok: false, reason: 'That file is not an Axiom export.' };
    if (f.app !== 'axiom') return { ok: false, reason: 'That file was exported by a different app.' };
    const d = sanitize(f.data);
    const proofs = Object.keys(d.solved).length;
    const dailies = Object.keys(d.daily).length;
    if (!proofs && !dailies && !d.onboarded) return { ok: false, reason: 'That export has no progress in it.' };
    return { ok: true, db: d, proofs: proofs, dailies: dailies, exported: typeof f.exported === 'string' ? f.exported : null };
  }
  /** Replace everything with a checked export. */
  function restore(checked) {
    if (!checked || !checked.ok) return false;
    db = checked.db;
    save();
    return true;
  }
  function erase() { db = JSON.parse(JSON.stringify(DEFAULTS)); try { localStorage.removeItem(KEY); } catch (e) {} }

  return { today: today, addDays: addDays, longDate: longDate, shortDate: shortDate, dayNumber: dayNumber,
           dailyTheorem: dailyTheorem, solved: solved, solvedCount: solvedCount, crowns: crowns,
           regionOpen: regionOpen, regionSolved: regionSolved, crownFor: crownFor, record: record,
           recordDaily: recordDaily, dailyResult: dailyResult, streak: streak, archive: archive,
           forgeDone: forgeDone, mastery: mastery, settings: settings, onboarded: onboarded,
           seen: seen, rigor: rigor, exportJson: exportJson, inspectJson: inspectJson,
           restore: restore, erase: erase };
})();
