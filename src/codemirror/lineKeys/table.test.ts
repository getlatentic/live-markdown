import { describe, expect, it } from "vitest";

import { ACTIONS } from "./actions";
import type { CaretAt, LineKind } from "./lineKind";
import { actionFor, TABLE, type LineKeyName } from "./table";

const KINDS: LineKind[] = [
  "none", "empty", "gap", "quoteGap", "paragraph", "indented", "heading", "bullet", "ordered", "task", "nested",
  "nestedTask", "continuation", "lazy", "quote", "lazyQuote", "indentedQuote", "fence", "code", "table",
];
const PLACES: CaretAt[] = ["blank", "start", "middle", "end", "marker"];
const KEYS = Object.keys(TABLE) as LineKeyName[];

describe("the line-key table", () => {
  it("names an action that exists for every key in every state", () => {
    for (const key of KEYS) {
      for (const line of KINDS) {
        for (const above of KINDS) {
          for (const at of PLACES) expect(ACTIONS[actionFor(key, line, above, at)], `${key} ${above}/${line}@${at}`).toBeTypeOf("function");
        }
      }
    }
  });

  it.each<[LineKeyName, LineKind, LineKind, CaretAt, string]>([
    ["Backspace", "bullet", "bullet", "start", "markerToIndent"],
    ["Backspace", "bullet", "paragraph", "start", "removeMarker"],
    ["Backspace", "bullet", "bullet", "blank", "removeMarker"],
    ["Backspace", "heading", "empty", "start", "closeGapAbove"],
    ["Backspace", "heading", "paragraph", "start", "joinHeadingAbove"],
    ["Backspace", "heading", "none", "start", "removeMarker"],
    ["Backspace", "continuation", "bullet", "start", "removeIndent"],
    ["Backspace", "paragraph", "paragraph", "start", "deleteBefore"],
    ["Backspace", "bullet", "bullet", "middle", "deleteBefore"],
    ["Enter", "bullet", "bullet", "blank", "leaveList"],
    ["Enter", "nested", "bullet", "blank", "outdentItem"],
    ["Enter", "bullet", "bullet", "end", "newItem"],
    ["Enter", "ordered", "paragraph", "start", "openItemAbove"],
    ["Enter", "task", "task", "start", "splitTask"],
    ["Enter", "heading", "paragraph", "start", "moveHeadingDown"],
    ["Enter", "continuation", "bullet", "start", "openLineAbove"],
    ["Enter", "paragraph", "paragraph", "middle", "stock"],
    ["Tab", "bullet", "bullet", "middle", "indentItem"],
    ["Tab", "paragraph", "none", "start", "nothing"],
    ["Tab", "code", "fence", "start", "stock"],
    ["Shift-Tab", "nested", "bullet", "start", "outdentItem"],
  ])("%s on %s under %s at %s is %s", (key, line, above, at, action) => {
    expect(actionFor(key, line, above, at)).toBe(action);
  });
});
