/**
 * Mermaid diagram widget — a closed ```mermaid fence rendered as a diagram
 * block. Clicking the diagram moves the caret into the fence, which flips the
 * block back to source (mermaidPlugin owns that swap).
 *
 * The mermaid library is heavy (~2 MB minified), so it loads lazily on the
 * first diagram — bundled with the app, never fetched at runtime, so
 * diagrams work fully offline. Render results and measured heights are
 * cached by source text: caret-in/out toggling and edits elsewhere in the
 * doc reuse the cached SVG instead of re-running the renderer, and
 * `estimatedHeight` answers with the real measured height so re-created
 * widgets never shift the scroll position (the #120 contract).
 */

import { EditorView, WidgetType } from "@codemirror/view";

type RenderResult = { ok: true; svg: string } | { ok: false; message: string };

let mermaidLoader: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid(): Promise<typeof import("mermaid").default> {
  mermaidLoader ??= import("mermaid").then((mod) => {
    const mermaid = mod.default;
    mermaid.initialize({
      startOnLoad: false,
      // "strict" escapes HTML in labels and blocks script/click directives —
      // fence content is the user's own doc, but pasted diagrams shouldn't
      // be able to inject markup either.
      securityLevel: "strict",
      theme: "neutral",
      fontFamily: "inherit",
      // On a parse error mermaid otherwise injects its own bomb-icon SVG
      // into <body>; the widget renders the error state itself.
      suppressErrorRendering: true,
    });
    return mermaid;
  });
  return mermaidLoader;
}

let renderSeq = 0;

/** Render results by fence source. Bounded: a doc being actively rewritten
 *  produces a new key per keystroke-burst, and SVG strings are not small. */
const svgCache = new Map<string, RenderResult>();
const measuredHeights = new Map<string, number>();
const CACHE_CAP = 100;

function remember(source: string, result: RenderResult): void {
  if (svgCache.size >= CACHE_CAP) {
    const oldest = svgCache.keys().next().value;
    if (oldest !== undefined) {
      svgCache.delete(oldest);
      measuredHeights.delete(oldest);
    }
  }
  svgCache.set(source, result);
}

async function renderMermaid(source: string): Promise<RenderResult> {
  const cached = svgCache.get(source);
  if (cached) return cached;
  let result: RenderResult;
  try {
    const mermaid = await loadMermaid();
    const { svg } = await mermaid.render(`cm-mermaid-${renderSeq++}`, source);
    result = { ok: true, svg };
  } catch (error) {
    result = { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  remember(source, result);
  return result;
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

    const cached = svgCache.get(this.source);
    if (cached) {
      this.fill(container, cached, view);
    } else {
      container.classList.add("cm-mermaid-block--pending");
      container.textContent = "Rendering diagram…";
      void renderMermaid(this.source).then((result) => {
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
          measuredHeights.set(this.source, container.offsetHeight);
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
