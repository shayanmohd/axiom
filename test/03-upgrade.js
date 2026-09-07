/* Axiom drive script 3: upgrading from the shipped 1.0.0.
   Seeds localStorage with a record shaped exactly as 1.0.0's web/js/store.js wrote it
   (flat rule lists for proofs, green and yellow squares in the daily shapes), loads the
   new build over it, and proves nothing is lost or misread. Then junk and half-records.
   node ../_shiptools/drive.js http://127.0.0.1:8828/index.html test/03-upgrade.js --out test/shots */
const L = require('./lib.js');
const V100 = require('./v100.json');

module.exports = async ({ page, shot, wait, text, log, errors }) => {
  await L.seed(page, wait, V100);

  const read = await page.evaluate(() => ({
    solvedCount: Store.solvedCount(),
    gold: Store.crowns('gold'),
    silver: Store.crowns('silver'),
    rigor: Store.rigor(),
    streak: Store.streak(),
    settings: Store.settings(),
    seenR07: Store.seen('r07'),
    mastery: { split: Store.mastery('split'), chain: Store.mastery('chain'), parity: Store.mastery('parity') },
    r07: Store.solved('r07'),
    fensOpen: Store.regionOpen('fens'),
    steppesOpen: Store.regionOpen('steppes')
  }));
  log('read back:', JSON.stringify({ ...read, r07: read.r07 && { len: read.r07.len, crown: read.r07.crown, steps: read.r07.proof.length } }));

  const wantSolved = Object.keys(V100.solved).length;
  if (read.solvedCount !== wantSolved) throw new Error('lost proofs: ' + read.solvedCount + ' of ' + wantSolved);
  if (read.rigor !== V100.rigor) throw new Error('rigor changed: ' + read.rigor + ' wanted ' + V100.rigor);
  if (read.settings.notifyTime !== '08:30' || read.settings.notify !== true) throw new Error('settings lost');
  if (read.settings.haptics !== false) throw new Error('a false toggle was read as true');
  if (!read.seenR07) throw new Error('read vignettes lost');
  if (read.streak !== 5) throw new Error('streak should count the five days ending yesterday, got ' + read.streak);
  if (!read.steppesOpen) throw new Error('the steppes should be open at 17 proofs');
  if (read.mastery.split <= 0) throw new Error('forge mastery lost');
  const r07 = read.r07;
  if (!r07 || r07.len !== V100.solved.r07.len || r07.crown !== V100.solved.r07.crown) throw new Error('a proof record was misread');
  if (r07.proof.length !== V100.solved.r07.proof.length) throw new Error('a recorded proof lost steps');

  await page.evaluate(() => App.go('map'));
  await wait(600);
  await shot('30-upgrade-map');
  log('map:', (await text('.hero')).replace(/\n/g, ' '));

  await page.evaluate(() => App.go('daily'));
  await wait(600);
  await shot('31-upgrade-daily');
  const arch = await page.evaluate(() => [...document.querySelectorAll('#dArchive .arch.done')].length);
  log('archive days marked done:', arch);
  if (arch !== Object.keys(V100.daily).length) throw new Error('archive lost days: ' + arch);
  // the 1.0.0 shape glyphs must still draw
  const oldDate = Object.keys(V100.daily)[0];
  const blocks = await page.evaluate((d) => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const r = Store.dailyResult(d);
    return r ? r.shape.split('\n').map(x => [...x].length) : null;
  }, oldDate);
  log('a 1.0.0 shape grid rows:', JSON.stringify(blocks));
  if (!blocks || !blocks.length) throw new Error('a 1.0.0 daily shape was lost');

  await page.evaluate(() => App.go('satchel'));
  await wait(600);
  await shot('32-upgrade-satchel');
  const rows = await page.evaluate(() => document.querySelectorAll('#satchelList .sat-row').length);
  log('satchel rows:', rows);
  if (rows !== wantSolvedCount()) throw new Error('satchel lost lemmas: ' + rows);
  function wantSolvedCount() { return Object.keys(V100.solved).length; }

  // a 1.0.0 proof must still replay: this is the record shape that changed
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#satchelList .sat-row')];
    const hit = rows.filter(r => /bridge of asses/i.test(r.textContent))[0] || rows[0];
    hit.click();
  });
  await wait(4200);
  await shot('33-upgrade-replay');
  const note = await page.evaluate(() => document.getElementById('replayNote').textContent);
  log('replay of a 1.0.0 proof:', note);
  if (/older version/.test(note)) throw new Error('a 1.0.0 proof no longer replays: ' + note);
  await page.evaluate(() => document.getElementById('bBack').click());
  await wait(400);

  await page.evaluate(() => App.go('profile'));
  await wait(500);
  await shot('34-upgrade-profile');
  log('profile:', (await text('.stats')).replace(/\n/g, ' | '));
  const toggles = await page.evaluate(() => ({
    sound: document.getElementById('setSound').checked,
    haptics: document.getElementById('setHaptics').checked,
    notify: document.getElementById('setNotify').checked,
    time: document.getElementById('setTime').value
  }));
  log('settings on screen:', JSON.stringify(toggles));
  if (toggles.haptics !== false || toggles.notify !== true || toggles.time !== '08:30')
    throw new Error('the settings screen did not show the upgraded settings');

  // ---- a half-written record: keys missing entirely ----
  await L.seed(page, wait, { onboarded: true, solved: { r01: { len: 1, par: 1, crown: 'gold', hints: 0 } } });
  const partial = await page.evaluate(() => ({
    solved: Store.solvedCount(), rigor: Store.rigor(), streak: Store.streak(),
    settings: Store.settings(), map: document.getElementById('mapDone').textContent + ' of ' + Content.THEOREMS.length
  }));
  log('partial record:', JSON.stringify(partial));
  if (partial.solved !== 1 || partial.rigor !== 1000) throw new Error('a partial record was not defaulted');
  if (partial.settings.notifyTime !== '19:00') throw new Error('missing settings did not fall back');

  // ---- junk in the key must not brick the app ----
  await page.evaluate(k => localStorage.setItem(k, 'this is not json'), L.KEY);
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(800);
  const junk = await page.evaluate(() => ({
    onboarding: !document.getElementById('onboard').hidden,
    rigor: Store.rigor()
  }));
  log('unparseable record:', JSON.stringify(junk));
  if (junk.rigor !== 1000) throw new Error('unparseable storage did not fall back to defaults');
  await shot('35-upgrade-junk');

  // ---- wrong types in every field ----
  await page.evaluate(k => localStorage.setItem(k, JSON.stringify({
    onboarded: 'yes', solved: 'nope', daily: 7, forge: null, rigor: 'lots', seen: [], settings: 'none'
  })), L.KEY);
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(800);
  const typed = await page.evaluate(() => ({
    solved: Store.solvedCount(), streak: Store.streak(), rigor: Store.rigor(),
    sound: Store.settings().sound, archive: Store.archive(3).length
  }));
  log('wrong types:', JSON.stringify(typed));
  await shot('36-upgrade-types');

  log('errors:', errors.length);
  if (errors.length) throw new Error('page errors: ' + errors.join(' ; '));
};
