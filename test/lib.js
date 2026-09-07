/* Shared helpers for the Axiom drive scripts.
   The auto-player drives the real panel: it asks the kernel's own solver for a shortest
   proof, then clicks the same buttons a player would, including the term picker. */

const KEY = 'axiom.v1';

/* Solve the currently open board by clicking, one move at a time. */
async function solveBoard(page, wait, log, spec) {
  const thmId = await page.evaluate(() => document.getElementById('bTitle').textContent);
  // the plan comes from the kernel, applied to the first open goal each time, which is
  // exactly the goal the panel shows after every move
  const plan = await page.evaluate((spec) => {
    const name = document.getElementById('bTitle').textContent;
    const thm = spec || Content.THEOREMS.filter(t => t.name === name)[0];
    if (!thm) return null;
    const tiles = (thm.tools || []).map(Content.tool).filter(Boolean);
    const proof = Kernel.solve(Kernel.start(thm, tiles), 11, 400000);
    if (!proof) return null;
    return proof.map(r => JSON.parse(JSON.stringify(r)));
  }, spec || null);
  if (!plan) throw new Error('no plan for board "' + thmId + '"');
  for (let i = 0; i < plan.length; i++) {
    const done = await step(page, plan[i]);
    if (!done) throw new Error('could not play move ' + (i + 1) + ' (' + plan[i].t + ') of "' + thmId + '"');
    await wait(160);
    await answerChooser(page, plan[i], wait);
    await wait(160);
  }
  if (log) log('solved "' + thmId + '" in ' + plan.length + ' moves');
  return plan.length;
}

/* Click the panel control that performs one kernel rule. */
function step(page, rule) {
  return page.evaluate(r => {
    const moves = [...document.querySelectorAll('#pMoves .move')];
    const byName = re => moves.filter(m => re.test(m.querySelector('.mv-n').textContent))[0];
    let el = null;
    switch (r.t) {
      case 'split': el = byName(/^Prove both halves/); break;
      case 'suppose': el = byName(/^Suppose [^i]/); break;
      case 'contradict': el = byName(/^Suppose it is false/); break;
      case 'induct': el = byName(/^Prove it by induction/); break;
      case 'fix': el = byName(/^Name an arbitrary/); break;
      case 'fixEx': el = byName(/^Name the one that exists/); break;
      case 'witness': el = byName(/^Offer a witness/); break;
      case 'pick': el = byName(r.side === 'r' ? /^Prove the right side/ : /^Prove the left side/); break;
      case 'cases': el = byName(/^Take cases on/); break;
      case 'use':
        if (r.src === 'tool') {
          el = document.querySelector('#pTools .tile[data-tool="' + r.ref + '"]');
        } else {
          const chips = [...document.querySelectorAll('#pKnow .chip.live')];
          el = chips[0];
        }
        break;
    }
    if (!el) return false;
    el.click();
    return true;
  }, rule);
}

/* The term picker asks one slot at a time; answer each from the plan's own substitution. */
async function answerChooser(page, rule, wait) {
  for (let guard = 0; guard < 4; guard++) {
    const open = await page.evaluate(() => !document.getElementById('chooser').hidden);
    if (!open) return;
    const picked = await page.evaluate(r => {
      const title = document.getElementById('chooserTitle').textContent;
      const chips = [...document.querySelectorAll('#chooserList .chip')];
      let wanted = null;
      const m = /^Which term is (.+)\?$/.exec(title);
      if (m && r.sub) wanted = Kernel.showT(r.sub[m[1]]);
      else if (r.term) wanted = Kernel.showT(r.term);
      const hit = chips.filter(c => c.textContent === wanted)[0] || chips[0];
      if (!hit) return null;
      hit.click();
      return hit.textContent;
    }, rule);
    if (!picked) return;
    await wait(140);
  }
}

/* Seed storage then reload, the way a returning player arrives. */
async function seed(page, wait, data) {
  await page.evaluate((k, v) => { localStorage.setItem(k, v); }, KEY, JSON.stringify(data));
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(600);
}

async function read(page) {
  return page.evaluate(k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, KEY);
}

const clear = (page) => page.evaluate(k => localStorage.removeItem(k), KEY);

/* Walk the onboarding cards and land on the first proof board. */
async function onboard(page, wait) {
  for (let i = 0; i < 4; i++) {
    const last = await page.evaluate(() => {
      const b = document.getElementById('obNext');
      if (!b || document.getElementById('onboard').hidden) return 'done';
      const t = b.textContent;
      b.click();
      return t;
    });
    if (last === 'done') break;
    await wait(400);
    if (last === 'Begin') break;
  }
  await wait(600);
}

module.exports = { KEY, solveBoard, step, answerChooser, seed, read, clear, onboard };
