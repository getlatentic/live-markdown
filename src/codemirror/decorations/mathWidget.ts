import katex from "katex";
import { EditorView, WidgetType } from "@codemirror/view";

export class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly displayMode: boolean,
  ) {
    super();
  }

  override eq(other: MathWidget): boolean {
    return other.tex === this.tex && other.displayMode === this.displayMode;
  }

  override toDOM(_view: EditorView): HTMLElement {
    const span = document.createElement(this.displayMode ? "div" : "span");
    span.className = this.displayMode ? "cm-math-block" : "cm-math-inline";
    try {
      katex.render(this.tex, span, {
        displayMode: this.displayMode,
        throwOnError: false,
        output: "html",
      });
    } catch {
      span.textContent = this.tex;
    }
    return span;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
