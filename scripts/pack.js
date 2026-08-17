import { execSync } from "child_process";
import { readFileSync, readdirSync } from "fs";

// Every directory under packages/ gets built and packed. The list is the
// filesystem, so a new package is included the day it appears.
const directories = readdirSync("./packages", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

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
