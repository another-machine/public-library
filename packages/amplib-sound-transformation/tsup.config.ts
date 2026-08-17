import { defineConfig } from "tsup";

/**
 * Three artifacts, not one — and the reason this package carries a config file
 * while its siblings get by with a `tsup` key in package.json.
 *
 * tsup leaves `dependencies` external by default. That is right for the ESM
 * build (a bundler resolves them) and fatally wrong for the browser bundles: an
 * IIFE with a bare `require("fft.js")` left in it is a script tag that throws.
 * `noExternal` is not expressible on the CLI, so the config has to be a file.
 */
export default defineConfig([
  // The package proper. Consumers with a bundler get this.
  {
    entry: ["src/index.ts"],
    format: "esm",
    dts: false,
    clean: true,
    minify: false,
    sourcemap: true,
    splitting: false,
  },
  // `window.SoundTransformationLib` for no-build pages. fft.js is bundled in;
  // the detection dependencies are absent because src/global.ts never imports
  // them.
  {
    // tsup suffixes iife output with `.global`, so this lands as
    // dist/sound-transformation.global.js — the same shape as the codec's
    // dist/stegassette.global.js.
    entry: { "sound-transformation": "src/global.ts" },
    format: "iife",
    globalName: "SoundTransformationLib",
    platform: "browser",
    noExternal: [/.*/],
    dts: false,
    clean: false,
    minify: false,
    sourcemap: true,
    splitting: false,
  },
  // The worklet, as its own file: `audioWorklet.addModule` wants a URL, and the
  // processor scope has no module loader to reach the bundle above with. It
  // registers `phase-vocoder-processor` as a side effect and exports nothing.
  {
    entry: { "phase-vocoder-processor": "src/processors/PhaseVocoderProcessor.ts" },
    format: "iife",
    platform: "browser",
    noExternal: [/.*/],
    dts: false,
    clean: false,
    minify: false,
    sourcemap: true,
    splitting: false,
  },
]);
