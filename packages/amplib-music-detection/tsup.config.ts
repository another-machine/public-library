import { defineConfig } from "tsup";

/**
 * Two artifacts. The ESM package keeps `@amplib/music-theory` external, since a
 * consumer holding both packages has to hold the same one — `tick()` hands back
 * its `Note` and `Chord` instances. The browser bundle inlines it, because a
 * `<script src>` has nothing to resolve a bare specifier with.
 *
 * `noExternal` has no command-line form, which is why this is a config file
 * rather than a `tsup` key in package.json.
 */
export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: "esm",
    dts: true,
    clean: true,
    minify: false,
    sourcemap: true,
    splitting: false,
    external: ["@amplib/music-theory"],
  },
  // `window.MusicDetection` for no-build pages. Only the pure-PCM analysis:
  // `DetectTone` and `DetectBPM` need an AnalyserNode and a live graph, which
  // a page reading a file off disk has no use for.
  {
    entry: { "music-detection": "src/global.ts" },
    format: "iife",
    globalName: "MusicDetection",
    platform: "browser",
    noExternal: [/.*/],
    dts: false,
    clean: false,
    minify: false,
    sourcemap: true,
    splitting: false,
  },
]);
