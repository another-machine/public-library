import { execSync } from "child_process";

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
];

process.chdir("./packages");
directories.forEach((directory) => {
  process.chdir(`./${directory}`);
  execSync(`npm run build`);
  process.chdir("..");
});
process.chdir("../dist");
directories.forEach((directory) => {
  execSync(`npm pack ../packages/${directory}`);
});
