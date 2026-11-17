/**
 * Enumerates the line-key machine from the editor itself: every kind of line,
 * under every kind of line, with the caret at each place, for each key. One
 * {@link Transition} per press, labelled with the abstract state it left and
 * the one it reached.
 */

import { deleteLineBackward, deleteLineForward } from "../interaction/groupDelete";
import { CARET, marked, mount, paste, press, SELECTED, type, unmount, type Chord, type Pasted } from "./drive";
import type { EditorState } from "@codemirror/state";

import type { MarkdownExtension } from "../extensions/types";
import { hostLine, namedKindOfLine, namedLineState } from "./hostRules";
import type { CaretAt } from "./lineKind";

/** A host's modules, with a line of each kind they name: the editor is
 *  explored with them mounted, and their lines among its own. */
export interface Host {
  readonly modules: readonly MarkdownExtension[];
  /** As `[marker, text]`; `text` empty for the line with only its marker. */
  readonly lines: readonly (readonly [string, string])[];
  /** The keys to press, by name. All of them when absent. */
  readonly keys?: readonly string[];
}

const NO_HOST: Host = { modules: [], lines: [] };

/** The lines to press in: the editor's, and a host's among them. */
interface Fixtures {
  modules: readonly MarkdownExtension[];
  lines: readonly (readonly [string, string])[];
  above: readonly string[];
}

const fixturesFor = ({ modules, lines }: Host): Fixtures => ({
  modules,
  lines: [...LINES, ...lines],
  // With text, as the editor's own lines above are: a line of only its
  // marker joins differently, and is pressed in as the caret's line.
  above: [...ABOVE, ...new Set(lines.filter(([, text]) => text !== "").map(([marker, text]) => `${marker}${text}\n`))],
});

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
  "| A | B |\n| --- | --- |\n| 1 | 2 |\n\n",
  "---\n",
  ">\n",
  "> - one\n",
  "> 1. one\n",
  "> - [ ] one\n",
  "- one\n   1. two\n",
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
  ["", "---"],
  ["> - ", "word text"],
  ["> - ", ""],
  ["> 1. ", ""],
  ["> - [ ] ", ""],
  ["> 1. ", "word text"],
  ["> - [ ] ", "word text"],
  ["   1. ", "word text"],
  ["   1. ", ""],
];

const BELOW = ["", "\nafter", "\n- after", "\n## After", "\n\nafter", "\n> after", "\n```\ncode\n```"];

type Named = "styled" | "code";

export interface Key {
  name: string;
  at: CaretAt[];
  /** Which neighbour the outcome may depend on. */
  beside: "above" | "below";
  /** The documents two lines up and beyond to press it in; all of them when absent. */
  settings?: string[];
  /** The keys to press, for a key pressed as keys. */
  chord?: Chord;
  /** What to paste, for a paste. */
  pasted?: Pasted;
  /** Named places to press it in as well: around styled text, in a code block. */
  also?: Named[];
  run(view: Parameters<typeof press>[0]): boolean;
}

/** A key that is not a line key: bound in `editingStack.ts`, not decided by
 *  the table. Pressed in fewer documents, as its rule looks less far. */
const bound = (name: string, chord: Chord, at: CaretAt[] = ["start", "middle", "end", "margin", "indent", "marker"], beside: Key["beside"] = "above"): Key => ({
  name,
  at,
  beside,
  settings: [""],
  chord,
  also: ["styled", "code"],
  run: (view) => press(view, chord),
});

const pasting = (text: string, html?: string): Key => ({
  name: `paste ${JSON.stringify(html ?? text)}`,
  at: ["start", "middle", "end"],
  beside: "above",
  settings: [""],
  pasted: { text, html },
  also: ["styled", "code"],
  run: (view) => (paste(view, { text, html }), true),
});

const typed = (text: string): Key => ({
  name: `type ${JSON.stringify(text)}`,
  at: ["start"],
  beside: "above",
  run: (view) => (type(view, text), true),
});

const LINE_PLACES: CaretAt[] = ["start", "middle", "end", "margin", "indent", "marker", "selection"];

/** A line key: the table decides it. */
const lineKey = (name: string, chord: Chord, at: CaretAt[], beside: Key["beside"] = "above", also: Named[] = ["styled", "code"]): Key => ({
  name,
  at,
  beside,
  chord,
  also,
  run: (view) => press(view, chord),
});

export const KEYS: Key[] = [
  lineKey("Backspace", { key: "Backspace" }, LINE_PLACES),
  lineKey("Enter", { key: "Enter" }, LINE_PLACES),
  lineKey("Tab", { key: "Tab" }, ["start", "middle", "selection"], "above", ["code"]),
  lineKey("Shift-Tab", { key: "Tab", shift: true }, ["start", "middle", "selection"], "above", ["code"]),
  lineKey("Delete", { key: "Delete" }, LINE_PLACES, "below"),
  typed("# "),
  typed("## "),
  typed("- "),
  typed("1. "),
  typed("- [ ] "),
  typed("> "),
  typed("```"),
  bound("ArrowLeft", { key: "ArrowLeft" }),
  bound("ArrowRight", { key: "ArrowRight" }, undefined, "below"),
  bound("Word-Backspace", { key: "Backspace", word: true }),
  bound("Word-Delete", { key: "Delete", word: true }, undefined, "below"),
  bound("Bold", { key: "b", mod: true }, ["start", "middle", "end", "selection"]),
  bound("Italic", { key: "i", mod: true }, ["middle", "selection"]),
  bound("Code", { key: "e", mod: true }, ["middle", "selection"]),
  // ⌘⌫ and ⌘⌦ are bound on a Mac only, so the commands are run by name.
  { ...bound("Line-Backspace", { key: "Backspace", line: true }, ["start", "middle", "end"]), run: deleteLineBackward },
  { ...bound("Line-Delete", { key: "Delete", line: true }, ["start", "middle", "end"], "below"), run: deleteLineForward },
  bound("Heading 1", { key: "1", mod: true }, ["middle"]),
  bound("Heading 2", { key: "2", mod: true }, ["middle"]),
  bound("Heading 3", { key: "3", mod: true }, ["middle"]),
  bound("Numbered list", { key: "7", mod: true, shift: true }, ["middle"]),
  bound("Bullet list", { key: "8", mod: true, shift: true }, ["middle"]),
  bound("Quote", { key: "9", mod: true, shift: true }, ["middle"]),
  pasting("pasted"),
  pasting("one\ntwo"),
  pasting("bold text", "<b>bold</b> text"),
  pasting("one\ntwo", "<ul><li>one</li><li>two</li></ul>"),
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
  /** The lines beside the caret, as the parser reads them, or as a host
   *  names them. */
  above: string;
  line: string;
  below: string;
  at: CaretAt;
  /** What a selection covers: part of the line's text, or `lines` when it
   *  starts on the line above. For a caret, the name of a place the kind of
   *  line does not tell: around styled text, in a code block. */
  span?: string;
  loose: boolean;
  /** Null when the key changed nothing. */
  outcome: Outcome | null;
  /** No binding took the key: the browser's own behaviour applies. */
  unhandled: boolean;
  /** A host's reader names the line the key was pressed on. */
  claimed: boolean;
  before: string;
  after: string;
}

function caretOffset(marker: string, text: string, at: CaretAt): number {
  if (at === "start") return marker.length;
  if (at === "end") return marker.length + text.length;
  return marker.length + (text.includes(" ") ? text.indexOf(" ") : Math.ceil(text.length / 2));
}

/**
 * A line as it is written, apart from the lines above it. Unmarked text reads
 * as a paragraph, a lazy list line or a lazy quote line, and an empty line as
 * a gap or not, only by what stands above; a rewrite leaves that to the reader.
 */
export function written(kind: string): string {
  if (kind === "paragraph" || kind === "lazy" || kind === "lazyQuote") return "text";
  if (kind === "indentedQuote") return "indented";
  return kind === "gap" || kind === "quoteGap" || kind === "tableGap" ? "empty" : kind;
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
  for (let i = 0; i < window.count + lines; i++) kinds.push(written(namedKindOfLine(after, window.first + i)));
  return {
    kinds,
    caretLine: after.doc.lineAt(after.selection.main.head).number - window.first,
    at: namedLineState(after).at,
    lines,
    edited: !before.doc.eq(after.doc),
  };
}

function transition(key: Key, { before, span }: Start, modules: readonly MarkdownExtension[]): Transition {
  const view = mount(before, modules);
  try {
    const start = view.state;
    const handled = key.run(view);
    const after = marked(view);
    return {
      key: key.name,
      claimed: hostLine(start, start.doc.lineAt(start.selection.main.from)) !== null,
      ...namedLineState(start),
      span,
      outcome: after === before ? null : outcome(start, view.state, key.beside),
      unhandled: !handled,
      before,
      after,
    };
  } finally {
    unmount(view);
  }
}

interface Start {
  before: string;
  span?: string;
  /** The caret's line is one a host gave, written with the host's marker. */
  hosts?: boolean;
}

const [OPEN, CLOSE] = SELECTED;

/** The line's text with part of it selected, by the name of the part. */
function spans(marker: string, text: string): [string, string][] {
  const [first, rest] = [text.slice(0, text.indexOf(" ")), text.slice(text.indexOf(" "))];
  return [
    ["start..middle", `${marker}${OPEN}${first}${CLOSE}${rest}`],
    ["middle..end", `${marker}${first}${OPEN}${rest}${CLOSE}`],
    ["start..end", `${marker}${OPEN}${text}${CLOSE}`],
  ];
}

/** `above` with the selection opening before the last word of its last line. */
function openedIn(above: string): string | null {
  const word = /\w+\n$/.exec(above);
  return word ? above.slice(0, word.index) + OPEN + above.slice(word.index) : null;
}

/** Selections in one line, and from the line above into it. */
function selections({ lines, above: lineAbove }: Fixtures): Start[] {
  const starts: Start[] = [];
  for (const [marker, text] of lines) {
    if (text === "") continue;
    const first = text.slice(0, text.indexOf(" "));
    for (const above of lineAbove) {
      const hosts = !LINES.some((own) => own[0] === marker && own[1] === text);
      for (const [span, line] of spans(marker, text)) starts.push({ before: above + line, span, hosts });
      const opened = openedIn(above);
      if (opened) starts.push({ before: `${opened}${marker}${first}${CLOSE}${text.slice(first.length)}`, span: "lines", hosts });
    }
  }
  return starts;
}

function documents(at: CaretAt, { beside, settings = SETTINGS }: Key, fixtures: Fixtures): Start[] {
  if (at === "selection") return selections(fixtures);
  const lines = IN_FRONT[at]?.() ?? null;
  if (!lines) return carets(at, beside, settings, fixtures);
  return under(lines, beside, at === "marker" ? [""] : ["", "- zero\n\n"], fixtures.above).map((before) => ({ before }));
}

const INDENTED = LINES.filter(([marker, text]) => marker.startsWith("  ") && text !== "");

/** Lines with the caret in front of their text: where deleting a line's
 *  first word leaves it, and where a step left of an indent puts it. */
const IN_FRONT: Partial<Record<CaretAt, () => string[]>> = {
  margin: () => INDENTED.map(([marker, text]) => CARET + marker + text),
  indent: () => INDENTED.map(([marker, text]) => ` ${CARET}${marker.slice(1)}${text}`),
  marker: () => [`> ${CARET} text`],
};

/** Each line under every line above, with the lines the key may look at. */
function under(lines: string[], beside: Key["beside"], settings: string[], lineAbove: readonly string[]): string[] {
  const docs: string[] = [];
  for (const line of lines) {
    if (beside === "below") {
      for (const below of BELOW) docs.push(line + below);
      continue;
    }
    for (const setting of settings) for (const above of lineAbove) docs.push(`${setting}${above}${line}\nafter`);
  }
  return docs;
}

function carets(at: CaretAt, beside: Key["beside"], settings: string[], { lines, above: lineAbove }: Fixtures): Start[] {
  const starts: Start[] = [];
  for (const [marker, text] of lines) {
    if (text === "" && at !== "start") continue;
    const hosts = !LINES.some((own) => own[0] === marker && own[1] === text);
    const docs = { push: (before: string) => starts.push({ before, hosts }) };
    const offset = caretOffset(marker, text, at);
    const line = (marker + text).slice(0, offset) + CARET + (marker + text).slice(offset);
    if (beside === "below") {
      for (const below of BELOW) for (const setting of ["", "intro\n\n"]) docs.push(setting + line + below);
      continue;
    }
    for (const setting of settings) {
      for (const above of lineAbove) {
        for (const below of ["", "\nafter"]) docs.push(setting + above + line + below);
      }
    }
  }
  return starts;
}

/** One span of styled text with the caret at each place around it. */
function around(name: string, open: string, text: string, close: string): [string, string][] {
  const half = Math.ceil(text.length / 2);
  return [
    [`before ${name}`, `word ${CARET}${open}${text}${close} text`],
    [`at the start of ${name}`, `word ${open}${CARET}${text}${close} text`],
    [`in ${name}`, `word ${open}${text.slice(0, half)}${CARET}${text.slice(half)}${close} text`],
    [`at the end of ${name}`, `word ${open}${text}${CARET}${close} text`],
    [`after ${name}`, `word ${open}${text}${close}${CARET} text`],
  ];
}

const STYLED = [...around("bold", "**", "bold", "**"), ...around("italic", "*", "slanted", "*"), ...around("struck text", "~~", "struck", "~~"), ...around("code", "`", "code", "`"), ...around("a link", "[", "link", "](url)")];

const BLOCK = "```js\ncode line\n  more\n```";
const caretIn = (text: string, offset: number): string => text.slice(0, offset) + CARET + text.slice(offset);

/** The closing fence is no place of the caret: clicks and arrow keys are
 *  kept off it (`fenceCaretGuard.ts`). */
const IN_CODE: [string, string][] = [
  ["at the end of the opening fence", caretIn(BLOCK, BLOCK.indexOf("\n"))],
  ["at the start of a code line", caretIn(BLOCK, BLOCK.indexOf("code"))],
  ["in a code line", caretIn(BLOCK, BLOCK.indexOf("de line"))],
  ["at the end of a code line", caretIn(BLOCK, BLOCK.indexOf("\n  more"))],
  ["at the start of an indented code line", caretIn(BLOCK, BLOCK.indexOf("more"))],
  ["at the end of the last code line", caretIn(BLOCK, BLOCK.lastIndexOf("\n"))],
  ["in an empty code block", `\`\`\`\n${CARET}\n\`\`\``],
];

/** Places the kinds of line do not tell apart. Each is named, and is a
 *  state of its own. */
const NAMED: Record<Named, () => Start[]> = {
  styled: () =>
    ["", "- ", "> ", "## "].flatMap((marker) =>
      ["", "some text\n"].flatMap((above) => STYLED.map(([span, line]) => ({ before: `${above}${marker}${line}\nafter`, span }))),
    ),
  // Under a line of text: the first line of a code block that starts the
  // document has nowhere to go backward.
  code: () => IN_CODE.map(([span, block]) => ({ before: `some text\n${block}\nafter`, span })),
};

/** Every press the model covers, in a stable order: of the editor alone, or
 *  with a host's modules mounted and its lines among the editor's. Pauses
 *  between documents, so a long run does not hold the thread it shares. */
export async function explore(host: Host = NO_HOST): Promise<Transition[]> {
  const fixtures = fixturesFor(host);
  const found: Transition[] = [];
  for (const key of KEYS.filter(({ name }) => !host.keys || host.keys.includes(name))) {
    for (const at of key.at) {
      for (const start of documents(at, key, fixtures)) {
        const step = transition(key, start, host.modules);
        // Text right under a table is one more of its rows, and a table's
        // source is not a place the caret rests.
        // A host's line where its reader does not claim it is plain text
        // with a marker's characters in it, and no state of its own.
        const plain = start.hosts && !step.claimed;
        if (!plain && step.line !== "table" && (step.at === at || step.at === "blank")) found.push(step);
      }
      await new Promise((resume) => setTimeout(resume, 0));
    }
    for (const named of key.also ?? []) found.push(...NAMED[named]().map((start) => transition(key, start, host.modules)));
  }
  return found;
}

/** Where the caret was, or what the selection covered. */
export const placeOf = (step: Transition): string => (step.span ? `${step.at} ${step.span}` : step.at);

/** The state a key was pressed in. A key that acts forward reads the line
 *  below the caret's, the others the line above. */
export function stateOf(step: Transition): string {
  const forward = !step.span && KEYS.find((key) => key.name === step.key)?.beside === "below";
  const pair = forward ? `${step.line}/${step.below}` : `${step.above}/${step.line}`;
  return `${pair}@${placeOf(step)}${step.loose ? " loose" : ""}`;
}

export function outcomeOf(step: Transition): string {
  const { outcome: result } = step;
  if (!result) return "unchanged";
  const where = `${result.caretLine}@${result.at}`;
  // Past a table the caret lands on whatever stands beyond it.
  if (!result.edited && result.kinds[result.caretLine] === undefined) return "caret leaves the lines";
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
