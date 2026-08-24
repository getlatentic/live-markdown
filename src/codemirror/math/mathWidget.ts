import katex from "katex";
import { EditorView, WidgetType } from "@codemirror/view";

/** Typeset `tex` into `el`, falling back to the source on a KaTeX failure so a
 *  malformed expression shows what the author wrote rather than nothing. */
export function renderMathInto(el: HTMLElement, tex: string, displayMode: boolean): void {
  try {
    katex.render(tex, el, { displayMode, throwOnError: false, output: "html" });
  } catch {
    el.textContent = tex;
  }
}

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
    renderMathInto(span, this.tex, this.displayMode);
    return span;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
