/* Axiom drive script 10: every state the recipe asks for, in one pass.
   empty, loading, error inline, success, disabled, focus-visible.
   node ../_shiptools/drive.js http://127.0.0.1:8828/index.html test/10-states.js --out test/shots */
const L = require('./lib.js');

module.exports = async ({ page, shot, wait, text, log, errors }) => {
  // ---- empty: a player who has just finished onboarding and proved nothing ----
  await L.seed(page, wait, { onboarded: true, rigor: 1000 });
  await page.evaluate(() => App.go('map'));
  await wait(700);
  await shot('a0-empty-map');
  const heroApart = await page.evaluate(() => document.getElementById('mapMark').classList.contains('is-apart'));
  log('map mark open at nothing proved:', heroApart);
  if (!heroApart) throw new Error('the signature mark does not show the open state');

  await page.evaluate(() => App.go('satchel'));
  await wait(600);
  await shot('a1-empty-satchel');
  const emptyShown = await page.evaluate(() => !document.getElementById('satchelEmpty').hidden &&
                                               !!document.querySelector('#satchelEmpty .empty-art'));
  log('satchel empty state has a drawing:', emptyShown);
  if (!emptyShown) throw new Error('the empty satchel has no illustration');

  await page.evaluate(() => App.go('daily'));
  await wait(600);
  await shot('a2-empty-daily');

  await page.evaluate(() => App.go('forge'));
  await wait(600);
  await shot('a3-empty-forge');

  // ---- the forge: fast enough that a loading state would be a lie. Measure it. ----
  const build = await page.evaluate(() => {
    const t = performance.now();
    for (const k of Forge.KINDS) Forge.drill(k.id);
    return Math.round(performance.now() - t);
  });
  log('building one drill of every kind took', build + 'ms in total');
  if (build > 800) throw new Error('drills are slow enough to need a loading state: ' + build + 'ms');
  await page.evaluate(() => document.querySelector('#forgeList .forge-row').click());
  await wait(700);
  await shot('a4-forge-opened');
  if (await page.evaluate(() => !document.getElementById('v-board').hidden)) {
    // ---- disabled ----
    await shot('a5-board-fresh');
    const undoOff = await page.evaluate(() => document.getElementById('bUndo').disabled);
    log('undo disabled on a fresh board:', undoOff);
    if (!undoOff) throw new Error('undo is not disabled with nothing to undo');
    // ---- a refusal: a tool that does not fit ----
    await page.evaluate(() => document.getElementById('bBack').click());
    await wait(400);
  }

  // ---- error, inline ----
  await page.evaluate(() => App.go('profile'));
  await wait(500);
  await page.evaluate(() => {
    const el = document.getElementById('importNote');
    el.textContent = 'That file was exported by a different app.';
    el.className = 'inline-note is-bad'; el.hidden = false;
    document.querySelector('#v-profile .scroller').scrollTop = 99999;
  });
  await wait(400);
  await shot('a6-inline-error');

  // ---- focus-visible ----
  await page.evaluate(() => { document.getElementById('exportBtn').focus({ focusVisible: true }); });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await wait(300);
  await shot('a7-focus-visible');
  const ring = await page.evaluate(() => {
    const el = document.activeElement;
    const cs = getComputedStyle(el);
    return { tag: el.tagName, id: el.id, outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor };
  });
  log('focused element:', JSON.stringify(ring));

  // ---- the refusal path on the board ----
  await page.evaluate(() => Board.open(Content.theorem('r07'), { onExit: () => App.go('map') }));
  await wait(700);
  await page.evaluate(() => {
    const dead = [...document.querySelectorAll('#pTools .tile')].filter(t => !t.classList.contains('live') && !t.classList.contains('bring'))[0];
    if (dead) dead.click();
  });
  await wait(400);
  await shot('a8-tool-refused');
  log('refusal toast:', await text('#toast'));

  log('errors:', errors.length);
  if (errors.length) throw new Error('page errors: ' + errors.join(' ; '));
};
