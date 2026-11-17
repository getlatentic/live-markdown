/**
 * The line-key rules as a table, and what can be said of the table as a
 * whole: which states it reaches but does not cover, which Backspace rules
 * make no progress, and the same rules written out for the TLA+ model.
 */

import { CARET } from "./drive";
import { KEYS, outcomeOf, placeOf, stateOf, written, type Rule } from "./explore";

/** One rule per line: key, state, outcome, then the document it was seen in. */
export function table(rules: Rule[]): string {
  const rows = rules.map((rule) =>
    [rule.key, stateOf(rule), outcomeOf(rule) + (rule.unhandled ? " (key not taken)" : ""), JSON.stringify(rule.before), JSON.stringify(rule.after)].join("\t"),
  );
  return `${["key", "state", "outcome", "before", "after"].join("\t")}\n${rows.sort().join("\n")}\n`;
}

/** Lines the model does not follow into: their keys have rules of their own. */
const OUTSIDE = new Set(["code", "fence", "table"]);

interface Landing {
  line: string;
  /** Null when the line above the caret is not one of the rewritten lines. */
  above: string | null;
  at: string;
}

function landing(rule: Rule): Landing | "outside" | null {
  const result = rule.outcome;
  if (!result) return null;
  const line = result.kinds[result.caretLine];
  if (line === undefined || OUTSIDE.has(line)) return "outside";
  return { line, above: result.kinds[result.caretLine - 1] ?? null, at: result.at };
}

const backward = (rule: Rule): boolean => KEYS.find((key) => key.name === rule.key)?.beside === "above";

function fits(state: Rule, to: Landing): boolean {
  return written(state.line) === to.line && state.at === to.at && (to.above === null || written(state.above) === to.above);
}

/** The states a rule can lead to: every covered state that reads as the
 *  lines it leaves. An over-approximation, since a state also depends on
 *  lines the rule does not touch. */
export function successors(rule: Rule, states: Rule[]): Rule[] {
  const to = landing(rule);
  return to === null || to === "outside" ? [] : states.filter((state) => fits(state, to));
}

/**
 * Places a key leaves the caret that no rule starts from: the table is not
 * closed under its own keys there. Each is a caret position the enumeration
 * never tried, usually one the editor should not produce.
 */
export function uncovered(rules: Rule[]): string[] {
  const states = rules.filter((rule) => rule.key === "Backspace");
  const open = new Set<string>();
  for (const rule of rules.filter(backward)) {
    const to = landing(rule);
    if (to === null || to === "outside" || states.some((state) => fits(state, to))) continue;
    open.add(`${rule.key}\t${stateOf(rule)}\t-> ${to.above ?? "?"}/${to.line}@${to.at}\t${JSON.stringify(rule.before)}\t${JSON.stringify(rule.after)}`);
  }
  return [...open].sort();
}

const caret = (marked: string): number => marked.indexOf(CARET);
/** The document's text, without the marks of the caret or the selection. */
export const textOf = (marked: string): string => marked.replace(/[‸«»]/g, "");
const length = (marked: string): number => textOf(marked).length;

/** How much structure a line carries: what Backspace at its start has left to take. */
const WEIGHT: Record<string, number> = { nested: 4, nestedOrdered: 4, nestedTask: 4, quotedItem: 4, quotedOrdered: 4, quotedTask: 4, bullet: 3, ordered: 3, task: 3, heading: 3, quote: 3, emptyQuote: 3, continuation: 2, indented: 1 };
const weight = (kinds: string[]): number => kinds.reduce((sum, kind) => sum + (WEIGHT[kind] ?? 0), 0);

/**
 * Backspace rules that make no progress. Every other rule lowers
 * (structure, length, caret) in that order, so Backspace held down always
 * ends at the start of the document.
 */
export function stuck(rules: Rule[]): Rule[] {
  return rules.filter((rule) => {
    // In a code block Backspace stops at the block's first line, by its own rules.
    if (rule.key !== "Backspace" || OUTSIDE.has(rule.line)) return false;
    if (!rule.outcome) return rule.above !== "none";
    // A selection goes: the text is shorter, whatever the line then reads as.
    if (rule.at === "selection") return length(rule.after) >= length(rule.before);
    const lighter = weight(rule.outcome.kinds) - weight([rule.above, rule.line].map(written));
    if (lighter !== 0) return lighter > 0;
    return rule.outcome.edited ? length(rule.after) >= length(rule.before) : caret(rule.after) >= caret(rule.before);
  });
}

const quoted = (text: string): string => `"${text}"`;
const stateId = (rule: Rule): string => `<<${quoted(rule.above)}, ${quoted(rule.line)}, ${quoted(placeOf(rule))}>>`;

/** The keys the table decides. The others are bound to one command each,
 *  and are checked one press at a time in `lineKeys.test.ts`. */
const LINE_KEYS = new Set(["Backspace", "Enter", "Tab", "Shift-Tab"]);

/** The rules as TLA+ data, for `model/LineKeys.tla`. Lists with gaps follow
 *  the same rules with one more empty line, and are left out. */
export function tlaRules(rules: Rule[]): string {
  const tight = rules.filter((rule) => backward(rule) && !rule.loose && (LINE_KEYS.has(rule.key) || rule.key.startsWith("type ")));
  const states = tight.filter((rule) => rule.key === "Backspace");
  const records = tight.map((rule) => {
    const next = successors(rule, states).map(stateId);
    const leaves = landing(rule) === "outside";
    return `  [key |-> ${quoted(rule.key.replace(/"/g, "'"))}, from |-> ${stateId(rule)}, changed |-> ${rule.outcome ? "TRUE" : "FALSE"}, leaves |-> ${leaves ? "TRUE" : "FALSE"}, next |-> {${[...new Set(next)].join(", ")}}]`;
  });
  return [
    "---- MODULE LineKeysRules ----",
    "\\* Generated from the editor by lineKeys.test.ts. Do not edit.",
    `States == {\n  ${[...new Set(states.map(stateId))].join(",\n  ")}\n}`,
    `Rules == {\n${records.join(",\n")}\n}`,
    "====",
    "",
  ].join("\n");
}
