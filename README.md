# Axiom

A puzzle game whose puzzles are real mathematical theorems. You grow a proof tree by hand and a
verification kernel running on the device checks every step, so when it says you proved it, you did.

- **Play listing:** https://play.google.com/store/apps/details?id=com.mohdshayan.axiom
- **Site:** https://shayanmohd.github.io/axiom/
- **Play it in a browser:** https://shayanmohd.github.io/axiom/play/
- **Privacy policy:** https://shayanmohd.github.io/axiom/privacy-policy.html

## What is actually in it

`web/js/kernel.js` is the whole trusted core: a classical natural deduction engine over a small first
order term language, with a parser, one way matching, the inference rules behind the eight moves, an
independent `verify()` pass that re-derives a finished tree from the root, and an iterative deepening
solver.

`web/js/content.js` holds thirty nine axioms and forty four theorems across three regions, four of them
keystones with a short history to read afterwards. It contains no
proofs and no pars. `tools/par.js` runs the solver over every theorem, replays the proof it finds, checks
it with `verify()`, and writes `web/js/pars.js`. If a theorem cannot be finished, the build fails, so an
unsolvable puzzle cannot ship.

```sh
node tools/par.js          # recompute every par; exits non-zero if anything is unsolvable
node tools/seed.js         # build a kernel-valid saved game for the store screenshots
node tools/shots-spec.js   # write store/shots.json for _shiptools/shots.js
node test/make-v100.js     # build test/v100.json, a save file shaped as 1.0.0 wrote it
```

`test/` holds the headless drive scripts used to hunt bugs: the first run and happy path, the upgrade
from a 1.0.0 save, the back gesture and lifecycle hooks, safe area insets, the native bridge, gestures
and wide trees, out of order replay, the export and restore round trip, every interface state, reduced
motion, and a contrast audit that measures every visible label against what is painted behind it.

```sh
python3 -m http.server 8828 --directory web
node ../_shiptools/drive.js http://127.0.0.1:8828/index.html test/01-firstrun.js --out test/shots
```

`web/` is the app: plain HTML, CSS and JavaScript, no build step, no dependencies, no network. All state
lives in `localStorage` under one key.

`android/` is a thin Kotlin WebView shell that serves `web/` from an app private https origin through
`WebViewAssetLoader`, adds amplitude haptics, file export and the daily notification scheduler, and
declares no INTERNET permission. The web core is copied into assets by the `syncWebAssets` Gradle task on
every build.

`docs/` is the GitHub Pages site: landing page, privacy policy and a playable copy of the game.

## Build

```sh
cd android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew bundleRelease
```

Signing reads `android/keystore.properties`, which is not in this repository.

## What was left out

Per theorem leaderboards, the community median crown tier, the daily histogram and classroom codes all
need a server and an account. Rather than fake them, crowns are scored against the kernel's own shortest
proof and the daily is derived from the date. There is no monetisation of any kind.
