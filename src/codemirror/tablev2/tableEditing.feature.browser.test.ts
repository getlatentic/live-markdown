/**
 * Runs the ADR 0001 interaction contract —
 * features/browser/table-editing.feature — in real WebKit. Scenario bodies are
 * empty: every step resolves from the shared pool in tableEditingSteps.ts, so
 * the feature file stays the single executable source of truth.
 */

import { describeFeature, loadFeatureFromText } from "@amiceli/vitest-cucumber";
import { afterAll } from "vitest";

import { protectMarkdown } from "../features/blockCommandSteps";
import featureText from "../features/browser/table-editing.feature?raw";
import { cleanupTableSteps, defineTableSteps } from "./tableEditingSteps";

defineTableSteps();
// Each STEP is its own test in this runner, so per-test hooks would tear the
// editor down mid-scenario. The Background resets state at scenario start;
// afterAll sweeps the last one.
afterAll(cleanupTableSteps);

const feature = loadFeatureFromText(protectMarkdown(featureText));

describeFeature(feature, ({ Background, Scenario }) => {
  Background(() => {});
  for (const scenario of feature.scenarii) {
    Scenario(scenario.description, () => {});
  }
});
