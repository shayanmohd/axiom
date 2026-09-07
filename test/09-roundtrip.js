/* Axiom drive script 9: export then restore, and every way a restore can go wrong.
   node ../_shiptools/drive.js http://127.0.0.1:8828/index.html test/09-roundtrip.js --out test/shots */
const fs = require('fs');
const path = require('path');
const L = require('./lib.js');
const V100 = require('./v100.json');
const TMP = path.join(__dirname, 'shots', 'tmp');

module.exports = async ({ page, shot, wait, text, log, errors }) => {
  fs.mkdirSync(TMP, { recursive: true });
  await L.seed(page, wait, V100);

  const exported = await page.evaluate(() => Store.exportJson());
  const good = path.join(TMP, 'axiom-export.json');
  fs.writeFileSync(good, exported);
  log('exported ' + exported.length + ' bytes to ' + good);

  // wipe, then restore the file
  await page.evaluate(() => Store.erase());
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(700);
  await page.evaluate(() => { Store.onboarded(true); });
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(700);
  await page.evaluate(() => App.go('profile'));
  await wait(400);
  const empty = await page.evaluate(() => Store.solvedCount());
  log('proofs before the restore:', empty);
  if (empty !== 0) throw new Error('erase left something behind');

  const put = async (file) => {
    const input = await page.$('#importFile');
    await input.uploadFile(file);
    await page.evaluate(() => document.getElementById('importFile').dispatchEvent(new Event('change')));
    await wait(500);
  };

  // a file that is not JSON
  const junk = path.join(TMP, 'not-json.json');
  fs.writeFileSync(junk, 'this is not json at all');
  await put(junk);
  let note = await text('#importNote');
  log('restoring junk says:', note);
  await shot('90-restore-junk');
  if (!/not readable/.test(note)) throw new Error('a junk file was not refused: ' + note);

  // a JSON file from something else
  const other = path.join(TMP, 'other-app.json');
  fs.writeFileSync(other, JSON.stringify({ app: 'sway', data: { storms: [] } }));
  await put(other);
  note = await text('#importNote');
  log('restoring another app says:', note);
  if (!/different app/.test(note)) throw new Error("another app's export was not refused: " + note);

  // an Axiom export with nothing in it
  const bare = path.join(TMP, 'bare.json');
  fs.writeFileSync(bare, JSON.stringify({ app: 'axiom', version: 1, data: { solved: {}, daily: {} } }));
  await put(bare);
  note = await text('#importNote');
  log('restoring an empty export says:', note);
  if (!/no progress/.test(note)) throw new Error('an empty export was not refused: ' + note);

  // the real thing: describe, then require a second tap
  await put(good);
  note = await text('#importNote');
  log('restoring the real export says:', note);
  await shot('91-restore-armed');
  if (!/holds 17 proofs/.test(note)) throw new Error('the restore did not read the file: ' + note);
  const still = await page.evaluate(() => Store.solvedCount());
  if (still !== 0) throw new Error('the restore replaced progress before it was confirmed');

  await page.evaluate(() => document.getElementById('importBtn').click());
  await wait(1600);
  const back = await page.evaluate(() => ({
    solved: Store.solvedCount(), rigor: Store.rigor(), gold: Store.crowns('gold'),
    settings: Store.settings(), dailies: Object.keys(Store.archive(30).filter(a => a.result)).length
  }));
  log('after the restore:', JSON.stringify(back));
  await page.evaluate(() => App.go('profile'));
  await wait(500);
  await shot('92-restored');
  if (back.solved !== Object.keys(V100.solved).length) throw new Error('the restore lost proofs');
  if (back.rigor !== V100.rigor) throw new Error('the restore lost rigor');
  if (back.settings.notifyTime !== '08:30') throw new Error('the restore lost settings');

  // and the restored records still replay
  await page.evaluate(() => App.go('satchel'));
  await wait(500);
  await page.evaluate(() => document.querySelector('#satchelList .sat-row').click());
  await wait(3000);
  const replay = await text('#replayNote');
  log('replay after restore:', replay);
  if (/could not be rebuilt/.test(replay)) throw new Error('a restored proof does not replay');

  fs.rmSync(TMP, { recursive: true, force: true });
  log('errors:', errors.length);
  if (errors.length) throw new Error('page errors: ' + errors.join(' ; '));
};
