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

export class MermaidWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }

  /** Source-only identity: edits elsewhere shift the fence's position but
   *  must not tear down (and re-render) the diagram DOM. */
  override eq(other: MermaidWidget): boolean {
    return other.source === this.source;
  }

  override toDOM(view: EditorView): HTMLElement {
    const container = document.createElement("div");
    container.className = "cm-mermaid-block";
    container.setAttribute("role", "img");
    container.setAttribute("aria-label", "Mermaid diagram — click to edit the source");
    container.title = "Click to edit the diagram source";
    container.addEventListener("mousedown", (event) => {
      event.preventDefault();
      revealSource(view, container);
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
      // Hover-revealed click-to-edit cue (the block itself stays cursor-plain —
      // a diagram is content, not a button). Purely visual: the container's
      // mousedown handler owns the actual reveal, chip included.
      const edit = document.createElement("span");
      edit.className = "cm-mermaid-edit";
      edit.setAttribute("aria-hidden", "true");
      edit.textContent = "Edit";
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
