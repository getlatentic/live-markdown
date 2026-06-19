/**
 * Horizontal-rule widget — replaces `---` / `***` / `___` source
 * with a styled inline `<span>` that draws a horizontal line.
 *
 * Kept as an inline widget (not `block: true`) so the line still
 * participates in CM6's normal line-metric measurement; CSS draws
 * the rule via a full-width border.
 */

import { EditorView, WidgetType } from "@codemirror/view";

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
