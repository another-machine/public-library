# Stegassette / stega.now / amplib — consolidation plan

Status (2026-07-30): **Phase 0 complete. Phase 1 complete** — all six steps. Next: Phase 2 (flip consumers). Target shape revised — see §3.

## 1. Where things stand

Five web surfaces, four repos, two hosts:

| Surface | Repo | Host | Where its codec comes from |
| --- | --- | --- | --- |
| `make.stega.now` — editor | `ja-k-e/labs-stegassette` (private) | Netlify | `lib/steg-core.js` — 1743 L vanilla JS |
| `stega.now` — player/console (+ `/me`, `/audio-console`) | `ja-k-e/stega-now` | Netlify | `lib/steg-core.js` — byte-identical vendored copy |
| `stegassette.jake.fun` — gallery | `ja-k-e/stegassette-website` | Netlify | `public/lib/steg-core.js` — vendored copy |
| `amplib.app/live`, `/geese-basement`, `/modulo`, `/steganography` | `another-machine/public-library` | GH Pages | `packages/amplib-steganography/src` ✅ real import |
| `amplib.app/stega` | same | GH Pages | old `Stega64`/`StegaCassette` API, untouched since December |

There is also a **fifth copy at the player layer**, one level above the codec: `stega-now/lib/reveal.js` (183 L, plain JS) and `packages/amplib-steganography/src/Stegassette/player.ts` (`createRevealPlayer`, 11.5 KB) are two independent wrappers around the same `computeRecon` / `computeRevealOrder` primitives.

And a **sixth implementation outside the web entirely**: `~/projects/another-machine/stega-player/` is an iOS app with `StegaKit`, a Swift port of `StegaMetadata` / `StegaCassette` / `Stega64` / `StegaBinary` / `StegaKey` — the **old** amplib API, not STGC. Two consequences:

- It is **not a git repository** — no remote, no history, nothing backed up. Worth fixing independently of this plan.
- It constrains the retirement of `StegaCassette`. Retiring `machines/stega` (the web app) is safe, but deleting `StegaCassette.ts` from the package would strand the iOS app's ability to be fed new images. Retire the *machine*, keep the *format module*, until the Swift side is ported to STGC or deliberately abandoned.

### The duplication inventory

- **4 hand-maintained implementations of the STGC codec.** `labs/lib/steg-core.js`, `stega-now/lib/steg-core.js`, `stegassette-website/public/lib/steg-core.js`, and `packages/amplib-steganography/src/Stegassette/*.ts` (16 files, the TS port).
- **The job schema was duplicated too.** `labs/lib/config.js` (24 KB) and a 9.4 KB stale fork on the website — deleted in Phase 0.
- **Job media copied by hand to 2 places.** `labs/jobs/live/*.png` → `machines/live/` and → `website/public/media/`, by hand.
- **The sync tax is visible in git history.** `stega-now` has three commits that do nothing but re-vendor the file: *"sync steg-core from the lab"*, *"re-sync steg-core after the lab's pixel-count and edge-key fix"*, *"re-sync steg-core for the nibble header and the orphan-key fix"*. `labs` has *"one truth with @amplib/steganography"* and *"align the header layout with @amplib/steganography"*. Both sides were being reconciled by hand, in both directions.

### One piece of luck

`labs/lib/steg-core.js` and `packages/amplib-steganography/src/Stegassette/keymap.ts` were last touched in the same minute (2026-07-29 22:05), with public-library's tree clean. **Parity was real at that moment** — which is why Phase 0 froze it with a version stamp rather than waiting.

## 2. The root cause

It is not that the projects live in different repos. It is that **the codec has no distribution mechanism**, so the only way to share it is to copy the file. Everything else — the stale gallery, the re-sync commits, the byte-identical media, `machines/stega` rotting on the old API — is downstream of that.

So the answer to *"do they all need to move into `machines/` to share the core lib?"* is **no**, and moving them would make things worse:

- `machines/*` are Parcel apps deployed to `amplib.app/<name>` by one GitHub Actions workflow that already hardcodes eight `npm i` / `npm run build` / `mv` triples. Adding three more means every push rebuilds all of it.
- One GH Pages deploy cannot serve `stega.now`, `make.stega.now`, and `stegassette.jake.fun` as their own domains.
- `labs-stegassette` carries **3.5 GB of gitignored job output** and a symlink into a **1.9 GB Dropbox source tree**. That must not go near a public monorepo.

What moves into public-library is the **library**, not the apps.

## 3. Target shape

Revised 2026-07-30 after two decisions: **`geese-basement` and `live` move off amplib.app onto stega.now**, and **`stegassette.jake.fun` is out of scope** — a frozen one-off for another purpose, kept on current code (done in Phase 0) but not consolidated.

The organising idea that falls out of this: **amplib.app is the library, stega.now is the work made with it.** Every stegassette *surface* lives on stega.now; amplib.app keeps only the packages, their docs, and the machines that are genuinely library demos. That is a cleaner line than the old split, where stegassette content was scattered across both.

### `another-machine/public-library` → `amplib.app` — the library

```
packages/
  amplib-steganography/     ← the codec; single source of truth
  amplib-*/                 ← the other packages
docs/                       ← amplib.app homepage + per-package docs
  src/steganography/        ← the codec's live demo (already exists)
machines/
  lexicon-standoff/  mindmeld/  modulo/  sonic-pixels/
  avva/  forever-song/  omnichord/  unison/     (older forms)
```

Sheds `machines/live` and `machines/geese-basement`. `machines/stega` gets retired (see Phase 2) — with `docs/src/steganography` as the codec's demo and stega.now as the real player, an unmaintained third encoder on the library site has no job. Its homepage entry repoints at stega.now.

### `ja-k-e/stega-now` → `stega.now` — the stegassette family

```
index.html              /                player + cartridge library
make/                   /make            the editor (from labs)
live/                   /live            the 16 performances
geese/                  /geese           geese basement
me/                     /me              existing
audio-console/          /audio-console   existing
lib/
  steg-core.js                           one vendored codec
  reveal.js                              one reveal player
media/live/, media/geese/                the cartridge PNGs
```

One public repo, one Netlify site, **no build step** — everything stays drop-a-file-and-serve.

### `ja-k-e/stegassette-jobs` (private) — the content pipeline

`encode-batch.js`, `video-batch.js`, `render-video.js`, `probe.js`, `jobs/*.jobs.json`, the Dropbox source mount. No web surface. Publishes PNGs into stega.now via a manifest instead of hand-copies.

### `ja-k-e/stegassette-website` → `stegassette.jake.fun` — out of scope

Frozen as-is on the current codec. Not moved, not merged, no `gallery.stega.now`. Note it shows the **same 16 performances** as `/live` will, from an older divergent encode — deliberate, since it serves a different purpose.

Net: 4 repos → 3 (+1 frozen), 4 codec copies → 1, 2 reveal players → 1, 137 MB of media out of the library's working tree and deploy.

One honest caveat on that last point: deleting the media from `public-library` shrinks the checkout and the Pages build, but **not** the 389 MB `.git` — the blobs stay in history unless you rewrite it with `filter-repo`. Worth doing only if clone time actually bothers you, and worth doing as its own deliberate step, never folded into another change.

> Decided 2026-07-30: the editor's source goes **public** as part of `stega-now`.

## 4. The layering rule

This split works because the current `lib/` already divides along a real seam. Written down, it decides every future "where does this go?":

| Layer | Contents | Home |
| --- | --- | --- |
| **Codec** | traversals, keymaps, combine ops, STGC header v1, entry table, `reconstructCover`, `computeRevealOrder`, `createRevealPlayer` | `packages/amplib-steganography` |
| **Audio prep** | trim / downmix / resample / relabel / reverse / normalize, `float32ToPcm` | same package — editor and batch runners both need it |
| **Job schema** | `config.js` — `expandJob`, `planChunks`, `mosaicGrid`, `resolveBorderWidth`, `jobMode`, `outBase` | same package, separate entry point. Already deliberately browser-safe. |
| **Node I/O** | pngjs read/write, `wav.js` | same package, `./node` entry (already exists) |
| **ffmpeg / probe** | `probe.js`, `render-video.js` | jobs repo — needs a binary, never runs in a browser |
| **UI** | `index.html` editor, player, gallery | stega-now repo |
| **Content** | `*.jobs.json`, source media, encoded output | jobs repo |

`config.js` in the package is load-bearing: it is what lets the public editor and the private batch runners agree on a job file without either vendoring the other.

## 5. How the codec gets out of public-library

The consumers are all *no-build, serve-anywhere static files*. That rules out anything needing a bundler at the consumer end.

Add a tsup IIFE entry to `packages/amplib-steganography` emitting a self-contained `dist/stegassette.global.js` that exposes `window.Stegassette`, alongside the existing ESM `index.js` / `node.js`. Then:

- **Ship it on `amplib.app`.** ✅ The Pages output now carries `amplib.app/lib/stegassette.js` (the codec + reveal player) and `amplib.app/lib/stegassette-jobs.js` (the job schema), each with a version-stamped copy alongside. The library literally distributes the library.
- **Consumers vendor it with a stamp.** `npm run codec:sync` copies it in; the `CODEC_VERSION` stamp is logged on boot and `npm run codec:check` hashes every copy. Wire the check into the Netlify build so drift fails the deploy. Drift becomes *loud* — that is what would have caught the six-week-stale gallery.
- **Hotlinking is the escape hatch, not the default.** A runtime cross-origin dependency would take `make.stega.now` down with `amplib.app`, and the encoder's worker `importScripts` would need CORS.

Publishing `@amplib/steganography` to npm is worth doing for `machines/*` and Node consumers, but it does not solve the static-site case, so it is not on the critical path.

## 6. Phases

### Phase 0 — stop the bleeding ✅ done 2026-07-30

What was planned was "delete four stale files and repoint a docs page". What was actually there was worse, and the fix changed shape accordingly:

- `public/references/index.html` was **not** a references page — it was a frozen 3858-line fork of the whole editor from June 12, live at `stegassette.jake.fun/references/` and linked from nowhere.
- The **live gallery** loaded its codec from that directory (`index.html:2005` → `./references/lib/steg-core.js`), so the stale copy was not documentation, it was the gallery's production codec — 1397 lines against the lab's 1743.

Done:

1. Verified the current codec decodes all 16 committed gallery PNGs — first in Node, then in-browser. Confirmed across three different `combine`/`traversal`/`keymap` triples (`difference`+`raster`+`adjacent`, `difference`+`spiral`+`poles`, `xor`+`raster`+`adjacent`), recovering real audio each time (44.1 s @ 11.6 kHz mono, 27.2 s @ 44.1 kHz stereo, 31.3 s @ 44.1 kHz mono; peak 0.891, >98 % audible samples). **The format is backward compatible** — worth knowing before any further migration.
2. Moved the codec to `public/lib/steg-core.js` and synced it to current.
3. Deleted `public/references/` entirely; added `public/_redirects` sending `/references/*` → `make.stega.now` so the public URL does not 404.
4. Added `CODEC_VERSION` to `lib/steg-core.js` (exported) and a lockstep constant to the TS package's `header.ts` (exported through `Stegassette`). Distinct from `STGC_VERSION`, which is the on-disk format version.
5. All three apps log `stegassette codec <version>` on boot — verified in-browser for `stega.now` and the gallery.
6. Added `scripts/codec-check.js` + `npm run codec:check` / `codec:sync`: hashes every vendored copy against the lab's, exits 1 on drift, `--fix` syncs them.
7. Gave `stegassette-website` its own `.claude/launch.json` (port 8150) instead of adding a sixth cross-repo entry to the lab's.

Regression check: all **233** existing assertions pass (`test-roundtrip` 36, `test-split` 31, `test-border` 157, `test-realonly-recon` 9).

Two findings logged, neither caused by this work:

- `packages/amplib-steganography` **`.d.ts` build has been broken for some time** — `StegaCassette.ts` fails on `Cannot find module '../../amplib-procedural-generation/src'` and `Type 'Float32Array' is not generic`. The ESM JS build succeeds, so nothing downstream noticed. This must be fixed before Phase 5's npm publish, and it is a good argument for retiring `StegaCassette` (step 11).
- The gallery's media has **diverged from the lab's**: 9 of its PNGs differ byte-wise from `jobs/live/`, and 4 (`10`–`13`, spelled `.stegasette`) do not exist in the lab at all. The gallery is a frozen June snapshot, self-consistent but no longer reproducible from the job files. Reconcile in step 14, and decide which side is canonical before re-publishing media.

### Phase 1 — freeze parity, then make the package the truth

1. ✅ **The parity gate exists and passes** — `packages/amplib-steganography/scripts/test-parity.mjs`, run with `npm run test:parity`.

   Built as a **differential** test rather than a port of the lab's suite, deliberately. The lab's 233 assertions prove `steg-core.js` is self-consistent; the package's would prove the same of itself. Neither proves the two *agree*, and agreement is the only property that makes Phase 2 safe — consumers are being switched from one implementation to the other underneath images that already exist. So for each of ~100 configurations (every combine, every traversal, every keymap, plus a combine × traversal × keymap sample, channel plans, bit depths, borders) it asserts:

   1. **byte-identical encode** — both produce the same pixels
   2. **cross-decode lab → package**
   3. **cross-decode package → lab**

   **314 assertions, 0 failures.** It also pins the three name arrays, because the STGC header stores combine/keymap/traversal as *indices* into them — if those orders ever diverge, every existing image silently decodes as the wrong mode. They currently match exactly in content and order.

   This file is transitional: delete it when `steg-core.js` becomes a build artifact of the package and there is nothing left to differ.

   **Two API divergences it caught**, neither a format difference, both able to break a migration silently:

   - **`encodeContainer` argument order differs.** Lab: `(entries, srcImg, keyImg, opts)`. Package: `(entries, srcImg, opts, keyImg)`. Every Phase 2 call site must be re-read, not just re-imported.
   - **The keymap option is spelled differently** — lab `keyMap`, package `keymap`. This is the *only* naming divergence in the entire option surface (`borderWidth`, `bytesPerSample`, `channels`, `combine`, `pack`, `params`, `plan`, `traversal` all match), and it was silently degrading: the package read `opts.keymap`, found nothing, defaulted to `"adjacent"`, and encoded 38 configurations with the wrong keymap while labelling them correctly in the header. Self-consistent, round-trippable, quietly not what was asked for.

     Fixed by `resolveKeymapName()` in `keymap.ts`, which throws when `keyMap` is passed without `keymap`. It has to sit at the **public boundary** (`encodeContainer`, `encodeImageData`, `browser.encode`) — options are normalized before `writeInterior` runs, so a guard placed deeper never sees the misspelling. The harness asserts the guard fires, so it cannot rot.

   Also done here: **`encodeContainer` / `decodeContainer` are now exported.** They were internal, leaving `encodeImageData` (which auto-scales) as the only entry point — but the lab's editor and batch runner size their own canvas via `autoScaleImg` and encode at the container level. Without these exports, Phase 2 would have meant restructuring the lab's encode flow rather than swapping an import.

   Verified no regressions: the lab's 233 assertions still pass, no in-repo consumer passes `keyMap` (modulo passes no keymap at all), and `machines/modulo` still builds against the browser entry.
2. ✅ **Audio pipeline and WAV are in the package.**

   `Stegassette/audioPrep.ts` owns the environment-agnostic tail of the encode pipeline. The full pipeline is `decode → deinterleave → reverse? → normalize? → layout → PCM → entry`, and only the first step is environment-specific (ffmpeg in Node, `decodeAudioData`/`OfflineAudioContext` in the browser). Everything after it was duplicated between `encode-batch.js` and `index.html`; the package now owns it as `prepareAudioEntry`, alongside `deinterleave`, `resolveNormalize`, and `resolveAudioRates`.

   `resolveAudioRates` is a named function rather than two inline ternaries on purpose: it encodes the relabel/resample contract, where the mimetype rate is **always** the target. Writing the source rate into a relabelled entry was a real bug once, and it is silent until you hear the playback.

   `src/wav.ts` ports `lib/wav.js` to the `./node` entry (`decodeWav`/`encodeWav` on bytes, `readWav`/`writeWav` on paths). It also clamps the data chunk to what is actually present, since trusting a truncated file's header length causes confusing overruns.

   **The parity harness grew to cover both: 886 assertions, 0 failures.** It transcribes the lab's pipeline from `encode-batch.js` and asserts identical mimetype and identical PCM bytes across channels × bit depths × layouts × direction × normalize forms, plus `resolveNormalize` over every loose form job files use, plus byte-identical WAV output and cross-reading.

   One divergence found and **deliberately not fixed**: an unrecognized normalize string falls through to `parseFloat` → NaN → *the default*, so `"no"` turns normalization **on** at −1 dBFS. Surprising, but changing it would change the output of any job file relying on it, so the package matches the lab exactly and the wart is documented at the function. (No job file currently uses anything but `-1` and `null`, so this is safe to fix deliberately once `steg-core.js` retires.)

3. ✅ **The job schema is in the package** as `src/jobSchema.js`, exported at the `./job-schema` subpath and as a second IIFE global `StegassetteJobs` (`dist/jobSchema.global.js`, 18 KB).

   Done as a **mechanical move, not a TypeScript rewrite.** A hand-translation of 631 lines of nuanced planner logic is exactly the change that introduces silent divergence, and this was the last shared surface with no differential coverage. So the wrapper changed (IIFE + CJS dual pattern → ESM named exports) and the function bodies did not. That is verifiable rather than asserted: normalizing whitespace and comments away, **17 of 19 function bodies are byte-identical**, and the two that differ are the two intended changes — `jobBytesPerPixel` losing its `Core` guard, and `expandJobs` only appearing to differ because the extractor caught the trailing `return {` versus `export {`. Types can be added incrementally now that there is one copy.

   The `Core &&` guards are gone, which removes a real hazard rather than just tidying: they carried **hardcoded fallback copies** of `COMBINE_NAMES` / `KEYMAP_NAMES` / `TRAVERSAL_NAMES` for when the codec was not loaded. The STGC header stores those as *indices*, so a fallback list silently drifting from the real one would mislabel every image encoded through it. The package imports them from the codec instead.

   It ships as a separate entry because the split is real: the editor and batch runner need the job schema, the player and galleries do not, so it stays out of the codec bundle. Two globals (`Stegassette` + `StegassetteJobs`) also mirror the lab's existing two script tags (`StegCore` + `StegConfig`), which keeps the Phase 2 editor migration close to mechanical.

   **Gate: 1476 assertions total, 0 failures.** The job-schema section drives every one of the 20 exports, including all **70 real jobs across the lab's 7 job files** through `resolveConfig`, `validateConfig`, `jobMode`, `framesSpec`, `splitSpec`, `splitAudioPath`, and `expandJob` — plus synthetic cases for every chunking mode the split planner supports (`count` / `chunk` / `maxBytes` / `maxPixels` / explicit `parts`, and the degenerate `0` / negative / empty forms). Errors are compared too: where one implementation throws, the other must throw the same message.

   > **A seam Phase 2 must handle.** `resolveConfig` emits `encodeOpts.keyMap` — the lab's spelling — because it is a faithful move and `encode-batch.js` reads that key. The codec wants `keymap`. So `encodeOpts` **cannot** be passed straight into `encodeContainer`. The harness asserts this fails loudly (the `resolveKeymapName` guard fires) and that translating `keyMap` → `keymap` works, so the seam is covered rather than lurking. Adding a canonical `keymap` alias to the schema output is the right fix, but it belongs in the commit that migrates the lab's consumers — doing it now would break both parity and `encode-batch.js`.

4. ✅ **The reveal is layered, not deduplicated.** This step was originally mis-scoped as "pick one and delete the other"; the two are different *levels*, and the fix was to separate them properly.

   `reveal.js` took an already-decoded image and let the caller drive the sweep by fraction — `stega.now` drives it from its own audio playhead and passes `entry: null` for a whole-interior sweep. It owns no audio. `player.ts` decoded the image itself, found the audio tracks, owned the `AudioBuffer`, and drove its own playhead; the galleries use only that. Only the inner pixel mechanism was genuinely duplicated.

   Now:

   - **`revealSurface.ts` → `RevealSurface`** owns the mechanism: stacked base (reconstruction) + overlay (encoded) canvases, `clearAt(pathIndex)` erasing a data pixel *and* its keymapped partner, `clearRange`, `reset`, and a batched `flush`.
   - **`SeekableReveal`** is the caller-driven level (`element`, `reset()`, `seek(fraction)`), plus `revealSpanForEntry` for computing an entry's pixel span and reveal order, and `animateReveal` for the clock-driven case.
   - **`RevealPlayer`** is rebuilt on `RevealSurface` and is now the multi-track audio-driven level only. Its public API is unchanged.
   - **`createSeekableReveal({source, entry})`** is the new decode-and-build convenience, mirroring `createRevealPlayer`.

   Two behaviours deliberately carried over from `reveal.js` rather than from `player.ts`:

   - **Batched uploads.** Erasing writes alpha 0 into a held `ImageData` and uploads only the touched bounding box per flush. `player.ts` used a `clearRect` per pixel, which made a deep seek cost hundreds of milliseconds because the work scales with how much of the image the jump reveals.
   - **`animateReveal` uses `setInterval`, not `requestAnimationFrame`.** A backgrounded tab stops serving frames, which would leave the image half-developed, whereas clock-measured progress still finishes. (`RevealPlayer` keeps rAF, which is correct there — it is synced to the audio clock, so a backgrounded tab simply catches up on return because `fillIdx` is derived from the clock rather than incremented per frame.)

   Verified in-browser against a real 787² cartridge: `SeekableReveal` reveals monotonically (44.9% → 72.5% → 100% cleared), reaches full coverage at `seek(1)`, treats a backwards seek as a no-op (erasure is one-way), and `reset()` restores. `animateReveal(600ms)` completed in 630 ms at 100%. `RevealPlayer`'s track span matches `revealSpanForEntry` exactly (46 → 170570, permuted), and driving its per-frame path gives 44.9% → 58.7 → 72.5 → 86.2 → 100%. Its full public API is intact, and `geese-basement`, `live`, `modulo`, and `docs` all still build.

5. ✅ **The IIFE bundle exists and is published.**

   `src/stegassette.ts` → `dist/stegassette.global.js` (66 KB, comparable to `steg-core.js`'s 68 KB), built by `npm run build:global` and exposing `window.Stegassette`. It ships the **browser** surface, so it includes the DOM-dependent reveal player the galleries need, not just the pure codec.

   The global is named `Stegassette`, **not** `StegCore`. The rename is deliberate: the two APIs are not drop-in compatible (different `encodeContainer` argument order, different keymap option spelling), so aliasing `window.StegCore` to this would hide exactly the breakage that matters. Every call site must be re-read.

   The Pages workflow now builds the package and emits `amplib.app/lib/stegassette.js` plus a version-stamped `stegassette-<CODEC_VERSION>.js`, so a consumer can pin one build while the unversioned name tracks latest.

   Verified in a browser via plain `<script src>` against a real cartridge: 68 exports present, correct `CODEC_VERSION`, container round-trip byte-exact under `difference`/`hilbert`/`poles`, the `keyMap` guard still fires after bundling, a real 787² cartridge decodes to 4 entries with 511,572 audio samples at 11.6 kHz, `reconstructCover` completes in 318 ms, and `createRevealPlayer` builds a working player element in 161 ms.

   > Note: `tsup`'s `dts` step is now set to `false`. It had been failing on `StegaCassette.ts` and emitting **no** `.d.ts` files at all, while still exiting non-zero — which blocked the global build from ever running. The package advertises no `types` field, so nothing shipped changes. `npm run build:types` is where the fix lands.

6. ✅ **`codec-check` knows about the published bundle.** `npm run codec:check:remote` fetches `amplib.app/lib/stegassette.js` and compares `CODEC_VERSION`. Bytes can never match — that bundle is built from the TypeScript port — so the version is the only comparable, which is precisely why the two `CODEC_VERSION` constants must move in lockstep. Currently reports a clean 404 with remediation, since the workflow change is not yet deployed.

**Gate (all steps):** `npm run test:parity` → **1476 assertions, 0 failures**, covering the codec (byte-identical encode + cross-decode both directions), the audio pipeline, WAV I/O, and the job schema over all 70 real jobs. Plus: the lab's 233 assertions still pass, and `machines/{modulo,live,geese-basement}` and `docs` all still build.

### Phase 2 — flip consumers, easiest first

7. **`stega-now`** — decode and playback only, smallest surface. Verify against a cartridge from each job set.
8. **`stegassette-website`** — optional now that it is frozen and out of scope. If touched at all, replace the hand-rolled `public/scripts/steg-reconstruction.js` with `reconstructCover` and verify against its 16 PNGs (Phase 0 established they all decode). Otherwise leave it.
9. **`labs/index.html` + batch runners** — the hard one: encode path, the inline-Blob worker's `importScripts`, `OffscreenCanvas`, and Node CJS `require`. The IIFE global build exists specifically so `<script src>` and `importScripts` keep working unchanged. Verify: re-run `jobs:rhir:png` and diff output PNGs byte-for-byte.
10. **`machines/stega`** — retire the machine, but **keep `StegaCassette.ts` in the package**: the untracked iOS app in `~/projects/another-machine/stega-player` is a Swift port of that format and would be stranded (see §1). Repoint the `docs/src/index.html` entry at `stega.now`, and fix the `.d.ts` build in place rather than by deletion.

**Gate after each:** byte-identical output on a known job. Flip one, verify, commit — do not batch.

### Phase 3 — move the galleries to stega.now

Cheaper than it looks. Both `index.ts` files use exactly **one** package API — `Stegassette.createRevealPlayer` — and TypeScript only for the `RevealPlayer` type. Parcel is doing TS compilation, `--public-url` rewriting, and asset hashing, none of which a static site needs.

11. Convert `machines/live` and `machines/geese-basement` to static pages under `stega-now/live/` and `stega-now/geese/`: keep `index.html` as-is (17 KB and 29 KB of hand-built gallery markup), drop the type annotations from `index.ts` → `index.js`, and call the Phase 1 reveal player from the vendored bundle. Drops Parcel, `node_modules`, and `sharp` from both.
12. Move the media: `live/src/media` (89 MB) and `geese-basement/src/media` (48 MB) → `stega-now/media/`. Both sets are currently **byte-identical to `labs/jobs/`**, so this is a move, not a reconciliation. Keep `generate-thumbs.js` with the jobs pipeline, which is where thumbnails belong.
13. Delete both machines from `public-library`, remove their two build-and-move blocks from `.github/workflows/main.yml`, and drop the `Live` entry from `docs/src/index.html`. (`geese-basement` was never listed there — it was an unlisted deploy.)

**Gate:** each gallery plays and reveals every cartridge in its set, verified in-browser, before the old deploy is removed.

### Phase 4 — split the repos

14. Extract `encode-batch.js`, `video-batch.js`, `render-video.js`, `probe.js`, `jobs/` into `ja-k-e/stegassette-jobs`, via `git subtree split` or `git filter-repo` so history follows.
15. Move `labs/index.html` + editor assets into `stega-now/make/`. What remains of `labs-stegassette` is nothing; archive it.
16. Add `publish.json` to the jobs repo — a manifest mapping job output → consumer path, replacing the hand-copying. Only one consumer now (`stega-now/media/`), since the website is frozen and the machines are gone.

### Phase 5 — domains

17. `stega.now` → player at `/`, plus `/make`, `/live`, `/geese`, `/me`, `/audio-console`. One Netlify site. Keep `/` exactly as it is — it is what `?src=` links and encoded cartridges point at.
18. `make.stega.now` → keep as an alias redirecting to `stega.now/make`, so existing links survive.
19. **Leave forwarding stubs at `amplib.app/live` and `amplib.app/geese-basement`.** Note GitHub Pages has no `_redirects` equivalent, so these must be small `index.html` pages with a `<meta http-equiv="refresh">` and a `<link rel="canonical">`, emitted into the Pages output by the workflow. Do not just delete the paths — `amplib.app/live` is linked from anothermachine.info and has been shared.
20. `amplib.app` becomes the library's own site: packages, docs, non-stegassette machines, and `/lib/stegassette.js`.
21. `stegassette.jake.fun` — untouched.

### Phase 5a — the link updates

Two sites carry links that break when `live`, `geese-basement`, and `stega` leave amplib.app. Full inventory:

**`another-machine/website` → `anothermachine.info`** (GH Pages, `CNAME`, own repo):

| Line | Current | Becomes |
| --- | --- | --- |
| `index.html:392` | `https://amplib.app/stega` | `https://stega.now` |
| `index.html:403` | `https://amplib.app/live` | `https://stega.now/live` |
| — | geese basement is **not linked at all** | add `https://stega.now/geese` if it should be |

Also in that repo: `amplib.app.live.png` (664 KB) and `amplib.app.geese-basement.png` (1.7 MB) sit in the root and are **referenced by nothing** in `index.html` — only `image.png` is used, as the OG image. Either wire them in or delete them.

> Jake may revise the prose in `anothermachine.info` alongside this — worth doing in the same pass, since the Stega/Live descriptions there will want to reflect that they now live on stega.now.

**`public-library/docs/src/index.html`** (the amplib.app homepage):

- The `Stega` entry (`h2` + its `machines/stega` GitHub link) → repoint at `stega.now`, drop the GitHub link when the machine is retired.
- The `Live` entry (`h2` + its `machines/live` GitHub link) → repoint at `stega.now/live`, drop the GitHub link.
- Both GitHub `tree/main/machines/...` URLs 404 once the directories are deleted, so they must go in the same commit as the deletion.

### Phase 6 — optional

22. Fix the `.d.ts` build and publish `@amplib/steganography` to npm for Node and bundler consumers.

## 6a. Galleries stay as pages — settled

`/live` and `/geese` remain hand-built pages, not collections folded into the player.

The reason is a boundary worth writing down: **the player's library is local storage, not a publishing surface.** It is the viewer's own shelf — cartridges they added, held in their browser's IndexedDB. Curated public sets are a different thing and belong in their own pages. Keeping them separate also preserves each gallery's bespoke design, and drops Parcel from both.

So `stega.now` has two distinct modes, and they should not be conflated:

| | `/` player | `/live`, `/geese` |
| --- | --- | --- |
| Content | whatever the viewer adds | a curated, fixed set |
| Storage | IndexedDB, local to the viewer | files served from the repo |
| Purpose | a personal shelf | a published piece |

## 7. The jobs question

Jobs do not belong in public-library — but they do not belong in the *lab* either. `jobs/` is 3.5 GB of gitignored output fed by a 1.9 GB Dropbox symlink, inside a repo whose other job is serving a website. That is why it feels gnarly: a content pipeline wearing a source repo's clothes.

Two separate things to fix:

**The symlink.** There is exactly one on disk — `jobs/source -> ~/Dropbox/stegassette/source`. That one is fine; it is a machine-local mount of a 1.9 GB asset tree and should stay a mount. Just make it *declared*: a `JOBS_SOURCE` env var with the symlink as documented default, so a fresh checkout fails with "set JOBS_SOURCE" instead of a confusing ENOENT.

**The thing that actually feels like symlinking.** The real sprawl is cross-repo references that are not symlinks at all:

- `labs/.claude/launch.json` launches dev servers for **four other projects** — `stega-now`, `_labs/lrc` (8140), `machines/geese-basement` (4301), `machines/live` (4302) — by absolute path. The lab repo has quietly become the launcher for everything.
- Job PNGs mirrored by hand into two consumers.

Fix both by direction, not by linking: each repo owns its own `launch.json` entries after the split, and media moves by an explicit publish step.
