/**
 * The line-key table: for a key pressed with a caret, which action runs on
 * each kind of line. This is the editor's rule for the key, not a record of
 * it: {@link lineKey} looks the action up here and runs it.
 *
 * A row is a kind of line. A cell is a place of the caret in that line, and
 * holds one action, or one per kind of line beside it. `else` covers what a
 * row or a cell does not name, so every state has exactly one answer.
 *
 * With a selection the place is `selection`, the row is the line the
 * selection starts on, and the line beside it is the line it ends on.
 *
 * An answer may be a list of actions: the first that applies runs.
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
  | "parkAtFence" // the caret goes beside the code block above, which stays whole (§12.2)
  | "deleteSelection" // the selected visible text goes
  // Delete
  | "deleteAfter" // the visible character after the caret, or join the line below
  // Enter. An action that splits a line replaces the selection, when there is one.
  | "splitItem" // the text after the caret becomes the next item, directly below
  | "splitTask" // an empty unchecked item above, the text below
  | "leaveList" // an empty item becomes an empty line
  | "continueQuote" // the new line is in the quote
  | "newline" // the new line starts as this one does: its indent, the quote it is in
  | "openItemAbove" // an empty item above, after an empty line
  | "openLineAbove" // an empty line above an item's further line
  | "moveHeadingDown" // an empty line above the heading
  // A typed marker
  | "replaceMarker" // the line takes the kind of the marker typed
  // Tab, Shift-Tab
  | "indentItem"
  | "outdentItem"
  | "nothing" // the key is taken and changes nothing
  // Not a line key here.
  | "typeText" // the typed character is text
  | "blockRule"; // inside a code block or a table, which have rules of their own

/** One action, or several: the first that applies runs. */
type Answer<A> = A | readonly A[];
type ByBeside<A> = Partial<Record<LineKind, Answer<A>>> & { else: Answer<A> };
type Cell<A> = Answer<A> | ByBeside<A>;
type Row<A = Action> = Partial<Record<CaretAt, Cell<A>>> & { else: Cell<A> };
/** Rows by the caret's line; a cell may split by the line beside it, which
 *  is the line below for Delete and the line above for every other key. */
export type KeyTable<A = Action> = Partial<Record<LineKind, Row<A>>> & { else: Row<A> };

const all = <A extends string>(kinds: LineKind[], action: Answer<A>): Partial<Record<LineKind, Answer<A>>> =>
  Object.fromEntries(kinds.map((kind) => [kind, action])) as Partial<Record<LineKind, Answer<A>>>;

const TASKS: LineKind[] = ["task", "nestedTask", "quotedTask"];
const ITEMS: LineKind[] = ["bullet", "ordered", "nested", "nestedOrdered", "quotedItem", "quotedOrdered", ...TASKS];

/** Lines an item's text can stay under once its marker is gone. */
const IN_A_LIST: LineKind[] = [...ITEMS, "continuation", "lazy", "gap"];
/** Text that is not part of a list: an empty item cannot begin a list under it. */
const PLAIN_TEXT: LineKind[] = ["paragraph", "indented", "quote", "lazyQuote", "indentedQuote", "table"];
const EMPTY: LineKind[] = ["empty", "gap", "quoteGap"];
/** A table, or the empty lines after one: nothing but space up to the table. */
const AFTER_TABLE = all(["table", "tableGap"], "parkAtTable");

/** The marker becomes an indent where the text then still reads as part of
 *  the item above, which the item's own indent and a gap can prevent. */
const itemBackspace: Row = {
  start: { ...all<Action>(IN_A_LIST, ["markerToIndent", "removeMarker"]), else: "removeMarker" },
  blank: "removeMarker",
  else: "deleteBefore",
};

const headingBackspace: Cell<Action> = { none: "removeMarker", fence: "parkAtFence", ...AFTER_TABLE, ...all(EMPTY, "closeGapAbove"), else: "joinHeadingAbove" };

/** Text with nothing in front of it on its line: only space stands between
 *  the caret and a table above. */
const textBackspace: Row = { start: { ...AFTER_TABLE, else: "deleteBefore" }, else: "deleteBefore" };

const itemEnter: Row = {
  start: { ...all(PLAIN_TEXT, "openItemAbove"), else: "splitItem" },
  blank: "leaveList",
  else: "splitItem",
};

const quoted: Row = { else: "continueQuote" };
const plain: Row = { else: "newline" };

const blockKeys: Row = { else: "blockRule" };

function listKeys(action: Action): KeyTable {
  return { ...rows(ITEMS, { else: action }), code: blockKeys, fence: blockKeys, table: blockKeys, else: { else: "nothing" } };
}

function rows(kinds: LineKind[], row: Row): Partial<Record<LineKind, Row>> {
  return Object.fromEntries(kinds.map((kind) => [kind, row]));
}

/** `table`, with one answer for a selection on every kind of line. */
function onSelection(action: Action, table: KeyTable): KeyTable {
  const withSelection = (row: Row): Row => ({ ...row, selection: action });
  return Object.fromEntries(Object.entries(table).map(([kind, row]) => [kind, withSelection(row)])) as KeyTable;
}

/** A marker typed at the start of the text of these kinds of line replaces
 *  the line's own. */
function typedOver(kinds: LineKind[]): KeyTable {
  const replace: Row = { start: "replaceMarker", else: "typeText" };
  return { ...rows(kinds, replace), else: { else: "typeText" } };
}

export const TABLE: Record<LineKeyName, KeyTable> = {
  Backspace: onSelection("deleteSelection", {
    ...rows(ITEMS, itemBackspace),
    heading: { start: headingBackspace, blank: headingBackspace, else: "deleteBefore" },
    continuation: { start: "removeIndent", else: "deleteBefore" },
    paragraph: textBackspace,
    indented: textBackspace,
    tableGap: { else: "parkAtTable" },
    // `end` is the end of the table; anywhere else is inside its source.
    table: { end: "parkAtTable", else: "deleteBefore" },
    else: { else: "deleteBefore" },
  }),
  Delete: onSelection("deleteSelection", { else: { else: "deleteAfter" } }),
  Enter: {
    ...rows(ITEMS, itemEnter),
    ...rows(TASKS, { ...itemEnter, start: "splitTask" }),
    nested: { ...itemEnter, blank: "outdentItem" },
    // An empty numbered item directly under the text of the item it is
    // nested in reads as that text, so it stands after an empty line.
    nestedOrdered: { ...itemEnter, start: "openItemAbove", blank: "outdentItem" },
    nestedTask: { ...itemEnter, start: "splitTask", blank: "outdentItem" },
    continuation: { start: "openLineAbove", else: "newline" },
    quote: quoted,
    lazyQuote: quoted,
    indentedQuote: quoted,
    heading: { start: "moveHeadingDown", else: "newline" },
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

const isAnswer = <A>(cell: Cell<A>): cell is Answer<A> => typeof cell === "string" || Array.isArray(cell);

/** The actions for a state, in the order to try them. */
export function lookup<A extends string>(table: KeyTable<A>, line: LineKind, beside: LineKind, at: CaretAt): readonly A[] {
  const row = table[line] ?? table.else;
  const cell = row[at] ?? row.else;
  const answer = isAnswer(cell) ? cell : (cell[beside] ?? cell.else);
  return typeof answer === "string" ? [answer] : answer;
}

export const actionsFor = (key: LineKeyName, line: LineKind, beside: LineKind, at: CaretAt): readonly Action[] => lookup(TABLE[key], line, beside, at);
