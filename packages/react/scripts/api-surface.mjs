/**
 * The names a built package exports, per module path, for values (`.js`) and
 * types (`.d.ts`). A module that exports another's again is followed into it,
 * so a forwarding module lists what its target lists.
 *
 *   node scripts/api-surface.mjs record <dist> <out.json>
 *   node scripts/api-surface.mjs check  <dist> <baseline.json>
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const CORE = "@latentic/live-markdown-core";
const CORE_DIST = resolve(import.meta.dirname, "../../core/dist");

function files(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files(path, found);
    else found.push(path);
  }
  return found;
}

/** The file a specifier names, or null for a package outside this build. */
function target(fromFile, specifier, extension) {
  if (specifier.startsWith(".")) return resolve(dirname(fromFile), specifier).replace(/\.js$/, "") + extension;
  if (specifier === CORE) return join(CORE_DIST, `index${extension}`);
  if (specifier.startsWith(`${CORE}/`)) return join(CORE_DIST, specifier.slice(CORE.length + 1) + extension);
  return null;
}

const listed = (names) =>
  names
    .split(",")
    .map((name) => name.trim().replace(/^type\s+/, ""))
    .filter(Boolean)
    .map((name) => name.split(/\s+as\s+/).pop());

function exportsOf(file, extension, seen = new Set()) {
  if (seen.has(file) || !existsSync(file)) return [];
  seen.add(file);
  const source = readFileSync(file, "utf8");
  const names = [];
  for (const [, body, from] of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}(?:\s*from\s*["']([^"']+)["'])?/g)) {
    void from;
    names.push(...listed(body));
  }
  for (const [, name] of source.matchAll(/export\s+(?:declare\s+)?(?:const|let|function\*?|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) {
    names.push(name);
  }
  if (/export\s+default\b/.test(source)) names.push("default");
  for (const [, specifier] of source.matchAll(/export\s+\*\s+from\s*["']([^"']+)["']/g)) {
    const next = target(file, specifier, extension);
    names.push(...(next ? exportsOf(next, extension, seen).filter((name) => name !== "default") : [`* from ${specifier}`]));
  }
  return [...new Set(names)].sort();
}

function surface(dist) {
  const modules = {};
  for (const file of files(dist).sort()) {
    const extension = file.endsWith(".d.ts") ? ".d.ts" : file.endsWith(".js") ? ".js" : null;
    if (!extension) continue;
    modules[relative(dist, file).split("\\").join("/")] = exportsOf(file, extension);
  }
  return modules;
}

const [mode, dist, path] = process.argv.slice(2);
const now = surface(dist);
if (mode === "record") {
  writeFileSync(path, `${JSON.stringify(now, null, 1)}\n`);
  console.log(`api-surface: recorded ${Object.keys(now).length} modules`);
} else {
  const before = JSON.parse(readFileSync(path, "utf8"));
  const missing = [];
  for (const [module, names] of Object.entries(before)) {
    if (!now[module]) missing.push(`${module}: the module is gone`);
    else for (const name of names) if (!now[module].includes(name)) missing.push(`${module}: ${name}`);
  }
  if (missing.length > 0) {
    console.error(`api-surface: ${missing.length} exports of ${path} are missing\n  ${missing.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`api-surface: every export of ${Object.keys(before).length} modules in ${path} is still there`);
}
