// @vitest-environment jsdom
/// <reference types="vite/client" />
import { describeFeature, loadFeatureFromText } from "@amiceli/vitest-cucumber";
import { afterEach } from "vitest";

import { destroyEditors } from "../decorations/editorTestHarness";
import { ZWSP, defineBlockSteps } from "./blockCommandSteps";

defineBlockSteps();
afterEach(destroyEditors);

// The cucumber parser treats a `#`-leading line as a comment and a `"""`/``` line
// as a doc-string delimiter — even *inside* a doc string — and it strips each
// content line's leading whitespace, which would also flatten the *relative*
// indent that list-nesting scenarios assert. So for every doc-string content
// line: strip the doc string's own base indent (the opening `"""` column), then
// prefix a zero-width space at column 0. The ZWSP is now the first character, so
// the parser strips nothing (relative indent survives) and reads no `#`/`"""`/```
// as syntax; the steps drop the ZWSP back out. Source `.feature` files stay clean.
function protectMarkdown(raw: string): string {
  let insideDocString = false;
  let baseIndent = 0;
  return raw
    .split("\n")
    .map((line) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('"""')) {
        if (!insideDocString) baseIndent = line.length - trimmed.length;
        insideDocString = !insideDocString;
        return line;
      }
      if (!insideDocString) return line;
      const dedented = line.startsWith(" ".repeat(baseIndent))
        ? line.slice(baseIndent)
        : trimmed;
      return ZWSP + dedented;
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
