/* Axiom drive script 11: with prefers-reduced-motion, motion stops but nothing disappears.
   node ../_shiptools/drive.js http://127.0.0.1:8828/index.html test/11-reduced.js --out test/shots --reduced-motion */
const L = require('./lib.js');
const V100 = require('./v100.json');

module.exports = async ({ page, shot, wait, text, log, errors }) => {
  const reduced = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  log('prefers-reduced-motion:', reduced);
  if (!reduced) throw new Error('run this one with --reduced-motion');

  await L.seed(page, wait, V100);
  await page.evaluate(() => App.go('map'));
  await wait(700);
  await shot('b0-reduced-map');
  const hero = await page.evaluate(() => {
    const mark = document.getElementById('mapMark');
    const halves = [...mark.querySelectorAll('.mk-half')].map(g => {
      const r = g.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height);
    });
    const seam = mark.querySelector('.mk-seam');
    const bar = document.getElementById('mapBar');
    return { halves: halves, seamOpacity: getComputedStyle(seam).opacity,
             markW: Math.round(mark.getBoundingClientRect().width),
             barW: Math.round(bar.getBoundingClientRect().width),
             trackW: Math.round(bar.parentElement.getBoundingClientRect().width) };
  });
  log('hero under reduced motion:', JSON.stringify(hero));
  if (hero.markW < 60) throw new Error('the signature mark collapsed');
  if (hero.halves.some(h => /^0x|x0$/.test(h))) throw new Error('a half of the mark has no size');
  if (Number(hero.seamOpacity) < 0.9) throw new Error('the lit seam is not drawn');
  if (hero.barW < 4 || hero.barW >= hero.trackW) throw new Error('the progress bar did not settle at its real width: ' + hero.barW + ' of ' + hero.trackW);

  // every list still shows its rows: the staggered entry must not leave anything at opacity 0
  for (const v of ['map', 'daily', 'forge', 'satchel', 'profile']) {
    await page.evaluate(x => App.go(x), v);
    await wait(320);
    const faded = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.seal-row, .forge-row, .sat-row, .region, .stat, .arch, .head, .hero')
        .forEach(el => {
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          if (r.height > 0 && (Number(cs.opacity) < 0.9 || cs.visibility === 'hidden')) out.push(el.className + ' ' + cs.opacity);
        });
      return out;
    });
    log(v + ': faded elements ->', faded.length ? faded.slice(0, 4).join(' | ') : 'none');
    if (faded.length) throw new Error(v + ' left content invisible under reduced motion');
    await shot('b1-reduced-' + v);
  }

  // the cascade still marks every node as proved, even with the animation stopped
  await page.evaluate(() => Board.open(Content.theorem('r03'), { onExit: () => App.go('map') }));
  await wait(500);
  await L.solveBoard(page, wait, log);
  await wait(2000);
  const lit = await page.evaluate(() => ({
    nodes: document.querySelectorAll('#tree .node').length,
    litNodes: document.querySelectorAll('#tree .node.lit').length,
    litEdges: document.querySelectorAll('#tree .edge.lit').length,
    victory: !document.getElementById('victory').hidden
  }));
  log('cascade under reduced motion:', JSON.stringify(lit));
  await shot('b2-reduced-cascade');
  if (lit.litNodes !== lit.nodes) throw new Error('the cascade did not light every node');
  if (!lit.victory) throw new Error('the victory card never appeared');

  log('errors:', errors.length);
  if (errors.length) throw new Error('page errors: ' + errors.join(' ; '));
};
