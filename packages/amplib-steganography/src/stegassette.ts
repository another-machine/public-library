/**
 * IIFE build entry — produces `dist/stegassette.global.js`, exposing everything
 * as `window.Stegassette`.
 *
 * This is the artifact the static sites consume. `stega.now`, its galleries,
 * and the lab's editor are all no-build, serve-anywhere pages that load the
 * codec with a plain `<script src>` (and, in the editor's case, `importScripts`
 * inside a Blob worker). None of them can consume an ESM package from
 * node_modules, so the ESM `index.js` is not enough on its own.
 *
 * The global is named `Stegassette`, matching the package's own namespace —
 * NOT `StegCore`, which is what the lab's `steg-core.js` installs. The rename
 * is deliberate: the two APIs are not drop-in compatible (`encodeContainer`
 * takes its arguments in a different order, and the keymap option is spelled
 * `keymap` rather than `keyMap`), so every call site must be re-read rather
 * than merely re-pointed. Aliasing `window.StegCore` to this would hide
 * exactly the breakage that matters.
 *
 * Ships the browser surface, so it includes the DOM-dependent reveal player
 * that the galleries need — not just the pure codec.
 */

export * from "./Stegassette/browser";
