/**
 * Line keys and kinds of line a host adds.
 *
 * The table in `table.ts` is the editor's own and is closed: the model
 * checks every state of it. A host's rules are asked first, in the order
 * their modules were given, last module first. A rule that does not apply
 * (its `run` returns false) passes the key on, to the next rule and then
 * to the table.
 */

import { Facet, type EditorState, type Line } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import { ACTIONS, type Press } from "./actions";
import type { CaretAt } from "./lineKind";
import type { Action, LineKeyName } from "./table";

/** Names a kind of line the editor does not know, or null to leave the line
 *  to the next reader and then to the editor's own kinds. */
export type LineKindReader = (state: EditorState, line: Line) => string | null;

/** What a host rule's command is given: the press, and the state it was read as. */
export interface LineKeyPress extends Press {
  readonly key: LineKeyName;
  /** The kind of the caret's line: one of the editor's, or a host's. */
  readonly kind: string;
  /** The kind of the line beside it: below for Delete, above for other keys. */
  readonly beside: string;
  readonly at: CaretAt;
}

export interface LineKeyRule {
  readonly key: LineKeyName | readonly LineKeyName[];
  /** The kind of the caret's line. Left out, the rule is for every kind. */
  readonly line?: string | readonly string[];
  readonly beside?: string | readonly string[];
  readonly at?: CaretAt | readonly CaretAt[];
  /** One of the editor's actions by name, or the host's own command. */
  readonly run: Action | ((view: EditorView, press: LineKeyPress) => boolean);
}

export const lineKindsFacet = Facet.define<LineKindReader>();
export const lineKeyRulesFacet = Facet.define<LineKeyRule>();

/** The kind a host names for `line`, or null where no reader claims it. */
export function hostKindOfLine(state: EditorState, line: Line | null): string | null {
  if (!line) return null;
  for (const read of state.facet(lineKindsFacet)) {
    const kind = read(state, line);
    if (kind !== null) return kind;
  }
  return null;
}

const among = <T>(wanted: T | readonly T[] | undefined, value: T): boolean =>
  wanted === undefined || (Array.isArray(wanted) ? wanted.includes(value) : wanted === value);

/** Run the first host rule that applies to `press`. False when none does. */
export function runHostRules(view: EditorView, press: LineKeyPress): boolean {
  return view.state.facet(lineKeyRulesFacet).some((rule) => {
    if (!among(rule.key, press.key) || !among(rule.line, press.kind) || !among(rule.beside, press.beside) || !among(rule.at, press.at)) return false;
    return typeof rule.run === "string" ? ACTIONS[rule.run](view, press) : rule.run(view, press);
  });
}
