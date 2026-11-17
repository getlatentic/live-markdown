import { defineConfig } from "tsup";

export default defineConfig({
  // One module per source file, as the core is built (see its config).
  entry: ["src/**/*.ts", "src/**/*.tsx", "!src/**/*.test.*"],
  bundle: false,
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  tsconfig: "tsconfig.build.json",
});
