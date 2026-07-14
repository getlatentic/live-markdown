/**
 * Horizontal-rule widget — replaces `---` / `***` / `___` source
 * with a styled inline `<span>` that draws a horizontal line.
 *
 * Kept as an inline widget (not `block: true`) so the line still
 * participates in CM6's normal line-metric measurement; CSS draws
 * the rule via a full-width border.
 */

import { Decoration, EditorView, WidgetType } from "@codemirror/view";

import { type NodeRule } from "./paint";

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

/** `---` → a styled `<hr>` widget. */
export const horizontalRuleRule: NodeRule = () => ({ paint: "widget", deco: HR_REPLACE });
