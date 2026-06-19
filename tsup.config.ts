import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  // ESM only — this is a modern React/CodeMirror package; both ecosystems are
  // ESM-first and the editor is browser-targeted.
  format: ["esm"],
  // Emit `dist/index.d.ts` from the TypeScript sources.
  dts: true,
  sourcemap: true,
  clean: true,
  // react / react-dom (peers) and @codemirror/* / katex / dompurify / yaml
  // (deps) are externalized automatically from package.json — never bundled.
  treeshake: true,
});
