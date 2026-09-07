/* Reviewer pass 4: safe areas. --sat 48px, --sab 34px, every screen, nothing under either bar.
   A scroller legitimately runs its content under the bars while you scroll; what must never
   happen is that the content cannot be brought clear. So each screen is checked twice, at
   rest: scrolled to the very top (nothing may sit under the status bar) and scrolled to the
   very bottom (nothing may sit under the navigation bar). Fixed chrome is checked always,
   and when a sheet is open only the sheet and the chrome are checked, since the rest is
   behind it. */
const v100 = require('./v100-review.json');
const L = require('./lib.js');

const SAT = 48, SAB = 34;

const BANDS =
  'body::before,body::after{content:"";position:fixed;left:0;right:0;z-index:9999;pointer-events:none;' +
  'background:rgba(0,120,255,0.30);}' +
  'body::before{top:0;height:' + SAT + 'px;}body::after{bottom:0;height:' + SAB + 'px;}';

async function inject(page) {
  await page.addStyleTag({ content: ':root { --sat: ' + SAT + 'px; --sab: ' + SAB + 'px; }' });
  await page.addStyleTag({ content: BANDS });
}

module.exports = async ({ page, shot, wait, click, errors, log }) => {
  await L.clear(page);
  await L.seed(page, wait, v100);
  await inject(page);
  await wait(400);

  const bad = [];

  /* scope: 'all' | a selector to restrict to (a sheet), edge: 'top' | 'bottom' */
  const check = async (name, scope, edge) => {
    const out = await page.evaluate((sat, sab, scope, edge) => {
      const H = window.innerHeight;
      const roots = scope === 'all'
        ? [document.body]
        : [...document.querySelectorAll(scope + ', header.bar, #tabs, .toast:not([hidden])')];
      const seen = new Set();
      const res = [];
      roots.forEach(root => {
        [root, ...root.querySelectorAll('*')].forEach(el => {
          if (seen.has(el) || el.closest('#glyphs')) return;
          seen.add(el);
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) return;
          const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length);
          const isControl = /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
          const isIcon = el.tagName === 'svg';
          if (!hasText && !isControl && !isIcon) return;
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) return;
          if (r.bottom < 0 || r.top > H) return;
          const hit = edge === 'top' ? r.top < sat : r.bottom > H - sab;
          if (!hit) return;
          res.push({ tag: el.tagName, cls: String(el.className.baseVal !== undefined ? el.className.baseVal : el.className || ''),
                     id: el.id, top: Math.round(r.top), bottom: Math.round(r.bottom),
                     text: (el.innerText || el.textContent || '').trim().slice(0, 46) });
        });
      });
      return res;
    }, SAT, SAB, scope, edge);
    await shot('r04-' + name);
    if (out.length) { log('UNDER THE ' + edge.toUpperCase() + ' BAR on ' + name + ':'); out.forEach(b => log('   ' + JSON.stringify(b))); out.forEach(b => bad.push(name + ' ' + (b.id || b.cls || b.tag))); }
    else log(name + ' (' + edge + '): clear');
  };

  const scroller = (page, sel, where) => page.evaluate((s, w) => {
    const el = document.querySelector(s);
    if (el) el.scrollTop = w === 'top' ? 0 : el.scrollHeight;
  }, sel, where);

  // A list longer than the screen runs under the tab bar while you scroll, which is right.
  // What matters is that both ends can be brought clear, so each screen is checked at rest
  // against the top bar scrolled to the top and against the bottom bar scrolled to the foot.
  const bothEnds = async (name, sel) => {
    await scroller(page, sel, 'top'); await wait(350);
    await check(name + '-top', 'all', 'top');
    await scroller(page, sel, 'bottom'); await wait(350);
    await check(name + '-bottom', 'all', 'bottom');
    // a screen that fits without scrolling has to clear both bars at once
    const fits = await page.evaluate(x => { const e = document.querySelector(x); return !e || e.scrollHeight <= e.clientHeight + 2; }, sel);
    if (fits) await check(name + '-both', 'all', 'top');
  };

  await bothEnds('map', '#v-map .scroller');
  await click('#tabs .tab:nth-child(2)'); await wait(500);
  await bothEnds('daily', '#v-daily .scroller');
  await click('#tabs .tab:nth-child(3)'); await wait(500);
  await bothEnds('forge', '#v-forge .scroller');
  await click('#tabs .tab:nth-child(4)'); await wait(500);
  await bothEnds('satchel', '#v-satchel .scroller');
  await click('#tabs .tab:nth-child(5)'); await wait(500);
  await bothEnds('profile', '#v-profile .scroller');

  // the board: a fixed bar at the top, a panel at the foot
  await click('#tabs .tab:nth-child(1)'); await wait(400);
  await scroller(page, '#v-map .scroller', 'top'); await wait(300);
  await page.evaluate(() => [...document.querySelectorAll('.seal-row')].filter(r => !r.classList.contains('done'))[0].click());
  await wait(700);
  await check('board-top', 'all', 'top');
  await page.evaluate(() => { const p = document.getElementById('panel'); p.scrollTop = p.scrollHeight; });
  await wait(350);
  await check('board-panel-bottom', 'all', 'bottom');

  await click('#bHint'); await wait(450);
  await check('hint-sheet-top', '.sheet:not([hidden]) .sheet-panel', 'top');
  await check('hint-sheet-bottom', '.sheet:not([hidden]) .sheet-panel', 'bottom');
  await page.evaluate(() => document.getElementById('hintClose').click()); await wait(300);

  await L.solveBoard(page, wait, log);
  await wait(2500);
  await check('victory-top', '#victory .sheet-panel', 'top');
  await check('victory-bottom', '#victory .sheet-panel', 'bottom');
  await page.evaluate(() => document.getElementById('vBack').click());
  await wait(700);

  // the toast, which floats above the tab bar
  await page.evaluate(() => App.toast('A message that must clear the bars'));
  await wait(350);
  await check('toast', '#toast', 'bottom');

  // a vignette
  const key = await page.evaluate(() => (Content.THEOREMS.filter(t => t.keystone && t.vignette)[0] || {}).id || null);
  if (key) {
    await page.evaluate(id => App.vignette(Content.THEOREMS.filter(t => t.id === id)[0], () => App.go('map')), key);
    await wait(600);
    await bothEnds('vignette', '#v-vignette .scroller');
    await page.evaluate(() => window.App.back());
    await wait(400);
  }

  // the term picker
  await page.evaluate(() => {
    const t = Content.THEOREMS.filter(x => (x.tools || []).length)[0];
    Board.open(t, { onExit: () => App.go('map') });
  });
  await wait(700);
  const gotChooser = await page.evaluate(() => {
    const tile = document.querySelector('#pTools .tile');
    if (!tile) return false;
    tile.click();
    return true;
  });
  await wait(500);
  if (gotChooser && await page.evaluate(() => !document.getElementById('chooser').hidden)) {
    await check('chooser-top', '#chooser .sheet-panel', 'top');
    await check('chooser-bottom', '#chooser .sheet-panel', 'bottom');
    await page.evaluate(() => document.getElementById('chooserCancel').click());
    await wait(300);
  } else log('the first tool needed no term picker; chooser not screenshotted');
  await page.evaluate(() => window.App.back());
  await wait(400);

  // onboarding, its own root layout
  await L.clear(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await inject(page);
  await wait(600);
  await check('onboard-1-top', 'all', 'top');
  await check('onboard-1-bottom', 'all', 'bottom');
  await page.evaluate(() => document.getElementById('obNext').click()); await wait(500);
  await page.evaluate(() => document.getElementById('obNext').click()); await wait(500);
  await check('onboard-3-top', 'all', 'top');
  await check('onboard-3-bottom', 'all', 'bottom');

  if (bad.length) throw new Error(bad.length + ' element(s) under a system bar: ' + bad.join(', '));
  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
};
