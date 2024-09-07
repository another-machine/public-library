import { execSync } from "child_process";
import fs from "fs";

const directories = [
  // "ampl-command-bar",
  "ampl-lexicon",
  "ampl-midi",
  // "ampl-music-detection",
  "ampl-music-theory",
  "ampl-procedural-generation",
  // "ampl-sound-synthesis",
  "ampl-steganography",
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
