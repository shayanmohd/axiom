/* Axiom drive script 12: measure the contrast of every piece of text and every control that
   is actually on screen, against what is actually painted behind it. AA is 4.5, or 3.0 for
   text at 18.66px bold or 24px, and for the border of a control.
   node ../_shiptools/drive.js http://127.0.0.1:8828/index.html test/12-contrast.js --out test/shots */
const L = require('./lib.js');
const V100 = require('./v100.json');

module.exports = async ({ page, wait, log, errors, shot }) => {
  await L.seed(page, wait, V100);

  const measure = () => page.evaluate(() => {
    const lum = (r, g, b) => {
      const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const parse = c => {
      const m = /rgba?\(([^)]+)\)/.exec(c);
      if (!m) return null;
      const p = m[1].split(',').map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a),
                                b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
    // Every colour that can be painted behind this text: walk the whole ancestor chain
    // including the element itself, and treat a gradient as all of its stops, so the
    // measurement takes the worst spot rather than a lucky one.
    const stops = (cs) => {
      const img = cs.backgroundImage;
      if (!img || img === 'none') return [];
      return (img.match(/rgba?\([^)]+\)/g) || []).map(parse).filter(c => c && c.a > 0);
    };
    const behinds = (el) => {
      let acc = [{ r: 20, g: 16, b: 15, a: 1 }];
      const chain = [];
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) chain.push(n);
      chain.reverse();
      for (const n of chain) {
        const cs = getComputedStyle(n);
        const solid = parse(cs.backgroundColor);
        if (solid && solid.a > 0) acc = acc.map(b => over(solid, b));
        const gs = stops(cs);
        if (gs.length) {
          const next = [];
          acc.forEach(b => gs.forEach(g => next.push(over(g, b))));
          acc = next;
        }
      }
      return acc;
    };
    const ratio = (a, b) => {
      const la = lum(a.r, a.g, a.b), lb = lum(b.r, b.g, b.b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };
    const out = [];
    document.querySelectorAll('body *').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.5) return;
      const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (!own) return;
      const fg = parse(cs.color); if (!fg) return;
      const bgs = behinds(el);
      const size = parseFloat(cs.fontSize);
      const bold = Number(cs.fontWeight) >= 600;
      const large = size >= 24 || (size >= 18.66 && bold);
      const need = large ? 3 : 4.5;
      const got = Math.min.apply(null, bgs.map(bg => ratio(over(fg, bg), bg)));
      out.push({ sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''),
                 text: (el.textContent || '').trim().slice(0, 30), size: Math.round(size * 10) / 10,
                 need: need, got: Math.round(got * 100) / 100 });
    });
    return out;
  });

  const seen = new Map();
  const collect = async (label) => {
    const rows = await measure();
    rows.forEach(r => { const k = r.sel + '|' + r.size; if (!seen.has(k) || seen.get(k).got > r.got) seen.set(k, Object.assign({ where: label }, r)); });
  };

  for (const v of ['map', 'daily', 'forge', 'satchel', 'profile']) {
    await page.evaluate(x => App.go(x), v);
    await wait(500);
    await collect(v);
    await page.evaluate(() => { document.querySelector('.screen.view:not([hidden]) .scroller').scrollTop = 99999; });
    await wait(400);
    await collect(v + ' bottom');
  }
  await page.evaluate(() => Board.open(Content.theorem('r07'), { onExit: () => App.go('map') }));
  await wait(700);
  await collect('board');
  await page.evaluate(() => document.getElementById('bHint').click());
  await wait(400);
  await collect('hint');
  await page.evaluate(() => document.getElementById('hintClose').click());
  await wait(200);
  await L.solveBoard(page, wait, log);
  await wait(2800);
  await collect('victory');
  await shot('c0-contrast-victory');

  const rows = [...seen.values()].sort((a, b) => a.got - b.got);
  rows.slice(0, 14).forEach(r => log(
    (r.got >= r.need ? 'ok  ' : 'FAIL') + ' ' + String(r.got).padEnd(6) + '(needs ' + r.need + ')  ' +
    r.size + 'px  ' + r.sel.slice(0, 46) + '  "' + r.text + '"  [' + r.where + ']'));
  const bad = rows.filter(r => r.got < r.need);
  log('measured ' + rows.length + ' text elements, ' + bad.length + ' below AA');
  if (bad.length) throw new Error('below AA: ' + bad.map(r => r.sel + ' ' + r.got).join(' ; '));
  if (errors.length) throw new Error('page errors: ' + errors.join(' ; '));
};
