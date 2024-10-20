import { execSync } from "child_process";

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
