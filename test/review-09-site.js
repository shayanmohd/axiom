/* Reviewer pass 9: the landing page and the privacy policy, at phone and desktop width,
   with every image resolving and no page errors. */
module.exports = async ({ page, shot, wait, text, errors, log }) => {
  const bad = [];
  page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });

  await page.goto('http://127.0.0.1:8919/index.html', { waitUntil: 'networkidle0' });
  await wait(600);
  await shot('r09-site-top');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.35));
  await wait(600);
  await shot('r09-site-mid');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(700);
  await shot('r09-site-foot');

  const imgs = await page.evaluate(() => [...document.images].map(i => ({ src: i.getAttribute('src'),
    ok: i.complete && i.naturalWidth > 0, w: i.naturalWidth, h: i.naturalHeight })));
  imgs.forEach(i => log((i.ok ? 'ok  ' : 'BAD ') + i.src + ' ' + i.w + 'x' + i.h));
  if (imgs.some(i => !i.ok)) throw new Error('a landing page image did not load');

  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(700);
  await shot('r09-site-desktop');

  await page.goto('http://127.0.0.1:8919/privacy-policy.html', { waitUntil: 'networkidle0' });
  await wait(500);
  await shot('r09-policy');
  const pol = await text('body');
  log('policy mentions: ' + ['VIBRATE', 'POST_NOTIFICATIONS', 'network', 'internet'].filter(w => new RegExp(w, 'i').test(pol)).join(', '));

  // the playable copy of the app under docs/play must be the same build
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto('http://127.0.0.1:8919/play/index.html', { waitUntil: 'networkidle0' });
  await wait(900);
  await shot('r09-play');
  const stamp = await page.evaluate(() => /version\s*\d/i.test(document.body.innerText));
  if (stamp) throw new Error('docs/play still carries a version stamp');

  if (bad.length) throw new Error('failed requests: ' + bad.join(' | '));
  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
};
