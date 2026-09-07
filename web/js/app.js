/* Axiom. Screens, the map, the daily ritual and the forge. */
const App = (function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.prototype.slice.call(document.querySelectorAll(s));
  const N = window.Native || null;
  const VIEWS = ['map', 'daily', 'forge', 'satchel', 'profile', 'board', 'vignette'];
  let view = 'map';
  let vignetteAfter = null;

  const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }

  const ICON = (id, cls) => '<svg class="' + (cls || 'ic') + '" aria-hidden="true"><use href="#' + id + '"/></svg>';

  function go(v) {
    view = v;
    VIEWS.forEach(x => { const el = $('#v-' + x); if (el) { el.hidden = x !== v; el.classList.remove('is-in'); } });
    $$('#tabs .tab').forEach(b => b.classList.toggle('is-on', b.dataset.view === v));
    const bare = (v === 'board' || v === 'vignette');
    $('#tabs').hidden = bare;
    document.body.classList.toggle('on-board', bare);
    if (v === 'map') renderMap();
    if (v === 'daily') renderDaily();
    if (v === 'forge') renderForge();
    if (v === 'satchel') renderSatchel();
    if (v === 'profile') renderProfile();
    const sc = $('#v-' + v + ' .scroller');
    if (sc) sc.scrollTop = 0;
    const scr = $('#v-' + v);
    if (scr && !bare) { void scr.offsetWidth; scr.classList.add('is-in'); }
  }

  /* ---------------- the map ---------------- */
  const BANDS = {
    riverlands: '<path d="M0 26 C 40 8, 80 44, 130 24 S 220 6, 300 30" />',
    steppes: '<path d="M0 34 L 300 34" /><path d="M0 20 C 60 12, 90 26, 150 18 S 250 8, 300 22" />',
    fens: '<path d="M20 40 L 20 12" /><path d="M60 40 L 60 4" /><path d="M100 40 L 100 16" /><path d="M150 40 L 150 8" /><path d="M200 40 L 200 18" /><path d="M250 40 L 250 6" /><path d="M285 40 L 285 20" />'
  };

  function seal(thm, i) {
    const rec = Store.solved(thm.id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seal-row' + (rec ? ' done' : '');
    b.style.animationDelay = Math.min(i, 9) * 26 + 'ms';
    const state = rec ? (rec.crown === 'gold' ? 'gold' : 'proven') : 'open';
    b.innerHTML =
      '<span class="seal seal-' + state + (thm.keystone ? ' keystone' : '') + '">' +
        (rec && rec.crown === 'gold' ? '<span class="cr">' + ICON('ic-crown') + '</span>' : '') +
        (thm.keystone ? ICON('ic-keystone') : '<span class="sn"></span>') +
      '</span>' +
      '<span class="seal-txt"><span class="seal-name"></span><span class="seal-sub"></span></span>';
    const sn = b.querySelector('.sn');
    if (sn) sn.textContent = String(i + 1);
    b.querySelector('.seal-name').textContent = thm.name;
    b.querySelector('.seal-sub').textContent = rec
      ? plural(rec.len, 'move') + ', par ' + rec.par +
        (rec.crown === 'gold' ? ', gold crown' : rec.crown === 'silver' ? ', silver crown' : '')
      : thm.prose;
    b.addEventListener('click', () => Board.open(thm, { onExit: () => go('map') }));
    return b;
  }

  function renderMap() {
    const wrap = $('#mapList');
    wrap.innerHTML = '';
    Content.REGIONS.forEach(r => {
      const total = Content.THEOREMS.filter(t => t.region === r.id).length;
      const done = Store.regionSolved(r.id);
      const open = Store.regionOpen(r.id);
      const sec = document.createElement('section');
      sec.className = 'region' + (open ? '' : ' locked');
      sec.innerHTML =
        '<div class="band"><svg viewBox="0 0 300 46" preserveAspectRatio="none">' + BANDS[r.id] + '</svg></div>' +
        '<h2 class="rg-name"></h2><p class="rg-era"></p><p class="rg-blurb"></p>' +
        '<p class="rg-prog"></p>';
      sec.querySelector('.rg-name').textContent = r.name;
      sec.querySelector('.rg-era').textContent = r.era;
      sec.querySelector('.rg-blurb').textContent = r.blurb;
      sec.querySelector('.rg-prog').innerHTML = open
        ? ICON('ic-daily') + '<span></span>'
        : ICON('ic-sealed') + '<span></span>';
      sec.querySelector('.rg-prog span').textContent = open
        ? done + ' of ' + total + ' sealed'
        : 'Sealed. ' + r.gate + ' proofs open the pass, and you have ' + Store.solvedCount() + '.';
      wrap.appendChild(sec);
      if (!open) return;
      const trail = document.createElement('div');
      trail.className = 'trail';
      Content.THEOREMS.filter(t => t.region === r.id).forEach((t, i) => trail.appendChild(seal(t, i)));
      wrap.appendChild(trail);
    });
    const done = Store.solvedCount(), total = Content.THEOREMS.length;
    $('#mapDone').textContent = done;
    $('#mapTotal').textContent = 'of ' + total + ' proved';
    // the mark closes as the map fills: apart at nothing proved, shut and lit at the end
    const mark = $('#mapMark');
    mark.classList.toggle('is-apart', done === 0);
    mark.style.setProperty('--seam', Math.min(1, 0.25 + done / total).toFixed(2));
    setTimeout(() => { $('#mapBar').style.width = Math.round(done / total * 100) + '%'; }, 60);
  }

  function nextTheorem(thm) {
    const list = Content.THEOREMS;
    const i = list.indexOf(thm);
    for (let j = i + 1; j < list.length; j++) {
      if (!Store.solved(list[j].id) && Store.regionOpen(list[j].region)) return list[j];
    }
    for (let j = 0; j < list.length; j++) {
      if (!Store.solved(list[j].id) && Store.regionOpen(list[j].region)) return list[j];
    }
    return null;
  }

  /* ---------------- daily ---------------- */
  function renderDaily() {
    const date = Store.today();
    const thm = Store.dailyTheorem(date);
    const res = Store.dailyResult(date);
    $('#dDay').textContent = 'Daily proof ' + Store.dayNumber(date);
    $('#dDate').textContent = Store.longDate(date);
    const sk = Store.streak();
    $('#dStreak').textContent = sk === 0 ? 'No streak yet' : sk === 1 ? 'One day so far' : sk + ' days in a row';
    $('#dEnvelope').hidden = !!res;
    $('#dResult').hidden = !res;
    if (!res) {
      const tone = ['A quiet Sunday.', 'Monday is gentle.', 'Tuesday, still kind.', 'Midweek.',
                    'Thursday asks a little more.', 'Friday.', 'Saturday is the hard one.'][new Date().getDay()];
      $('#dTone').textContent = tone;
      $('#dOpen').onclick = () => {
        if ($('#dOpen').disabled) return;
        $('#dOpen').disabled = true;
        const seal = $('#dSeal');
        seal.classList.add('crack');
        Sound.snap();
        setTimeout(() => {
          seal.classList.remove('crack');
          $('#dOpen').disabled = false;
          Board.open(thm, { mode: 'daily', date: date, onExit: () => go('daily') });
        }, 420);
      };
    } else {
      renderShape($('#dShape'), res.shape || '');
      $('#dScore').textContent = plural(res.len, 'move') + ', par ' + res.par;
      $('#dCrown').textContent = res.crown === 'gold' ? 'Gold crown' : res.crown === 'silver' ? 'Silver crown' : 'No crown';
      $('#dCrown').className = 'crown crown-' + res.crown;
      $('#dName').textContent = thm.name + '. ' + thm.prose;
      $('#dShare').onclick = () => {
        const text = 'Axiom, daily proof ' + Store.dayNumber(date) + '\n' + (res.shape || '') +
          '\n' + res.len + ' moves, par ' + res.par + (res.crown === 'gold' ? ' 👑' : '') + '\nNo statement given away.';
        if (N && N.shareText) N.shareText('Axiom', text);
        else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('Result copied'), () => toast('Could not copy'));
        else toast('Sharing is not available here');
      };
    }
    const arch = $('#dArchive');
    arch.innerHTML = '';
    Store.archive(30).forEach((a, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'arch' + (a.result ? ' done' : '') + (i === 0 ? ' today' : '');
      b.innerHTML = '<span class="ad"></span><span class="am"></span>';
      b.querySelector('.ad').textContent = Store.shortDate(a.date);
      if (a.result && a.result.crown === 'gold') b.querySelector('.am').innerHTML = ICON('ic-crown');
      else if (a.result) b.querySelector('.am').textContent = String(a.result.len);
      else b.classList.add('unset');
      b.title = 'Daily ' + a.day;
      b.addEventListener('click', () => {
        if (a.result) { toast('Already proved on ' + Store.shortDate(a.date)); return; }
        Board.open(a.theorem, { mode: 'daily', date: a.date, onExit: () => go('daily') });
      });
      arch.appendChild(b);
    });
  }

  /** The share grid, drawn in the app's own ink rather than as emoji. */
  function renderShape(el, shape) {
    el.innerHTML = '';
    shape.split('\n').forEach(row => {
      const r = document.createElement('div');
      r.className = 'shape-row';
      Array.from(row).forEach(ch => {
        const b = document.createElement('i');
        // 1.0.0 wrote green and yellow squares; 1.0.1 writes red and black. Both read here.
        b.className = 'blk ' + (ch === '\u{1F7E9}' || ch === '\u{1F7E5}' ? 'leaf' : 'mid');
        r.appendChild(b);
      });
      el.appendChild(r);
    });
  }

  /* ---------------- forge ---------------- */
  function renderForge() {
    const list = $('#forgeList');
    list.innerHTML = '';
    Forge.KINDS.forEach(k => {
      const m = Store.mastery(k.id);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'forge-row';
      b.style.animationDelay = Math.min(list.children.length, 9) * 26 + 'ms';
      b.innerHTML = '<span class="fg-h"><span class="fg-n"></span><span class="fg-p"></span></span>' +
                    '<span class="fg-b"></span><span class="meter"><i></i></span>';
      b.querySelector('.fg-n').textContent = k.name;
      b.querySelector('.fg-p').textContent = m >= 0.99 ? 'sharp' : m > 0.5 ? 'holding' : m > 0 ? 'fading' : 'untried';
      b.querySelector('.fg-b').textContent = k.blurb;
      b.querySelector('.meter i').style.width = Math.round(m * 100) + '%';
      b.addEventListener('click', () => forgeStart(k.id));
      list.appendChild(b);
    });
  }

  /* Growing a drill and proving it solvable takes about a millisecond, so there is no
     loading state to show: the board simply opens. Only failure has anything to say. */
  function forgeStart(kind) {
    let d = null;
    try { d = Forge.drill(kind); } catch (e) { d = null; }
    if (!d) { toast('The forge could not shape that one. Try again.'); return; }
    Board.open(d, { mode: 'forge', onExit: () => go('forge') });
  }

  /* ---------------- satchel ---------------- */
  function renderSatchel() {
    const list = $('#satchelList');
    list.innerHTML = '';
    let any = false;
    Content.REGIONS.forEach(r => {
      const solved = Content.THEOREMS.filter(t => t.region === r.id && Store.solved(t.id));
      if (!solved.length) return;
      any = true;
      const h = document.createElement('p');
      h.className = 'sat-head'; h.textContent = r.name;
      list.appendChild(h);
      solved.forEach(t => {
        const rec = Store.solved(t.id);
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'sat-row';
        b.style.animationDelay = Math.min(list.children.length, 9) * 24 + 'ms';
        b.innerHTML = '<svg class="sat-ic" viewBox="0 0 108 108" aria-hidden="true"><use href="#mark"/></svg>' +
                      '<span class="sat-tx"><span class="sat-l"></span><span class="sat-m"></span></span>';
        b.querySelector('.sat-l').textContent = t.lemma || t.name;
        b.querySelector('.sat-m').textContent = plural(rec.len, 'move') + ' against par ' + rec.par +
          (rec.crown === 'gold' ? ', gold crown' : rec.crown === 'silver' ? ', silver crown' : '');
        b.addEventListener('click', () => {
          if (!rec.proof || !rec.proof.length) { toast('No recorded steps for this one.'); return; }
          Board.open(t, { replay: rec.proof, onExit: () => go('satchel') });
        });
        list.appendChild(b);
      });
    });
    $('#satchelEmpty').hidden = any;
  }

  /* ---------------- profile ---------------- */
  function renderProfile() {
    $('#pRigor').textContent = Store.rigor();
    $('#pSeals').textContent = Store.solvedCount() + ' of ' + Content.THEOREMS.length;
    $('#pGold').textContent = Store.crowns('gold');
    $('#pSilver').textContent = Store.crowns('silver');
    $('#pStreak').textContent = Store.streak();
    const s = Store.settings();
    $('#setSound').checked = s.sound;
    $('#setHaptics').checked = s.haptics;
    $('#setNotify').checked = s.notify;
    $('#setTime').value = s.notifyTime;
    $('#setTimeRow').hidden = !s.notify;
  }

  /* ---------------- vignettes ---------------- */
  function vignette(thm, after) {
    if (!thm || !thm.vignette) { if (after) after(); return; }
    const v = thm.vignette;
    $('#vgTitle').textContent = v.title;
    $('#vgEra').textContent = v.era;
    const body = $('#vgBody');
    body.innerHTML = '';
    v.body.forEach(p => { const el = document.createElement('p'); el.textContent = p; body.appendChild(el); });
    Store.seen(thm.id, true);
    vignetteAfter = after || (() => go('map'));
    go('vignette');
  }

  /* ---------------- notifications ---------------- */
  function scheduleNotifications() {
    if (!N || !N.scheduleNotifications) return;
    const s = Store.settings();
    if (!s.notify) { try { N.cancelNotifications(); } catch (e) {} return; }
    const [h, m] = (s.notifyTime || '19:00').split(':').map(Number);
    const plan = [];
    for (let i = 0; i < 7; i++) {
      const date = Store.addDays(Store.today(), i);
      if (Store.dailyResult(date)) continue;
      const at = new Date(date.split('-')[0], Number(date.split('-')[1]) - 1, Number(date.split('-')[2]), h, m, 0, 0);
      if (at.getTime() <= Date.now()) continue;
      plan.push({ id: i + 1, at: at.getTime(), title: 'Daily proof ' + Store.dayNumber(date),
                  body: 'Today’s theorem is waiting. No spoilers here.' });
    }
    try { N.scheduleNotifications(JSON.stringify(plan)); } catch (e) {}
  }

  /* ---------------- onboarding ---------------- */
  function onboard() {
    let i = 0;
    const cards = $$('#obTrack .ob-card');
    const dots = $('#obDots');
    const art = $('#obArt .mark-live');
    dots.innerHTML = cards.map(() => '<i class="ob-dot"></i>').join('');
    const paint = () => {
      cards.forEach(c => { c.style.transform = 'translateX(' + (-i * 100) + '%)'; });
      $$('#obDots .ob-dot').forEach((d, j) => d.classList.toggle('on', j === i));
      $('#obNext').textContent = i === cards.length - 1 ? 'Begin' : 'Next';
      // the two halves close over the three cards, which is the whole idea of the game
      art.classList.toggle('is-apart', i < cards.length - 1);
      if (i === cards.length - 1) { art.classList.remove('is-shut'); void art.offsetWidth; art.classList.add('is-shut'); }
    };
    paint();
    $('#obNext').onclick = () => {
      Sound.tick();
      if (i < cards.length - 1) { i++; paint(); return; }
      Store.onboarded(true);
      $('#onboard').hidden = true;
      const first = Content.THEOREMS[0];
      Board.open(first, { onExit: () => go('map') });
    };
  }

  /* ---------------- wiring ---------------- */
  function init() {
    Sound.enable(Store.settings().sound);
    Board.init();

    $$('#tabs .tab').forEach(b => b.addEventListener('click', () => { Sound.tick(); go(b.dataset.view); }));
    $('#vgBack').addEventListener('click', () => { const f = vignetteAfter; vignetteAfter = null; (f || (() => go('map')))(); });

    $('#setSound').addEventListener('change', e => { Store.settings({ sound: e.target.checked }); Sound.enable(e.target.checked); Sound.tick(); });
    $('#setHaptics').addEventListener('change', e => Store.settings({ haptics: e.target.checked }));
    $('#setNotify').addEventListener('change', e => {
      Store.settings({ notify: e.target.checked });
      $('#setTimeRow').hidden = !e.target.checked;
      if (e.target.checked && N && N.notificationsAllowed && !N.notificationsAllowed()) {
        try { N.requestNotificationPermission(); } catch (err) {}
      }
      scheduleNotifications();
    });
    $('#setTime').addEventListener('change', e => {
      // an empty or half-typed time would silently fall back at schedule time; keep the last good one
      if (!/^\d{2}:\d{2}$/.test(e.target.value)) { e.target.value = Store.settings().notifyTime; return; }
      Store.settings({ notifyTime: e.target.value });
      scheduleNotifications();
    });

    $('#exportBtn').addEventListener('click', () => {
      const text = Store.exportJson();
      const name = 'axiom-progress-' + Store.today() + '.json';
      if (N && N.saveFile) {
        const b64 = btoa(unescape(encodeURIComponent(text)));
        toast(N.saveFile(name, 'application/json', b64) ? 'Saved to Downloads' : 'Could not save the file');
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Exported');
    });
    /* Restore. The file is read, checked and shown to you before anything is replaced,
       and the replacement itself needs a second tap. */
    let pending = null;
    function importNote(msg, kind) {
      const el = $('#importNote');
      el.textContent = msg || '';
      el.className = 'inline-note' + (kind ? ' is-' + kind : '');
      el.hidden = !msg;
    }
    $('#importBtn').addEventListener('click', () => {
      if (pending) {
        Store.restore(pending);
        pending = null;
        toast('Progress restored');
        setTimeout(() => location.reload(), 500);
        return;
      }
      importNote('');
      $('#importFile').value = '';
      $('#importFile').click();
    });
    $('#importFile').addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const r = new FileReader();
      r.onerror = () => importNote('That file could not be read.', 'bad');
      r.onload = () => {
        const checked = Store.inspectJson(String(r.result || ''));
        if (!checked.ok) { pending = null; $('#importBtn').textContent = 'Restore from a file'; importNote(checked.reason, 'bad'); return; }
        pending = checked;
        $('#importBtn').textContent = 'Tap again to replace everything';
        importNote('That file holds ' + plural(checked.proofs, 'proof') + ' and ' +
                   plural(checked.dailies, 'daily result') +
                   (checked.exported ? ', saved on ' + Store.longDate(checked.exported) : '') +
                   '. Restoring replaces what is on this device.', 'ok');
        setTimeout(() => {
          if (!pending) return;
          pending = null;
          $('#importBtn').textContent = 'Restore from a file';
          importNote('');
        }, 12000);
      };
      r.readAsText(file);
    });

    $('#eraseBtn').addEventListener('click', () => {
      if ($('#eraseBtn').dataset.armed) { Store.erase(); toast('Everything erased'); location.reload(); return; }
      $('#eraseBtn').dataset.armed = '1';
      $('#eraseBtn').textContent = 'Tap again to erase everything';
      setTimeout(() => { delete $('#eraseBtn').dataset.armed; $('#eraseBtn').textContent = 'Erase everything'; }, 4000);
    });

    if (!Store.onboarded()) {
      $('#onboard').hidden = false;
      onboard();
    } else {
      go('map');
    }
    scheduleNotifications();
  }

  function back() {
    if (Board.back()) return true;
    if (view === 'vignette') { const f = vignetteAfter; vignetteAfter = null; (f || (() => go('map')))(); return true; }
    if (!$('#onboard').hidden) return false;   // onboarding is the root; let the system have Back
    if (view !== 'map') { go('map'); return true; }
    return false;
  }

  function onPause() {
    Board.pause();
    Sound.suspend();
    clearTimeout(toast._t);
    const t = $('#toast'); if (t) t.hidden = true;
  }

  function onResume() {
    Board.resume();
    Sound.enable(Store.settings().sound);
    scheduleNotifications();
    if (view === 'daily') renderDaily();
    if (view === 'map') renderMap();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { go: go, toast: toast, back: back, onPause: onPause, onResume: onResume, vignette: vignette,
           nextTheorem: nextTheorem, forgeStart: forgeStart };
})();

window.App = App;
