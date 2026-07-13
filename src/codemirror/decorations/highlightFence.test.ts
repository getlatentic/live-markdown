// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { languages } from "@codemirror/language-data";

import { highlightFenceSpans } from "./highlightFence";

describe("highlightFenceSpans", () => {
  it("returns inline-styled spans once the grammar is loaded (the sync path)", async () => {
    await languages.find((l) => l.name === "JavaScript")!.load();

    const spans = highlightFenceSpans("js", "const x = 'hi' // note");

    expect(spans).not.toBeNull();
    const keyword = spans!.find((span) => span.text === "const");
    expect(keyword?.style).toContain("color:#a626a4");
    const string = spans!.find((span) => span.text === "'hi'");
    expect(string?.style).toContain("color:#50a14f");
    const comment = spans!.find((span) => span.text === "// note");
    expect(comment?.style).toContain("font-style:italic");
    // Round-trip: concatenated spans reproduce the source exactly.
    expect(spans!.map((s) => s.text).join("")).toBe("const x = 'hi' // note");
  });

  it("returns null for an unknown language", () => {
    expect(highlightFenceSpans("nosuchlang", "x")).toBeNull();
  });

  it("returns null (and kicks the load) for a not-yet-loaded grammar", () => {
    // Erlang is obscure enough that nothing else in the suite loads it.
    const cold = languages.find((l) => l.name === "Erlang")!;
    expect(cold.support).toBeUndefined();
    expect(highlightFenceSpans("erlang", "x")).toBeNull();
  });
});
