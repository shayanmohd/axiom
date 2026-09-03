# Axiom

A puzzle game whose puzzles are real mathematical theorems. You grow a proof tree by hand and a
verification kernel running on the device checks every step, so when it says you proved it, you did.

- **Play listing:** https://play.google.com/store/apps/details?id=com.mohdshayan.axiom
- **Site:** https://shayanmohd.github.io/axiom/
- **Play it in a browser:** https://shayanmohd.github.io/axiom/play/
- **Privacy policy:** https://shayanmohd.github.io/axiom/privacy-policy.html

## What is actually in it

`web/js/kernel.js` is the whole trusted core: a classical natural deduction engine over a small first
order term language, with a parser, one way matching, the eight inference rules, an independent
`verify()` pass that re-derives a finished tree from the root, and an iterative deepening solver.

`web/js/content.js` holds thirty nine axioms and forty four theorems across three regions. It contains no
proofs and no pars. `tools/par.js` runs the solver over every theorem, replays the proof it finds, checks
it with `verify()`, and writes `web/js/pars.js`. If a theorem cannot be finished, the build fails, so an
unsolvable puzzle cannot ship.

```sh
node tools/par.js          # recompute every par; exits non-zero if anything is unsolvable
node tools/seed.js         # build a kernel-valid saved game for the store screenshots
node tools/shots-spec.js   # write store/shots.json for _shiptools/shots.js
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
