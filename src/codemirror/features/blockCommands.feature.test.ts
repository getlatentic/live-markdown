// @vitest-environment jsdom
/// <reference types="vite/client" />
import { describeFeature, loadFeatureFromText } from "@amiceli/vitest-cucumber";
import { afterEach } from "vitest";

import { destroyEditors } from "../decorations/editorTestHarness";
import { defineBlockSteps, protectMarkdown } from "./blockCommandSteps";

defineBlockSteps();
afterEach(destroyEditors);


// Vite resolves and inlines each sibling `.feature` file's text at transform time
// (robust under vitest, where runtime paths are virtual). Each scenario draws
// from the shared step pool, so a new behaviour is just a scenario in a
// `.feature` file — no test code to touch.
const featureFiles = import.meta.glob("./*.feature", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

for (const content of Object.values(featureFiles)) {
  const feature = loadFeatureFromText(protectMarkdown(content));
  describeFeature(feature, ({ Scenario }) => {
    for (const scenario of feature.scenarii) {
      Scenario(scenario.description, () => {});
    }
  });
}
