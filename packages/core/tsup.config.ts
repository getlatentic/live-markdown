import { defineConfig } from "tsup";

export default defineConfig({
  // Every source module is its own entry, and nothing is bundled: the package
  // ships a mirror of `src/` rather than one 216KB module.
  //
  // A single bundled module is opaque to a consumer's tree-shaker at the
  // granularity that matters. Reaching for one link helper retained the file it
  // was bundled with, and with it `yaml`, `dompurify` and the whole CodeMirror
  // surface — half a megabyte in an app that only wanted to resolve a wikilink.
  // Per-module output lets the consumer's bundler follow the real graph.
  entry: ["src/**/*.ts", "src/**/*.tsx", "!src/**/*.test.*", "!src/**/*.spec.*"],
  bundle: false,
  // ESM only — this is a modern React/CodeMirror package; both ecosystems are
  // ESM-first and the editor is browser-targeted.
  format: ["esm"],
  // Emit `.d.ts` beside each module.
  dts: true,
  sourcemap: true,
  clean: true,
});
