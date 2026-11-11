/**
 * The line-key table: for a key pressed with a caret, which action runs on
 * each kind of line. This is the editor's rule for the key, not a record of
 * it: {@link lineKey} looks the action up here and runs it.
 *
 * A row is a kind of line. A cell is a place of the caret in that line, and
 * holds one action, or one per kind of line above. `else` covers what a row
 * or a cell does not name, so every state has exactly one action.
 */

import type { CaretAt, LineKind } from "./lineKind";

export type LineKeyName = "Backspace" | "Enter" | "Tab" | "Shift-Tab";

export type Action =
  // Backspace
  | "deleteBefore" // the visible character before the caret, or join the line above
  | "removeMarker" // the line becomes plain text where it stands
  | "markerToIndent" // the item's text stays in the item above
  | "removeIndent" // an item's further line moves to the margin
  | "closeGapAbove" // the empty line above goes, the heading stays
  | "joinHeadingAbove" // the heading joins the line above and takes its kind
  // Enter
  | "splitTask" // an empty unchecked item above, the text below
  | "leaveList" // an empty item becomes an empty line
  | "newItem" // the next item, directly below
  | "openItemAbove" // an empty item above, after an empty line
  | "openLineAbove" // an empty line above an item's further line
  | "moveHeadingDown" // an empty line above the heading
  // Tab, Shift-Tab
  | "indentItem"
  | "outdentItem"
  | "nothing" // the key is taken and changes nothing
  // Left to the bindings below this table: CodeMirror's markdown and stock keys.
  | "stock";

type ByAbove = Partial<Record<LineKind, Action>> & { else: Action };
type Cell = Action | ByAbove;
type Row = Partial<Record<CaretAt, Cell>> & { else: Cell };
type KeyTable = Partial<Record<LineKind, Row>> & { else: Row };

const all = (kinds: LineKind[], action: Action): Partial<Record<LineKind, Action>> =>
  Object.fromEntries(kinds.map((kind) => [kind, action]));

/** Lines an item's text can stay under once its marker is gone. */
const IN_A_LIST: LineKind[] = ["bullet", "ordered", "task", "nested", "nestedTask", "continuation", "lazy", "gap"];
/** Text that is not part of a list: an empty item cannot begin a list under it. */
const PLAIN_TEXT: LineKind[] = ["paragraph", "indented", "quote", "lazyQuote", "indentedQuote", "table"];
const EMPTY: LineKind[] = ["empty", "gap", "quoteGap"];

const itemBackspace: Row = {
  start: { ...all(IN_A_LIST, "markerToIndent"), else: "removeMarker" },
  blank: "removeMarker",
  else: "deleteBefore",
};

const headingBackspace: Cell = { none: "removeMarker", ...all(EMPTY, "closeGapAbove"), else: "joinHeadingAbove" };

const itemEnter: Row = {
  start: { ...all(PLAIN_TEXT, "openItemAbove"), else: "stock" },
  blank: "leaveList",
  end: "newItem",
  else: "stock",
};

const blockKeys: Row = { else: "stock" };

function listKeys(action: Action): KeyTable {
  const item: Row = { else: action };
  return { bullet: item, ordered: item, task: item, nested: item, nestedTask: item, code: blockKeys, fence: blockKeys, table: blockKeys, else: { else: "nothing" } };
}

export const TABLE: Record<LineKeyName, KeyTable> = {
  Backspace: {
    bullet: itemBackspace,
    ordered: itemBackspace,
    task: itemBackspace,
    nested: itemBackspace,
    nestedTask: itemBackspace,
    heading: { start: headingBackspace, blank: headingBackspace, else: "deleteBefore" },
    continuation: { start: "removeIndent", else: "deleteBefore" },
    else: { else: "deleteBefore" },
  },
  Enter: {
    bullet: itemEnter,
    ordered: itemEnter,
    nested: { ...itemEnter, blank: "outdentItem" },
    task: { start: "splitTask", blank: "leaveList", else: "stock" },
    nestedTask: { start: "splitTask", blank: "outdentItem", else: "stock" },
    continuation: { start: "openLineAbove", else: "stock" },
    heading: { start: "moveHeadingDown", else: "stock" },
    else: { else: "stock" },
  },
  Tab: listKeys("indentItem"),
  "Shift-Tab": listKeys("outdentItem"),
};

export function actionFor(key: LineKeyName, line: LineKind, above: LineKind, at: CaretAt): Action {
  const row = TABLE[key][line] ?? TABLE[key].else;
  const cell = row[at] ?? row.else;
  return typeof cell === "string" ? cell : (cell[above] ?? cell.else);
}
