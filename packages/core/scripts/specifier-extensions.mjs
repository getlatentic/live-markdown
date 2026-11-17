/**
 * Give relative import specifiers a real file extension in the built output.
 *
 * The sources import extensionless (`./links/wikilink`, `./codemirror/format`),
 * which TypeScript and every bundler resolve — the second of those against a
 * directory's `index`. Unbundled output has to carry specifiers that resolve
 * without that guesswork, so this rewrites them once, after the build, by
 * looking at what was actually emitted.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

const RELATIVE_SPECIFIER =
  /(\bfrom\s*["']|\bimport\s*\(\s*["']|\bexport\s+\*\s+from\s*["']|\bimport\s*["'])(\.\.?\/[^"']*)(["'])/g;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

/** The emitted file a specifier means: the module itself, or its directory's
 *  index. Anything else is left alone and will fail loudly at resolve time
 *  rather than silently. */
function resolved(fromFile, specifier, declaration) {
  const base = resolve(dirname(fromFile), specifier);
  const source = declaration ? ".d.ts" : ".js";
  if (existsSync(base + source)) return `${specifier}.js`;
  if (existsSync(join(base, `index${source}`))) return `${specifier}/index.js`;
  return null;
}

let rewritten = 0;
const unresolved = [];
for await (const file of walk("dist")) {
  if (![".js", ".ts", ".mjs"].includes(extname(file))) continue;
  const declaration = file.endsWith(".d.ts");
  const source = await readFile(file, "utf8");
  const next = source.replace(RELATIVE_SPECIFIER, (match, open, specifier, close) => {
    if (extname(specifier)) return match;
    const target = resolved(file, specifier, declaration);
    if (!target) {
      unresolved.push(`${file} → ${specifier}`);
      return match;
    }
    return `${open}${target}${close}`;
  });
  if (next !== source) {
    await writeFile(file, next);
    rewritten += 1;
  }
}

console.log(`specifier-extensions: rewrote ${rewritten} files`);
if (unresolved.length > 0) {
  console.error(`specifier-extensions: ${unresolved.length} unresolved specifiers`);
  for (const entry of unresolved.slice(0, 20)) console.error(`  ${entry}`);
  process.exit(1);
}
