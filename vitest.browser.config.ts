/**
 * Real-browser tier: geometry, caret, click placement, and contenteditable
 * behaviour run in actual WebKit — the engine the editor's first host ships on.
 *
 * Suites end in `.browser.test.ts` and are excluded from the default run.
 * Needs the WebKit binary once: `pnpm exec playwright install webkit`.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  optimizeDeps: { include: ["@amiceli/vitest-cucumber"] },
  test: {
    include: ["**/*.browser.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    browser: {
      enabled: true,
      provider: "playwright",
      headless: true,
      screenshotFailures: false,
      instances: [{ browser: "webkit" }],
    },
  },
});
