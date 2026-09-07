/* Reviewer pass 6: export and import both ways, the reminder time, rapid taps, corrupt and
   hostile saves, the notification schedule, and every empty state drawn. */
const L = require('./lib.js');
const v100 = require('./v100-review.json');

const eq = (a, b, what) => { if (a !== b) throw new Error(what + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); };

module.exports = async ({ page, shot, wait, text, click, errors, log }) => {
  /* ---- empty states, first, on a clean install past onboarding ---- */
  await L.clear(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(300);
  await page.evaluate(() => Store.onboarded(true));
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(700);
  await shot('r06-empty-map');
  await click('#tabs .tab:nth-child(4)'); await wait(600);
  await shot('r06-empty-satchel');
  const drawn = await page.evaluate(() => {
    const e = document.getElementById('satchelEmpty');
    return { hidden: e.hidden, svg: !!e.querySelector('svg'), paths: e.querySelectorAll('svg use, svg path').length };
  });
  log('empty satchel: ' + JSON.stringify(drawn));
  if (drawn.hidden || !drawn.svg || drawn.paths < 3) throw new Error('the empty satchel is not drawn');
  await click('#tabs .tab:nth-child(2)'); await wait(600);
  await shot('r06-empty-daily');
  await click('#tabs .tab:nth-child(3)'); await wait(600);
  await shot('r06-forge-untried');
  await click('#tabs .tab:nth-child(5)'); await wait(600);
  await shot('r06-profile-empty');

  /* ---- the reminder time, every bad value ---- */
  await page.evaluate(() => {
    const n = document.getElementById('setNotify');
    n.checked = true; n.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await wait(300);
  const setTime = async (v) => {
    await page.evaluate(x => {
      const t = document.getElementById('setTime');
      t.value = x; t.dispatchEvent(new Event('change', { bubbles: true }));
    }, v);
    await wait(150);
    return page.evaluate(() => ({ field: document.getElementById('setTime').value, stored: Store.settings().notifyTime }));
  };
  log('good time 06:15 -> ' + JSON.stringify(await setTime('06:15')));
  eq((await page.evaluate(() => Store.settings().notifyTime)), '06:15', 'a good time is stored');
  const cleared = await setTime('');
  log('cleared -> ' + JSON.stringify(cleared));
  eq(cleared.stored, '06:15', 'clearing the field must keep the last good time');
  eq(cleared.field, '06:15', 'the field is put back to the last good time');
  const junk = await setTime('7');
  eq(junk.stored, '06:15', 'a half typed time must not be stored');
  log('junk "7" -> ' + JSON.stringify(junk));

  /* ---- the notification schedule ----
     The shell injects window.Native before any page script runs, and app.js captures it at
     load, so the mock has to be installed the same way rather than poked in afterwards. */
  await page.evaluateOnNewDocument(() => {
    window.__native = { calls: [], saved: null };
    window.Native = {
      isNative: () => true,
      vibrate: () => {}, vibratePattern: () => {}, hasAmplitudeControl: () => false, cancelVibration: () => {},
      keepAwake: () => {}, shareText: (s, t) => window.__native.calls.push(['shareText', s, t]),
      saveFile: (name, mime, b64) => { window.__native.saved = { name: name, mime: mime, b64: b64 }; return 'content://x'; },
      scheduleNotifications: j => window.__native.calls.push(['schedule', JSON.parse(j)]),
      cancelNotifications: () => window.__native.calls.push(['cancel']),
      notificationsAllowed: () => true,
      requestNotificationPermission: () => {}
    };
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(700);
  await click('#tabs .tab:nth-child(5)'); await wait(500);
  await page.evaluate(() => {
    const n = document.getElementById('setNotify');
    if (!n.checked) { n.checked = true; n.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await wait(400);
  const plan = await page.evaluate(() => window.__native.calls.filter(c => c[0] === 'schedule').map(c => c[1]));
  const entries = plan[plan.length - 1];
  log('schedule: ' + (Array.isArray(entries) ? entries.length + ' entries, first ' + JSON.stringify(entries[0]) : entries));
  if (!Array.isArray(entries)) throw new Error('nothing was scheduled with notifications on');
  if (entries.length > 64) throw new Error('more than 64 notifications scheduled');
  entries.forEach(e => { if (e.at <= Date.now()) throw new Error('a notification is scheduled in the past'); });
  if (entries.some(e => /!/.test(e.title + e.body))) throw new Error('an exclamation mark in a notification');

  /* ---- export through Native.saveFile ---- */
  await L.seed(page, wait, v100);
  await click('#tabs .tab:nth-child(5)'); await wait(600);
  await page.evaluate(() => document.getElementById('exportBtn').click());
  await wait(400);
  const saved = await page.evaluate(() => {
    const s = window.__native.saved;
    return s ? { name: s.name, mime: s.mime, text: decodeURIComponent(escape(atob(s.b64))) } : null;
  });
  if (!saved) throw new Error('Native.saveFile was never called by Export');
  log('saveFile: ' + saved.name + ' ' + saved.mime + ' ' + saved.text.length + ' bytes');
  log('export toast: ' + (await text('#toast')));
  const parsed = JSON.parse(saved.text);
  eq(parsed.app, 'axiom', 'export app tag');
  eq(Object.keys(parsed.data.solved).length, Object.keys(v100.solved).length, 'exported proofs');
  await shot('r06-export-native');

  /* ---- restore: junk, a foreign file, an empty file, and the real one ---- */
  const feed = async (name, content) => {
    await page.evaluate(() => { const el = document.getElementById('importNote'); el.hidden = true; });
    await page.evaluate((n, c) => {
      const dt = new DataTransfer();
      dt.items.add(new File([c], n, { type: 'application/json' }));
      const inp = document.getElementById('importFile');
      inp.files = dt.files;
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }, name, content);
    await wait(500);
    return page.evaluate(() => ({ note: document.getElementById('importNote').textContent,
                                  hidden: document.getElementById('importNote').hidden,
                                  btn: document.getElementById('importBtn').textContent }));
  };
  log('not json    -> ' + JSON.stringify(await feed('a.json', 'this is not json at all')));
  await shot('r06-restore-junk');
  log('foreign app -> ' + JSON.stringify(await feed('b.json', JSON.stringify({ app: 'sway', data: {} }))));
  log('empty       -> ' + JSON.stringify(await feed('c.json', JSON.stringify({ app: 'axiom', data: { solved: {}, daily: {} } }))));
  const armed = await feed('d.json', saved.text);
  log('good file   -> ' + JSON.stringify(armed));
  await shot('r06-restore-armed');
  if (!/Tap again/.test(armed.btn)) throw new Error('a good export did not arm the restore');
  if (/[!]/.test(armed.note)) throw new Error('an exclamation mark in the restore note');
  // wipe, then restore, and prove it came back
  await page.evaluate(() => { Store.erase(); });
  await page.evaluate(() => document.getElementById('importBtn').click());
  await wait(1400);
  const back = await L.read(page);
  eq(Object.keys(back.solved).length, Object.keys(v100.solved).length, 'proofs after restore');
  eq(back.rigor, v100.rigor, 'rigor after restore');
  log('restored: ' + Object.keys(back.solved).length + ' proofs, rigor ' + back.rigor);

  /* ---- hostile and wrong typed saves ---- */
  const hostile = [
    { name: 'solved as a string', db: { onboarded: true, solved: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', daily: {}, forge: {}, rigor: 1000, seen: {}, settings: {} } },
    { name: 'solved as an array', db: { onboarded: true, solved: [1, 2, 3], daily: {}, rigor: 'x' } },
    { name: 'rigor as NaN text', db: { onboarded: true, solved: {}, daily: {}, rigor: 'many' } },
    { name: 'settings as a number', db: { onboarded: true, solved: {}, daily: {}, settings: 7 } },
    { name: 'a solved entry with no len', db: { onboarded: true, solved: { r01: { crown: 'gold' } }, daily: {} } },
    { name: 'null', db: null },
    { name: 'a bare number', db: 42 }
  ];
  for (const h of hostile) {
    await page.evaluate(v => localStorage.setItem('axiom.v1', v), JSON.stringify(h.db));
    await page.reload({ waitUntil: 'networkidle0' });
    await wait(700);
    const st = await page.evaluate(() => ({ count: Store.solvedCount(), rigor: Store.rigor(),
      regions: Content.REGIONS.map(r => Store.regionOpen(r.id)), notifyTime: Store.settings().notifyTime,
      view: document.getElementById('v-map').hidden ? 'other' : 'map' }));
    log(h.name.padEnd(26) + ' -> ' + JSON.stringify(st));
    if (typeof st.count !== 'number' || st.count > 44) throw new Error(h.name + ': solvedCount is nonsense');
    if (st.count === 0 && st.regions.filter(Boolean).length > 1) throw new Error(h.name + ': a region opened with nothing proved');
    if (typeof st.rigor !== 'number' || !isFinite(st.rigor)) throw new Error(h.name + ': rigor is not a number');
    if (!/^\d{2}:\d{2}$/.test(st.notifyTime)) throw new Error(h.name + ': notifyTime is not a time (' + st.notifyTime + ')');
  }
  await shot('r06-after-hostile');

  /* ---- rapid taps ---- */
  await L.clear(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(300);
  await page.evaluate(() => Store.onboarded(true));
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(700);
  await click('#tabs .tab:nth-child(2)'); await wait(600);
  await page.evaluate(() => { const b = document.getElementById('dOpen'); b.click(); b.click(); b.click(); b.click(); });
  await wait(1400);
  const boards = await page.evaluate(() => ({ open: !document.getElementById('v-board').hidden,
                                              nodes: document.querySelectorAll('#tree .node').length,
                                              trees: document.querySelectorAll('#tree').length }));
  log('after four taps on the seal: ' + JSON.stringify(boards));
  await shot('r06-seal-rapid');
  if (boards.trees !== 1) throw new Error('rapid taps built more than one board');
  await page.evaluate(() => window.App.back());
  await wait(500);
  // rapid tab flipping
  for (let i = 0; i < 14; i++) await page.evaluate(j => document.querySelectorAll('#tabs .tab')[j % 5].click(), i);
  await wait(700);
  const visible = await page.evaluate(() => [...document.querySelectorAll('.screen')].filter(s => !s.hidden).map(s => s.id));
  log('visible screens after rapid tab flipping: ' + JSON.stringify(visible));
  if (visible.length !== 1) throw new Error('rapid tab flipping left ' + visible.length + ' screens visible');
  await shot('r06-after-rapid-tabs');

  // rapid taps on a satchel row and the erase button
  await click('#tabs .tab:nth-child(5)'); await wait(500);
  await page.evaluate(() => { const b = document.getElementById('eraseBtn'); b.click(); });
  await wait(200);
  const armedErase = await text('#eraseBtn');
  log('erase after one tap: ' + armedErase);
  if (!/Tap again/.test(armedErase)) throw new Error('erase armed on the first tap');
  await wait(4500);
  log('erase after the timeout: ' + (await text('#eraseBtn')));

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
};
