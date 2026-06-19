import { EditorView, WidgetType } from "@codemirror/view";

export class CellDividerWidget extends WidgetType {
  override eq(_other: CellDividerWidget): boolean {
    return true;
  }
  override toDOM(_view: EditorView): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-table-divider";
    return span;
  }
  override ignoreEvent(): boolean {
    return false;
  }
}
