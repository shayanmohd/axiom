/* The forge builds drills rather than storing them: a random shape is grown for the
   move you asked to practise, then handed to the kernel's solver. Only shapes the
   solver actually finishes are served, so a drill can never be a dead end. */
const Forge = (function () {
  'use strict';
  const ATOMS = ['P', 'Q', 'R', 'S', 'T', 'U'];
  const pick = a => a[Math.floor(Math.random() * a.length)];
  function atoms(n) {
    const pool = ATOMS.slice();
    const out = [];
    for (let i = 0; i < n; i++) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return out;
  }
  /** A small random propositional shape, so no two drills read alike. */
  function shape(depth, pool) {
    if (depth <= 0 || Math.random() < 0.45) return pick(pool);
    const a = shape(depth - 1, pool), b = shape(depth - 1, pool);
    const op = pick(['&', '|', '->']);
    return '(' + a + ' ' + op + ' ' + b + ')';
  }

  const KINDS = [
    { id: 'split', name: 'Prove both halves', blurb: 'Taking an “and” apart in the goal.',
      make: () => { const a = atoms(3); const X = shape(1, a), Y = shape(1, a);
        return { statement: '(' + X + ') & (' + Y + ') -> (' + Y + ') & (' + X + ')', tools: [] }; } },
    { id: 'suppose', name: 'Suppose it', blurb: 'Taking the promise an arrow offers you.',
      make: () => { const a = atoms(3); const X = shape(1, a), Y = shape(1, a);
        return { statement: '(' + X + ') -> (' + Y + ') -> (' + X + ')', tools: [] }; } },
    { id: 'chain', name: 'Follow the arrows', blurb: 'Using an implication you already hold.',
      make: () => { const a = atoms(3);
        return { statement: '(' + a[0] + ' -> ' + a[1] + ') -> (' + a[1] + ' -> ' + a[2] + ') -> (' + a[0] + ' -> ' + a[2] + ')', tools: [] }; } },
    { id: 'cases', name: 'Take cases', blurb: 'Handling an “or” you were not allowed to choose.',
      make: () => { const a = atoms(3); const X = shape(1, a), Y = shape(1, a);
        return { statement: '(' + X + ') | (' + Y + ') -> (' + Y + ') | (' + X + ')', tools: [] }; } },
    { id: 'contradict', name: 'Assume the worst', blurb: 'Proof by supposing the goal is false.',
      make: () => { const a = atoms(2); const X = shape(1, a);
        return { statement: '~~(' + X + ') -> (' + X + ')', tools: [] }; } },
    { id: 'distribute', name: 'Push the “and” inside', blurb: 'Mixing conjunction and disjunction.',
      make: () => { const a = atoms(3);
        return { statement: a[0] + ' & (' + a[1] + ' | ' + a[2] + ') -> (' + a[0] + ' & ' + a[1] + ') | (' + a[0] + ' & ' + a[2] + ')', tools: [] }; } },
    { id: 'name', name: 'Name a witness', blurb: 'Meeting an “exists” by producing something.',
      make: () => {
        const t = pick([
          { statement: 'ex X. even(X) & even(mul(X,X))', tools: ['zero-even', 'even-sq'] },
          { statement: 'ex X. even(X) & odd(s(X))', tools: ['zero-even', 'even-succ'] },
          { statement: 'ex X. even(X) & even(add(X,X))', tools: ['zero-even', 'even-sum'] },
          { statement: 'ex X. div(2,X) & even(X)', tools: ['zero-even', 'even-div2', 'div2-even'] }
        ]);
        return { statement: t.statement, tools: t.tools };
      } },
    { id: 'parity', name: 'Work with parity', blurb: 'Even, odd, and the collision between them.',
      make: () => {
        const t = pick([
          { statement: 'odd(m) -> odd(n) -> even(add(n,m))', tools: ['odd-sum', 'even-sum'] },
          { statement: 'even(m) -> odd(n) -> odd(add(m,n))', tools: ['mix-sum', 'even-sum'] },
          { statement: 'odd(n) -> ~even(mul(n,n))', tools: ['odd-sq', 'not-both'] },
          { statement: 'even(n) -> ~odd(n)', tools: ['not-both', 'even-odd'] },
          { statement: 'even(n) -> even(add(n,add(n,n)))', tools: ['even-sum'] }
        ]);
        return { statement: t.statement, tools: t.tools };
      } }
  ];

  /** Build a solvable drill for a kind, or null if the dice were unkind ten times running. */
  function drill(kindId) {
    const kind = KINDS.filter(k => k.id === kindId)[0];
    if (!kind) return null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const spec = kind.make();
      const thm = {
        id: 'forge-' + kindId + '-' + Date.now() + '-' + attempt,
        region: 'forge', name: kind.name, prose: kind.blurb,
        statement: spec.statement, tools: spec.tools, forge: kindId,
        hints: ['Look at the shape of the goal before you look at the tools.',
                'The move that matches ' + kind.blurb.toLowerCase().replace(/\.$/, '') + ' is the one to reach for.',
                'Ask for a ghost step and the kernel will show you one legal move.']
      };
      let proof = null;
      try { proof = Kernel.solve(Kernel.start(thm, (spec.tools || []).map(Content.tool)), 8, 90000); }
      catch (e) { proof = null; }
      if (proof && proof.length >= 2) { thm.par = proof.length; return thm; }
    }
    return null;
  }

  return { KINDS: KINDS, drill: drill };
})();
