/**
 * Give this package every module path the core has.
 *
 * The package was one before it was two, and its modules were importable by
 * path (`@latentic/live-markdown/cm/state`, `…/codemirror/editingStack`).
 * Each of those paths stays, as a module that exports the core's again, so
 * there is one copy of the code whichever package a host names. A path this
 * package builds itself is left as built.
 */
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const CORE = "@latentic/live-markdown-core";
const CORE_DIST = "../core/dist";

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

if (!existsSync(join(CORE_DIST, "index.js"))) {
  console.error("forward-core: build the core first");
  process.exit(1);
}

let forwarded = 0;
for await (const file of walk(CORE_DIST)) {
  if (!file.endsWith(".js")) continue;
  const module = relative(CORE_DIST, file).slice(0, -".js".length).split("\\").join("/");
  const target = join("dist", `${module}.js`);
  if (existsSync(target)) continue;
  const hasDefault = /export\s+default\b|\bas\s+default\b/.test(await readFile(file, "utf8"));
  const source = `export * from "${CORE}/${module}";\n${hasDefault ? `export { default } from "${CORE}/${module}";\n` : ""}`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, source);
  await writeFile(join("dist", `${module}.d.ts`), source);
  forwarded += 1;
}
await copyFile(join(CORE_DIST, "styles.css"), "dist/styles.css");
console.log(`forward-core: ${forwarded} modules forwarded`);
