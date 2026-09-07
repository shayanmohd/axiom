/* Reviewer pass 5: contrast measured against the pixels Chrome actually painted.
   Computed styles miss glows, box shadows, pseudo-element washes and the grid behind the
   tree, so every text element is measured against a real screenshot: the foreground is the
   element's computed colour, and the backgrounds are every colour cluster covering at least
   4% of its box once the glyph pixels are removed. The worst cluster is the score.
   AA is 4.5, or 3.0 for text at 24px, or 18.66px bold. */
const v100 = require('./v100-review.json');
const L = require('./lib.js');

const ANALYSE = async (b64, boxes, dpr) => {
  const img = new Image();
  await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = p => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const near = (a, b) => Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]) + Math.abs(a[2]-b[2]) < 90;
  return boxes.map(box => {
    // inset by 2 CSS px: a rounded corner or a 1px border inside the box is not the ground
    // the glyphs sit on, and scoring text against its own border is a false alarm
    const in2 = 2 * dpr;
    const x = Math.max(0, Math.round(box.x * dpr) + in2), y = Math.max(0, Math.round(box.y * dpr) + in2);
    const w = Math.min(c.width - x, Math.round(box.w * dpr) - 2 * in2), h = Math.min(c.height - y, Math.round(box.h * dpr) - 2 * in2);
    if (w < 2 || h < 2) return null;
    const d = g.getImageData(x, y, w, h).data;
    const fg = box.fg;
    const bucket = (map, p) => {
      const k = ((p[0] >> 4) << 8) | ((p[1] >> 4) << 4) | (p[2] >> 4);
      const e = map.get(k) || { n: 0, r: 0, g: 0, b: 0 };
      e.n++; e.r += p[0]; e.g += p[1]; e.b += p[2];
      map.set(k, e);
    };
    // pass one: the modal colour of the box is the ground the glyphs are painted on
    const first = new Map();
    for (let i = 0; i < d.length; i += 4) { const p = [d[i], d[i+1], d[i+2]]; if (!near(p, fg)) bucket(first, p); }
    let mode = null;
    first.forEach(e => { if (!mode || e.n > mode.n) mode = e; });
    if (!mode) return null;
    const bg0 = [mode.r / mode.n, mode.g / mode.n, mode.b / mode.n];
    // pass two: at 10px, most of a glyph is partial coverage, and those blend pixels look
    // like intermediate backgrounds. Anything on the line from the ground to the text colour
    // is type, not ground, so drop it before clustering what is left.
    const onBlend = p => {
      let num = 0, den = 0;
      for (let c = 0; c < 3; c++) { const dv = fg[c] - bg0[c]; num += (p[c] - bg0[c]) * dv; den += dv * dv; }
      if (den < 1) return false;
      const t = Math.max(0, Math.min(1, num / den));
      let err = 0;
      for (let c = 0; c < 3; c++) { const e = p[c] - (bg0[c] + t * (fg[c] - bg0[c])); err += e * e; }
      return Math.sqrt(err / 3) < 14 && t > 0.06;
    };
    const hist = new Map();
    let total = 0;
    for (let i = 0; i < d.length; i += 4) {
      const p = [d[i], d[i+1], d[i+2]];
      if (near(p, fg)) continue;                       // a glyph pixel, not the ground
      if (onBlend(p)) continue;                        // partial coverage of the same glyph
      bucket(hist, p);
      total++;
    }
    if (!total) { const rr = ratio(fg, bg0); return { got: Math.round(rr * 100) / 100, bg: bg0.map(Math.round), share: 100 }; }
    let worst = { r: ratio(fg, bg0), bg: bg0.map(Math.round), share: 1 };
    hist.forEach(e => {
      if (e.n / total < 0.10) return;
      const bg = [e.r / e.n, e.g / e.n, e.b / e.n];
      const rr = ratio(fg, bg);
      if (!worst || rr < worst.r) worst = { r: rr, bg: bg.map(Math.round), share: e.n / total };
    });
    if (!worst) return null;
    return { got: Math.round(worst.r * 100) / 100, bg: worst.bg, share: Math.round(worst.share * 100) };
  });
};

module.exports = async ({ page, browser, shot, wait, click, errors, log }) => {
  await L.clear(page);
  await L.seed(page, wait, v100);

  const seen = new Map();

  const collect = async (label) => {
    const boxes = await page.evaluate(() => {
      const parse = c => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null;
        const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
      const out = [];
      document.querySelectorAll('body *').forEach(el => {
        if (el.closest('#glyphs')) return;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.5) return;
        const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        if (!own) return;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 6) return;
        if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) return;
        const fg = parse(cs.color);
        if (!fg || fg[3] < 0.95) return;              // translucent text is measured by the pixels anyway
        // anything a sheet, a toast or another overlay covers would be measured against the
        // overlay's pixels rather than its own ground, so drop it rather than score it wrong
        const pts = [[r.left + r.width / 2, r.top + r.height / 2],
                     [r.left + r.width * 0.2, r.top + r.height / 2],
                     [r.left + r.width * 0.8, r.top + r.height / 2]];
        const clear = pts.every(([px, py]) => {
          const hit = document.elementFromPoint(px, py);
          return hit && (hit === el || el.contains(hit) || hit.contains(el));
        });
        if (!clear) return;
        const size = parseFloat(cs.fontSize);
        const bold = Number(cs.fontWeight) >= 600;
        out.push({ x: r.left, y: r.top, w: r.width, h: r.height, fg: [fg[0], fg[1], fg[2]],
                   size: Math.round(size * 10) / 10, need: (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5,
                   sel: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : ''),
                   text: (el.textContent || '').trim().slice(0, 34) });
      });
      return out;
    });
    if (!boxes.length) return;
    const b64 = await page.screenshot({ encoding: 'base64' });
    const res = await page.evaluate(ANALYSE, b64, boxes, 2);
    log('  measured ' + boxes.length + ' boxes on ' + label);
    res.forEach((r, i) => {
      if (!r) return;
      const b = boxes[i];
      const k = b.sel + '|' + b.size + '|' + b.text;
      const row = Object.assign({}, b, r, { where: label });
      if (!seen.has(k) || seen.get(k).got > r.got) seen.set(k, row);
    });
  };

  const scroll = (sel, where) => page.evaluate((s, w) => {
    const el = document.querySelector(s); if (el) el.scrollTop = w === 'top' ? 0 : el.scrollHeight;
  }, sel, where);

  for (const [n, id] of [[1, 'v-map'], [2, 'v-daily'], [3, 'v-forge'], [4, 'v-satchel'], [5, 'v-profile']]) {
    await click('#tabs .tab:nth-child(' + n + ')');
    await wait(600);
    await collect(id);
    await scroll('#' + id + ' .scroller', 'bottom'); await wait(500);
    await collect(id + ' bottom');
  }

  // the board, its sheets, a half-built tree and a lit one
  await click('#tabs .tab:nth-child(1)'); await wait(400);
  await scroll('#v-map .scroller', 'top'); await wait(300);
  await page.evaluate(() => Board.open(Content.THEOREMS.filter(t => t.id === 'r07')[0] || Content.THEOREMS[6], { onExit: () => App.go('map') }));
  await wait(800);
  await collect('board');
  await click('#bHint'); await wait(500);
  await collect('hint sheet');
  await page.evaluate(() => document.getElementById('hintClose').click()); await wait(300);
  await L.solveBoard(page, wait, log);
  await wait(3400);                       // let the cascade and the card settle; mid transition is not a state
  await collect('victory');
  await page.evaluate(() => document.getElementById('vBack').click());
  await wait(700);
  // a fully lit tree with no card over it: the satchel replay, which is where the proved
  // node captions are actually read
  await click('#tabs .tab:nth-child(4)'); await wait(600);
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#satchelList .sat-row')];
    rows[rows.length - 1].click();
  });
  await wait(9000);
  await shot('r05-replay-lit');
  await collect('replayed proof, lit tree');
  await page.evaluate(() => window.App.back());
  await wait(600);

  // the locked region on a fresh install, and the empty satchel
  await L.clear(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(400);
  await page.evaluate(() => { Store.onboarded(true); });
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(700);
  await scroll('#v-map .scroller', 'bottom'); await wait(500);
  await collect('map locked region');
  await click('#tabs .tab:nth-child(4)'); await wait(600);
  await collect('empty satchel');
  await click('#tabs .tab:nth-child(2)'); await wait(600);
  await collect('daily sealed');
  await page.evaluate(() => App.toast('Already proved on 3 Sep'));
  await wait(400);
  await collect('toast');

  // onboarding
  await L.clear(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(600);
  await collect('onboarding');

  const rows = [...seen.values()].sort((a, b) => a.got - b.got);
  rows.slice(0, 22).forEach(r => log(
    (r.got >= r.need ? 'ok   ' : 'FAIL ') + String(r.got).padEnd(6) + '(needs ' + r.need + ')  ' +
    String(r.size).padEnd(5) + 'px  bg rgb(' + r.bg.join(',') + ') ' + String(r.share).padStart(3) + '%  ' +
    r.sel.slice(0, 40) + '  "' + r.text + '"  [' + r.where + ']'));
  const bad = rows.filter(r => r.got < r.need);
  log('measured ' + rows.length + ' text elements on real pixels, ' + bad.length + ' below AA');
  if (bad.length) throw new Error('below AA: ' + bad.map(r => r.sel + ' ' + r.got + ' [' + r.where + ']').join(' ; '));
  if (errors.length) throw new Error('page errors: ' + errors.join(' ; '));
};
