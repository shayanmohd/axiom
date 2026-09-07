/* Axiom drive script 6: the native bridge. Mocks window.Native the way the Android shell
   provides it and checks the notification schedule, the export file and sharing, then does
   the same export through the plain browser download path.
   node ../_shiptools/drive.js http://127.0.0.1:8828/index.html test/06-native.js --out test/shots */
const L = require('./lib.js');
const V100 = require('./v100.json');

module.exports = async ({ page, shot, wait, text, log, errors }) => {
  // ---- first, with no shell at all: the plain browser download path ----
  await L.seed(page, wait, V100);
  await page.evaluate(() => {
    window.__dl = [];
    HTMLAnchorElement.prototype.click = function () { window.__dl.push({ name: this.download, href: this.href }); };
  });
  await page.evaluate(() => App.go('profile'));
  await wait(400);
  await page.evaluate(() => document.getElementById('exportBtn').click());
  await wait(500);
  const dl = await page.evaluate(() => window.__dl);
  log('browser download:', JSON.stringify(dl));
  if (!dl.length || !/^axiom-progress-\d{4}-\d{2}-\d{2}\.json$/.test(dl[0].name) || !/^blob:/.test(dl[0].href))
    throw new Error('the browser export path did not produce a download');
  log('toast without a shell:', await text('#toast'));
  await shot('61-export-browser');

  // ---- then the same app inside the Android shell ----
  await page.evaluateOnNewDocument(() => {
    window.__native = { schedules: [], files: [], shares: [], cancels: 0, allowed: false, asked: 0 };
    window.Native = {
      isNative: () => true,
      vibrate: () => {},
      vibratePattern: () => {},
      hasAmplitudeControl: () => true,
      cancelVibration: () => {},
      keepAwake: () => {},
      saveFile: (name, mime, b64) => { window.__native.files.push({ name, mime, b64 }); return 'content://downloads/1'; },
      shareText: (subject, text) => { window.__native.shares.push({ subject, text }); },
      shareUri: () => {},
      scheduleNotifications: (json) => { window.__native.schedules.push(JSON.parse(json)); },
      cancelNotifications: () => { window.__native.cancels++; },
      notificationsAllowed: () => window.__native.allowed,
      requestNotificationPermission: () => { window.__native.asked++; window.__native.allowed = true; }
    };
  });
  await L.seed(page, wait, V100);   // notify is on at 08:30 in this record

  const plans = () => page.evaluate(() => window.__native.schedules);
  let sched = await plans();
  const last = sched[sched.length - 1];
  log('schedule on open:', JSON.stringify(last));
  if (!last) throw new Error('nothing was scheduled on open, though the reminder is on');
  if (last.length > 64) throw new Error('more than 64 notifications: ' + last.length);
  const nowMs = Date.now();
  if (last.some(n => n.at <= nowMs)) throw new Error('a reminder was scheduled in the past');
  if (new Set(last.map(n => n.id)).size !== last.length) throw new Error('duplicate notification ids');
  if (last.some(n => !n.title || !n.body)) throw new Error('a reminder has no text');

  // resuming recomputes the whole plan
  await page.evaluate(() => window.App.onResume());
  await wait(400);
  sched = await plans();
  log('schedules sent so far:', sched.length);
  if (sched.length < 2) throw new Error('onResume did not recompute the schedule');

  // solving today's daily removes today's reminder
  await page.evaluate(() => App.go('daily'));
  await wait(400);
  await page.evaluate(() => document.getElementById('dOpen').click());
  await wait(900);
  await L.solveBoard(page, wait, log);
  await wait(2800);
  await page.evaluate(() => document.getElementById('vBack').click());
  await wait(600);
  await page.evaluate(() => window.App.onResume());
  await wait(400);
  sched = await plans();
  const afterSolve = sched[sched.length - 1];
  log('schedule after solving today:', JSON.stringify(afterSolve.map(n => n.title)));
  const today = await page.evaluate(() => Store.today());
  const todayN = await page.evaluate(() => Store.dayNumber(Store.today()));
  if (afterSolve.some(n => n.title.indexOf(' ' + todayN) > 0 && n.title.indexOf(' ' + todayN) === n.title.length - String(todayN).length - 1))
    throw new Error("today's reminder survived solving today's proof");

  // turning the reminder off cancels everything
  await page.evaluate(() => App.go('profile'));
  await wait(400);
  await page.evaluate(() => { const c = document.getElementById('setNotify'); c.checked = false; c.dispatchEvent(new Event('change')); });
  await wait(400);
  const cancels = await page.evaluate(() => window.__native.cancels);
  log('cancelNotifications calls after switching off:', cancels);
  if (cancels < 1) throw new Error('switching the reminder off did not cancel the schedule');

  // turning it back on asks for permission once
  await page.evaluate(() => { const c = document.getElementById('setNotify'); c.checked = true; c.dispatchEvent(new Event('change')); });
  await wait(400);
  const asked = await page.evaluate(() => window.__native.asked);
  log('permission requests:', asked);
  if (asked !== 1) throw new Error('the notification permission was asked for ' + asked + ' times');

  // ---- export through Native.saveFile ----
  await page.evaluate(() => document.getElementById('exportBtn').click());
  await wait(500);
  await shot('60-export-native');
  const file = await page.evaluate(() => {
    const f = window.__native.files[0];
    if (!f) return null;
    const json = decodeURIComponent(escape(atob(f.b64)));
    let parsed = null; try { parsed = JSON.parse(json); } catch (e) {}
    return { name: f.name, mime: f.mime, bytes: json.length, app: parsed && parsed.app,
             solved: parsed && parsed.data && Object.keys(parsed.data.solved).length,
             rigor: parsed && parsed.data && parsed.data.rigor };
  });
  log('exported file:', JSON.stringify(file));
  if (!file) throw new Error('Native.saveFile was never called');
  if (file.mime !== 'application/json' || !/^axiom-progress-\d{4}-\d{2}-\d{2}\.json$/.test(file.name))
    throw new Error('the export has the wrong name or type: ' + file.name);
  if (file.app !== 'axiom' || file.solved !== Object.keys(V100.solved).length)
    throw new Error('the export lost proofs');
  log('toast:', await text('#toast'));

  // ---- sharing the shape ----
  await page.evaluate(() => App.go('daily'));
  await wait(400);
  await page.evaluate(() => document.getElementById('dShare').click());
  await wait(400);
  const share = await page.evaluate(() => window.__native.shares[0]);
  log('shared text:', JSON.stringify(share));
  if (!share || !/Axiom/.test(share.text)) throw new Error('sharing the daily did not reach the shell');
  if (/[–—]/.test(share.text)) throw new Error('the shared text contains an em or en dash');

  log('errors:', errors.length);
  if (errors.length) throw new Error('page errors: ' + errors.join(' ; '));
};
