/* Reviewer pass 8: look at what changed. Onboarding composition, the archive placeholder,
   the profile foot, and the whole set again under reduced motion. */
const v100 = require('./v100-review.json');
const L = require('./lib.js');

module.exports = async ({ page, shot, wait, text, click, errors, log }) => {
  await L.clear(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(600);
  for (let i = 1; i <= 3; i++) {
    await shot('r08-onboard-' + i);
    const gap = await page.evaluate(() => {
      const card = document.querySelector('#obTrack .ob-card:not([hidden])');
      const last = card.lastElementChild.getBoundingClientRect();
      const foot = document.querySelector('.ob-foot').getBoundingClientRect();
      const art = document.querySelector('.ob-art').getBoundingClientRect();
      return { artTop: Math.round(art.top), artH: Math.round(art.height),
               copyEnds: Math.round(last.bottom), footTop: Math.round(foot.top),
               deadSpace: Math.round(foot.top - last.bottom), viewport: innerHeight };
    });
    log('card ' + i + ': ' + JSON.stringify(gap));
    if (i < 3) { await page.evaluate(() => document.getElementById('obNext').click()); await wait(500); }
  }

  await L.seed(page, wait, v100);
  await click('#tabs .tab:nth-child(2)'); await wait(700);
  await shot('r08-daily');
  await click('#tabs .tab:nth-child(5)'); await wait(600);
  await page.evaluate(() => { const s = document.querySelector('#v-profile .scroller'); s.scrollTop = s.scrollHeight; });
  await wait(400);
  await shot('r08-profile-foot');
  log('colophon: ' + (await text('.colophon')));
  const stamp = await page.evaluate(() => /version\s*\d/i.test(document.body.innerText));
  if (stamp) throw new Error('a version stamp is still in the UI');

  // a proof, left in the middle of the cascade, must stop buzzing and lighting
  await click('#tabs .tab:nth-child(1)'); await wait(500);
  await page.evaluate(() => {
    window.__vibes = 0;
    const nv = navigator.vibrate ? navigator.vibrate.bind(navigator) : null;
    navigator.vibrate = () => { window.__vibes++; return true; };
    [...document.querySelectorAll('.seal-row')].filter(r => !r.classList.contains('done'))[0].click();
  });
  await wait(700);
  await L.solveBoard(page, wait, log);
  await wait(120);
  await page.evaluate(() => window.App.onPause());
  const v1 = await page.evaluate(() => window.__vibes);
  await wait(2500);
  const v2 = await page.evaluate(() => window.__vibes);
  log('vibrations during the cascade: ' + v1 + ', after pausing: ' + v2);
  if (v2 !== v1) throw new Error('the cascade kept buzzing after onPause (' + v1 + ' -> ' + v2 + ')');
  const lit = await page.evaluate(() => ({ nodes: document.querySelectorAll('#tree .node').length,
                                           litNodes: document.querySelectorAll('#tree .node.lit').length }));
  log('after pausing mid cascade: ' + JSON.stringify(lit));
  if (lit.litNodes !== lit.nodes) throw new Error('pausing left the tree half lit');
  await shot('r08-paused-cascade');
  await page.evaluate(() => window.App.onResume());
  await wait(1500);
  await page.evaluate(() => { const b = document.getElementById('vBack'); if (b) b.click(); });
  await wait(600);

  // leaving mid cascade must not light the next board's edges
  await page.evaluate(() => {
    [...document.querySelectorAll('.seal-row')].filter(r => !r.classList.contains('done'))[0].click();
  });
  await wait(700);
  await L.solveBoard(page, wait, log);
  await wait(60);
  await page.evaluate(() => window.App.back());
  await wait(60);
  await page.evaluate(() => {
    [...document.querySelectorAll('.seal-row')].filter(r => !r.classList.contains('done'))[0].click();
  });
  await wait(900);
  const spill = await page.evaluate(() => ({ litEdges: document.querySelectorAll('#tree .edge.lit').length,
                                             litNodes: document.querySelectorAll('#tree .node.lit').length,
                                             victory: !document.getElementById('victory').hidden }));
  log('a fresh board opened right after leaving a cascade: ' + JSON.stringify(spill));
  await shot('r08-no-spill');
  if (spill.litEdges || spill.litNodes || spill.victory) throw new Error('the old cascade spilled onto the new board');

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
};
