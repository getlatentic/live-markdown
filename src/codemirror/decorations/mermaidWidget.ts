/**
 * Mermaid diagram widget — a closed ```mermaid fence rendered as a diagram
 * block. Clicking the diagram moves the caret into the fence, which flips the
 * block back to source (mermaidPlugin owns that swap).
 *
 * Rendering itself (lazy mermaid load, SVG cache, clipboard PNG warm-up) lives
 * in [mermaidRender](./mermaidRender.ts) — this file owns only the widget:
 * measured heights are cached by source so `estimatedHeight` answers with the
 * real height and re-created widgets never shift the scroll position (the
 * #120 contract).
 */

import { EditorView, WidgetType } from "@codemirror/view";

import {
  getCachedMermaidSvg,
  renderMermaidToSvg,
  warmMermaidPng,
  type MermaidRenderResult,
} from "./mermaidRender";

type RenderResult = MermaidRenderResult;

const measuredHeights = new Map<string, number>();
const MEASURED_CACHE_CAP = 100;

function rememberHeight(source: string, height: number): void {
  if (measuredHeights.size >= MEASURED_CACHE_CAP) {
    const oldest = measuredHeights.keys().next().value;
    if (oldest !== undefined) measuredHeights.delete(oldest);
  }
  measuredHeights.set(source, height);
}

/** Pre-measure estimate: diagram height doesn't map cleanly onto source
 *  lines, but ~a node-row per line is the right order of magnitude, and the
 *  measured cache replaces the guess after the first real render. */
export function estimateMermaidHeight(source: string): number {
  const lines = source === "" ? 1 : source.split("\n").length;
  return Math.min(520, Math.max(140, 96 + lines * 32));
}

/** The rendered source per container, so `updateDOM` can tell a
 *  selection-only flip (toggle a class in place) from a source change
 *  (rebuild + re-render). */
const containerSources = new WeakMap<HTMLElement, string>();

export class MermaidWidget extends WidgetType {
  constructor(
    readonly source: string,
    /** The fence is covered by a (spanning) selection — native selection
     *  paints nothing over a block widget, so the widget shows its own
     *  selected state. */
    readonly selected = false,
  ) {
    super();
  }

  /** Identity = source + selected. Edits elsewhere shift the fence's position
   *  but must not tear down the diagram DOM; a selected flip alone updates
   *  the class in place via {@link updateDOM}. */
  override eq(other: MermaidWidget): boolean {
    return other.source === this.source && other.selected === this.selected;
  }

  override updateDOM(dom: HTMLElement): boolean {
    if (containerSources.get(dom) !== this.source) return false;
    dom.classList.toggle("cm-mermaid-block--selected", this.selected);
    return true;
  }

  override toDOM(view: EditorView): HTMLElement {
    const container = document.createElement("div");
    container.className = "cm-mermaid-block";
    if (this.selected) container.classList.add("cm-mermaid-block--selected");
    containerSources.set(container, this.source);
    container.setAttribute("role", "img");
    container.setAttribute("aria-label", "Mermaid diagram — click to select, double-click to edit");
    container.title = "Click to select · double-click to edit";
    // A diagram is an OBJECT first: click selects the whole fence (still
    // rendered — the reveal rule ignores spanning selections), so ⌘C copies
    // it without ever flashing to source. Editing is the deliberate action:
    // double-click, or the Edit chip.
    container.addEventListener("mousedown", (event) => {
      event.preventDefault();
      if (event.detail >= 2) {
        revealSource(view, container);
      } else {
        selectFenceBlock(view, container);
      }
    });

    const cached = getCachedMermaidSvg(this.source);
    if (cached) {
      this.fill(container, cached, view);
    } else {
      container.classList.add("cm-mermaid-block--pending");
      container.textContent = "Rendering diagram…";
      void renderMermaidToSvg(this.source).then((result) => {
        if (!container.isConnected) return;
        container.classList.remove("cm-mermaid-block--pending");
        container.textContent = "";
        this.fill(container, result, view);
      });
    }
    return container;
  }

  private fill(container: HTMLElement, result: RenderResult, view: EditorView): void {
    if (result.ok) {
      container.innerHTML = result.svg;
      // The hover-revealed Edit chip is the pointer path INTO the source
      // (alongside double-click); a plain click selects the diagram instead.
      const edit = document.createElement("span");
      edit.className = "cm-mermaid-edit";
      edit.setAttribute("role", "button");
      edit.setAttribute("aria-label", "Edit diagram source");
      edit.title = "Edit source";
      edit.textContent = "Edit";
      edit.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        revealSource(view, container);
      });
      container.appendChild(edit);
      // Rasterise a clipboard PNG in the background — the copy event is
      // synchronous, so it can only embed diagrams warmed ahead of time.
      // Deferred off the paint path (NOT requestIdleCallback: WebKit never
      // runs it while the window is unfocused).
      window.setTimeout(() => void warmMermaidPng(this.source), 300);
    } else {
      container.classList.add("cm-mermaid-block--error");
      const title = document.createElement("div");
      title.className = "cm-mermaid-error__title";
      title.textContent = "Mermaid couldn't render this diagram — click to edit the source";
      const message = document.createElement("pre");
      message.className = "cm-mermaid-error__message";
      message.textContent = result.message;
      container.append(title, message);
    }
    // Record the real height in a controlled measure pass — never let CM
    // discover the layout shift mid-scroll.
    view.requestMeasure({
      read: () => {
        if (container.isConnected && container.offsetHeight > 0) {
          rememberHeight(this.source, container.offsetHeight);
        }
      },
    });
  }

  /** The widget owns its events (click-to-edit); CM must not also react. */
  override ignoreEvent(): boolean {
    return true;
  }

  override get estimatedHeight(): number {
    return measuredHeights.get(this.source) ?? estimateMermaidHeight(this.source);
  }
}

/** Move the caret onto the fence's first content line (the opener when the
 *  fence is empty) — the plugin sees the selection inside and reveals the
 *  source in the widget's place. */
function revealSource(view: EditorView, container: HTMLElement): void {
  const fenceStart = view.posAtDOM(container);
  const opener = view.state.doc.lineAt(fenceStart);
  view.dispatch({
    selection: { anchor: Math.min(opener.to + 1, view.state.doc.length) },
  });
  view.focus();
}

/** Select the whole fence as one block. Both endpoints sit ON the fence's
 *  boundaries — not inside — so the diagram stays rendered while selected,
 *  and ⌘C picks up the full fence markdown (which the clipboard enrichment
 *  turns back into the diagram). */
function selectFenceBlock(view: EditorView, container: HTMLElement): void {
  const fenceStart = view.posAtDOM(container);
  const doc = view.state.doc;
  const opener = doc.lineAt(fenceStart);
  const markChar = opener.text.trim()[0];
  const markCount = opener.text.trim().length - opener.text.trim().replace(/^(`+|~+)/, "").length;
  const closerRe = new RegExp(`^\\s*\\${markChar}{${Math.max(markCount, 3)},}\\s*$`);
  let end = opener.to;
  for (let lineNumber = opener.number + 1; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber);
    end = line.to;
    if (closerRe.test(line.text)) break;
  }
  view.dispatch({ selection: { anchor: opener.from, head: end } });
  view.focus();
}
