/* Axiom drive script 5: the status bar and navigation bar insets the Android shell injects.
   Sets --sat and --sab the way MainActivity does and screenshots every screen, then measures
   that nothing interactive sits under either bar.
   node ../_shiptools/drive.js http://127.0.0.1:8828/index.html test/05-safearea.js --out test/shots */
const L = require('./lib.js');
const V100 = require('./v100.json');

const SAT = 48, SAB = 34;

module.exports = async ({ page, shot, wait, log, errors }) => {
  await L.seed(page, wait, V100);
  await page.evaluate((t, b) => {
    document.documentElement.style.setProperty('--sat', t + 'px');
    document.documentElement.style.setProperty('--sab', b + 'px');
  }, SAT, SAB);
  await wait(400);

  const clear = async (label, sels) => {
    const bad = await page.evaluate((sels, sat, sab) => {
      const H = window.innerHeight, out = [];
      // Only what the eye can actually see. Anything clipped by its own scroller is not
      // on screen at all, and a list that still has more to scroll is allowed to run under
      // the navigation bar: that is what scrolling is for. What must never be obscured is
      // fixed chrome, and the last row once a list has been scrolled to its end.
      const state = el => {
        let p = el.parentElement, moreBelow = false, clipped = false;
        while (p && p !== document.body) {
          const st = getComputedStyle(p);
          if (/(auto|scroll)/.test(st.overflowY) && p.scrollHeight > p.clientHeight + 1) {
            const pr = p.getBoundingClientRect(), r = el.getBoundingClientRect();
            if (r.bottom > pr.bottom + 0.5 || r.top < pr.top - 0.5) clipped = true;
            if (p.scrollTop + p.clientHeight < p.scrollHeight - 1) moreBelow = true;
          }
          p = p.parentElement;
        }
        return { clipped: clipped, moreBelow: moreBelow };
      };
      sels.forEach(s => document.querySelectorAll(s).forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        const st = state(el);
        if (st.clipped) return;
        if (r.top < sat - 0.5) out.push(s + ' top ' + Math.round(r.top));
        if (!st.moreBelow && r.bottom > H - sab + 0.5) out.push(s + ' bottom ' + Math.round(H - r.bottom));
      }));
      return out;
    }, sels, SAT, SAB);
    log(label + ':', bad.length ? 'UNDER A BAR -> ' + bad.join(', ') : 'clear of both bars');
    return bad;
  };

  const problems = [];
  for (const v of ['map', 'daily', 'forge', 'satchel', 'profile']) {
    await page.evaluate(x => App.go(x), v);
    await wait(500);
    await shot('5' + v[0] + '-safe-' + v);
    problems.push(...await clear(v, ['.bar-title', '.bar-sub', '#tabs .tab']));
  }

  await page.evaluate(() => Board.open(Content.theorem('r07'), { onExit: () => App.go('map') }));
  await wait(700);
  await shot('5b-safe-board');
  problems.push(...await clear('board', ['#bBack', '#bHint', '#bTitle', '#pMoves .move', '#pTools .tile', '#bUndo']));
  // and again with the panel scrolled to its very end, where the last tile has to clear the bar
  await page.evaluate(() => { const p = document.getElementById('panel'); p.scrollTop = p.scrollHeight; });
  await wait(300);
  await shot('5b2-safe-board-scrolled');
  problems.push(...await clear('board, panel at the end', ['#pTools .tile']));

  await page.evaluate(() => document.getElementById('bHint').click());
  await wait(400);
  await shot('5c-safe-hint');
  problems.push(...await clear('hint sheet', ['#hintClose', '#hintTier']));
  await page.evaluate(() => document.getElementById('hintClose').click());
  await wait(200);

  await L.solveBoard(page, wait, log);
  await wait(2800);
  await shot('5d-safe-victory');
  problems.push(...await clear('victory card', ['#vNext', '#vShare', '#vBack', '#vTitle']));
  await page.evaluate(() => document.getElementById('vVignette').click());
  await wait(700);
  await shot('5e-safe-vignette');
  problems.push(...await clear('vignette', ['#vgBack', '.vg-title']));
  await page.evaluate(() => document.getElementById('vgBack').click());
  await wait(400);

  await page.evaluate(() => App.toast('A message that has to clear the navigation bar'));
  await wait(400);
  await shot('5f-safe-toast');
  problems.push(...await clear('toast', ['#toast']));

  await L.clear(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.evaluate((t, b) => {
    document.documentElement.style.setProperty('--sat', t + 'px');
    document.documentElement.style.setProperty('--sab', b + 'px');
  }, SAT, SAB);
  await wait(600);
  await shot('5g-safe-onboard');
  problems.push(...await clear('onboarding', ['.ob-line', '#obNext', '.ob-dots']));

  log('errors:', errors.length);
  if (problems.length) throw new Error('content under a system bar: ' + problems.join(' ; '));
  if (errors.length) throw new Error('page errors: ' + errors.join(' ; '));
};
