/**
 * What must hold of the line keys as a whole, as checks over the rules the
 * editor was explored into. The editor's own test runs them on the editor
 * alone; a host runs them with its modules mounted ({@link checkLineKeys}),
 * so its rules for the line keys are held to what the editor's are.
 */

import type { MarkdownExtension } from "../extensions/types";
import { marked, mount, press, unmount } from "./drive";
import { explore, KEYS, outcomeOf, rules, stateOf, type Host, type Rule } from "./explore";
import { stuck, table, textOf, tlaRules, uncovered } from "./model";

const shown = (rule: Rule, after = rule.after): string => `${rule.key} in ${stateOf(rule)}  ${JSON.stringify(rule.before)} -> ${JSON.stringify(after)}`;

/** The document after `names` are pressed in turn, starting from `before`. */
function pressed(modules: readonly MarkdownExtension[], before: string, ...names: string[]): string {
  const view = mount(before, modules);
  try {
    for (const name of names) {
      const chord = KEYS.find((key) => key.name === name)?.chord;
      if (chord) press(view, chord);
    }
    return marked(view);
  } finally {
    unmount(view);
  }
}

type Check = (found: Rule[], modules: readonly MarkdownExtension[]) => string[];

const of = (found: Rule[], ...keys: string[]): Rule[] => found.filter((rule) => keys.includes(rule.key));

/** Each check by what it requires, giving the rules that break it. */
export const CHECKS: Record<string, Check> = {
  "every state has one outcome per key": (found) =>
    found
      .filter((rule) => rule.conflicts.length > 0)
      .flatMap((rule) => [rule, ...rule.conflicts].map((seen) => `${rule.key} in ${stateOf(rule)}: ${outcomeOf(seen)}  ${JSON.stringify(seen.before)} -> ${JSON.stringify(seen.after)}`)),

  "every Backspace makes progress, so holding it ends at the start of the document": (found) => stuck(found).map((rule) => shown(rule)),

  "an arrow key moves the caret and edits nothing": (found) =>
    of(found, "ArrowLeft", "ArrowRight")
      .filter((rule) => rule.outcome?.edited)
      .map((rule) => shown(rule)),

  "an arrow key undone by the other and pressed again comes back to the same place": (found, modules) => {
    const back: Record<string, string> = { ArrowLeft: "ArrowRight", ArrowRight: "ArrowLeft" };
    // From a place the arrow keys themselves reach: the text of a line. A
    // rule line is drawn as one thing, and has no place inside it.
    return of(found, "ArrowLeft", "ArrowRight")
      .filter((rule) => rule.outcome && rule.line !== "rule" && ["start", "middle", "end", "blank"].includes(rule.at))
      .map((rule) => [rule, pressed(modules, rule.before, rule.key, back[rule.key], rule.key)] as const)
      .filter(([rule, again]) => again !== rule.after)
      .map(([rule, again]) => shown(rule, again));
  },

  "a word deletion takes text away, and adds none": (found) =>
    of(found, "Word-Backspace", "Word-Delete")
      .filter((rule) => textOf(rule.after).length > textOf(rule.before).length)
      .map((rule) => shown(rule)),

  // Where the first press put markers in. Inside a span it takes that
  // span's markers out, and a second press starts a new one at the caret.
  "bold, italic or code pressed a second time restores the text": (found, modules) =>
    of(found, "Bold", "Italic", "Code")
      .filter((rule) => textOf(rule.after).length > textOf(rule.before).length)
      .map((rule) => [rule, pressed(modules, rule.before, rule.key, rule.key)] as const)
      .filter(([rule, twice]) => textOf(twice) !== textOf(rule.before))
      .map(([rule, twice]) => shown(rule, twice)),

  "a code block keeps its fences, whatever is pressed inside it": (found) => {
    const fences = (doc: string): number => doc.split("\n").filter((line) => line.startsWith("```")).length;
    return found
      .filter((rule) => rule.span && (rule.line === "code" || rule.line === "fence"))
      .filter((rule) => fences(textOf(rule.after)) !== 2 && !(rule.span === "in an empty code block" && fences(textOf(rule.after)) === 0))
      .map((rule) => shown(rule));
  },

  "no empty pair of markers is left where styled text was deleted": (found) => {
    const emptyPair = /\*{4}|(?<![*\w])\*\*(?![*\w])|(?<![`\w])``(?![`\w])|\[\]\(/;
    return of(found, "Backspace", "Delete", "Word-Backspace", "Word-Delete")
      .filter((rule) => rule.span && emptyPair.test(textOf(rule.after)))
      .map((rule) => shown(rule));
  },
};

export interface LineKeyReport {
  rules: Rule[];
  /** The rules that break each check, by the check's name. Empty when all hold. */
  failures: Record<string, string[]>;
  /** Places a key leaves the caret that no rule starts from. */
  uncovered: string[];
  /** One row per rule: key, state, outcome, the document it was seen in. */
  table: string;
  /** The rules as `LineKeysRules.tla`, for TLC with `model/LineKeys.tla`. */
  tla: string;
}

/**
 * Explore the editor with a host's modules mounted and run every check.
 * Needs a DOM (jsdom, or a browser). The whole run presses each key in
 * every state and takes minutes; `host.keys` narrows it.
 */
export async function checkLineKeys(host?: Host): Promise<LineKeyReport> {
  const found = rules(await explore(host));
  const modules = host?.modules ?? [];
  const failures: Record<string, string[]> = {};
  for (const [name, check] of Object.entries(CHECKS)) {
    const broken = check(found, modules);
    if (broken.length > 0) failures[name] = broken;
  }
  return { rules: found, failures, uncovered: uncovered(found), table: table(found), tla: tlaRules(found) };
}
