/* Find a theorem whose shortest proof is: one branching move, then one move per branch.
   That is the smallest proof that can be built out of order. */
module.exports = async ({ page, log }) => {
  const hits = await page.evaluate(() => {
    const out = [];
    Content.THEOREMS.forEach(t => {
      let p = null;
      try { p = Kernel.solve(Kernel.start(t, (t.tools || []).map(Content.tool).filter(Boolean)), 9, 200000); }
      catch (e) { return; }
      if (!p) return;
      if (p.length === 3 && (p[0].t === 'split' || p[0].t === 'cases')) out.push({ id: t.id, name: t.name, plan: p.map(r => r.t) });
    });
    return out;
  });
  log(JSON.stringify(hits, null, 1));
};
