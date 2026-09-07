/* The proof board. The tree is laid out here, but every step it draws was sanctioned
   by the kernel first: this file never marks a goal closed on its own. */
const Board = (function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const N = window.Native || null;
  const show = f => Kernel.show(f);

  let cur = null;          // { thm, tiles, st, hints, t0, mode, date, focus, done }
  let chooser = null;      // open term picker
  let onExit = null;

  const haptic = (ms, amp) => {
    if (!Store.settings().haptics) return;
    try { if (N && N.vibrate) N.vibrate(ms, amp); else if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
  };

  /* ---------------- opening and closing ---------------- */
  function open(thm, opts) {
    opts = opts || {};
    cur = {
      thm: thm,
      tiles: (thm.tools || []).map(Content.tool).filter(Boolean),
      hints: 0, t0: Date.now(), mode: opts.mode || 'normal', date: opts.date || null,
      replay: opts.replay || null, replayAt: 0, done: false, focus: null, ghost: null
    };
    cur.st = Kernel.start(thm, cur.tiles);
    cur.focus = cur.st.root;
    onExit = opts.onExit || null;
    $('#bTitle').textContent = thm.name;
    $('#bSub').textContent = cur.mode === 'daily'
      ? 'Daily proof ' + Store.dayNumber(cur.date) + (cur.date === Store.today() ? '' : ', from the archive')
      : cur.mode === 'forge' ? 'Forge drill'
      : cur.replay ? 'Your proof, replayed'
      : (Content.REGIONS.filter(r => r.id === thm.region)[0] || {}).name || '';
    $('#bStatement').innerHTML = '<p class="st-prose"></p><p class="st-formal"></p>';
    $('#bStatement .st-prose').textContent = thm.prose;
    $('#bStatement .st-formal').textContent = show(Kernel.parse(thm.statement));
    $('#bHint').hidden = !!cur.replay;
    $('#panel').hidden = !!cur.replay;
    $('#replayBar').hidden = !cur.replay;
    document.body.classList.add('on-board');
    App.go('board');
    draw();
    if (cur.replay) cur.replayAtT = setTimeout(replayStep, 700);
  }

  /** Jump the cascade to where it was going: every node and edge lit, no timers left. */
  function stopCascade(finishIt) {
    if (!cur || !cur.cascadeT) return;
    cur.cascadeT.forEach(clearTimeout);
    cur.cascadeT = null;
    if (!finishIt) return;
    const tree = $('#tree');
    Array.prototype.forEach.call(tree.querySelectorAll('.node'), el => el.classList.add('lit'));
    Array.prototype.forEach.call(tree.querySelectorAll('.edge'), e => e.classList.add('lit'));
  }

  function close() {
    document.body.classList.remove('on-board');
    stopCascade(false);
    if (cur) { clearTimeout(cur.victoryAt); clearTimeout(cur.replayAtT); }
    $('#victory').hidden = true;
    $('#hint').hidden = true;
    $('#chooser').hidden = true;
    chooser = null;
    cur = null;
    if (onExit) { const f = onExit; onExit = null; f(); }
    else App.go('map');
  }

  /* ---------------- drawing the tree ---------------- */
  const GAPX = 16, GAPY = 34;   // room for a rule label of up to two lines under each row

  function nodeClass(n) {
    let c = 'node';
    if (n.kids.length) c += ' is-mid';
    else if (n.closed) c += ' is-done';
    else c += ' is-open';
    if (n.closed) c += ' is-closed';
    if (cur.focus === n.id && !n.closed && !n.kids.length) c += ' is-focus';
    if (cur.ghost && cur.ghost.node === n.id) c += ' is-ghost';
    return c;
  }

  function ruleName(st, nd) {
    const r = nd.rule;
    if (!r) return '';
    switch (r.t) {
      case 'split': return 'both halves';
      case 'suppose': return 'suppose';
      case 'pick': return r.side === 'r' ? 'right side' : 'left side';
      case 'cases': return 'cases';
      case 'contradict': return 'suppose false';
      case 'induct': return 'induction';
      case 'fix': return 'name ' + r.c;
      case 'fixEx': return 'name ' + r.c;
      case 'witness': return 'witness ' + Kernel.showT(r.term);
      case 'use': {
        if (r.src === 'tool') { const t = Content.tool(r.ref); return t ? t.name.toLowerCase() : 'tool'; }
        return r.dir === 'fwd' ? 'bring in' : 'a fact you hold';
      }
    }
    return '';
  }

  function draw() {
    if (!cur) return;
    const st = cur.st;
    const tree = $('#tree');
    tree.innerHTML = '';
    // measure against unlimited room: a node's width must not depend on the width the
    // previous layout happened to leave behind on the container
    tree.style.transform = 'none';
    tree.style.width = '4000px';
    tree.style.height = 'auto';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'edges');
    tree.appendChild(svg);

    const order = [];
    (function walk(id, d) {
      const n = st.nodes[id]; if (!n) return;
      n._d = d; order.push(id); n.kids.forEach(k => walk(k, d + 1));
    })(st.root, 0);

    const els = {};
    order.forEach(id => {
      const n = st.nodes[id];
      const el = document.createElement('button');
      el.className = nodeClass(n);
      el.dataset.id = String(id);
      el.type = 'button';
      const t = document.createElement('span');
      t.className = 'ntext';
      t.textContent = show(n.goal);
      el.appendChild(t);
      if (n.closed && !n.kids.length) {
        const cap = document.createElement('span');
        cap.className = 'ncap';
        cap.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#ic-qed"/></svg><span></span>';
        cap.querySelector('span').textContent = n.rule ? ruleName(st, n) : 'already known';
        el.appendChild(cap);
      }
      tree.appendChild(el);
      els[id] = el;
    });

    order.forEach(id => {
      const n = st.nodes[id];
      // fractional widths rounded down make the last word wrap, so take the ceiling
      const r = els[id].getBoundingClientRect();
      n._w = Math.ceil(r.width) + 1;
      n._h = Math.ceil(r.height);
    });

    // The rule label sits in the gap under its row, and a long tool name wraps to two or
    // three lines. Measure the labels first, then open each gap wide enough for the tallest
    // one in that row, or a label lands on the goal below it.
    const labs = {};
    const labH = [];
    order.forEach(id => {
      const n = st.nodes[id];
      if (!n.kids.length) return;
      const text = ruleName(st, n);
      if (!text) return;
      const el = document.createElement('span');
      el.className = 'rulelab';
      el.textContent = text;
      tree.appendChild(el);
      const r = el.getBoundingClientRect();
      el._w = Math.ceil(r.width) + 1;
      el._h = Math.ceil(r.height);
      labs[id] = el;
      labH[n._d] = Math.max(labH[n._d] || 0, el._h);
    });

    const rowH = [];
    order.forEach(id => { const n = st.nodes[id]; rowH[n._d] = Math.max(rowH[n._d] || 0, n._h); });
    const gapAfter = [];
    for (let d = 0; d < rowH.length; d++) gapAfter[d] = Math.max(GAPY, (labH[d] || 0) + 13);
    const rowY = []; let y = 0;
    for (let d = 0; d < rowH.length; d++) { rowY[d] = y; y += rowH[d] + gapAfter[d]; }
    const totalH = Math.max(1, y - gapAfter[rowH.length - 1]);

    (function width(id) {
      const n = st.nodes[id];
      if (!n.kids.length) { n._sw = n._w; return n._sw; }
      let w = 0;
      n.kids.forEach((k, i) => { w += width(k); if (i) w += GAPX; });
      n._sw = Math.max(w, n._w);
      return n._sw;
    })(st.root);

    (function place(id, left) {
      const n = st.nodes[id];
      n._x = left + (n._sw - n._w) / 2;
      n._y = rowY[n._d];
      let x = left + (n._sw - n.kids.reduce((a, k, i) => a + st.nodes[k]._sw + (i ? GAPX : 0), 0)) / 2;
      n.kids.forEach(k => { place(k, x); x += st.nodes[k]._sw + GAPX; });
    })(st.root, 0);

    const totalW = Math.max(1, st.nodes[st.root]._sw);
    order.forEach(id => {
      const n = st.nodes[id];
      els[id].style.left = n._x + 'px';
      els[id].style.top = n._y + 'px';
      els[id].style.width = n._w + 'px';   // pin the measured width; do not re-flow
    });

    let edges = '';
    order.forEach(id => {
      const n = st.nodes[id];
      if (!n.kids.length) return;
      const bend = gapAfter[n._d] * 0.6;
      const px = n._x + n._w / 2, py = n._y + n._h;
      n.kids.forEach(k => {
        const c = st.nodes[k];
        const cx = c._x + c._w / 2, cy = c._y;
        edges += '<path class="edge' + (c.closed ? ' lit' : '') + '" d="M' + px + ' ' + py +
                 ' C' + px + ' ' + (py + bend) + ' ' + cx + ' ' + (cy - bend) + ' ' + cx + ' ' + cy + '"/>';
      });
      const el = labs[id];
      if (el) {
        // sit in the gap below the whole row, so a short node's label cannot land on a tall neighbour
        el.style.left = Math.max(0, px - el._w / 2) + 'px';
        el.style.top = (rowY[n._d] + rowH[n._d] + 5) + 'px';
        el.style.width = el._w + 'px';
      }
    });
    svg.setAttribute('viewBox', '0 0 ' + totalW + ' ' + totalH);
    svg.setAttribute('width', totalW); svg.setAttribute('height', totalH);
    svg.innerHTML = edges;

    tree.style.width = totalW + 'px';
    tree.style.height = totalH + 'px';
    const wrap = $('#treeWrap');
    const availW = Math.max(200, wrap.clientWidth - 20);
    const availH = Math.max(160, wrap.clientHeight - 24);
    // shrink to fit the board, but never so far that the formulas stop being readable
    const scale = Math.max(0.5, Math.min(1, availW / totalW, availH / totalH));
    wrap.style.alignItems = (totalH * scale <= availH) ? 'center' : 'flex-start';
    tree.style.transform = 'scale(' + scale + ')';
    $('#treeFit').style.width = (totalW * scale) + 'px';
    $('#treeFit').style.height = (totalH * scale) + 'px';

    Array.prototype.forEach.call(tree.querySelectorAll('.node'), el => {
      el.addEventListener('click', () => {
        const n = st.nodes[Number(el.dataset.id)];
        if (!n || n.closed || n.kids.length) return;
        cur.focus = n.id; cur.ghost = null;
        Sound.tick(); draw();
      });
    });

    if (!cur.replay) drawPanel();
    $('#bPar').innerHTML = '<b></b> of par <b></b>';
    const parts = $('#bPar').querySelectorAll('b');
    parts[0].textContent = Kernel.length(st);
    parts[1].textContent = cur.thm.par || '?';

    // keep the goal you are working on in sight
    const live = st.nodes[cur.focus];
    if (live && !cur.replay) {
      const top = live._y * scale, h = live._h * scale;
      if (top + h > wrap.scrollTop + wrap.clientHeight - 16 || top < wrap.scrollTop) {
        wrap.scrollTop = Math.max(0, top + h - wrap.clientHeight + 20);
      }
    } else if (cur.replay) {
      wrap.scrollTop = wrap.scrollHeight;
    }
  }

  /* ---------------- the panel ---------------- */
  function focusNode() {
    const st = cur.st;
    const open = Kernel.openGoals(st);
    if (!open.length) return null;
    if (open.indexOf(cur.focus) < 0) cur.focus = open[0];
    return st.nodes[cur.focus];
  }

  function moveLabel(nd, m) {
    switch (m.t) {
      case 'split': return ['Prove both halves', 'One goal for each side of the “and”.'];
      case 'suppose': return ['Suppose ' + show(nd.goal.l), 'Take the promise, then owe the rest.'];
      case 'pick': return ['Prove the ' + (m.side === 'r' ? 'right' : 'left') + ' side',
                           show(m.side === 'r' ? nd.goal.r : nd.goal.l)];
      case 'cases': return ['Take cases on ' + show(nd.ctx[m.i]), 'Prove the goal on both branches.'];
      case 'contradict': return ['Suppose it is false', 'Then go looking for the impossible.'];
      case 'induct': return ['Prove it by induction', 'Nought first, then each number to the next.'];
      case 'fix': return ['Name an arbitrary ' + nd.goal.v, 'Prove it for a name that could be anything.'];
      case 'fixEx': return ['Name the one that exists', show(nd.ctx[m.i])];
      case 'witness': return ['Offer a witness', 'Name something that fits, then prove it fits.'];
    }
    return ['', ''];
  }

  function drawPanel() {
    const st = cur.st;
    const nd = focusNode();
    if (!nd) return;
    $('#pGoal').textContent = show(nd.goal);
    const know = $('#pKnow');
    know.innerHTML = '';
    $('#pKnowHead').textContent = nd.ctx.length ? 'What you may use here' : 'You hold nothing yet. Work from the goal.';

    const all = Kernel.movesFor(st, nd.id);
    const ctxUse = {};
    all.forEach(m => { if (m.t === 'use' && m.src === 'ctx') ctxUse[m.ref] = m; });

    nd.ctx.forEach((h, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (ctxUse[i] ? ' live' : '');
      b.textContent = show(h);
      if (ctxUse[i]) {
        b.title = 'Use this on the goal';
        b.addEventListener('click', () => runUse(ctxUse[i], nd.id));
      } else {
        b.addEventListener('click', () => App.toast('That does not reach this goal on its own.'));
      }
      know.appendChild(b);
    });

    const moves = $('#pMoves');
    moves.innerHTML = '';
    const structural = all.filter(m => m.t !== 'use');
    structural.forEach(m => {
      const [name, sub] = moveLabel(nd, m);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'move';
      b.innerHTML = '<span class="mv-n"></span><span class="mv-s"></span>';
      b.querySelector('.mv-n').textContent = name;
      b.querySelector('.mv-s').textContent = sub;
      b.addEventListener('click', () => {
        if (m.t === 'witness') {
          pickTerm('Name a witness', 'Something that makes “' + show(nd.goal.b) + '” true.',
                   m.candidates, t => doApply(nd.id, { t: 'witness', term: t }));
          return;
        }
        doApply(nd.id, m);
      });
      moves.appendChild(b);
    });
    if (!structural.length) {
      const p = document.createElement('p'); p.className = 'panel-none';
      p.textContent = 'Nothing structural to do here. Reach for the satchel.';
      moves.appendChild(p);
    }

    const toolBox = $('#pTools');
    toolBox.innerHTML = '';
    const toolUse = {};
    all.forEach(m => { if (m.t === 'use' && m.src === 'tool') toolUse[m.ref] = m; });
    const fwd = {};
    Kernel.forwardOptions(st, nd.id).forEach(o => { fwd[o.ref] = o; });
    $('#pToolsLabel').textContent = 'Satchel';
    if (!cur.tiles.length) {
      const none = document.createElement('p');
      none.className = 'panel-none';
      none.textContent = 'No tools for this one. The shape of the goal is all you need.';
      toolBox.appendChild(none);
    }
    cur.tiles.forEach(t => {
      const b = document.createElement('button');
      b.type = 'button';
      const live = !!toolUse[t.id], bring = !live && !!fwd[t.id];
      b.className = 'tile' + (live ? ' live' : bring ? ' bring' : '');
      b.dataset.tool = t.id;
      b.innerHTML = '<span class="tl-n"></span><span class="tl-t"></span>';
      b.querySelector('.tl-n').textContent = t.name;
      b.querySelector('.tl-t').textContent = bring ? 'Bring it in' : t.text;
      b.addEventListener('click', () => {
        if (b.dataset.dragged) { delete b.dataset.dragged; return; }
        if (live) runUse(toolUse[t.id], nd.id);
        else if (bring) runUse(fwd[t.id], nd.id);
        else { Sound.refuse(); bounce(b); App.toast('That tool does not fit this goal.'); }
      });
      addDrag(b, t.id);
      toolBox.appendChild(b);
    });
    $('#bUndo').disabled = Kernel.length(st) === 0;
  }

  function bounce(el) {
    el.classList.remove('bounce'); void el.offsetWidth; el.classList.add('bounce');
  }

  /* ---------------- applying moves ---------------- */
  function ruleOf(opt) {
    return { t: 'use', src: opt.src, ref: opt.ref, n: opt.n, sub: opt.sub, dir: opt.dir };
  }

  function runUse(opt, nodeId) {
    const needs = opt.needs || [];
    if (!needs.length) { doApply(nodeId, ruleOf(opt)); return; }
    const sub = Object.assign({}, opt.sub);
    const cands = opt.candidates || Kernel.candidates(cur.st.nodes[nodeId].ctx, cur.st.nodes[nodeId].goal, cur.st.pool);
    (function ask(i) {
      if (i >= needs.length) {
        doApply(nodeId, { t: 'use', src: opt.src, ref: opt.ref, n: opt.n, sub: sub, dir: opt.dir });
        return;
      }
      const from = opt.src === 'tool' ? (Content.tool(opt.ref) || {}).name : 'a fact you already hold';
      pickTerm('Which term is ' + needs[i] + '?', 'Filling a slot in “' + from + '”.',
               cands, t => { sub[needs[i]] = t; ask(i + 1); });
    })(0);
  }

  function pickTerm(title, note, cands, done) {
    if (!cands || !cands.length) { Sound.refuse(); App.toast('Nothing here to name yet.'); return; }
    const sheet = $('#chooser');
    $('#chooserTitle').textContent = title;
    $('#chooserNote').textContent = note || '';
    $('#chooserNote').hidden = !note;
    const list = $('#chooserList');
    list.innerHTML = '';
    cands.forEach(t => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip pickable';
      b.textContent = Kernel.showT(t);
      b.addEventListener('click', () => { sheet.hidden = true; chooser = null; done(t); });
      list.appendChild(b);
    });
    sheet.hidden = false;
    chooser = true;
  }

  function doApply(nodeId, rule) {
    const st = cur.st;
    const before = Kernel.openGoals(st).length;
    const ok = Kernel.apply(st, nodeId, rule);
    if (!ok) { Sound.refuse(); haptic(8, 60); App.toast('The kernel would not accept that step.'); return; }
    cur.ghost = null;
    Sound.snap(); haptic(14, 160);
    const open = Kernel.openGoals(st);
    cur.focus = open.length ? open[0] : nodeId;
    draw();
    $('#panel').scrollTop = 0;
    const el = $('#tree').querySelector('.node[data-id="' + nodeId + '"]');
    if (el) { el.classList.remove('snapped'); void el.offsetWidth; el.classList.add('snapped'); }
    if (Kernel.isComplete(st)) finish();
  }

  function undo() {
    if (!cur || cur.done) return;
    if (!Kernel.undo(cur.st)) return;
    cur.ghost = null;
    Sound.tick(); haptic(8, 70);
    const open = Kernel.openGoals(cur.st);
    cur.focus = open.length ? open[0] : cur.st.root;
    draw();
  }

  /* ---------------- dragging a tile onto a goal ----------------
     A tile owns its gesture (touch-action: none), because leaving it to the browser
     meant every upward drag on a phone was swallowed by the panel's own scrolling.
     So: press and hold to lift a tile, swipe to scroll the panel by hand, tap to
     apply. The pointer is captured, which means the browser still delivers the
     click to this tile after a drag, so a real drag marks the tile and the click
     handler steps over it. */
  function addDrag(el, toolId) {
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const panel = $('#panel');
      const touch = e.pointerType !== 'mouse';
      const startX = e.clientX, startY = e.clientY;
      let lastY = startY, mode = '', moved = false, ghost = null, over = null;
      delete el.dataset.dragged;
      el.setPointerCapture(e.pointerId);
      const hold = touch ? setTimeout(() => { if (!mode) { mode = 'drag'; lift(startX, startY); } }, 260) : 0;

      function lift(x, y) {
        ghost = document.createElement('div');
        ghost.className = 'dragghost';
        ghost.textContent = (Content.tool(toolId) || {}).name || '';
        document.body.appendChild(ghost);
        document.body.classList.add('dragging');
        haptic(6, 40);
        place(x, y);
      }
      function place(x, y) {
        ghost.style.left = x + 'px';
        ghost.style.top = (y - 18) + 'px';
        ghost.style.display = 'none';
        const under = document.elementFromPoint(x, y);
        ghost.style.display = '';
        const nodeEl = under && under.closest ? under.closest('.node.is-open') : null;
        if (over && over !== nodeEl) over.classList.remove('drop');
        over = nodeEl;
        if (over) over.classList.add('drop');
      }

      const move = ev => {
        if (!mode) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 10) return;
          clearTimeout(hold);
          mode = touch ? 'scroll' : 'drag';
          if (mode === 'drag') lift(ev.clientX, ev.clientY);
        }
        if (mode === 'scroll') { panel.scrollTop -= ev.clientY - lastY; lastY = ev.clientY; return; }
        ev.preventDefault();
        moved = true;
        place(ev.clientX, ev.clientY);
      };
      const up = () => {
        clearTimeout(hold);
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        document.body.classList.remove('dragging');
        if (ghost) { ghost.remove(); ghost = null; }
        if (over) over.classList.remove('drop');
        if (mode !== 'drag' || !moved) { over = null; return; }
        el.dataset.dragged = '1';
        const target = over; over = null;
        if (!target) return;
        const id = Number(target.dataset.id);
        const opts = Kernel.movesFor(cur.st, id).filter(m => m.t === 'use' && m.src === 'tool' && m.ref === toolId);
        if (opts.length) { runUse(opts[0], id); return; }
        const f = Kernel.forwardOptions(cur.st, id).filter(o => o.ref === toolId);
        if (f.length) { runUse(f[0], id); return; }
        Sound.refuse(); haptic(8, 50); bounce(el);
        App.toast('That tool does not fit that goal.');
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
  }

  /* ---------------- hints ---------------- */
  function hint() {
    if (!cur || cur.done) return;
    cur.hints = Math.min(3, cur.hints + 1);
    const h = cur.thm.hints || [];
    const sheet = $('#hint');
    $('#hintTier').textContent = ['A nudge', 'A strategy', 'A ghost step'][cur.hints - 1];
    $('#hintBody').textContent = h[cur.hints - 1] || 'Work backwards from the goal, never forwards from the hypotheses.';
    let extra = '';
    if (cur.hints === 3) {
      const g = Kernel.ghost(cur.st, 6);
      if (g) {
        cur.ghost = g;
        const nd = cur.st.nodes[g.node];
        extra = 'One legal move here: ' + describeRule(nd, g.rule) + '. It is not placed for you.';
        cur.focus = g.node;
        draw();
      } else {
        extra = 'The kernel could not find a short finish from here. Undo a step and try another line.';
      }
    }
    $('#hintExtra').textContent = extra;
    $('#hintExtra').hidden = !extra;
    $('#hintCost').textContent = cur.hints === 1
      ? 'A hint costs no moves. It costs the gold crown.'
      : 'Hints used: ' + cur.hints + ' of 3.';
    sheet.hidden = false;
  }

  function describeRule(nd, r) {
    switch (r.t) {
      case 'use': {
        if (r.src === 'tool') { const t = Content.tool(r.ref); return 'use “' + (t ? t.name : r.ref) + '”'; }
        return 'use a fact you already hold';
      }
      case 'pick': return 'prove the ' + (r.side === 'r' ? 'right' : 'left') + ' side';
      case 'cases': return 'take cases';
      case 'witness': return 'offer ' + Kernel.showT(r.term) + ' as the witness';
      default: {
        const named = { split: 'prove both halves', suppose: 'suppose the left side of the arrow',
                        contradict: 'suppose the goal is false', induct: 'prove it by induction',
                        fix: 'name an arbitrary one', fixEx: 'name the thing that exists' };
        return named[r.t] || r.t;
      }
    }
  }

  /* ---------------- finishing ---------------- */
  function shape(st) {
    const rows = [];
    (function walk(id, d) {
      const n = st.nodes[id];
      if (!n) return;
      rows[d] = rows[d] || [];
      rows[d].push(n.kids.length ? 'mid' : 'leaf');
      n.kids.forEach(k => walk(k, d + 1));
    })(st.root, 0);
    return rows.map(r => r.map(x => x === 'leaf' ? '🟥' : '⬛').join('')).join('\n');
  }

  function finish() {
    const st = cur.st;
    const v = Kernel.verify(st);
    if (!v.ok) { App.toast('The kernel rejected the finished tree: ' + v.reason); return; }
    cur.done = true;
    const len = Kernel.length(st);
    const secs = Math.round((Date.now() - cur.t0) / 1000);
    const par = cur.thm.par || len;
    const crown = Store.crownFor(len, par, cur.hints);

    // the cascade: light the tree from the leaves upward
    const tree = $('#tree');
    const nodes = Array.prototype.slice.call(tree.querySelectorAll('.node'));
    const byDepth = nodes.slice().sort((a, b) => {
      const na = cur.st.nodes[Number(a.dataset.id)], nb = cur.st.nodes[Number(b.dataset.id)];
      return (nb._d || 0) - (na._d || 0);
    });
    Sound.cascade(crown === 'gold' ? 2 : crown === 'silver' ? 1 : 0);
    // every one of these is held, because a cascade left running past the screen it belongs
    // to buzzes the phone in a pocket and can light the edges of the next proof you open
    cur.cascadeT = [];
    byDepth.forEach((el, i) => cur.cascadeT.push(setTimeout(() => {
      el.classList.add('lit');
      if (i % 2 === 0) haptic(6, 40);
    }, i * 70)));
    cur.cascadeT.push(setTimeout(() => {
      Array.prototype.forEach.call(tree.querySelectorAll('.edge'), e => e.classList.add('lit'));
    }, 120));

    let res = { gain: 0, improved: true };
    // { n: goal id, r: rule }. 1.0.0 recorded a flat rule list and replay still reads those,
    // but it could only rebuild proofs built strictly down the leftmost branch.
    const proof = st.history.map(h => ({ n: h.node, r: h.rule }));
    if (cur.mode === 'forge') {
      Store.forgeDone(cur.thm.forge);
    } else {
      res = Store.record(cur.thm, len, cur.hints, secs, proof);
      if (cur.mode === 'daily') Store.recordDaily(cur.date, cur.thm, len, cur.hints, secs, shape(st));
    }

    cur.victoryAt = setTimeout(() => {
      if (!cur || !cur.done) return;              // the player left while the tree was lighting
      showVictory(len, par, crown, secs, res, v);
    }, byDepth.length * 70 + 320);
  }

  function showVictory(len, par, crown, secs, res, v) {
    const card = $('#victory');
    $('#vTitle').textContent = cur.thm.name;
    $('#vVerify').textContent = 'Kernel verified: ' + v.reason;
    $('#vMoves').textContent = len;
    $('#vPar').textContent = par;
    $('#vTime').textContent = secs < 60 ? secs + 's' : Math.floor(secs / 60) + 'm ' + (secs % 60) + 's';
    const cr = $('#vCrown');
    cr.className = 'crown crown-' + crown;
    cr.textContent = crown === 'gold' ? 'Gold crown. This matches the shortest proof the kernel can find.'
      : crown === 'silver' ? 'Silver crown. Within two moves of the shortest.'
      : 'No crown this time. The shortest proof the kernel knows is ' + par + ' moves.';
    $('#vRigor').textContent = res.gain ? '+' + res.gain + ' Rigor' : '';
    $('#vRigor').hidden = !res.gain;
    $('#vLemma').textContent = cur.mode === 'forge' ? '' : 'Added to your satchel: ' + (cur.thm.lemma || cur.thm.name);
    $('#vLemma').hidden = cur.mode === 'forge';
    $('#vNext').textContent = cur.mode === 'forge' ? 'Another drill' : 'Next theorem';
    const key = cur.thm.keystone && cur.mode !== 'forge' && cur.thm.vignette;
    $('#vVignette').hidden = !key;
    card.hidden = false;
  }

  function shareProof() {
    if (!cur) return;
    const st = cur.st;
    const len = Kernel.length(st), par = cur.thm.par || len;
    const crown = Store.crownFor(len, par, cur.hints);
    const head = cur.mode === 'daily'
      ? 'Axiom, daily proof ' + Store.dayNumber(cur.date)
      : 'Axiom: ' + cur.thm.name;
    const text = head + '\n' + shape(st) + '\n' + len + ' moves, par ' + par +
      (crown === 'gold' ? ' 👑' : '') + '\nNo statement given away.';
    if (N && N.shareText) { N.shareText('Axiom', text); return; }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => App.toast('Result copied'), () => App.toast('Could not copy'));
    } else App.toast('Sharing is not available here');
  }

  /* ---------------- replay ---------------- */
  /** A step is either { n, r } from 1.0.1 or a bare rule from 1.0.0. */
  function replayTarget(entry, open) {
    if (!entry || !entry.r) return open[0];
    const nd = cur.st.nodes[entry.n];
    return (nd && !nd.closed && !nd.kids.length) ? entry.n : open[0];
  }

  function replayStep() {
    if (!cur || !cur.replay || cur.paused) return;
    if (cur.replayAt >= cur.replay.length) { $('#replayNote').textContent = 'That was your proof, exactly as you built it.'; return; }
    const open = Kernel.openGoals(cur.st);
    if (!open.length) return;
    const entry = cur.replay[cur.replayAt++];
    const ok = Kernel.apply(cur.st, replayTarget(entry, open), entry && entry.r ? entry.r : entry);
    if (!ok) { $('#replayNote').textContent = 'This recording could not be rebuilt. The proof itself still counts.'; return; }
    Sound.tick();
    draw();
    $('#replayNote').textContent = 'Step ' + cur.replayAt + ' of ' + cur.replay.length;
    if (cur.replayAt < cur.replay.length) cur.replayAtT = setTimeout(replayStep, 750);
    else cur.replayAtT = setTimeout(() => { $('#replayNote').textContent = 'That was your proof, exactly as you built it.'; }, 400);
  }

  /* ---------------- wiring ---------------- */
  function init() {
    $('#bBack').addEventListener('click', close);
    $('#bUndo').addEventListener('click', undo);
    $('#bHint').addEventListener('click', hint);
    $('#hintClose').addEventListener('click', () => { $('#hint').hidden = true; });
    $('#chooserCancel').addEventListener('click', () => { $('#chooser').hidden = true; chooser = null; });
    $('#vShare').addEventListener('click', shareProof);
    $('#vBack').addEventListener('click', () => { $('#victory').hidden = true; close(); });
    $('#vVignette').addEventListener('click', () => { $('#victory').hidden = true; App.vignette(cur.thm, close); });
    $('#vNext').addEventListener('click', () => {
      $('#victory').hidden = true;
      if (cur.mode === 'forge') { const k = cur.thm.forge; close(); App.forgeStart(k); return; }
      const next = App.nextTheorem(cur.thm);
      if (next) { const ex = onExit; close(); open(next, { onExit: ex }); }
      else close();
    });
    window.addEventListener('resize', () => { if (cur && document.body.classList.contains('on-board')) draw(); });
  }

  function back() {
    if (!$('#chooser').hidden) { $('#chooser').hidden = true; chooser = null; return true; }
    if (!$('#hint').hidden) { $('#hint').hidden = true; return true; }
    if (!$('#victory').hidden) { $('#victory').hidden = true; close(); return true; }
    if (cur && !document.getElementById('v-board').hidden) { close(); return true; }
    return false;
  }

  /* The shell calls these when the app leaves and returns. Nothing may keep ticking
     while the player is not looking: not the replay, not the cascade. */
  function pause() {
    if (!cur) return;
    cur.paused = true;
    clearTimeout(cur.replayAtT);
    stopCascade(true);          // the proof is finished; show it finished rather than mid flight
  }
  function resume() {
    if (!cur || !cur.paused) return;
    cur.paused = false;
    if (cur.replay && cur.replayAt < cur.replay.length) cur.replayAtT = setTimeout(replayStep, 400);
  }

  return { init: init, open: open, close: close, back: back, pause: pause, resume: resume,
           isOpen: () => !!cur };
})();
