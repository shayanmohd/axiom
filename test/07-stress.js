/* Axiom drive script 7: the gestures and the shapes that stress the board. Drags a tile onto a
   goal with a real touch sequence, rotates through screens fast, proves the widest tree in the
   game and the induction one, and checks nothing ever scrolls the page sideways.
   node ../_shiptools/drive.js http://127.0.0.1:8828/index.html test/07-stress.js --out test/shots */
const L = require('./lib.js');
const V100 = require('./v100.json');

module.exports = async ({ page, shot, wait, text, log, errors }) => {
  await L.seed(page, wait, V100);

  const noSideScroll = async (where) => {
    const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    log(where + ' width:', JSON.stringify(w));
    if (w.doc > w.win + 1) throw new Error(where + ' scrolls sideways: ' + w.doc + ' > ' + w.win);
  };

  // ---- press, hold, drag a tile onto a goal ----
  await page.evaluate(() => Board.open(Content.theorem('r02'), { onExit: () => App.go('map') }));
  await wait(600);
  await page.evaluate(() => {
    [...document.querySelectorAll('#pMoves .move')]
      .filter(b => /^Suppose [^i]/.test(b.querySelector('.mv-n').textContent))[0].click();
  });
  await wait(300);
  await page.evaluate(() => {
    [...document.querySelectorAll('#pMoves .move')]
      .filter(b => /^Suppose [^i]/.test(b.querySelector('.mv-n').textContent))[0].click();
  });
  await wait(400);
  const before = await page.evaluate(() => document.getElementById('bPar').textContent);
  const box = await page.evaluate(() => {
    const t = document.querySelector('#pTools .tile[data-tool="eq-sym"]');
    const n = document.querySelector('#tree .node.is-open');
    if (!t || !n) return null;
    const a = t.getBoundingClientRect(), b = n.getBoundingClientRect();
    return { from: { x: a.left + a.width / 2, y: a.top + a.height / 2 },
             to: { x: b.left + b.width / 2, y: b.top + b.height / 2 } };
  });
  log('drag from/to:', JSON.stringify(box));
  if (!box) throw new Error('no tile or open goal to drag between');
  await page.touchscreen.touchStart(box.from.x, box.from.y);
  await wait(340);                                   // the press-and-hold that lifts the tile
  await page.touchscreen.touchMove(box.from.x, box.from.y - 30);
  await wait(80);
  await shot('70-drag-lifted');
  await page.touchscreen.touchMove(box.to.x, box.to.y + 4);
  await wait(120);
  await page.touchscreen.touchMove(box.to.x, box.to.y);
  await wait(120);
  await shot('71-drag-over-goal');
  await page.touchscreen.touchEnd();
  await wait(500);
  const after = await page.evaluate(() => document.getElementById('bPar').textContent);
  log('move counter before/after the drag:', before, '->', after);
  await shot('72-drag-dropped');
  if (before === after) throw new Error('dragging a tile onto a matching goal did nothing');
  const ghosts = await page.evaluate(() => document.querySelectorAll('.dragghost').length);
  if (ghosts !== 0) throw new Error('a drag ghost was left behind');

  // dragging onto nothing must refuse, not break
  const box2 = await page.evaluate(() => {
    const t = document.querySelector('#pTools .tile');
    const a = t.getBoundingClientRect();
    return { x: a.left + a.width / 2, y: a.top + a.height / 2 };
  });
  await page.touchscreen.touchStart(box2.x, box2.y);
  await wait(340);
  await page.touchscreen.touchMove(box2.x - 60, box2.y - 200);
  await wait(150);
  await page.touchscreen.touchEnd();
  await wait(500);
  log('after dropping on empty space:', await text('#toast'));
  if (await page.evaluate(() => document.querySelectorAll('.dragghost').length) !== 0)
    throw new Error('a drag ghost survived a drop on empty space');
  await page.evaluate(() => document.getElementById('bBack').click());
  await wait(400);

  // ---- the widest and deepest trees in the game ----
  for (const id of ['r10', 's10', 's12']) {
    await page.evaluate(x => Board.open(Content.theorem(x), { onExit: () => App.go('map') }), id);
    await wait(600);
    await L.solveBoard(page, wait, log);
    await wait(600);
    await shot('73-tree-' + id);
    await noSideScroll('board ' + id);
    const fit = await page.evaluate(() => {
      const w = document.getElementById('treeWrap'), f = document.getElementById('treeFit');
      return { wrap: Math.round(w.clientWidth), fit: Math.round(f.getBoundingClientRect().width),
               scale: document.getElementById('tree').style.transform };
    });
    log('tree ' + id + ' fit:', JSON.stringify(fit));
    if (fit.fit > fit.wrap + 2) log('  (the tree is wider than the board and scrolls, which is by design)');
    await wait(2600);
    await page.evaluate(() => document.getElementById('vBack').click());
    await wait(500);
  }

  // ---- induction ----
  await page.evaluate(() => Board.open(Content.theorem('s10'), { onExit: () => App.go('map') }));
  await wait(500);
  const hasInduct = await page.evaluate(() =>
    [...document.querySelectorAll('#pMoves .move')].some(b => /induction/.test(b.textContent)));
  log('induction offered on s10:', hasInduct);
  await page.evaluate(() => document.getElementById('bBack').click());
  await wait(400);

  // ---- rotating through screens fast ----
  for (let i = 0; i < 3; i++) {
    for (const v of ['map', 'daily', 'forge', 'satchel', 'profile']) {
      await page.evaluate(x => App.go(x), v);
      await wait(40);
    }
  }
  await wait(500);
  await shot('74-after-fast-rotation');
  await noSideScroll('after fast rotation');
  log('landed on:', await text('.bar-title'));

  // ---- a locked region, and a daily that reaches into one ----
  await page.evaluate(() => App.go('map'));
  await wait(500);
  const locked = await page.evaluate(() => [...document.querySelectorAll('.region.locked .rg-prog')].map(e => e.textContent));
  log('locked regions:', JSON.stringify(locked));
  await page.evaluate(() => { document.querySelector('#v-map .scroller').scrollTop = 99999; });
  await wait(400);
  await shot('75-map-locked-region');

  // proving one theorem inside a locked region opens the pass
  await page.evaluate(() => Board.open(Content.theorem('f01'), { mode: 'daily', date: Store.today(), onExit: () => App.go('map') }));
  await wait(600);
  await L.solveBoard(page, wait, log);
  await wait(2800);
  await page.evaluate(() => document.getElementById('vBack').click());
  await wait(600);
  const nowOpen = await page.evaluate(() => Store.regionOpen('fens'));
  log('the fens after proving one of its theorems through the daily:', nowOpen);
  if (!nowOpen) throw new Error('a daily from a locked region left it locked, so the proof is unreachable');
  await shot('76-map-after-daily-unlock');

  log('errors:', errors.length);
  if (errors.length) throw new Error('page errors: ' + errors.join(' ; '));
};
