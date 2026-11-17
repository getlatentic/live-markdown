import { defineConfig } from "vitest/config";

// The core as its source, so the tests run what is in the tree, not a build.
const conditions = ["@latentic/source"];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: { environment: "node", globals: true, exclude: ["**/node_modules/**", "**/dist/**"] },
});
