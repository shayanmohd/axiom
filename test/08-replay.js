/* Axiom drive script 8: a proof built out of order. Nothing forces a player to work down the
   leftmost branch, so a recorded proof has to remember which goal each step went to.
   node ../_shiptools/drive.js http://127.0.0.1:8828/index.html test/08-replay.js --out test/shots */
const L = require('./lib.js');

module.exports = async ({ page, shot, wait, text, log, errors }) => {
  await L.seed(page, wait, { onboarded: true, rigor: 1000 });

  // r03: eq(a,b) -> eq(b,a) & eq(a,a). Suppose, split, then finish the RIGHT branch first.
  await page.evaluate(() => Board.open(Content.theorem('r03'), { onExit: () => App.go('map') }));
  await wait(600);
  const click = (re) => page.evaluate(r => {
    const b = [...document.querySelectorAll('#pMoves .move')]
      .filter(x => new RegExp(r).test(x.querySelector('.mv-n').textContent))[0];
    if (!b) return false; b.click(); return true;
  }, re);

  if (!await click('^Suppose [^i]')) throw new Error('no suppose move');
  await wait(300);
  if (!await click('^Prove both halves')) throw new Error('no split move');
  await wait(400);
  await shot('80-two-open-goals');

  // pick the SECOND open goal in the tree, which is not the one the panel offers
  const picked = await page.evaluate(() => {
    const open = [...document.querySelectorAll('#tree .node.is-open')];
    if (open.length < 2) return null;
    open[1].click();
    return open.map(e => e.textContent);
  });
  log('open goals, working on the second:', JSON.stringify(picked));
  if (!picked) throw new Error('the split did not leave two open goals');
  await wait(400);
  await shot('81-focus-second-goal');
  const focused = await page.evaluate(() => document.getElementById('pGoal').textContent);
  log('panel goal after tapping the right hand branch:', focused);
  if (focused !== picked[1]) throw new Error('tapping a goal did not move the panel to it: ' + focused);

  // close the right branch with reflexivity, then the left one with symmetry
  await page.evaluate(() => document.querySelector('#pTools .tile[data-tool="eq-refl"]').click());
  await wait(600);
  const nextGoal = await page.evaluate(() => document.getElementById('pGoal').textContent);
  log('panel moved on to:', nextGoal);
  await page.evaluate(() => document.querySelector('#pTools .tile[data-tool="eq-sym"]').click());
  await wait(2800);
  const won = await page.evaluate(() => !document.getElementById('victory').hidden);
  log('proved out of order:', won);
  if (!won) throw new Error('an out of order proof did not finish');
  await shot('82-out-of-order-victory');
  await page.evaluate(() => document.getElementById('vBack').click());
  await wait(600);

  // now replay it from the satchel: this is where a flat rule list loses the plot
  await page.evaluate(() => App.go('satchel'));
  await wait(500);
  await page.evaluate(() => document.querySelector('#satchelList .sat-row').click());
  await wait(4000);
  await shot('83-replay-out-of-order');
  const note = await page.evaluate(() => document.getElementById('replayNote').textContent);
  const lit = await page.evaluate(() => document.querySelectorAll('#tree .node').length);
  log('replay note:', note, '/ nodes rebuilt:', lit);
  if (!/exactly as you built it/.test(note))
    throw new Error('an out of order proof does not replay: "' + note + '"');
  const stored = await page.evaluate(() => Store.solved('r03').proof.length);
  log('stored proof steps:', stored);

  log('errors:', errors.length);
  if (errors.length) throw new Error('page errors: ' + errors.join(' ; '));
};
