/* Reviewer pass 7: the settings block is the one part of a save the store copies over
   without checking the type of each field, and 1.0.1 added a Restore that will read any
   JSON file a user hands it. */
module.exports = async ({ page, shot, wait, text, errors, log }) => {
  const cases = [
    { name: 'notifyTime as a number', settings: { sound: true, haptics: true, notify: true, notifyTime: 5 } },
    { name: 'notifyTime as null', settings: { sound: true, haptics: true, notify: true, notifyTime: null } },
    { name: 'notifyTime as an object', settings: { notify: true, notifyTime: { h: 7 } } },
    { name: 'notifyTime as junk text', settings: { notify: true, notifyTime: 'half past six' } },
    { name: 'sound as a string', settings: { sound: 'no', notify: false } }
  ];
  const bad = [];
  for (const c of cases) {
    await page.evaluate(s => localStorage.setItem('axiom.v1',
      JSON.stringify({ onboarded: true, installed: '2026-01-02', solved: {}, daily: {}, forge: {},
                       rigor: 1000, seen: {}, settings: s })), c.settings);
    const before = errors.length;
    await page.reload({ waitUntil: 'networkidle0' });
    await wait(800);
    await page.evaluate(() => App.go('profile'));
    await wait(500);
    const st = await page.evaluate(() => {
      const s = Store.settings();
      return { notifyTime: s.notifyTime, sound: s.sound, field: document.getElementById('setTime').value,
               screens: [...document.querySelectorAll('.screen')].filter(x => !x.hidden).map(x => x.id) };
    });
    const newErrors = errors.slice(before);
    log(c.name.padEnd(26) + ' -> ' + JSON.stringify(st) + (newErrors.length ? '  ERRORS: ' + newErrors.join(' | ') : ''));
    if (newErrors.length) bad.push(c.name + ': ' + newErrors[0]);
    if (!/^\d{2}:\d{2}$/.test(String(st.notifyTime))) bad.push(c.name + ': notifyTime is ' + JSON.stringify(st.notifyTime));
    if (typeof st.sound !== 'boolean') bad.push(c.name + ': sound is ' + JSON.stringify(st.sound));
  }
  await shot('r07-settings-types');
  if (bad.length) throw new Error(bad.join(' ; '));
};
