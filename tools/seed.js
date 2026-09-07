#!/usr/bin/env node
/* Builds a believable saved game for the store screenshots. Every proof in it is
   produced by the kernel's solver and re-checked, so nothing shown is invented. */
const path = require('path');
const fs = require('fs');
const WEB = path.join(__dirname, '..', 'web', 'js');
const K = require(path.join(WEB, 'kernel.js'));
const C = require(path.join(WEB, 'content.js'));

const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseYmd = s => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const today = ymd(new Date());

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const WEEK = [7, 3, 3, 5, 5, 6, 8];
function dailyTheorem(date) {
  const want = WEEK[parseYmd(date).getDay()];
  const all = C.THEOREMS.filter(t => t.par);
  let pool = all.filter(t => Math.abs(t.par - want) <= 1);
  if (pool.length < 4) pool = all;
  pool = pool.slice().sort((a, b) => a.id < b.id ? -1 : 1);
  return pool[hash('axiom' + date) % pool.length];
}

function proveIt(thm) {
  const tiles = (thm.tools || []).map(C.tool).filter(Boolean);
  const proof = K.solve(K.start(thm, tiles), 11, 400000);
  if (!proof) throw new Error('unsolved ' + thm.id);
  const st = K.start(thm, tiles);
  if (!K.applySeq(st, proof)) throw new Error('replay failed ' + thm.id);
  const v = K.verify(st);
  if (!v.ok) throw new Error('verify failed ' + thm.id + ': ' + v.reason);
  // 1.0.1 records which goal each step went to, so a proof replays even out of order
  return { proof: st.history.map(h => ({ n: h.node, r: h.rule })), st: st };
}

function shape(st) {
  const rows = [];
  (function walk(id, d) {
    const n = st.nodes[id]; if (!n) return;
    rows[d] = rows[d] || [];
    rows[d].push(n.kids.length ? '\u2B1B' : '\u{1F7E5}');
    n.kids.forEach(k => walk(k, d + 1));
  })(st.root, 0);
  return rows.map(r => r.join('')).join('\n');
}

const crownFor = (len, par, hints) => (hints === 0 && len <= par) ? 'gold' : (len <= par + 2 ? 'silver' : 'none');

/* who this player is: through the Riverlands, a start on the Steppes, the Fens still shut */
const PLAY = [
  ['r01', 0, 0], ['r02', 0, 0], ['r03', 0, 0], ['r04', 1, 1], ['r05', 0, 0],
  ['r06', 2, 1], ['r07', 0, 0], ['r08', 1, 2], ['r09', 0, 0], ['r10', 1, 0],
  ['s01', 0, 0], ['s02', 0, 0], ['s03', 1, 0]
];
const MINUTES = [38, 51, 74, 132, 96, 210, 168, 145, 88, 240, 42, 71, 63];

const db = {
  onboarded: true,
  installed: addDays(today, -23),
  solved: {}, daily: {}, forge: {}, rigor: 1000, seen: {},
  settings: { sound: true, haptics: true, notify: false, notifyTime: '19:00' }
};

PLAY.forEach(([id, extra, hints], i) => {
  const thm = C.theorem(id);
  const { proof, st } = proveIt(thm);
  const len = proof.length + extra;
  const par = thm.par;
  const crown = crownFor(len, par, hints);
  db.solved[id] = { len: len, par: par, crown: crown, hints: hints, ms: MINUTES[i],
                    at: Date.now() - (PLAY.length - i) * 86400000, proof: proof };
  db.rigor += Math.max(3, 14 + Math.max(0, par - len) * 8 - hints * 4 - Math.max(0, len - par) * 3);
});

/* a daily habit with one honest gap in it */
const DAYS = [0, 1, 2, 3, 4, 6, 7, 8, 9, 11];
const HINTS = [0, 0, 1, 0, 0, 0, 2, 0, 0, 1];
DAYS.forEach((back, i) => {
  const date = addDays(today, -back);
  const thm = dailyTheorem(date);
  const { proof, st } = proveIt(thm);
  const len = proof.length;
  const hints = HINTS[i];
  db.daily[date] = { id: thm.id, len: len, par: thm.par, hints: hints, ms: 120 + (i * 37) % 260,
                     crown: crownFor(len, thm.par, hints), shape: shape(st) };
  if (!db.solved[thm.id]) {
    db.solved[thm.id] = { len: len, par: thm.par, crown: db.daily[date].crown, hints: hints,
                          ms: db.daily[date].ms, at: Date.now() - back * 86400000, proof: proof };
    db.rigor += Math.max(3, 14 - hints * 4);
  }
});

db.forge = {
  split: { done: 7, lastAt: Date.now() - 2 * 86400000 },
  suppose: { done: 5, lastAt: Date.now() - 5 * 86400000 },
  chain: { done: 3, lastAt: Date.now() - 9 * 86400000 },
  cases: { done: 2, lastAt: Date.now() - 16 * 86400000 },
  contradict: { done: 4, lastAt: Date.now() - 4 * 86400000 }
};
db.rigor += 21 * 3;

const out = path.join(__dirname, '..', 'store', 'seed.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(db));
console.log('seed: ' + Object.keys(db.solved).length + ' theorems, ' + Object.keys(db.daily).length +
            ' dailies, rigor ' + db.rigor + ' -> ' + out);
console.log('today ' + today + ' daily = ' + dailyTheorem(today).id + ' ' + dailyTheorem(today).name);
