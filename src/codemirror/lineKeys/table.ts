/**
 * The line-key table: for a key pressed with a caret, which action runs on
 * each kind of line. This is the editor's rule for the key, not a record of
 * it: {@link lineKey} looks the action up here and runs it.
 *
 * A row is a kind of line. A cell is a place of the caret in that line, and
 * holds one action, or one per kind of line beside it. `else` covers what a
 * row or a cell does not name, so every state has exactly one action.
 */

import type { CaretAt, LineKind } from "./lineKind";

export type LineKeyName =
  | "Backspace"
  | "Delete"
  | "Enter"
  | "Tab"
  | "Shift-Tab"
  // A marker and its space, typed where a line's own marker ends.
  | "TypeHeading"
  | "TypeBullet"
  | "TypeOrdered"
  | "TypeQuote";

export type Action =
  // Backspace
  | "deleteBefore" // the visible character before the caret, or join the line above
  | "removeMarker" // the line becomes plain text where it stands
  | "markerToIndent" // the item's text stays in the item above
  | "removeIndent" // an item's further line moves to the margin
  | "closeGapAbove" // the empty line above goes, the heading stays
  | "joinHeadingAbove" // the heading joins the line above and takes its kind
  | "parkAtTable" // the caret goes to the table's end; from there, the table goes (§8.4)
  // Delete
  | "deleteAfter" // the visible character after the caret, or join the line below
  // Enter
  | "splitTask" // an empty unchecked item above, the text below
  | "leaveList" // an empty item becomes an empty line
  | "newItem" // the next item, directly below
  | "openItemAbove" // an empty item above, after an empty line
  | "openLineAbove" // an empty line above an item's further line
  | "moveHeadingDown" // an empty line above the heading
  // A typed marker
  | "replaceMarker" // the line takes the kind of the marker typed
  // Tab, Shift-Tab
  | "indentItem"
  | "outdentItem"
  | "nothing" // the key is taken and changes nothing
  // Enter where the line splits or a new one opens. These two run
  // CodeMirror's own commands, by name: the table decides that they run.
  | "continueMarkup" // the new line carries on the list, the quote or the indent
  | "newline" // a new line, at the indent of this one
  // Not a line key here.
  | "typeText" // the typed character is text
  | "blockRule"; // inside a code block or a table, which have rules of their own

type ByBeside<A> = Partial<Record<LineKind, A>> & { else: A };
type Cell<A> = A | ByBeside<A>;
type Row<A = Action> = Partial<Record<CaretAt, Cell<A>>> & { else: Cell<A> };
/** Rows by the caret's line; a cell may split by the line beside it, which
 *  is the line below for Delete and the line above for every other key. */
export type KeyTable<A = Action> = Partial<Record<LineKind, Row<A>>> & { else: Row<A> };

const all = <A extends string>(kinds: LineKind[], action: A): Partial<Record<LineKind, A>> =>
  Object.fromEntries(kinds.map((kind) => [kind, action])) as Partial<Record<LineKind, A>>;

/** Lines an item's text can stay under once its marker is gone. */
const IN_A_LIST: LineKind[] = ["bullet", "ordered", "task", "nested", "nestedTask", "continuation", "lazy", "gap"];
/** Text that is not part of a list: an empty item cannot begin a list under it. */
const PLAIN_TEXT: LineKind[] = ["paragraph", "indented", "quote", "lazyQuote", "indentedQuote", "table"];
const EMPTY: LineKind[] = ["empty", "gap", "quoteGap"];
/** A table, or the empty lines after one: nothing but space up to the table. */
const AFTER_TABLE = all(["table", "tableGap"], "parkAtTable");

const itemBackspace: Row = {
  start: { ...all(IN_A_LIST, "markerToIndent"), else: "removeMarker" },
  blank: "removeMarker",
  else: "deleteBefore",
};

const headingBackspace: Cell<Action> = { none: "removeMarker", ...AFTER_TABLE, ...all(EMPTY, "closeGapAbove"), else: "joinHeadingAbove" };

/** Text with nothing in front of it on its line: only space stands between
 *  the caret and a table above. */
const textBackspace: Row = { start: { ...AFTER_TABLE, else: "deleteBefore" }, else: "deleteBefore" };

const itemEnter: Row = {
  start: { ...all(PLAIN_TEXT, "openItemAbove"), else: "continueMarkup" },
  blank: "leaveList",
  end: "newItem",
  else: "continueMarkup",
};

const continued: Row = { else: "continueMarkup" };
const plain: Row = { else: "newline" };

const blockKeys: Row = { else: "blockRule" };

function listKeys(action: Action): KeyTable {
  const item: Row = { else: action };
  return { bullet: item, ordered: item, task: item, nested: item, nestedTask: item, code: blockKeys, fence: blockKeys, table: blockKeys, else: { else: "nothing" } };
}

/** A marker typed at the start of the text of these kinds of line replaces
 *  the line's own. */
function typedOver(kinds: LineKind[]): KeyTable {
  const replace: Row = { start: "replaceMarker", else: "typeText" };
  return { ...Object.fromEntries(kinds.map((kind) => [kind, replace])), else: { else: "typeText" } };
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
    paragraph: textBackspace,
    indented: textBackspace,
    tableGap: { else: "parkAtTable" },
    table: { else: "parkAtTable" },
    else: { else: "deleteBefore" },
  },
  Delete: { else: { else: "deleteAfter" } },
  Enter: {
    bullet: itemEnter,
    ordered: itemEnter,
    nested: { ...itemEnter, blank: "outdentItem" },
    task: { start: "splitTask", blank: "leaveList", else: "continueMarkup" },
    nestedTask: { start: "splitTask", blank: "outdentItem", else: "continueMarkup" },
    continuation: { start: "openLineAbove", else: "continueMarkup" },
    lazy: continued,
    gap: continued,
    quote: continued,
    lazyQuote: continued,
    indentedQuote: continued,
    quoteGap: continued,
    // A heading can stand in a quote, which the new line carries on.
    heading: { start: "moveHeadingDown", else: "continueMarkup" },
    paragraph: plain,
    indented: plain,
    empty: plain,
    tableGap: plain,
    code: blockKeys,
    fence: blockKeys,
    table: blockKeys,
    else: plain,
  },
  Tab: listKeys("indentItem"),
  "Shift-Tab": listKeys("outdentItem"),
  // The same kind typed again is text; a heading's level is the exception.
  TypeHeading: typedOver(["bullet", "ordered", "task", "heading"]),
  TypeBullet: typedOver(["ordered", "task", "heading"]),
  TypeOrdered: typedOver(["bullet", "task", "heading"]),
  TypeQuote: typedOver(["bullet", "ordered", "task", "heading"]),
};

/** What a completed code fence does to the line it was typed on. */
export type FenceAction = "closeFence" | "wrapLine" | "typeText";

/** `blank`: the fence is all the line holds. `start`: text follows it. */
export const FENCE: KeyTable<FenceAction> = {
  code: { else: "typeText" },
  fence: { else: "typeText" },
  table: { else: "typeText" },
  else: { blank: "closeFence", start: "wrapLine", else: "typeText" },
};

export function lookup<A extends string>(table: KeyTable<A>, line: LineKind, beside: LineKind, at: CaretAt): A {
  const row = table[line] ?? table.else;
  const cell = row[at] ?? row.else;
  return typeof cell === "string" ? cell : (cell[beside] ?? cell.else);
}

export const actionFor = (key: LineKeyName, line: LineKind, beside: LineKind, at: CaretAt): Action => lookup(TABLE[key], line, beside, at);
