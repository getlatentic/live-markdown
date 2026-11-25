import { describe, expect, it } from "vitest";

import { mermaidField } from "../mermaid/mermaidPlugin";
import { parsedState } from "./randomEdits";

describe("parsedState", () => {
  it("gives fields the finished parse, past what EditorState.create parses up front", () => {
    const doc = `${"A paragraph of filler text.\n\n".repeat(400)}\`\`\`mermaid\nflowchart TD\n  A --> B\n\`\`\`\n`;
    const state = parsedState(doc, [mermaidField]);
    expect(state.field(mermaidField).fences.size).toBe(1);
  });
});
