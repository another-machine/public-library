import { execSync } from "child_process";
import { readFileSync } from "fs";

// Packages to build and pack tarballs for. Not the same as the published set —
// some of these have never been published. `amplib-color` is deliberately
// absent: it is built and tested, but held back until its shape is settled.
// Add it here when it publishes.
const directories = [
  "amplib-devices",
  "amplib-lexicon",
  "amplib-music-detection",
  "amplib-music-theory",
  "amplib-procedural-generation",
  "amplib-sound-synthesis",
  "amplib-steganography",
  "amplib-ui",
];

// Not every package compiles. @amplib/ui is stylesheets — the published files
// are the source files, so there is no build script to run and `npm run build`
// would exit non-zero on a missing script rather than no-op.
const hasBuild = (directory) => {
  const manifest = JSON.parse(
    readFileSync(`./${directory}/package.json`, "utf8")
  );
  return Boolean(manifest.scripts?.build);
};

process.chdir("./packages");
directories.forEach((directory) => {
  if (!hasBuild(directory)) return;
  process.chdir(`./${directory}`);
  execSync(`npm run build`);
  process.chdir("..");
});
process.chdir("../dist");
directories.forEach((directory) => {
  execSync(`npm pack ../packages/${directory}`);
});
