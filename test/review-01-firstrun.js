/* Reviewer pass 1: first run, every screen, real data, reload, persistence. Zero page errors. */
const L = require('./lib.js');

module.exports = async ({ page, shot, wait, text, click, errors, log }) => {
  await L.clear(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(400);

  // --- onboarding, all three cards, look at each
  for (let i = 1; i <= 3; i++) {
    await shot('r01-onboard-' + i);
    const label = await page.evaluate(() => document.getElementById('obNext').textContent);
    log('card ' + i + ' button: ' + label);
    // App.back() at the onboarding root must hand Back to the system
    const b = await page.evaluate(() => window.App.back());
    if (b !== false) throw new Error('App.back() returned ' + b + ' on onboarding card ' + i);
    await page.evaluate(() => document.getElementById('obNext').click());
    await wait(420);
  }
  await wait(700);

  const onBoard = await page.evaluate(() => !document.getElementById('v-board').hidden);
  if (!onBoard) throw new Error('onboarding did not land on the board');
  await shot('r01-board-first');

  // --- solve it for real, through the panel
  await L.solveBoard(page, wait, log);
  await wait(1800);
  const vict = await page.evaluate(() => !document.getElementById('victory').hidden);
  if (!vict) throw new Error('no victory card after a finished proof');
  await shot('r01-victory');
  await page.evaluate(() => document.getElementById('vBack').click());
  await wait(600);

  // --- map with one proof on it
  await shot('r01-map');

  // --- daily: break the seal and solve it
  await click('#tabs .tab:nth-child(2)');
  await wait(500);
  await shot('r01-daily-sealed');
  await click('#dOpen');
  await wait(900);
  await L.solveBoard(page, wait, log);
  await wait(2200);
  await page.evaluate(() => { const b = document.getElementById('vBack'); if (b) b.click(); });
  await wait(700);
  await shot('r01-daily-solved');

  // --- forge: run a drill and finish it
  await click('#tabs .tab:nth-child(3)');
  await wait(500);
  await shot('r01-forge');
  await page.evaluate(() => {
    const o = Board.open;
    Board.open = function (t) { window.__thm = JSON.parse(JSON.stringify(t)); return o.apply(this, arguments); };
  });
  await click('#forgeList .forge-row');
  await wait(700);
  const fname = await page.evaluate(() => document.getElementById('bTitle').textContent);
  log('forge drill: ' + fname);
  const stmt = await text('#bStatement');
  log('drill statement: ' + stmt.replace(/\n/g, ' | '));
  await shot('r01-forge-board');
  const spec = await page.evaluate(() => window.__thm || null);
  await L.solveBoard(page, wait, log, spec);
  await wait(2000);
  await page.evaluate(() => { const b = document.getElementById('vBack'); if (b) b.click(); });
  await wait(600);

  // --- satchel with a real row, and replay it
  await click('#tabs .tab:nth-child(4)');
  await wait(500);
  await shot('r01-satchel');
  const rows = await page.evaluate(() => document.querySelectorAll('#satchelList .sat-row').length);
  log('satchel rows: ' + rows);
  if (!rows) throw new Error('satchel is empty after two proofs');
  await click('#satchelList .sat-row');
  await wait(1200);
  await shot('r01-replay');
  const note = await text('#replayNote');
  log('replay note early: ' + note);
  await wait(6000);
  const note2 = await text('#replayNote');
  log('replay note late: ' + note2);
  await shot('r01-replay-end');
  if (/older version|could not be rebuilt/.test(note2)) throw new Error('replay of a fresh proof failed: ' + note2);
  await page.evaluate(() => window.App.back());
  await wait(500);

  // --- profile
  await click('#tabs .tab:nth-child(5)');
  await wait(500);
  await shot('r01-profile');
  log('profile: ' + (await text('.stats')).replace(/\n/g, ' | '));

  // --- reload and prove persistence
  const before = await L.read(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(900);
  const after = await L.read(page);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('storage changed across a reload');
  const view = await page.evaluate(() => document.getElementById('v-map').hidden ? 'not-map' : 'map');
  log('after reload view: ' + view);
  await shot('r01-after-reload');
  log('solved after reload: ' + Object.keys(after.solved).length + ', dailies: ' + Object.keys(after.daily).length +
      ', rigor: ' + after.rigor);
  if (!Object.keys(after.solved).length) throw new Error('proofs lost across a reload');

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
};
