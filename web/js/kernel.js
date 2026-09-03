/* Axiom verification kernel.
   A small classical natural-deduction engine over a first-order term language.
   Nothing in the interface is trusted: every step is re-checked here, and a finished
   proof is walked again from the root by verify() before it counts. */
const Kernel = (function () {
  'use strict';

  /* ---------------- terms and formulas ---------------- */
  const V = n => ({ v: n });
  const T = (f, a) => ({ f: f, a: a || [] });
  const atom = (p, a) => ({ k: 'atom', p: p, a: a || [] });
  const and = (l, r) => ({ k: 'and', l: l, r: r });
  const or = (l, r) => ({ k: 'or', l: l, r: r });
  const imp = (l, r) => ({ k: 'imp', l: l, r: r });
  const FALSE = { k: 'false' };
  const not = f => imp(f, FALSE);
  const all = (v, b) => ({ k: 'all', v: v, b: b });
  const ex = (v, b) => ({ k: 'ex', v: v, b: b });
  const isNot = f => f.k === 'imp' && f.r.k === 'false';

  function tkey(t) {
    if (t.v !== undefined) return '?' + t.v;
    return t.a.length ? t.f + '(' + t.a.map(tkey).join(',') + ')' : t.f;
  }
  function key(f) {
    switch (f.k) {
      case 'atom': return f.a.length ? f.p + '(' + f.a.map(tkey).join(',') + ')' : f.p;
      case 'and': return '(' + key(f.l) + '&' + key(f.r) + ')';
      case 'or': return '(' + key(f.l) + '|' + key(f.r) + ')';
      case 'imp': return '(' + key(f.l) + '>' + key(f.r) + ')';
      case 'false': return '#F';
      case 'all': return '(A' + f.v + '.' + key(f.b) + ')';
      case 'ex': return '(E' + f.v + '.' + key(f.b) + ')';
    }
    return '?';
  }
  const same = (a, b) => key(a) === key(b);

  /* ---------------- parser ----------------
     form  := disj ('->' form)?      right associative, lowest precedence
     disj  := conj ('|' conj)*
     conj  := unary ('&' unary)*
     unary := '~' unary | prim
     prim  := '(' form ')' | 'false' | quant | ident ['(' terms ')']
     quant := ('all'|'ex') ident+ '.' form
  */
  function lex(s) {
    const out = []; let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '-' && s[i + 1] === '>') { out.push('->'); i += 2; continue; }
      if ('()&|~.,'.indexOf(c) >= 0) { out.push(c); i++; continue; }
      const m = /^[A-Za-z0-9_]+/.exec(s.slice(i));
      if (!m) throw new Error('unexpected character "' + c + '" in "' + s + '"');
      out.push(m[0]); i += m[0].length;
    }
    return out;
  }

  function parse(src) {
    const ts = lex(src); let p = 0;
    const peek = () => ts[p];
    const eat = t => { if (ts[p] !== t) throw new Error('expected ' + t + ' but found ' + ts[p] + ' in "' + src + '"'); p++; };
    function args(bound) {
      eat('('); const a = [];
      if (peek() !== ')') { a.push(term(bound)); while (peek() === ',') { eat(','); a.push(term(bound)); } }
      eat(')'); return a;
    }
    function term(bound) {
      const id = ts[p++];
      if (peek() === '(') return T(id, args(bound));
      return bound.has(id) ? V(id) : T(id, []);
    }
    function prim(bound) {
      if (peek() === '(') { eat('('); const f = form(bound); eat(')'); return f; }
      if (peek() === 'false') { p++; return FALSE; }
      if (peek() === 'all' || peek() === 'ex') {
        const q = ts[p++]; const vs = [];
        while (peek() !== '.' && p < ts.length) vs.push(ts[p++]);
        eat('.');
        const b2 = new Set(bound); vs.forEach(v => b2.add(v));
        let body = form(b2);
        for (let i = vs.length - 1; i >= 0; i--) body = q === 'all' ? all(vs[i], body) : ex(vs[i], body);
        return body;
      }
      const id = ts[p++];
      if (peek() === '(') return atom(id, args(bound));
      return atom(id, []);
    }
    function unary(bound) { if (peek() === '~') { p++; return not(unary(bound)); } return prim(bound); }
    function conj(bound) { let l = unary(bound); while (peek() === '&') { p++; l = and(l, unary(bound)); } return l; }
    function disj(bound) { let l = conj(bound); while (peek() === '|') { p++; l = or(l, conj(bound)); } return l; }
    function form(bound) { const l = disj(bound); if (peek() === '->') { p++; return imp(l, form(bound)); } return l; }
    const f = form(new Set());
    if (p !== ts.length) throw new Error('trailing input in "' + src + '"');
    return f;
  }

  /* ---------------- substitution ---------------- */
  function substT(t, m) {
    if (t.v !== undefined) return Object.prototype.hasOwnProperty.call(m, t.v) ? m[t.v] : t;
    return t.a.length ? T(t.f, t.a.map(x => substT(x, m))) : t;
  }
  function subst(f, m) {
    switch (f.k) {
      case 'atom': return atom(f.p, f.a.map(t => substT(t, m)));
      case 'and': return and(subst(f.l, m), subst(f.r, m));
      case 'or': return or(subst(f.l, m), subst(f.r, m));
      case 'imp': return imp(subst(f.l, m), subst(f.r, m));
      case 'false': return f;
      case 'all': case 'ex': {
        if (Object.prototype.hasOwnProperty.call(m, f.v)) {
          const m2 = Object.assign({}, m); delete m2[f.v];
          return f.k === 'all' ? all(f.v, subst(f.b, m2)) : ex(f.v, subst(f.b, m2));
        }
        return f.k === 'all' ? all(f.v, subst(f.b, m)) : ex(f.v, subst(f.b, m));
      }
    }
    return f;
  }

  /* ---------------- one-way matching (pattern has metavariables) ---------------- */
  function matchT(p, t, s) {
    if (p.v !== undefined) {
      if (Object.prototype.hasOwnProperty.call(s, p.v)) return tkey(s[p.v]) === tkey(t) ? s : null;
      const s2 = Object.assign({}, s); s2[p.v] = t; return s2;
    }
    if (t.v !== undefined) return null;
    if (p.f !== t.f || p.a.length !== t.a.length) return null;
    for (let i = 0; i < p.a.length; i++) { s = matchT(p.a[i], t.a[i], s); if (!s) return null; }
    return s;
  }
  function matchF(p, t, s) {
    if (p.k !== t.k) return null;
    switch (p.k) {
      case 'atom':
        if (p.p !== t.p || p.a.length !== t.a.length) return null;
        for (let i = 0; i < p.a.length; i++) { s = matchT(p.a[i], t.a[i], s); if (!s) return null; }
        return s;
      case 'and': case 'or': case 'imp':
        s = matchF(p.l, t.l, s); return s ? matchF(p.r, t.r, s) : null;
      case 'false': return s;
      case 'all': case 'ex':
        return p.v === t.v ? matchF(p.b, t.b, s) : null;
    }
    return null;
  }

  /* ---------------- context ---------------- */
  function ctxAdd(ctx, f) {
    const out = ctx.slice();
    const seen = new Set(out.map(key));
    (function push(g) {
      if (g.k === 'and') { push(g.l); push(g.r); return; }
      const k = key(g);
      if (!seen.has(k)) { seen.add(k); out.push(g); }
    })(f);
    return out;
  }
  /** A goal that is already a hypothesis needs no work, and anything follows from a contradiction. */
  function autoClosed(ctx, goal) {
    const gk = key(goal);
    for (let i = 0; i < ctx.length; i++) {
      if (ctx[i].k === 'false') return true;
      if (key(ctx[i]) === gk) return true;
    }
    return false;
  }

  /* ---------------- collecting candidate terms ---------------- */
  function isGroundT(t) { return t.v === undefined && t.a.every(isGroundT); }
  function termsOfT(t, out) {
    if (t.v !== undefined) return;
    if (isGroundT(t)) out.set(tkey(t), t);
    t.a.forEach(x => termsOfT(x, out));
  }
  function termsOfF(f, out) {
    switch (f.k) {
      case 'atom': f.a.forEach(t => termsOfT(t, out)); break;
      case 'and': case 'or': case 'imp': termsOfF(f.l, out); termsOfF(f.r, out); break;
      case 'all': case 'ex': termsOfF(f.b, out); break;
    }
  }
  function candidates(ctx, goal, extra) {
    const m = new Map();
    ctx.forEach(f => termsOfF(f, m));
    termsOfF(goal, m);
    (extra || []).forEach(t => termsOfT(t, m));
    return Array.from(m.values()).sort((a, b) => tkey(a).length - tkey(b).length).slice(0, 14);
  }

  /* ---------------- proof state ---------------- */
  function mkNode(st, parent, ctx, goal) {
    const id = st.seq++;
    st.nodes[id] = {
      id: id, parent: parent, ctx: ctx, goal: goal,
      kids: [], rule: null, closed: autoClosed(ctx, goal), auto: autoClosed(ctx, goal)
    };
    return id;
  }

  function toolPool(tiles) {
    const m = new Map();
    tiles.forEach(t => termsOfF(parse(t.f), m));
    return Array.from(m.values());
  }
  function start(thm, tiles) {
    const st = { thm: thm, tiles: tiles, pool: toolPool(tiles), nodes: {}, seq: 0, fresh: 0, history: [] };
    st.root = mkNode(st, null, [], parse(thm.statement));
    return st;
  }
  const cands = (st, ctx, goal) => candidates(ctx, goal, st.pool || []);

  const node = (st, id) => st.nodes[id];
  /** Open leaves in reading order: leftmost branch first, the way the tree is drawn. */
  function openGoals(st) {
    const out = [];
    (function walk(id) {
      const n = st.nodes[id];
      if (!n) return;
      if (n.kids.length === 0) { if (!n.closed) out.push(id); return; }
      n.kids.forEach(walk);
    })(st.root);
    return out;
  }
  /** Replay a flat rule list, each applied to the first open goal. */
  function applySeq(st, rules) {
    for (let i = 0; i < rules.length; i++) {
      const open = openGoals(st);
      if (!open.length) return false;
      if (!apply(st, open[0], rules[i])) return false;
    }
    return true;
  }
  const isComplete = st => openGoals(st).length === 0;
  const length = st => st.history.length;

  /** Every constant used anywhere, so a fixed name is genuinely fresh. */
  function usedNames(st) {
    const s = new Set();
    const walkT = t => { if (t.v === undefined) { s.add(t.f); t.a.forEach(walkT); } };
    const walkF = f => {
      switch (f.k) {
        case 'atom': f.a.forEach(walkT); break;
        case 'and': case 'or': case 'imp': walkF(f.l); walkF(f.r); break;
        case 'all': case 'ex': walkF(f.b); break;
      }
    };
    Object.keys(st.nodes).forEach(id => { st.nodes[id].ctx.forEach(walkF); walkF(st.nodes[id].goal); });
    return s;
  }
  function freshName(st) {
    const used = usedNames(st);
    let i = st.fresh + 1;
    while (used.has('k' + i)) i++;
    st.fresh = i;
    return 'k' + i;
  }

  /* ---------------- tools: axioms and earned lemmas ---------------- */
  function toolFormula(st, ref) {
    const t = st.tiles.filter(x => x.id === ref)[0];
    return t ? parse(t.f) : null;
  }

  /** Strip leading universals; return {vars, body}. */
  function strip(f) {
    const vars = [];
    while (f.k === 'all') { vars.push(f.v); f = f.b; }
    return { vars: vars, body: f };
  }
  /** Split a body into n leading premises plus the remaining conclusion. */
  function splitPremises(body, n) {
    const prem = [];
    for (let i = 0; i < n; i++) {
      if (body.k !== 'imp') return null;
      prem.push(body.l); body = body.r;
    }
    return { prem: prem, concl: body };
  }
  function maxPremises(body) {
    let n = 0; while (body.k === 'imp') { n++; body = body.r; }
    return n;
  }

  /* ---------------- rule application ----------------
     Each rule returns the list of child sequents it demands, or null when it does
     not apply. apply() and verify() both go through here, so the interface can
     never invent a step the kernel would not sanction. */
  function children(st, nd, rule) {
    const ctx = nd.ctx, goal = nd.goal;
    switch (rule.t) {
      case 'split':
        if (goal.k !== 'and') return null;
        return [{ ctx: ctx, goal: goal.l }, { ctx: ctx, goal: goal.r }];

      case 'suppose':
        if (goal.k !== 'imp') return null;
        return [{ ctx: ctxAdd(ctx, goal.l), goal: goal.r }];

      case 'pick':
        if (goal.k !== 'or') return null;
        return [{ ctx: ctx, goal: rule.side === 'r' ? goal.r : goal.l }];

      case 'cases': {
        const h = ctx[rule.i];
        if (!h || h.k !== 'or') return null;
        return [{ ctx: ctxAdd(ctx, h.l), goal: goal }, { ctx: ctxAdd(ctx, h.r), goal: goal }];
      }

      case 'contradict':
        if (goal.k === 'false') return null;
        return [{ ctx: ctxAdd(ctx, not(goal)), goal: FALSE }];

      case 'induct': {
        if (goal.k !== 'all') return null;
        const v = goal.v;
        const base = subst(goal.b, (function () { const m = {}; m[v] = T('0', []); return m; })());
        const step = all(v, imp(goal.b, subst(goal.b, (function () { const m = {}; m[v] = T('s', [V(v)]); return m; })())));
        return [{ ctx: ctx, goal: base }, { ctx: ctx, goal: step }];
      }

      case 'fix': {
        if (goal.k !== 'all') return null;
        const m = {}; m[goal.v] = T(rule.c, []);
        return [{ ctx: ctx, goal: subst(goal.b, m) }];
      }

      case 'fixEx': {
        const h = ctx[rule.i];
        if (!h || h.k !== 'ex') return null;
        const m = {}; m[h.v] = T(rule.c, []);
        const rest = ctx.filter((_, j) => j !== rule.i);
        return [{ ctx: ctxAdd(rest, subst(h.b, m)), goal: goal }];
      }

      case 'witness': {
        if (goal.k !== 'ex') return null;
        const m = {}; m[goal.v] = rule.term;
        return [{ ctx: ctx, goal: subst(goal.b, m) }];
      }

      case 'use': {
        const src = rule.src === 'tool' ? toolFormula(st, rule.ref) : ctx[rule.ref];
        if (!src) return null;
        const s = strip(src);
        const sp = splitPremises(s.body, rule.n);
        if (!sp) return null;
        for (let i = 0; i < s.vars.length; i++) {
          if (!Object.prototype.hasOwnProperty.call(rule.sub, s.vars[i])) return null;
        }
        const prem = sp.prem.map(p => subst(p, rule.sub));
        const concl = subst(sp.concl, rule.sub);
        if (rule.dir === 'fwd') {
          return prem.map(p => ({ ctx: ctx, goal: p })).concat([{ ctx: ctxAdd(ctx, concl), goal: goal }]);
        }
        if (!same(concl, goal)) return null;
        return prem.map(p => ({ ctx: ctx, goal: p }));
      }
    }
    return null;
  }

  function apply(st, id, rule) {
    const nd = node(st, id);
    if (!nd || nd.closed || nd.kids.length) return false;
    if (rule.t === 'fix' || rule.t === 'fixEx') rule = Object.assign({}, rule, { c: rule.c || freshName(st) });
    const kids = children(st, nd, rule);
    if (!kids) return false;
    nd.rule = rule;
    nd.kids = kids.map(s => mkNode(st, id, s.ctx, s.goal));
    if (nd.kids.length === 0) nd.closed = true;
    st.history.push({ node: id, rule: rule });
    settle(st, id);
    return true;
  }

  /** A node with children is closed once all of them are. */
  function settle(st, id) {
    let n = node(st, id);
    while (n) {
      if (n.kids.length && n.kids.every(k => st.nodes[k].closed)) n.closed = true;
      else if (n.kids.length) n.closed = false;
      n = n.parent === null ? null : node(st, n.parent);
    }
  }

  function undo(st) {
    const last = st.history.pop();
    if (!last) return false;
    const nd = node(st, last.node);
    const drop = id => { node(st, id).kids.forEach(drop); delete st.nodes[id]; };
    nd.kids.forEach(drop);
    nd.kids = []; nd.rule = null;
    nd.closed = nd.auto;
    settle(st, last.node);
    return true;
  }

  /* ---------------- independent verification ----------------
     Walks the finished tree from the root and re-derives every child sequent.
     Returns { ok, reason }. Nothing about the interface is taken on trust. */
  function verify(st) {
    const seen = new Set();
    function walk(id) {
      if (seen.has(id)) return 'a node was reached twice';
      seen.add(id);
      const nd = node(st, id);
      if (!nd) return 'a step points at a node that does not exist';
      if (nd.kids.length === 0) {
        if (autoClosed(nd.ctx, nd.goal)) return null;
        if (nd.rule && nd.rule.t === 'use') {
          const k = children(st, nd, nd.rule);
          if (k && k.length === 0) return null;
        }
        return 'an unfinished goal remains';
      }
      const expect = children(st, nd, nd.rule);
      if (!expect) return 'a step does not follow from the rule it claims';
      if (expect.length !== nd.kids.length) return 'a step produced the wrong number of goals';
      for (let i = 0; i < expect.length; i++) {
        const k = node(st, nd.kids[i]);
        if (!same(k.goal, expect[i].goal)) return 'a goal was altered after the step that made it';
        if (k.ctx.length !== expect[i].ctx.length) return 'a hypothesis list was altered';
        for (let j = 0; j < k.ctx.length; j++) {
          if (!same(k.ctx[j], expect[i].ctx[j])) return 'a hypothesis was altered';
        }
        const r = walk(nd.kids[i]);
        if (r) return r;
      }
      return null;
    }
    const reason = walk(st.root);
    if (reason) return { ok: false, reason: reason };
    if (Object.keys(st.nodes).length !== seen.size) return { ok: false, reason: 'the tree contains detached nodes' };
    return { ok: true, reason: 'checked from the root' };
  }

  /* ---------------- move discovery for the interface ---------------- */
  function useOptions(st, nd, src, ref, srcName) {
    const bare = t => t.a.length === 0;
    const f = src === 'tool' ? toolFormula(st, ref) : nd.ctx[ref];
    if (!f) return [];
    const s = strip(f);
    const out = [];
    const maxN = maxPremises(s.body);
    for (let n = maxN; n >= 0; n--) {
      const sp = splitPremises(s.body, n);
      if (!sp) continue;
      const sub = matchF(sp.concl, nd.goal, {});
      if (!sub) continue;
      const need = s.vars.filter(v => !Object.prototype.hasOwnProperty.call(sub, v));
      if (need.length > 2) break;
      const pool = cands(st, nd.ctx, nd.goal);
      out.push({
        t: 'use', src: src, ref: ref, n: n, sub: sub, dir: 'back',
        needs: need, label: srcName, premises: sp.prem.length,
        candidates: need.length > 1 ? pool.filter(bare) : pool
      });
      break; // the largest matching premise count is the useful reading
    }
    return out;
  }

  function movesFor(st, id) {
    const nd = node(st, id);
    if (!nd || nd.closed || nd.kids.length) return [];
    const out = [];
    if (nd.goal.k === 'and') out.push({ t: 'split' });
    if (nd.goal.k === 'imp') out.push({ t: 'suppose' });
    if (nd.goal.k === 'or') { out.push({ t: 'pick', side: 'l' }); out.push({ t: 'pick', side: 'r' }); }
    if (nd.goal.k === 'all') {
      out.push({ t: 'fix' });
      if (st.thm.induction) out.push({ t: 'induct' });
    }
    if (nd.goal.k === 'ex') out.push({ t: 'witness', needs: ['?'], candidates: cands(st, nd.ctx, nd.goal) });
    nd.ctx.forEach((h, i) => {
      if (h.k === 'or') out.push({ t: 'cases', i: i });
      if (h.k === 'ex') out.push({ t: 'fixEx', i: i });
    });
    if (nd.goal.k !== 'false') out.push({ t: 'contradict' });
    st.tiles.forEach(t => { useOptions(st, nd, 'tool', t.id, t.name).forEach(o => out.push(o)); });
    nd.ctx.forEach((h, i) => { useOptions(st, nd, 'ctx', i, 'a hypothesis').forEach(o => out.push(o)); });
    return out;
  }

  /** Tools that cannot close this goal but can still be brought into the hypotheses. */
  function forwardOptions(st, id) {
    const nd = node(st, id);
    if (!nd || nd.closed || nd.kids.length) return [];
    const out = [];
    st.tiles.forEach(t => {
      if (!t.fwd) return;
      const f = parse(t.f);
      const s = strip(f);
      const sp = splitPremises(s.body, 0);
      out.push({
        t: 'use', src: 'tool', ref: t.id, n: 0, sub: {}, dir: 'fwd',
        needs: s.vars, label: t.name, premises: 0,
        candidates: cands(st, nd.ctx, nd.goal)
      });
    });
    return out;
  }

  /* ---------------- solver ----------------
     Iterative deepening over the same rules, used to compute par offline and to
     offer the third hint tier without ever placing a move for the player. */
  function solve(st, maxDepth, budget) {
    const tiles = (st.tiles || []).map(t => ({ id: t.id, f: parse(t.f), fwd: !!t.fwd }));
    const pool = st.pool || [];
    let tried = 0;
    const cap = budget || 400000;
    const seqKey = g => g.ctx.map(key).sort().join(';') + '|-' + key(g.goal);

    function expand(g, fresh) {
      const out = [];
      const push = (rule, kids) => out.push({ rule: rule, kids: kids });
      const cs = () => candidates(g.ctx, g.goal, pool);

      if (g.goal.k === 'and') push({ t: 'split' }, [{ ctx: g.ctx, goal: g.goal.l }, { ctx: g.ctx, goal: g.goal.r }]);
      if (g.goal.k === 'imp') push({ t: 'suppose' }, [{ ctx: ctxAdd(g.ctx, g.goal.l), goal: g.goal.r }]);
      if (g.goal.k === 'or') {
        push({ t: 'pick', side: 'l' }, [{ ctx: g.ctx, goal: g.goal.l }]);
        push({ t: 'pick', side: 'r' }, [{ ctx: g.ctx, goal: g.goal.r }]);
      }

      const tryUse = (src, ref, f) => {
        const sp0 = strip(f);
        for (let n = maxPremises(sp0.body); n >= 0; n--) {
          const sp = splitPremises(sp0.body, n);
          if (!sp) continue;
          const sub = matchF(sp.concl, g.goal, {});
          if (!sub) continue;
          const need = sp0.vars.filter(v => !Object.prototype.hasOwnProperty.call(sub, v));
          if (need.length === 0) {
            push({ t: 'use', src: src, ref: ref, n: n, sub: sub, dir: 'back' },
                 sp.prem.map(p => ({ ctx: g.ctx, goal: subst(p, sub) })));
          } else if (need.length === 1) {
            cs().forEach(c => {
              const s2 = Object.assign({}, sub); s2[need[0]] = c;
              push({ t: 'use', src: src, ref: ref, n: n, sub: s2, dir: 'back' },
                   sp.prem.map(p => ({ ctx: g.ctx, goal: subst(p, s2) })));
            });
          } else if (need.length === 2) {
            // two open slots: these are always bare names (a point, a number), never
            // compound terms, so the pairs stay countable
            const bare = cs().filter(t => t.a.length === 0).slice(0, 8);
            bare.forEach(c1 => bare.forEach(c2 => {
              const s2 = Object.assign({}, sub); s2[need[0]] = c1; s2[need[1]] = c2;
              push({ t: 'use', src: src, ref: ref, n: n, sub: s2, dir: 'back' },
                   sp.prem.map(p => ({ ctx: g.ctx, goal: subst(p, s2) })));
            }));
          }
          break;
        }
      };
      tiles.forEach(t => tryUse('tool', t.id, t.f));
      g.ctx.forEach((h, i) => tryUse('ctx', i, h));

      g.ctx.forEach((h, i) => {
        if (h.k === 'or') push({ t: 'cases', i: i },
          [{ ctx: ctxAdd(g.ctx, h.l), goal: g.goal }, { ctx: ctxAdd(g.ctx, h.r), goal: g.goal }]);
        if (h.k === 'ex') {
          const c = 'k' + (fresh + 1); const m = {}; m[h.v] = T(c, []);
          push({ t: 'fixEx', i: i, c: c },
            [{ ctx: ctxAdd(g.ctx.filter((_, j) => j !== i), subst(h.b, m)), goal: g.goal }]);
        }
      });

      if (g.goal.k === 'all') {
        const c = 'k' + (fresh + 1); const m = {}; m[g.goal.v] = T(c, []);
        push({ t: 'fix', c: c }, [{ ctx: g.ctx, goal: subst(g.goal.b, m) }]);
        if (st.thm && st.thm.induction) {
          const v = g.goal.v;
          const m0 = {}; m0[v] = T('0', []);
          const ms = {}; ms[v] = T('s', [V(v)]);
          push({ t: 'induct' }, [{ ctx: g.ctx, goal: subst(g.goal.b, m0) },
                                 { ctx: g.ctx, goal: all(v, imp(g.goal.b, subst(g.goal.b, ms))) }]);
        }
      }
      if (g.goal.k === 'ex') {
        cs().forEach(c => {
          const m = {}; m[g.goal.v] = c;
          push({ t: 'witness', term: c }, [{ ctx: g.ctx, goal: subst(g.goal.b, m) }]);
        });
      }

      tiles.forEach(t => {
        if (!t.fwd) return;
        const sp0 = strip(t.f);
        if (sp0.vars.length > 1) return;
        const list = sp0.vars.length ? cs() : [null];
        list.forEach(c => {
          const sub = {}; if (c) sub[sp0.vars[0]] = c;
          const concl = subst(sp0.body, sub);
          if (g.ctx.some(h => same(h, concl))) return;
          push({ t: 'use', src: 'tool', ref: t.id, n: 0, sub: sub, dir: 'fwd' },
               [{ ctx: ctxAdd(g.ctx, concl), goal: g.goal }]);
        });
      });

      if (g.goal.k !== 'false') push({ t: 'contradict' }, [{ ctx: ctxAdd(g.ctx, not(g.goal)), goal: FALSE }]);
      // fewest new goals first: a move that finishes a branch outright beats one that forks it
      out.sort((a, b) => a.kids.length - b.kids.length);
      return out;
    }

    /** Prove every sequent in `gs` using at most `d` moves in total. */
    function proveList(gs, d, fresh, seen) {
      const live = gs.filter(g => !autoClosed(g.ctx, g.goal));
      if (live.length === 0) return [];
      if (d <= 0 || live.length > d) return null;
      if (++tried > cap) throw new Error('budget');
      const k = live.map(seqKey).join('||') + '#' + d;
      if (seen.has(k)) return null;
      seen.add(k);
      const rest = live.slice(1);
      const opts = expand(live[0], fresh);
      for (let i = 0; i < opts.length; i++) {
        const o = opts[i];
        const nf = (o.rule.c && /^k(\d+)$/.test(o.rule.c)) ? Number(o.rule.c.slice(1)) : fresh;
        const sub = proveList(o.kids.concat(rest), d - 1, nf, seen);
        if (sub) return [o.rule].concat(sub);
      }
      return null;
    }

    const root = { ctx: st.nodes[st.root].ctx, goal: st.nodes[st.root].goal };
    for (let d = 1; d <= (maxDepth || 9); d++) {
      tried = 0;
      try {
        const r = proveList([root], d, st.fresh, new Set());
        if (r) return r;
      } catch (e) { if (e.message !== 'budget') throw e; }
    }
    return null;
  }

  /** The next single move of a shortest completion of the current position. */
  function ghost(st, maxDepth) {
    const open = openGoals(st);
    if (!open.length) return null;
    for (let i = 0; i < open.length; i++) {
      const nd = node(st, open[i]);
      const sub = { thm: st.thm, tiles: st.tiles, pool: st.pool, nodes: {}, seq: 0, fresh: st.fresh, history: [] };
      sub.root = mkNode(sub, null, nd.ctx, nd.goal);
      const r = solve(sub, maxDepth || 6, 40000);
      if (r && r.length) return { node: open[i], rule: r[0] };
    }
    return null;
  }

  /* ---------------- display ---------------- */
  const SUP = { '2': '²', '3': '³' };
  const TERMS = {
    seg: a => a[0] + a[1],
    ang: a => '∠' + a[0] + a[1] + a[2],
    tri: a => '△' + a[0] + a[1] + a[2],
    line: a => a[0] + a[1],
    add: a => a[0] + ' + ' + a[1],
    mul: a => (a[0] === a[1] ? a[0] + SUP['2'] : a[0] + a[1]),
    s: a => a[0] + ' + 1',
    fact1: a => a[0] + '! + 1',
    sq: a => a[0] + SUP['2']
  };
  const ATOMS = {
    eq: a => a[0] + ' = ' + a[1],
    cong: a => a[0] + ' ≅ ' + a[1],
    par: a => a[0] + ' ∥ ' + a[1],
    perp: a => a[0] + ' ⊥ ' + a[1],
    supp: a => a[0] + ' and ' + a[1] + ' are supplementary',
    vert: a => a[0] + ' and ' + a[1] + ' are vertical angles',
    mid: a => a[0] + ' is the midpoint of ' + a[1],
    right: a => a[0] + ' is a right angle',
    human: a => a[0] + ' is human',
    mortal: a => a[0] + ' is mortal',
    even: a => a[0] + ' is even',
    odd: a => a[0] + ' is odd',
    prime: a => a[0] + ' is prime',
    div: a => a[0] + ' divides ' + a[1],
    lt: a => a[0] + ' < ' + a[1],
    nat: a => a[0] + ' is a whole number'
  };
  const NEG = {
    eq: a => a[0] + ' \u2260 ' + a[1],
    even: a => a[0] + ' is not even',
    odd: a => a[0] + ' is not odd',
    prime: a => a[0] + ' is not prime',
    div: a => a[0] + ' does not divide ' + a[1],
    lt: a => a[0] + ' is not less than ' + a[1],
    human: a => a[0] + ' is not human',
    mortal: a => a[0] + ' is not mortal',
    cong: a => a[0] + ' is not congruent to ' + a[1],
    par: a => a[0] + ' is not parallel to ' + a[1],
    supp: a => a[0] + ' and ' + a[1] + ' are not supplementary',
    vert: a => a[0] + ' and ' + a[1] + ' are not vertical angles',
    right: a => a[0] + ' is not a right angle'
  };
  function showT(t) {
    if (t.v !== undefined) return t.v;
    if (!t.a.length) return t.f;
    const f = TERMS[t.f];
    const a = t.a.map(showT);
    return f ? f(a) : t.f + '(' + a.join(', ') + ')';
  }
  const PREC = { atom: 5, false: 5, imp: 1, or: 2, and: 3 };
  function show(f, outer) {
    outer = outer || 0;
    let s, p;
    switch (f.k) {
      case 'atom': {
        const g = ATOMS[f.p]; const a = f.a.map(showT);
        s = f.a.length ? (g ? g(a) : f.p + '(' + a.join(', ') + ')') : f.p; p = 5; break;
      }
      case 'false': s = 'a contradiction'; p = 5; break;
      case 'and': s = show(f.l, 3) + ' ∧ ' + show(f.r, 4); p = 3; break;
      case 'or': s = show(f.l, 2) + ' ∨ ' + show(f.r, 3); p = 2; break;
      case 'imp':
        if (isNot(f)) {
          const inner = f.l;
          if (inner.k === 'atom' && inner.a.length && NEG[inner.p]) s = NEG[inner.p](inner.a.map(showT));
          else if (inner.k === 'atom' || inner.k === 'false') s = 'not ' + show(inner, 5);
          else s = 'not (' + show(inner, 0) + ')';
          p = 5; break;
        }
        s = show(f.l, 3) + ' → ' + show(f.r, 1); p = 1; break;
      case 'all': s = '∀' + f.v + '. ' + show(f.b, 0); p = 0; break;
      case 'ex': s = '∃' + f.v + '. ' + show(f.b, 0); p = 0; break;
      default: s = '?'; p = 5;
    }
    return p < outer ? '(' + s + ')' : s;
  }
  /** Shorter negations for leaf chips: "not (P)" reads badly at small sizes. */
  function showShort(f) {
    if (isNot(f)) {
      const inner = f.l;
      if (inner.k === 'atom') {
        const a = inner.a.map(showT);
        if (inner.p === 'eq') return a[0] + ' ≠ ' + a[1];
        if (ATOMS[inner.p] && inner.a.length) return show(inner, 0).replace(' is ', ' is not ').replace(' divides ', ' does not divide ');
        return 'not ' + show(inner, 0);
      }
    }
    return show(f, 0);
  }

  const api = {
    parse: parse, show: show, showShort: showShort, showT: showT, key: key, same: same,
    start: start, apply: apply, undo: undo, verify: verify, movesFor: movesFor,
    forwardOptions: forwardOptions, openGoals: openGoals, isComplete: isComplete,
    length: length, node: node, candidates: candidates, solve: solve, ghost: ghost, applySeq: applySeq,
    children: children, freshName: freshName, not: not, strip: strip, isNot: isNot
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
