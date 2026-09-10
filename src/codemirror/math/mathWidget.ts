import { EditorView, WidgetType } from "@codemirror/view";

/**
 * KaTeX, fetched the first time a document actually contains math.
 *
 * It is the largest single dependency this package pulls — 293KB of a host's
 * launch bundle, measured in Compose — and most documents have no `$` in them
 * at all. A static import spends it on every launch regardless.
 *
 * The cost of deferring is one frame on the first expression in a session: the
 * element is in the DOM already, so it is typeset in place when KaTeX lands,
 * and every expression after that is synchronous.
 */
let katex: typeof import("katex").default | null = null;
let loadingKatex: Promise<void> | null = null;

function loadKatex(): Promise<void> {
  loadingKatex ??= import("katex").then((module) => {
    katex = module.default;
  });
  return loadingKatex;
}

/** Typesets still waiting on KaTeX. Anything that measures rendered output —
 *  a test, or a host exporting a document — has to wait for these. */
const pendingTypesets = new Set<Promise<void>>();

/** Resolves once every math expression asked for so far has been typeset. */
export function mathTypesettingSettled(): Promise<void> {
  return Promise.all([...pendingTypesets]).then(() => undefined);
}

function typeset(el: HTMLElement, tex: string, displayMode: boolean): void {
  try {
    katex?.render(tex, el, { displayMode, throwOnError: false, output: "html" });
  } catch {
    el.textContent = tex;
  }
}

/** Typeset `tex` into `el`, falling back to the source on a KaTeX failure so a
 *  malformed expression shows what the author wrote rather than nothing. */
export function renderMathInto(el: HTMLElement, tex: string, displayMode: boolean): void {
  if (katex) {
    typeset(el, tex, displayMode);
    return;
  }
  // Until it arrives, the source stands in — which is also the failure mode, so
  // a document that never loads KaTeX still shows what the author wrote.
  el.textContent = tex;
  const settled = loadKatex().then(() => typeset(el, tex, displayMode));
  pendingTypesets.add(settled);
  void settled.finally(() => pendingTypesets.delete(settled));
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
