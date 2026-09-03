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

  function go(v) {
    view = v;
    VIEWS.forEach(x => { const el = $('#v-' + x); if (el) el.hidden = x !== v; });
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
    b.className = 'seal-row' + (i % 2 ? ' right' : '');
    const state = rec ? (rec.crown === 'gold' ? 'gold' : 'proven') : 'open';
    b.innerHTML =
      '<span class="seal seal-' + state + (thm.keystone ? ' keystone' : '') + '">' +
        (rec && rec.crown === 'gold' ? '<span class="cr">♛</span>' : '') +
        '<span class="sn"></span></span>' +
      '<span class="seal-txt"><span class="seal-name"></span><span class="seal-sub"></span></span>';
    b.querySelector('.sn').textContent = thm.keystone ? '★' : String(i + 1);
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
      sec.querySelector('.rg-prog').textContent = open
        ? done + ' of ' + total + ' sealed'
        : 'Sealed. ' + r.gate + ' proofs open the pass, and you have ' + Store.solvedCount() + '.';
      wrap.appendChild(sec);
      if (!open) return;
      const trail = document.createElement('div');
      trail.className = 'trail';
      Content.THEOREMS.filter(t => t.region === r.id).forEach((t, i) => trail.appendChild(seal(t, i)));
      wrap.appendChild(trail);
    });
    $('#mapCount').textContent = Store.solvedCount() + ' of ' + Content.THEOREMS.length + ' theorems proved';
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
        const seal = $('#dSeal');
        seal.classList.add('crack');
        Sound.snap();
        setTimeout(() => {
          seal.classList.remove('crack');
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
      b.querySelector('.am').textContent = a.result
        ? (a.result.crown === 'gold' ? '♛' : a.result.len)
        : (i === 0 ? '·' : '–');
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
        b.className = 'blk ' + (ch === '\u{1F7E9}' ? 'leaf' : 'mid');
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

  function forgeStart(kind) {
    toast('Building a drill');
    setTimeout(() => {
      const d = Forge.drill(kind);
      if (!d) { toast('The forge could not shape that one. Try again.'); return; }
      Board.open(d, { mode: 'forge', onExit: () => go('forge') });
    }, 60);
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
        b.innerHTML = '<span class="sat-l"></span><span class="sat-m"></span>';
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
    dots.innerHTML = cards.map(() => '<i class="ob-dot"></i>').join('');
    const paint = () => {
      cards.forEach(c => { c.style.transform = 'translateX(' + (-i * 100) + '%)'; });
      $$('#obDots .ob-dot').forEach((d, j) => d.classList.toggle('on', j === i));
      $('#obNext').textContent = i === cards.length - 1 ? 'Begin' : 'Next';
    };
    paint();
    $('#obNext').onclick = () => {
      Sound.tick();
      if (i < cards.length - 1) { i++; paint(); return; }
      Store.onboarded(true);
      $('#onboard').hidden = true;
      document.body.classList.add('has-tabs');
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
    $('#setTime').addEventListener('change', e => { Store.settings({ notifyTime: e.target.value }); scheduleNotifications(); });

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
      document.body.classList.add('has-tabs');
      go('map');
    }
    scheduleNotifications();
  }

  function back() {
    if (Board.back()) return true;
    if (view === 'vignette') { const f = vignetteAfter; vignetteAfter = null; (f || (() => go('map')))(); return true; }
    if (!$('#onboard').hidden) return true;
    if (view !== 'map') { go('map'); return true; }
    return false;
  }

  function onResume() {
    scheduleNotifications();
    if (view === 'daily') renderDaily();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { go: go, toast: toast, back: back, onResume: onResume, vignette: vignette,
           nextTheorem: nextTheorem, forgeStart: forgeStart };
})();

window.App = App;
