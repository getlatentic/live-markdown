import { describe, expect, it } from "vitest";

import { ACTIONS } from "./actions";
import type { CaretAt, LineKind } from "./lineKind";
import { actionsFor, TABLE, type LineKeyName } from "./table";

const KINDS: LineKind[] = [
  "none", "empty", "gap", "quoteGap", "tableGap", "paragraph", "indented", "heading", "bullet", "ordered", "task", "nested",
  "nestedOrdered", "nestedTask", "quotedItem", "quotedOrdered", "quotedTask", "continuation", "lazy", "quote", "lazyQuote", "indentedQuote", "fence", "code", "table",
];
const PLACES: CaretAt[] = ["blank", "start", "middle", "end", "marker", "number", "selection"];
const KEYS = Object.keys(TABLE) as LineKeyName[];

describe("the line-key table", () => {
  it("names an action that exists for every key in every state", () => {
    for (const key of KEYS) {
      for (const line of KINDS) {
        for (const above of KINDS) {
          for (const at of PLACES) {
            const actions = actionsFor(key, line, above, at);
            expect(actions.length, `${key} ${above}/${line}@${at}`).toBeGreaterThan(0);
            for (const action of actions) expect(ACTIONS[action], `${key} ${above}/${line}@${at}`).toBeTypeOf("function");
          }
        }
      }
    }
  });

  it.each<[LineKeyName, LineKind, LineKind, CaretAt, string]>([
    ["Backspace", "bullet", "bullet", "start", "markerToIndent, removeMarker"],
    ["Backspace", "heading", "fence", "start", "parkAtFence"],
    ["Backspace", "table", "paragraph", "end", "parkAtTable"],
    ["Backspace", "table", "paragraph", "middle", "deleteBefore"],
    ["Backspace", "bullet", "paragraph", "selection", "deleteSelection"],
    ["Delete", "code", "code", "selection", "deleteSelection"],
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
    ["Enter", "bullet", "bullet", "end", "splitItem"],
    ["Enter", "quotedItem", "quote", "middle", "splitItem"],
    ["Enter", "bullet", "paragraph", "selection", "splitItem"],
    ["Enter", "lazy", "bullet", "middle", "newline"],
    ["Enter", "ordered", "paragraph", "start", "openItemAbove"],
    ["Enter", "task", "task", "start", "splitTask"],
    ["Enter", "heading", "paragraph", "start", "moveHeadingDown"],
    ["Enter", "continuation", "bullet", "start", "openLineAbove"],
    ["Enter", "paragraph", "paragraph", "middle", "newline"],
    ["Enter", "quote", "paragraph", "middle", "continueQuote"],
    ["Enter", "paragraph", "paragraph", "selection", "newline"],
    ["Enter", "code", "fence", "middle", "blockRule"],
    ["Delete", "paragraph", "bullet", "end", "deleteAfter"],
    ["Backspace", "paragraph", "table", "start", "parkAtTable"],
    ["Backspace", "ordered", "ordered", "number", "deleteBefore"],
    ["TypeHeading", "bullet", "none", "start", "replaceMarker"],
    ["TypeBullet", "bullet", "none", "start", "typeText"],
    ["Tab", "bullet", "bullet", "middle", "indentItem"],
    ["Tab", "bullet", "bullet", "selection", "indentItem"],
    ["Tab", "paragraph", "none", "start", "nothing"],
    ["Tab", "code", "fence", "start", "blockRule"],
    ["Shift-Tab", "nested", "bullet", "start", "outdentItem"],
  ])("%s on %s under %s at %s is %s", (key, line, above, at, action) => {
    expect(actionsFor(key, line, above, at).join(", ")).toBe(action);
  });
});
