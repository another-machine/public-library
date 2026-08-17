import { defineConfig } from "tsup";

/**
 * Two artifacts. The ESM package keeps `@amplib/devices` external, since a
 * consumer holding both packages has to hold the same one — `Camera` hands
 * back its `CameraStream`. The browser bundle inlines it, because a
 * `<script src>` has nothing to resolve a bare specifier with.
 *
 * `noExternal` has no command-line form, which is why this is a config file
 * rather than the `tsup` key this package.json used to carry.
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
    external: ["@amplib/devices"],
  },
  // `window.Photography` for no-build pages — the whole surface, since all of
  // it (the camera, the darkroom, the schema) runs in a script tag.
  {
    // tsup suffixes iife output with `.global`, so this lands as
    // dist/photography.global.js — the same shape as the codec's
    // dist/stegassette.global.js.
    entry: { photography: "src/global.ts" },
    format: "iife",
    globalName: "Photography",
    platform: "browser",
    noExternal: [/.*/],
    dts: false,
    clean: false,
    minify: false,
    sourcemap: true,
    splitting: false,
  },
]);
