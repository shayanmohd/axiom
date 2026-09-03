/* Every sound in Axiom is synthesised on the device. No audio files, nothing fetched. */
const Sound = (function () {
  'use strict';
  let ctx = null, on = true;
  function ac() {
    if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (C) ctx = new C(); }
    if (ctx && ctx.state === 'suspended') { const r = ctx.resume(); if (r && r.catch) r.catch(function () {}); }
    return ctx;
  }
  function enable(v) { on = !!v; if (on) ac(); }

  function tone(freq, t0, dur, gain, type, bend) {
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (bend) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * bend), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  /* a woodblock: a short pitched knock with a wooden overtone */
  function snap() {
    if (!on) return; const c = ac(); if (!c) return;
    const t = c.currentTime;
    tone(880, t, 0.055, 0.16, 'triangle', 0.6);
    tone(2100, t, 0.03, 0.05, 'square', 0.7);
  }
  /* the refusal: soft, low, no sting */
  function refuse() {
    if (!on) return; const c = ac(); if (!c) return;
    const t = c.currentTime;
    tone(150, t, 0.12, 0.09, 'sine', 0.8);
  }
  function tick() {
    if (!on) return; const c = ac(); if (!c) return;
    tone(1400, c.currentTime, 0.02, 0.04, 'triangle');
  }
  /* the cascade chord: a rising arpeggio whose top note is higher for a better proof */
  function cascade(elegance) {
    if (!on) return; const c = ac(); if (!c) return;
    const t = c.currentTime;
    const base = 261.63;
    const notes = [1, 1.25, 1.5, 2, elegance >= 2 ? 3 : elegance >= 1 ? 2.5 : 2.25];
    notes.forEach((r, i) => tone(base * r, t + i * 0.085, 0.5 + i * 0.12, 0.11, 'triangle'));
  }
  return { enable: enable, snap: snap, refuse: refuse, tick: tick, cascade: cascade };
})();
