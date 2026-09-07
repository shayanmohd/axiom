/* Axiom drive script 1: cold start, onboarding, the first proof, then every screen with real data.
   node ../_shiptools/drive.js http://127.0.0.1:8828/index.html test/01-firstrun.js --out test/shots */
const L = require('./lib.js');

module.exports = async ({ page, shot, wait, text, click, log, errors }) => {
  await L.clear(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(700);

  await shot('01-onboard-1');
  await page.evaluate(() => document.getElementById('obNext').click());
  await wait(500);
  await shot('01-onboard-2');
  await page.evaluate(() => document.getElementById('obNext').click());
  await wait(500);
  await shot('01-onboard-3');
  await page.evaluate(() => document.getElementById('obNext').click());
  await wait(800);

  // onboarding hands you straight to the first theorem
  const onBoard = await page.evaluate(() => !document.getElementById('v-board').hidden);
  log('board open after onboarding:', onBoard);
  if (!onBoard) throw new Error('onboarding did not open the first theorem');
  await shot('02-board-first');

  await L.solveBoard(page, wait, log);
  await wait(2600);
  await shot('03-victory');
  const vic = await page.evaluate(() => ({
    open: !document.getElementById('victory').hidden,
    title: document.getElementById('vTitle').textContent,
    verify: document.getElementById('vVerify').textContent,
    moves: document.getElementById('vMoves').textContent,
    crown: document.getElementById('vCrown').textContent
  }));
  log('victory:', JSON.stringify(vic));
  if (!vic.open) throw new Error('no victory card after a complete proof');
  if (!/checked from the root/.test(vic.verify)) throw new Error('kernel did not verify: ' + vic.verify);

  // next theorem, straight from the card
  await page.evaluate(() => document.getElementById('vNext').click());
  await wait(700);
  await shot('04-board-second');
  await L.solveBoard(page, wait, log);
  await wait(2600);
  await page.evaluate(() => document.getElementById('vNext').click());
  await wait(700);

  // third: use a hint ladder on the way
  await page.evaluate(() => document.getElementById('bHint').click());
  await wait(400);
  await shot('05-hint-1');
  await page.evaluate(() => document.getElementById('hintClose').click());
  await wait(200);
  await page.evaluate(() => document.getElementById('bHint').click());
  await wait(200);
  await page.evaluate(() => document.getElementById('hintClose').click());
  await wait(200);
  await page.evaluate(() => document.getElementById('bHint').click());
  await wait(900);
  await shot('06-hint-ghost');
  const ghost = await page.evaluate(() => document.getElementById('hintExtra').textContent);
  log('ghost hint:', ghost);
  if (!ghost) throw new Error('the third hint tier produced nothing');
  await page.evaluate(() => document.getElementById('hintClose').click());
  await wait(200);
  await L.solveBoard(page, wait, log);
  await wait(2600);
  const noCrown = await page.evaluate(() => document.getElementById('vCrown').textContent);
  log('crown after three hints:', noCrown);
  if (/Gold crown/.test(noCrown)) throw new Error('hints did not cost the gold crown: ' + noCrown);
  await page.evaluate(() => document.getElementById('vBack').click());
  await wait(600);

  await shot('07-map');
  log('map:', (await text('.hero')).replace(/\n/g, ' '));

  // daily
  await page.evaluate(() => App.go('daily'));
  await wait(500);
  await shot('08-daily-sealed');
  await page.evaluate(() => document.getElementById('dOpen').click());
  await wait(900);
  await shot('09-daily-board');
  await L.solveBoard(page, wait, log);
  await wait(2600);
  await page.evaluate(() => document.getElementById('vBack').click());
  await wait(700);
  await shot('10-daily-result');
  const daily = await page.evaluate(() => ({
    result: !document.getElementById('dResult').hidden,
    score: document.getElementById('dScore').textContent,
    streak: document.getElementById('dStreak').textContent,
    blocks: document.querySelectorAll('#dShape .blk').length
  }));
  log('daily:', JSON.stringify(daily));
  if (!daily.result || daily.blocks < 2) throw new Error('daily result did not render a shape grid');

  // forge
  await page.evaluate(() => App.go('forge'));
  await wait(500);
  await shot('11-forge');
  await page.evaluate(() => document.querySelector('#forgeList .forge-row').click());
  await wait(2500);
  const forgeOpen = await page.evaluate(() => !document.getElementById('v-board').hidden);
  log('forge drill opened by tapping the row:', forgeOpen);
  if (!forgeOpen) throw new Error('the forge did not build a drill');
  await shot('12-forge-board');
  await page.evaluate(() => document.getElementById('bBack').click());
  await wait(500);
  // solve one drill end to end: the same code path, with the drill in hand so the
  // kernel can be asked for its shortest proof
  const drill = await page.evaluate(() => {
    const d = Forge.drill('chain');
    if (!d) return null;
    window.__drill = d;
    Board.open(d, { mode: 'forge', onExit: () => App.go('forge') });
    return { statement: d.statement, tools: d.tools || [], par: d.par };
  });
  log('drill:', JSON.stringify(drill));
  if (!drill) throw new Error('Forge.drill returned nothing for "chain"');
  await wait(700);
  await L.solveBoard(page, wait, log, drill);
  await wait(2600);
  await page.evaluate(() => document.getElementById('vBack').click());
  await wait(600);
  await shot('13-forge-after');

  // satchel and replay
  await page.evaluate(() => App.go('satchel'));
  await wait(500);
  await shot('14-satchel');
  await page.evaluate(() => document.querySelector('#satchelList .sat-row').click());
  await wait(2600);
  await shot('15-replay');
  const replay = await page.evaluate(() => document.getElementById('replayNote').textContent);
  log('replay note:', replay);
  if (/older version/.test(replay)) throw new Error('replay could not rebuild a proof it just recorded');
  await page.evaluate(() => document.getElementById('bBack').click());
  await wait(500);

  // profile
  await page.evaluate(() => App.go('profile'));
  await wait(500);
  await shot('16-profile');
  log('profile:', (await text('.stats')).replace(/\n/g, ' | '));

  log('errors:', errors.length);
  if (errors.length) throw new Error('page errors: ' + errors.join(' ; '));
};
