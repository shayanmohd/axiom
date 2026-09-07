/* Reviewer pass 2: upgrade. Seed the 1.0.1 build with a save written by the real
   shipped 1.0.0 (test/v100-review.json, produced by review-02a against the first commit)
   and prove nothing is lost or misread. */
const v100 = require('./v100-review.json');
const L = require('./lib.js');

const eq = (a, b, what) => { if (a !== b) throw new Error(what + ': expected ' + b + ', got ' + a); };

module.exports = async ({ page, shot, wait, text, click, errors, log }) => {
  await L.clear(page);
  await L.seed(page, wait, v100);

  const after = await L.read(page);
  // load() rewrites nothing until a save; force one read-through by asking the store
  const view = await page.evaluate(() => ({
    solved: Object.keys(Store.solved && JSON.parse(localStorage.getItem('axiom.v1')).solved).length,
    count: Store.solvedCount(),
    rigor: Store.rigor(),
    gold: Store.crowns('gold'),
    silver: Store.crowns('silver'),
    streak: Store.streak(),
    settings: Store.settings(),
    mastery: Object.fromEntries(Forge.KINDS.map(k => [k.id, Store.mastery(k.id)]))
  }));
  log('read back: ' + JSON.stringify(view));
  eq(view.count, Object.keys(v100.solved).length, 'solved count');
  eq(view.rigor, v100.rigor, 'rigor');
  eq(view.settings.notifyTime, v100.settings.notifyTime, 'notifyTime');
  eq(view.settings.haptics, v100.settings.haptics, 'haptics');
  eq(view.settings.notify, v100.settings.notify, 'notify');
  eq(view.streak, 1, 'streak');
  const anyMastery = Object.values(view.mastery).some(v => v > 0);
  if (!anyMastery) throw new Error('forge mastery lost across the upgrade');

  await shot('r02b-map');
  const mapTxt = await text('.hero-txt');
  log('map header: ' + mapTxt.replace(/\n/g, ' '));

  // profile: every number must match the 1.0.0 record
  await click('#tabs .tab:nth-child(5)');
  await wait(500);
  await shot('r02b-profile');
  log('profile: ' + (await text('.stats')).replace(/\n/g, ' | '));
  const t = await page.evaluate(() => document.getElementById('setTime').value);
  eq(t, v100.settings.notifyTime, 'reminder time field');
  const hap = await page.evaluate(() => document.getElementById('setHaptics').checked);
  eq(hap, v100.settings.haptics, 'haptics checkbox');

  // daily: the archive and the result drawn from a 1.0.0 shape string of green and yellow
  await click('#tabs .tab:nth-child(2)');
  await wait(600);
  await shot('r02b-daily');
  const blocks = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#dShape .blk')];
    return { n: b.length, leaf: b.filter(x => x.classList.contains('leaf')).length };
  });
  log('1.0.0 daily shape rendered: ' + JSON.stringify(blocks));
  if (!blocks.n) throw new Error('the 1.0.0 daily shape did not render');
  if (!blocks.leaf) throw new Error('the 1.0.0 green squares did not read as leaves');
  const solvedArch = await page.evaluate(() => document.querySelectorAll('#dArchive .arch.done').length);
  log('archive tiles marked done: ' + solvedArch);
  if (solvedArch < 1) throw new Error('the 1.0.0 daily result is missing from the archive');

  // satchel: every 1.0.0 proof must replay, including the flat rule list
  await click('#tabs .tab:nth-child(4)');
  await wait(600);
  await shot('r02b-satchel');
  const nRows = await page.evaluate(() => document.querySelectorAll('#satchelList .sat-row').length);
  eq(nRows, Object.keys(v100.solved).length, 'satchel rows');
  for (let i = 0; i < nRows; i++) {
    await page.evaluate(j => document.querySelectorAll('#satchelList .sat-row')[j].click(), i);
    await wait(900);
    const name = await page.evaluate(() => document.getElementById('bTitle').textContent);
    await wait(4200);
    const note = await text('#replayNote');
    log('replay ' + i + ' (' + name + '): ' + note);
    await shot('r02b-replay-' + i);
    if (!/exactly as you built it/.test(note)) throw new Error('1.0.0 proof did not replay: ' + name + ' -> ' + note);
    await page.evaluate(() => window.App.back());
    await wait(600);
  }

  // and the new build must keep writing on top of the old record without losing it
  await click('#tabs .tab:nth-child(1)');
  await wait(500);
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.seal-row:not(.done)')];
    rows[0].click();
  });
  await wait(700);
  await L.solveBoard(page, wait, log);
  await wait(2200);
  await page.evaluate(() => { const b = document.getElementById('vBack'); if (b) b.click(); });
  await wait(700);
  const final = await L.read(page);
  Object.keys(v100.solved).forEach(k => {
    if (!final.solved[k]) throw new Error('1.0.0 proof ' + k + ' was dropped by a 1.0.1 write');
    if (JSON.stringify(final.solved[k]) !== JSON.stringify(v100.solved[k]))
      throw new Error('1.0.0 record ' + k + ' was rewritten: ' + JSON.stringify(final.solved[k]));
  });
  Object.keys(v100.daily).forEach(k => {
    if (JSON.stringify(final.daily[k]) !== JSON.stringify(v100.daily[k]))
      throw new Error('1.0.0 daily ' + k + ' was rewritten');
  });
  if (JSON.stringify(final.forge) !== JSON.stringify(v100.forge)) throw new Error('1.0.0 forge record rewritten');
  log('after a 1.0.1 write: solved ' + Object.keys(final.solved).length + ', rigor ' + final.rigor);
  await shot('r02b-after-new-proof');

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
};
