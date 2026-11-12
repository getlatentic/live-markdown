/**
 * Horizontal-rule widget — replaces `---` / `***` / `___` source
 * with a styled inline `<span>` that draws a horizontal line.
 *
 * Kept as an inline widget (not `block: true`) so the line still
 * participates in CM6's normal line-metric measurement; CSS draws
 * the rule via a full-width border.
 */

import type { EditorState } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type ViewUpdate } from "@codemirror/view";

import { type NodeLike, type NodeRule } from "./paint";
import { treeAt } from "./treeAt";

export class HorizontalRuleWidget extends WidgetType {
  override eq(_other: HorizontalRuleWidget): boolean {
    return true;
  }

  override toDOM(_view: EditorView): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-hr-widget";
    return span;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

/* ---------------- The HorizontalRule rule ---------------- */

// Stateless → one shared decoration; allocating per node per viewport build
// is pure GC pressure.
const HR_REPLACE = Decoration.replace({ widget: new HorizontalRuleWidget() });

/** The rule the caret is inside, between two of its characters. */
function ruleAroundCaret(state: EditorState): { from: number; to: number } | null {
  const { head, empty } = state.selection.main;
  const line = state.doc.lineAt(head);
  if (!empty || head === line.from || head === line.to) return null;
  for (let node: NodeLike | null = treeAt(state, head).resolveInner(head, 1); node; node = node.parent) {
    if (node.name === "HorizontalRule") return head > node.from && head < node.to ? node : null;
  }
  return null;
}

/**
 * `---` → a styled `<hr>` widget, except while the caret is inside it. A
 * widget has no place for a caret between its characters: the browser draws
 * the caret after it and types there. Only an edit puts the caret inside (a
 * dash typed in front of a rule, the `****` of an empty bold), and then the
 * source shows, with the caret where the next key goes.
 */
export const horizontalRuleRule: NodeRule = (ctx) => {
  const open = ruleAroundCaret(ctx.state);
  return open && open.from === ctx.from ? { paint: "none" } : { paint: "widget", deco: HR_REPLACE };
};

/** Did the caret go into or out of a rule without an edit? */
export function ruleCaretChanged(update: ViewUpdate): boolean {
  return update.selectionSet && ruleAroundCaret(update.startState)?.from !== ruleAroundCaret(update.state)?.from;
}
