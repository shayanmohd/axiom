#!/usr/bin/env node
/* Writes store/shots.json for _shiptools/shots.js. 540x960 at dpr 2 = 1080x1920. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const seed = fs.readFileSync(path.join(ROOT, 'store', 'seed.json'), 'utf8');

const sleep = 'const sleep = ms => new Promise(r => setTimeout(r, ms));';
const tool = "const tool = n => [...document.querySelectorAll('#pTools .tile')].find(e => e.querySelector('.tl-n').textContent.indexOf(n) >= 0);";

const spec = {
  url: 'http://127.0.0.1:8909/index.html',
  out: path.join(ROOT, 'store', 'screenshots'),
  width: 540, height: 960, dpr: 2, wait: 900,
  colorScheme: 'light',
  seed: '(function(){ try { if (localStorage.getItem("axiom.v1")) return; localStorage.setItem("axiom.v1", ' +
        JSON.stringify(seed) + '); } catch (e) {} })()',
  shots: [
    { name: '03-map', waitMs: 700, before:
      "(async () => { " + sleep + " App.go('map'); await sleep(400); document.querySelector('#v-map .scroller').scrollTop = 0; })()" },
    { name: '04-daily', waitMs: 700, before:
      "(async () => { " + sleep + " App.go('daily'); await sleep(400); document.querySelector('#v-daily .scroller').scrollTop = 0; })()" },
    { name: '05-satchel', waitMs: 700, before:
      "(async () => { " + sleep + " App.go('satchel'); await sleep(400); document.querySelector('#v-satchel .scroller').scrollTop = 0; })()" },
    { name: '06-forge', waitMs: 700, before:
      "(async () => { " + sleep + " App.go('forge'); await sleep(400); })()" },
    { name: '01-board', waitMs: 900, before:
      "(async () => { " + sleep + " " + tool +
      " App.go('map'); Board.open(Content.theorem('r07'), {}); await sleep(500);" +
      " document.querySelector('#pMoves .move').click(); await sleep(350);" +
      " tool('second corner').click(); await sleep(350);" +
      " tool('Side, angle, side').click(); await sleep(600);" +
      " document.querySelector('#panel').scrollTop = 0; })()" },
    { name: '02-victory', waitMs: 900, before:
      "(async () => { " + sleep + " " + tool +
      " tool('An angle read backwards').click(); await sleep(400);" +
      " tool('Equality runs both ways').click(); await sleep(2400); })()" }
  ]
};
fs.writeFileSync(path.join(ROOT, 'store', 'shots.json'), JSON.stringify(spec, null, 2));
console.log('wrote store/shots.json');
