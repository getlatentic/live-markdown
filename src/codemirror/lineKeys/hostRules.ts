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
import { kindOfLine, lineState, type CaretAt, type LineState } from "./lineKind";
import type { Action, LineKeyName } from "./table";

/** A line of a host's kind, and where its text starts: after the marker the
 *  host writes it with. */
export interface HostLine {
  readonly kind: string;
  readonly textFrom: number;
}

/**
 * Names a kind of line the editor does not know, or null to leave the line
 * to the next reader and then to the editor's own kinds. A bare name is a
 * line whose text starts where the line does.
 */
export type LineKindReader = (state: EditorState, line: Line) => string | HostLine | null;

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

/** The line as a host reads it, or null where no reader claims it. */
export function hostLine(state: EditorState, line: Line | null): HostLine | null {
  if (!line) return null;
  for (const read of state.facet(lineKindsFacet)) {
    const named = read(state, line);
    if (named !== null) return typeof named === "string" ? { kind: named, textFrom: line.from } : named;
  }
  return null;
}

/** Where the caret is in a host's line: the places of `caretAt`, counted
 *  from where the host says the line's text starts. */
export function hostCaretAt(state: EditorState, line: Line, pos: number, { textFrom }: HostLine): CaretAt {
  if (!state.selection.main.empty) return "selection";
  if (state.sliceDoc(textFrom, line.to).trim() === "") return "blank";
  if (pos < textFrom) return pos === line.from ? "margin" : "marker";
  if (pos === textFrom) return "start";
  return pos === line.to ? "end" : "middle";
}

const lineNumbered = (state: EditorState, number: number): Line | null => (number >= 1 && number <= state.doc.lines ? state.doc.line(number) : null);

/** The kind of a line by number: a host's name for it, or the editor's. */
export const namedKindOfLine = (state: EditorState, number: number): string => hostLine(state, lineNumbered(state, number))?.kind ?? kindOfLine(state, number);

/** The state a key is pressed in, with a host's kinds and places where its
 *  readers claim a line. */
export function namedLineState(state: EditorState): Omit<LineState, "above" | "line" | "below"> & { above: string; line: string; below: string } {
  const own = lineState(state);
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const host = hostLine(state, line);
  return {
    ...own,
    above: namedKindOfLine(state, line.number - 1),
    line: host?.kind ?? own.line,
    below: namedKindOfLine(state, line.number + 1),
    at: host ? hostCaretAt(state, line, pos, host) : own.at,
  };
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
