/**
 * Default tier: jsdom and node. Suites that need layout — geometry, caret,
 * click placement, contenteditable — end in `.browser.test.ts` and run in real
 * WebKit instead (`vitest.browser.config.ts`), because jsdom has no layout
 * engine and green-lights all of it silently.
 *
 * `environment: "node"` is the default; a suite that needs a DOM declares
 * `// @vitest-environment jsdom` at its top.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/*.browser.test.ts",
    ],
  },
});
