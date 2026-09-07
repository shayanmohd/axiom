/* Reviewer pass 3: window.App.back() on every screen and sheet, onPause/onResume,
   and a proof genuinely built out of order, replayed from the satchel. */
const L = require('./lib.js');

const eq = (a, b, what) => { if (a !== b) throw new Error(what + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); };
const back = page => page.evaluate(() => window.App.back());
const pause = page => page.evaluate(() => { window.App.onPause(); return true; });
const resume = page => page.evaluate(() => { window.App.onResume(); return true; });

module.exports = async ({ page, shot, wait, text, click, errors, log }) => {
  await L.clear(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(400);

  /* --- onboarding is the root: Back belongs to the system --- */
  for (let i = 0; i < 3; i++) {
    eq(await back(page), false, 'back() on onboarding card ' + (i + 1));
    eq(await pause(page), true, 'onPause during onboarding');
    eq(await resume(page), true, 'onResume during onboarding');
    await page.evaluate(() => document.getElementById('obNext').click());
    await wait(420);
  }
  await wait(900);
  // that last Begin lands on the board
  eq(await page.evaluate(() => !document.getElementById('v-board').hidden), true, 'board after onboarding');

  /* --- the board: pause and resume mid proof, then Back leaves it --- */
  eq(await pause(page), true, 'onPause on the board');
  eq(await resume(page), true, 'onResume on the board');
  eq(await back(page), true, 'back() on the board');
  await wait(500);
  eq(await page.evaluate(() => !document.getElementById('v-map').hidden), true, 'map after leaving the board');

  /* --- the map is the root --- */
  eq(await back(page), false, 'back() on the map');

  /* --- every other tab returns to the map --- */
  for (const [n, id] of [[2, 'v-daily'], [3, 'v-forge'], [4, 'v-satchel'], [5, 'v-profile']]) {
    await click('#tabs .tab:nth-child(' + n + ')');
    await wait(400);
    eq(await pause(page), true, 'onPause on ' + id);
    eq(await resume(page), true, 'onResume on ' + id);
    eq(await back(page), true, 'back() on ' + id);
    await wait(300);
    eq(await page.evaluate(() => !document.getElementById('v-map').hidden), true, 'map after back from ' + id);
  }

  /* --- the hint sheet and the chooser --- */
  await page.evaluate(() => document.querySelectorAll('.seal-row')[1].click());
  await wait(700);
  await click('#bHint');
  await wait(400);
  eq(await page.evaluate(() => !document.getElementById('hint').hidden), true, 'hint sheet open');
  await shot('r03-hint');
  eq(await back(page), true, 'back() closes the hint sheet');
  eq(await page.evaluate(() => document.getElementById('hint').hidden), true, 'hint sheet closed');
  eq(await page.evaluate(() => !document.getElementById('v-board').hidden), true, 'still on the board');
  eq(await back(page), true, 'back() then leaves the board');
  await wait(400);

  /* --- a keystone theorem, its vignette, and Back out of it --- */
  const key = await page.evaluate(() => {
    const t = Content.THEOREMS.filter(x => x.keystone && x.vignette)[0];
    return t ? { id: t.id, name: t.name } : null;
  });
  if (key) {
    await page.evaluate(id => { App.vignette(Content.THEOREMS.filter(t => t.id === id)[0], () => App.go('map')); }, key.id);
    await wait(500);
    eq(await page.evaluate(() => !document.getElementById('v-vignette').hidden), true, 'vignette open');
    await shot('r03-vignette');
    eq(await pause(page), true, 'onPause on the vignette');
    eq(await resume(page), true, 'onResume on the vignette');
    eq(await back(page), true, 'back() closes the vignette');
    await wait(400);
    eq(await page.evaluate(() => !document.getElementById('v-map').hidden), true, 'map after the vignette');
  }

  /* --- the victory card --- */
  await page.evaluate(() => document.querySelectorAll('.seal-row')[0].click());
  await wait(600);
  await L.solveBoard(page, wait, log);
  await wait(2000);
  eq(await page.evaluate(() => !document.getElementById('victory').hidden), true, 'victory card open');
  eq(await pause(page), true, 'onPause on the victory card');
  eq(await resume(page), true, 'onResume on the victory card');
  eq(await back(page), true, 'back() closes the victory card');
  await wait(500);
  eq(await page.evaluate(() => document.getElementById('victory').hidden), true, 'victory card closed');
  eq(await page.evaluate(() => !document.getElementById('v-map').hidden), true, 'map after the victory card');
  eq(await back(page), false, 'back() at the root once more');

  /* --- leaving during the victory cascade must not throw or pop the card over the map --- */
  await page.evaluate(() => {
    const r = [...document.querySelectorAll('.seal-row')].filter(x => !x.classList.contains('done'))[0];
    r.click();
  });
  await wait(600);
  await L.solveBoard(page, wait, log);
  await wait(160);                       // the cascade is still running
  await back(page);                      // walk out mid cascade
  await wait(2600);
  eq(await page.evaluate(() => document.getElementById('victory').hidden), true, 'no victory card after leaving mid cascade');
  eq(await page.evaluate(() => !document.getElementById('v-map').hidden), true, 'on the map after leaving mid cascade');
  await shot('r03-after-leaving-cascade');

  /* --- a proof built out of order, then replayed --- */
  const plan = await page.evaluate(() => {
    const paths = st => { const m = {}; const inv = {};
      (function walk(id, p) { const k = p.join('.'); m[id] = k; inv[k] = id;
        st.nodes[id].kids.forEach((c, i) => walk(c, p.concat(i))); })(st.root, []);
      return { byId: m, byPath: inv };
    };
    for (const t of Content.THEOREMS) {
      const tiles = (t.tools || []).map(Content.tool).filter(Boolean);
      let p = null;
      try { p = Kernel.solve(Kernel.start(t, tiles), 9, 200000); } catch (e) { continue; }
      if (!p || p.length < 3 || p.length > 6) continue;
      // canonical run: which goal did each rule go to, by path
      const st = Kernel.start(t, tiles);
      const steps = [];
      let ok = true;
      for (const r of p) {
        const open = Kernel.openGoals(st);
        const pm = paths(st);
        steps.push({ path: pm.byId[open[0]], rule: JSON.parse(JSON.stringify(r)) });
        if (!Kernel.apply(st, open[0], r)) { ok = false; break; }
      }
      if (!ok) continue;
      // reordered run: always take the deepest, rightmost goal that has a rule waiting
      const st2 = Kernel.start(t, tiles);
      const left = steps.slice();
      const order = [];
      while (left.length) {
        const pm = paths(st2);
        const open = Kernel.openGoals(st2);
        const openPaths = open.map(id => pm.byId[id]);
        const cand = left.filter(s => openPaths.indexOf(s.path) >= 0);
        if (!cand.length) { ok = false; break; }
        cand.sort((a, b) => b.path.localeCompare(a.path));
        const s = cand[0];
        const id = pm.byPath[s.path];
        if (!Kernel.apply(st2, id, s.rule)) { ok = false; break; }
        order.push({ path: s.path, rule: s.rule, node: id, goalText: null });
        left.splice(left.indexOf(s), 1);
      }
      if (!ok) continue;
      const same = order.map(o => o.path).join('|') === steps.map(s => s.path).join('|');
      if (same) continue;                        // this one has only one legal order
      return { id: t.id, name: t.name, order: order, canonical: steps.map(s => s.path) };
    }
    return null;
  });

  if (!plan) {
    log('no theorem in the set admits two different build orders; out-of-order replay not exercised');
  } else {
    log('out of order on "' + plan.name + '": canonical ' + plan.canonical.join(',') +
        ' built as ' + plan.order.map(o => o.path).join(','));
    // clear and start clean so this is the only proof of that theorem on record
    await L.clear(page);
    await page.reload({ waitUntil: 'networkidle0' });
    await wait(500);
    await page.evaluate(() => { Store.onboarded(true); });
    await page.reload({ waitUntil: 'networkidle0' });
    await wait(600);
    await page.evaluate(id => { Board.open(Content.THEOREMS.filter(t => t.id === id)[0], { onExit: () => App.go('map') }); }, plan.id);
    await wait(700);
    for (let i = 0; i < plan.order.length; i++) {
      const s = plan.order[i];
      const clicked = await page.evaluate(n => {
        const el = document.querySelector('#tree .node[data-id="' + n + '"]');
        if (!el) return null;
        el.click();
        return el.innerText;
      }, s.node);
      if (clicked === null) throw new Error('no node ' + s.node + ' on the board at step ' + (i + 1));
      await wait(200);
      const done = await L.step(page, s.rule);
      if (!done) throw new Error('could not play out-of-order move ' + (i + 1) + ' (' + s.rule.t + ')');
      await wait(180);
      await L.answerChooser(page, s.rule, wait);
      await wait(200);
    }
    await wait(2400);
    await shot('r03-out-of-order-victory');
    const rec = await page.evaluate(id => JSON.parse(localStorage.getItem('axiom.v1')).solved[id], plan.id);
    if (!rec) throw new Error('the out-of-order proof was not recorded');
    log('recorded proof: ' + JSON.stringify(rec.proof.map(p => p.n)));
    await page.evaluate(() => { const b = document.getElementById('vBack'); if (b) b.click(); });
    await wait(700);
    await click('#tabs .tab:nth-child(4)');
    await wait(600);
    await click('#satchelList .sat-row');
    await wait(1200);
    await shot('r03-replay-out-of-order-start');
    await wait(6500);
    const note = await text('#replayNote');
    log('out-of-order replay: ' + note);
    await shot('r03-replay-out-of-order-end');
    if (!/exactly as you built it/.test(note)) throw new Error('out-of-order replay failed: ' + note);
    // pause and resume in the middle of a replay must not double-step or throw
    await page.evaluate(() => window.App.back());
    await wait(600);
    await click('#satchelList .sat-row');
    await wait(900);
    await pause(page);
    await wait(1600);
    const frozen = await text('#replayNote');
    await wait(1500);
    const stillFrozen = await text('#replayNote');
    eq(stillFrozen, frozen, 'the replay kept stepping while the app was paused');
    log('paused replay stayed at: ' + frozen);
    await resume(page);
    await wait(6500);
    const note2 = await text('#replayNote');
    log('after resume: ' + note2);
    if (!/exactly as you built it/.test(note2)) throw new Error('the replay did not finish after resume: ' + note2);
  }

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
};
