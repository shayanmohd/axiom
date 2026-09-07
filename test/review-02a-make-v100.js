/* Play the SHIPPED 1.0.0 build and dump exactly what it wrote to localStorage.
   Run against a server pointed at a checkout of the first commit's web/.
   The dump goes to test/v100-review.json and is the seed for review-02b. */
const fs = require('fs');
const path = require('path');
const L = require('./lib.js');

module.exports = async ({ page, shot, wait, text, errors, log }) => {
  await L.clear(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(400);
  await L.onboard(page, wait);

  // theorem 1, straight through
  await L.solveBoard(page, wait, log);
  await wait(1800);
  await page.evaluate(() => { const b = document.getElementById('vBack'); if (b) b.click(); });
  await wait(600);

  // a proof built OUT OF ORDER: solve the second open goal first where there is one.
  // 1.0.0 recorded a flat rule list, so this is the case its replay could not rebuild.
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.seal-row')];
    (rows[1] || rows[0]).click();
  });
  await wait(700);
  const nm = await page.evaluate(() => document.getElementById('bTitle').textContent);
  log('second theorem: ' + nm);
  await L.solveBoard(page, wait, log);
  await wait(1800);
  await page.evaluate(() => { const b = document.getElementById('vBack'); if (b) b.click(); });
  await wait(600);

  // the daily, so a 1.0.0 shape string with the old emoji lands in storage
  await page.evaluate(() => document.querySelectorAll('#tabs .tab')[1].click());
  await wait(500);
  await page.evaluate(() => document.getElementById('dOpen').click());
  await wait(900);
  await L.solveBoard(page, wait, log);
  await wait(2000);
  await page.evaluate(() => { const b = document.getElementById('vBack'); if (b) b.click(); });
  await wait(600);

  // a forge drill, so db.forge has a real entry
  await page.evaluate(() => document.querySelectorAll('#tabs .tab')[2].click());
  await wait(500);
  await page.evaluate(() => {
    const o = Board.open;
    Board.open = function (t) { window.__thm = JSON.parse(JSON.stringify(t)); return o.apply(this, arguments); };
  });
  await page.evaluate(() => document.querySelector('#forgeList .forge-row').click());
  await wait(700);
  const spec = await page.evaluate(() => window.__thm || null);
  await L.solveBoard(page, wait, log, spec);
  await wait(2000);
  await page.evaluate(() => { const b = document.getElementById('vBack'); if (b) b.click(); });
  await wait(600);

  // settings a real 1.0.0 user could have set, written through 1.0.0's own store
  await page.evaluate(() => {
    document.querySelectorAll('#tabs .tab')[4].click();
  });
  await wait(400);
  await page.evaluate(() => {
    const n = document.getElementById('setNotify');
    n.checked = true; n.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await wait(200);
  await page.evaluate(() => {
    const t = document.getElementById('setTime');
    t.value = '07:30'; t.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('setHaptics').checked = false;
    document.getElementById('setHaptics').dispatchEvent(new Event('change', { bubbles: true }));
  });
  await wait(300);
  await shot('r02a-v100-profile');

  const db = await L.read(page);
  const out = path.join(__dirname, 'v100-review.json');
  fs.writeFileSync(out, JSON.stringify(db, null, 2));
  log('wrote ' + out);
  log('solved: ' + Object.keys(db.solved).length + ', daily: ' + Object.keys(db.daily).length +
      ', forge: ' + Object.keys(db.forge).length + ', rigor: ' + db.rigor);
  log('settings: ' + JSON.stringify(db.settings));
  const firstProof = db.solved[Object.keys(db.solved)[0]].proof;
  log('proof shape (1.0.0): ' + JSON.stringify(firstProof).slice(0, 200));
  const anyDaily = db.daily[Object.keys(db.daily)[0]];
  log('daily shape codepoints: ' + JSON.stringify(anyDaily.shape));

  if (errors.length) throw new Error('1.0.0 page errors: ' + errors.join(' | '));
};
