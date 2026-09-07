/* Axiom drive script 4: the back gesture at every depth, the lifecycle hooks, rapid taps
   on every primary button, and the edges of every input.
   node ../_shiptools/drive.js http://127.0.0.1:8828/index.html test/04-edges.js --out test/shots */
const L = require('./lib.js');
const V100 = require('./v100.json');

module.exports = async ({ page, shot, wait, text, log, errors }) => {
  const back = () => page.evaluate(() => window.App.back());
  const view = () => page.evaluate(() => ['map', 'daily', 'forge', 'satchel', 'profile', 'board', 'vignette']
    .filter(v => !document.getElementById('v-' + v).hidden).join(',') || 'onboarding');

  // ---- back during onboarding must let the system have it ----
  await L.clear(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(700);
  const obBack = await back();
  log('back on the first onboarding card returns:', obBack, '(root, so false is right)');
  if (obBack !== false) throw new Error('back() trapped the user inside onboarding');

  // ---- back from every nested screen ----
  await L.seed(page, wait, V100);
  log('view at start:', await view());
  if (await back() !== false) throw new Error('back() at the map root should return false');

  for (const v of ['daily', 'forge', 'satchel', 'profile']) {
    await page.evaluate(x => App.go(x), v);
    await wait(300);
    if (await back() !== true) throw new Error('back() from ' + v + ' should be true');
    if (await view() !== 'map') throw new Error('back() from ' + v + ' did not land on the map');
  }

  await page.evaluate(() => Board.open(Content.theorem('r04'), { onExit: () => App.go('map') }));
  await wait(600);
  if (await view() !== 'board') throw new Error('the board did not open');
  if (await back() !== true) throw new Error('back() on the board should be true');
  await wait(300);
  if (await view() !== 'map') throw new Error('back() from the board did not land on the map');

  // sheets: hint, then chooser, then victory
  await page.evaluate(() => Board.open(Content.theorem('r04'), { onExit: () => App.go('map') }));
  await wait(500);
  await page.evaluate(() => document.getElementById('bHint').click());
  await wait(300);
  if (await back() !== true) throw new Error('back() should close the hint sheet');
  const hintShut = await page.evaluate(() => document.getElementById('hint').hidden);
  if (!hintShut) throw new Error('the hint sheet stayed open');

  // r04 needs a middle term, so the term picker opens
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#pMoves .move')]
        .filter(x => /^Suppose [^i]/.test(x.querySelector('.mv-n').textContent))[0];
      if (b) b.click();
    });
    await wait(260);
  }
  await page.evaluate(() => { const t = document.querySelector('#pTools .tile[data-tool="eq-trans"]'); if (t) t.click(); });
  await wait(400);
  const chooserOpen = await page.evaluate(() => !document.getElementById('chooser').hidden);
  log('term picker opened:', chooserOpen);
  if (chooserOpen) {
    await shot('40-chooser');
    if (await back() !== true) throw new Error('back() should close the term picker');
    const shut = await page.evaluate(() => document.getElementById('chooser').hidden);
    if (!shut) throw new Error('the term picker stayed open');
  }

  // ---- back while the victory cascade is still running ----
  await page.evaluate(() => document.getElementById('bBack').click());
  await wait(400);
  await page.evaluate(() => Board.open(Content.theorem('r01'), { onExit: () => App.go('map') }));
  await wait(500);
  await L.solveBoard(page, wait, log);
  await wait(120);                                   // the cascade is mid-flight
  const midBack = await back();
  log('back during the cascade returned:', midBack);
  await wait(2500);
  const afterCascade = await page.evaluate(() => ({
    view: ['map', 'board'].filter(v => !document.getElementById('v-' + v).hidden).join(','),
    victory: !document.getElementById('victory').hidden
  }));
  log('after leaving mid-cascade:', JSON.stringify(afterCascade));
  await shot('41-left-mid-cascade');
  if (errors.length) throw new Error('leaving during the cascade threw: ' + errors.join(' ; '));
  if (afterCascade.victory) throw new Error('the victory card appeared after the player left');

  // ---- lifecycle ----
  const life = await page.evaluate(() => ({
    hasPause: typeof window.App.onPause === 'function',
    hasResume: typeof window.App.onResume === 'function'
  }));
  log('lifecycle hooks:', JSON.stringify(life));
  if (!life.hasResume) throw new Error('App.onResume missing');
  if (!life.hasPause) throw new Error('App.onPause missing');
  await page.evaluate(() => { window.App.onPause(); window.App.onResume(); });
  await wait(300);

  // pausing mid replay must stop it
  await page.evaluate(() => App.go('satchel'));
  await wait(400);
  await page.evaluate(() => {
    // the longest recorded proof, so there is something left to interrupt
    const rows = [...document.querySelectorAll('#satchelList .sat-row')];
    rows.sort((a, b) => Number(/^(\d+)/.exec(b.querySelector('.sat-m').textContent)[1]) -
                        Number(/^(\d+)/.exec(a.querySelector('.sat-m').textContent)[1]));
    rows[0].click();
  });
  await wait(1500);
  const beforePause = await page.evaluate(() => document.getElementById('replayNote').textContent);
  await page.evaluate(() => window.App.onPause());
  await wait(1800);
  const afterPause = await page.evaluate(() => document.getElementById('replayNote').textContent);
  log('replay note before pause:', beforePause, '/ after 1.8s paused:', afterPause);
  if (beforePause !== afterPause) throw new Error('the replay kept running while the app was paused');
  await page.evaluate(() => window.App.onResume());
  await wait(2500);
  const afterResume = await page.evaluate(() => document.getElementById('replayNote').textContent);
  log('replay note after resume:', afterResume);
  if (afterResume === afterPause) throw new Error('the replay did not resume');
  await page.evaluate(() => document.getElementById('bBack').click());
  await wait(400);

  // ---- rapid double taps on every primary button ----
  const twice = async (sel) => {
    await page.evaluate(s => { const e = document.querySelector(s); if (e) { e.click(); e.click(); e.click(); } }, sel);
    await wait(500);
  };
  await page.evaluate(() => App.go('daily'));
  await wait(400);
  const dailyDone = await page.evaluate(() => !document.getElementById('dEnvelope').hidden);
  if (dailyDone) { await twice('#dOpen'); await wait(900); }
  log('after triple-tapping the seal, view is:', await view());
  await shot('42-seal-triple-tap');
  if (await view() === 'board') { await page.evaluate(() => document.getElementById('bBack').click()); await wait(400); }

  await page.evaluate(() => App.go('forge'));
  await wait(400);
  await twice('#forgeList .forge-row');
  await wait(2600);
  log('after triple-tapping a forge row, view is:', await view());
  await shot('43-forge-triple-tap');
  const boards = await page.evaluate(() => document.querySelectorAll('#v-board').length);
  if (boards !== 1) throw new Error('rapid taps produced ' + boards + ' boards');
  if (await view() === 'board') { await page.evaluate(() => document.getElementById('bBack').click()); await wait(400); }

  // undo past the beginning
  await page.evaluate(() => Board.open(Content.theorem('r03'), { onExit: () => App.go('map') }));
  await wait(500);
  for (let i = 0; i < 6; i++) { await page.evaluate(() => document.getElementById('bUndo').click()); await wait(120); }
  const undoState = await page.evaluate(() => ({ par: document.getElementById('bPar').textContent,
                                                 disabled: document.getElementById('bUndo').disabled }));
  log('after six undos on a fresh board:', JSON.stringify(undoState));
  if (!undoState.disabled) throw new Error('undo is not disabled at the start of a proof');

  // a move, then undo it, then prove the whole thing from the position undo left behind
  await page.evaluate(() => document.querySelector('#pMoves .move').click());
  await wait(300);
  const midPar = await page.evaluate(() => document.getElementById('bPar').textContent);
  await page.evaluate(() => document.getElementById('bUndo').click());
  await wait(300);
  const backPar = await page.evaluate(() => document.getElementById('bPar').textContent);
  log('par counter after a move then undo:', midPar, '->', backPar);
  if (!/^0 of/.test(backPar)) throw new Error('undo did not put the move counter back: ' + backPar);
  await L.solveBoard(page, wait, log);
  await wait(2600);
  await shot('44-after-undo-redo');
  await page.evaluate(() => document.getElementById('vBack').click());
  await wait(500);

  // ---- input edges: the reminder time ----
  await page.evaluate(() => App.go('profile'));
  await wait(400);
  await page.evaluate(() => {
    const n = document.getElementById('setNotify');
    if (!n.checked) { n.checked = true; n.dispatchEvent(new Event('change')); }
  });
  await wait(300);
  for (const v of ['', '00:00', '23:59']) {
    await page.evaluate(t => {
      const el = document.getElementById('setTime');
      el.value = t; el.dispatchEvent(new Event('change'));
    }, v);
    await wait(200);
    const s = await page.evaluate(() => Store.settings().notifyTime);
    log('reminder time set to "' + v + '" stored as:', JSON.stringify(s));
  }
  await shot('45-profile-settings');

  // ---- erase: one tap arms, two erases ----
  await page.evaluate(() => document.getElementById('eraseBtn').click());
  await wait(200);
  const armed = await text('#eraseBtn');
  log('erase after one tap:', armed);
  if (!/Tap again/.test(armed)) throw new Error('erase erased on the first tap');

  log('errors:', errors.length);
  if (errors.length) throw new Error('page errors: ' + errors.join(' ; '));
};
