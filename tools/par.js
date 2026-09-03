#!/usr/bin/env node
/* Runs the kernel's own solver over every theorem, records the shortest proof it can
   find, checks that proof with verify(), and writes web/js/pars.js. Nothing ships
   with a par that the kernel has not personally produced and re-checked. */
const path = require('path');
const fs = require('fs');
const WEB = path.join(__dirname, '..', 'web', 'js');
const K = require(path.join(WEB, 'kernel.js'));
const C = require(path.join(WEB, 'content.js'));

const only = process.argv[2];
const MAXD = Number(process.env.MAXD || 11);
const BUDGET = Number(process.env.BUDGET || 400000);

const out = {};
let fails = 0;
for (const thm of C.THEOREMS) {
  if (only && thm.id !== only) continue;
  const tiles = (thm.tools || []).map(C.tool);
  const t0 = Date.now();
  let proof = null, err = null;
  try { proof = K.solve(K.start(thm, tiles), MAXD, BUDGET); }
  catch (e) { err = e.message; }
  const ms = Date.now() - t0;
  if (!proof) {
    console.log(`${thm.id}  NO PROOF FOUND  (${ms}ms)${err ? ' ' + err : ''}  ${thm.name}`);
    fails++;
    continue;
  }
  // replay and verify independently
  const st = K.start(thm, tiles);
  const ok = K.applySeq(st, proof);
  const v = K.verify(st);
  if (!ok || !v.ok || !K.isComplete(st)) {
    console.log(`${thm.id}  REPLAY FAILED  ${v.reason}`);
    fails++;
    continue;
  }
  out[thm.id] = proof.length;
  console.log(`${thm.id}  par ${String(proof.length).padStart(2)}  ${String(ms).padStart(6)}ms  ${proof.map(r => r.t).join(' ')}`);
}

if (!only) {
  const body = 'const PARS = ' + JSON.stringify(out, null, 2) + ';\n' +
    "if (typeof module !== 'undefined' && module.exports) module.exports = PARS;\n";
  fs.writeFileSync(path.join(WEB, 'pars.js'), body);
  console.log('\nwrote web/js/pars.js with ' + Object.keys(out).length + ' pars, ' + fails + ' unsolved');
}
process.exit(fails ? 1 : 0);
