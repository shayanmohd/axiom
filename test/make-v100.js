#!/usr/bin/env node
/* Builds test/v100.json: a save file shaped exactly as the shipped 1.0.0 wrote it.
   Proofs are flat rule lists, which is what 1.0.0's Board recorded (st.history.map(h => h.rule)),
   and daily shapes use the green and yellow squares 1.0.0 emitted. */
const path = require('path'), fs = require('fs');
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
function prove(thm) {
  const tiles = (thm.tools || []).map(C.tool).filter(Boolean);
  const proof = K.solve(K.start(thm, tiles), 11, 400000);
  if (!proof) throw new Error('no proof for ' + thm.id);
  const st = K.start(thm, tiles);
  if (!K.applySeq(st, proof) || !K.verify(st).ok) throw new Error('bad proof for ' + thm.id);
  return { proof, st };
}
function shape(st) {                                     // 1.0.0's grid glyphs
  const rows = [];
  (function walk(id, d) {
    const n = st.nodes[id]; if (!n) return;
    rows[d] = rows[d] || [];
    rows[d].push(n.kids.length ? 'mid' : 'leaf');
    n.kids.forEach(k => walk(k, d + 1));
  })(st.root, 0);
  return rows.map(r => r.map(x => x === 'leaf' ? '\u{1F7E9}' : '\u{1F7E8}').join('')).join('\n');
}

const db = {
  onboarded: true,
  installed: addDays(today, -21),
  solved: {}, daily: {}, forge: {},
  rigor: 1000,
  seen: {},
  settings: { sound: true, haptics: false, notify: true, notifyTime: '08:30' }
};

const done = ['r01', 'r02', 'r03', 'r04', 'r05', 'r06', 'r07', 'r08', 'r09', 'r10',
              's01', 's02', 's03', 's04', 's05', 's06', 's07'];
done.forEach((id, i) => {
  const thm = C.theorem(id);
  const { proof } = prove(thm);
  const len = proof.length;
  const hints = i % 5 === 0 ? 1 : 0;
  const crown = hints === 0 && len <= thm.par ? 'gold' : len <= thm.par + 2 ? 'silver' : 'none';
  db.solved[id] = { len, par: thm.par, crown, hints, ms: 90 + i * 17,
                    at: Date.now() - (done.length - i) * 86400000, proof };
  db.rigor += 14 + Math.max(0, thm.par - len) * 8 - hints * 4;
});
db.seen['r07'] = true;
db.seen['s07'] = true;

[1, 2, 3, 4, 5].forEach(back => {
  const date = addDays(today, -back);
  const thm = dailyTheorem(date);
  const { proof, st } = prove(thm);
  db.daily[date] = { id: thm.id, len: proof.length, par: thm.par, hints: 0, ms: 140 + back * 9,
                     crown: proof.length <= thm.par ? 'gold' : 'silver', shape: shape(st) };
});
db.forge = { split: { done: 4, lastAt: Date.now() - 3 * 86400000 },
             chain: { done: 7, lastAt: Date.now() - 10 * 86400000 },
             parity: { done: 1, lastAt: Date.now() - 26 * 86400000 } };

fs.writeFileSync(path.join(__dirname, 'v100.json'), JSON.stringify(db, null, 2));
console.log('wrote test/v100.json: ' + Object.keys(db.solved).length + ' solved, ' +
            Object.keys(db.daily).length + ' dailies, rigor ' + db.rigor);
