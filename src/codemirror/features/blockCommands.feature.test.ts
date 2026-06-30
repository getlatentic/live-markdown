// @vitest-environment jsdom
/// <reference types="vite/client" />
import { describeFeature, loadFeatureFromText } from "@amiceli/vitest-cucumber";
import { afterEach } from "vitest";

import { destroyEditors } from "../decorations/editorTestHarness";
import { ZWSP, defineBlockSteps } from "./blockCommandSteps";

defineBlockSteps();
afterEach(destroyEditors);

// The cucumber parser treats a `#`-leading line as a comment and a `"""`/``` line
// as a doc-string delimiter — even *inside* a doc string — which mangles literal
// markdown (headings, code fences). Prefix every doc-string content line with a
// zero-width space so none of those line-start checks fire (`.trim()` leaves it,
// it isn't `#`/`"""`/```); the steps strip it back out. Source `.feature` files
// stay clean markdown.
function protectMarkdown(raw: string): string {
  let insideDocString = false;
  return raw
    .split("\n")
    .map((line) => {
      if (line.trimStart().startsWith('"""')) {
        insideDocString = !insideDocString;
        return line;
      }
      return insideDocString ? line.replace(/^(\s*)/, `$1${ZWSP}`) : line;
    })
    .join("\n");
}

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
