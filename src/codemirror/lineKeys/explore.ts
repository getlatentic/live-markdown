/**
 * Enumerates the line-key machine from the editor itself: every kind of line,
 * under every kind of line, with the caret at each place, for each key. One
 * {@link Transition} per press, labelled with the abstract state it left and
 * the one it reached.
 */

import { CARET, marked, mount, press, type, unmount } from "./drive";
import type { EditorState } from "@codemirror/state";

import { kindOfLine, lineState, type CaretAt, type LineKind } from "./lineKind";

/** What stands two lines up and beyond: the same window in different documents. */
const SETTINGS = ["", "intro\n\n", "- zero\n", "- zero\n\n", "> said\n"];

const ABOVE = [
  "",
  "\n",
  "some text\n",
  "# Title\n",
  "- one\n",
  "1. one\n",
  "- [ ] one\n",
  "- one\n  more\n",
  "> quoted\n",
  "```\ncode\n```\n",
  "- one\n  - two\n",
  "- one\n  - [ ] two\n",
  "  indented\n",
  "| A | B |\n| --- | --- |\n| 1 | 2 |\n",
];

/** The caret's line, as `[marker, text]`. */
const LINES: [string, string][] = [
  ["", ""],
  ["", "word text"],
  ["## ", "word text"],
  ["- ", "word text"],
  ["1. ", "word text"],
  ["- [ ] ", "word text"],
  ["  ", "word text"],
  ["> ", "word text"],
  ["- ", ""],
  ["1. ", ""],
  ["- [ ] ", ""],
  ["> ", ""],
  ["## ", ""],
  ["  - ", "word text"],
  ["  - ", ""],
  ["  - [ ] ", "word text"],
  ["  - [ ] ", ""],
];

const BELOW = ["", "\nafter", "\n- after", "\n## After", "\n\nafter", "\n> after", "\n```\ncode\n```"];

export interface Key {
  name: string;
  at: CaretAt[];
  /** Which neighbour the outcome may depend on. */
  beside: "above" | "below";
  run(view: Parameters<typeof press>[0]): boolean;
}

const typed = (text: string): Key => ({
  name: `type ${JSON.stringify(text)}`,
  at: ["start"],
  beside: "above",
  run: (view) => (type(view, text), true),
});

export const KEYS: Key[] = [
  { name: "Backspace", at: ["start", "middle", "end"], beside: "above", run: (view) => press(view, "Backspace") },
  { name: "Enter", at: ["start", "middle", "end"], beside: "above", run: (view) => press(view, "Enter") },
  { name: "Tab", at: ["start", "middle"], beside: "above", run: (view) => press(view, "Tab") },
  { name: "Shift-Tab", at: ["start", "middle"], beside: "above", run: (view) => press(view, "Tab", true) },
  { name: "Delete", at: ["start", "middle", "end"], beside: "below", run: (view) => press(view, "Delete") },
  typed("# "),
  typed("## "),
  typed("- "),
  typed("1. "),
  typed("- [ ] "),
  typed("> "),
  typed("```"),
];

/** What the two lines became, as written, and where the caret is among them. */
export interface Outcome {
  kinds: string[];
  /** Index into `kinds`; outside it when the caret left the two lines. */
  caretLine: number;
  at: CaretAt;
  /** Lines added (+) or removed (−). */
  lines: number;
  /** The document's text changed, not only the caret. */
  edited: boolean;
}

export interface Transition {
  key: string;
  /** The lines beside the caret, as the parser reads them. */
  above: LineKind;
  line: LineKind;
  below: LineKind;
  at: CaretAt;
  loose: boolean;
  /** Null when the key changed nothing. */
  outcome: Outcome | null;
  /** No binding took the key: the browser's own behaviour applies. */
  unhandled: boolean;
  before: string;
  after: string;
}

function caretOffset(marker: string, text: string, at: CaretAt): number {
  if (at === "start") return marker.length;
  return marker.length + (at === "end" ? text.length : text.indexOf(" "));
}

/**
 * A line as it is written, apart from the lines above it. Unmarked text reads
 * as a paragraph, a lazy list line or a lazy quote line, and an empty line as
 * a gap or not, only by what stands above; a rewrite leaves that to the reader.
 */
export function written(kind: LineKind): string {
  if (kind === "paragraph" || kind === "lazy" || kind === "lazyQuote") return "text";
  if (kind === "indentedQuote") return "indented";
  return kind === "gap" || kind === "quoteGap" ? "empty" : kind;
}

/** The lines the key may rewrite: the caret's and its neighbour. */
function windowOf(state: EditorState, beside: Key["beside"]): { first: number; count: number } {
  const line = state.doc.lineAt(state.selection.main.head).number;
  if (beside === "above") return line > 1 ? { first: line - 1, count: 2 } : { first: line, count: 1 };
  return { first: line, count: line < state.doc.lines ? 2 : 1 };
}

function outcome(before: EditorState, after: EditorState, beside: Key["beside"]): Outcome {
  const window = windowOf(before, beside);
  const lines = after.doc.lines - before.doc.lines;
  const kinds: string[] = [];
  for (let i = 0; i < window.count + lines; i++) kinds.push(written(kindOfLine(after, window.first + i)));
  return {
    kinds,
    caretLine: after.doc.lineAt(after.selection.main.head).number - window.first,
    at: lineState(after).at,
    lines,
    edited: !before.doc.eq(after.doc),
  };
}

function transition(key: Key, before: string): Transition {
  const view = mount(before);
  try {
    const start = view.state;
    const handled = key.run(view);
    const after = marked(view);
    return {
      key: key.name,
      ...lineState(start),
      outcome: after === before ? null : outcome(start, view.state, key.beside),
      unhandled: !handled,
      before,
      after,
    };
  } finally {
    unmount(view);
  }
}

function documents(at: CaretAt, beside: Key["beside"]): string[] {
  const docs: string[] = [];
  for (const [marker, text] of LINES) {
    if (text === "" && at !== "start") continue;
    const offset = caretOffset(marker, text, at);
    const line = (marker + text).slice(0, offset) + CARET + (marker + text).slice(offset);
    if (beside === "below") {
      for (const below of BELOW) for (const setting of ["", "intro\n\n"]) docs.push(setting + line + below);
      continue;
    }
    for (const setting of SETTINGS) {
      for (const above of ABOVE) {
        for (const below of ["", "\nafter"]) docs.push(setting + above + line + below);
      }
    }
  }
  return docs;
}

/** Every press the model covers, in a stable order. Pauses between
 *  documents, so a long run does not hold the thread it shares. */
export async function explore(): Promise<Transition[]> {
  const found: Transition[] = [];
  for (const key of KEYS) {
    for (const at of key.at) {
      for (const before of documents(at, key.beside)) {
        const step = transition(key, before);
        if (step.at === at || step.at === "blank") found.push(step);
      }
      await new Promise((resume) => setTimeout(resume, 0));
    }
  }
  return found;
}

/** The state a key was pressed in. A key that acts forward reads the line
 *  below the caret's, the others the line above. */
export function stateOf(step: Transition): string {
  const forward = KEYS.find((key) => key.name === step.key)?.beside === "below";
  const pair = forward ? `${step.line}/${step.below}` : `${step.above}/${step.line}`;
  return `${pair}@${step.at}${step.loose ? " loose" : ""}`;
}

export function outcomeOf(step: Transition): string {
  const { outcome: result } = step;
  if (!result) return "unchanged";
  const where = `${result.caretLine}@${result.at}`;
  return result.edited ? `${result.kinds.join(" + ") || "nothing"}, caret ${where}` : `caret to ${where}`;
}

export interface Rule extends Transition {
  /** Other outcomes seen from the same state: the state is too coarse, or the
   *  editor decides by something further away than the two lines. */
  conflicts: Transition[];
}

/** One rule per state and key: the first document that reaches it. */
export function rules(transitions: Transition[]): Rule[] {
  const byState = new Map<string, Rule>();
  for (const step of transitions) {
    const id = `${step.key}\t${stateOf(step)}`;
    const rule = byState.get(id);
    if (!rule) {
      byState.set(id, { ...step, conflicts: [] });
    } else if (![rule, ...rule.conflicts].some((seen) => outcomeOf(seen) === outcomeOf(step))) {
      rule.conflicts.push(step);
    }
  }
  return [...byState.values()];
}
