/**
 * Mermaid rendering, decoupled from CodeMirror — shared by the editor widget,
 * the document export (which ships the SVG to the backend), and the clipboard
 * (which needs a PNG, since Google Docs/Word drop SVG on paste).
 *
 * The mermaid library is heavy (~2 MB minified), so it loads lazily on the
 * first diagram — bundled with the app, never fetched at runtime, so diagrams
 * work fully offline. Render results are cached by source text; PNGs are
 * rasterised once per diagram in the background (see {@link warmMermaidPng})
 * so the SYNCHRONOUS copy event can embed them from cache.
 */

export type MermaidRenderResult = { ok: true; svg: string } | { ok: false; message: string };

/** Whether a fence info string denotes a rendered mermaid diagram — the tag
 *  alone, any casing, no trailing meta ("mermaid title=x" is source, not a
 *  diagram). The one definition shared by the editor plugin, the export's SVG
 *  collector, and the clipboard, so every surface classifies identically. */
export function isMermaidFenceInfo(info: string): boolean {
  return /^mermaid\s*$/i.test(info.trim());
}

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
      // SVG-native <text> labels, not <foreignObject> HTML: canvas refuses to
      // rasterise foreignObject content (the clipboard PNG taints), and
      // text-only SVGs travel better through the export paths. The root key
      // is what mermaid 11.16 honours (`flowchart.htmlLabels` is deprecated
      // and loses to the root's default).
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      class: { htmlLabels: false },
      // On a parse error mermaid otherwise injects its own bomb-icon SVG
      // into <body>; callers render their own error states.
      suppressErrorRendering: true,
    });
    return mermaid;
  });
  return mermaidLoader;
}

let renderSeq = 0;

/** Render results by fence source. Bounded: a doc being actively rewritten
 *  produces a new key per keystroke-burst, and SVG strings are not small. */
const svgCache = new Map<string, MermaidRenderResult>();
const SVG_CACHE_CAP = 100;

function remember(source: string, result: MermaidRenderResult): void {
  if (svgCache.size >= SVG_CACHE_CAP) {
    const oldest = svgCache.keys().next().value;
    if (oldest !== undefined) svgCache.delete(oldest);
  }
  svgCache.set(source, result);
}

/** The cached render for a source, or null — the SYNCHRONOUS path. The widget
 *  uses it to fill a re-created diagram in the same task (no pending flash, no
 *  measure churn on caret-in/out toggles). */
export function getCachedMermaidSvg(source: string): MermaidRenderResult | null {
  return svgCache.get(source) ?? null;
}

/** Render a mermaid diagram source to SVG, memoised by source. Never rejects —
 *  a parse error resolves to `{ ok: false, message }`. */
export async function renderMermaidToSvg(source: string): Promise<MermaidRenderResult> {
  const cached = svgCache.get(source);
  if (cached) return cached;
  let result: MermaidRenderResult;
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

// ── PNG side (clipboard) ─────────────────────────────────────────────────────
//
// Keys are the TRIMMED diagram source: the markdown pipeline hands the
// clipboard a fence body with a trailing newline, the widget hands the warm
// path the fence's inner text — trimming is the meeting point (the export's
// SVG map uses the same convention).

const pngCache = new Map<string, string>();
const pngPending = new Set<string>();
const PNG_CACHE_CAP = 24;

/** The cached PNG data URI for a diagram source, if it has been rasterised. */
export function getCachedMermaidPng(source: string): string | null {
  return pngCache.get(source.trim()) ?? null;
}

/** Render + rasterise a diagram in the background so a LATER (synchronous)
 *  clipboard copy can embed it from cache. Fire-and-forget: failures leave the
 *  cache empty and the copy degrades to the source block. */
export async function warmMermaidPng(source: string): Promise<void> {
  const key = source.trim();
  if (key === "" || pngCache.has(key) || pngPending.has(key)) return;
  pngPending.add(key);
  try {
    const rendered = await renderMermaidToSvg(key);
    if (!rendered.ok) return;
    const png = await rasterizeSvgToPngDataUri(rendered.svg);
    if (!png) return;
    if (pngCache.size >= PNG_CACHE_CAP) {
      const oldest = pngCache.keys().next().value;
      if (oldest !== undefined) pngCache.delete(oldest);
    }
    pngCache.set(key, png);
  } finally {
    pngPending.delete(key);
  }
}

/** Rasterise an SVG string to a PNG data URI at `scale`× its intrinsic size
 *  (2× by default, so the pasted image stays sharp on retina targets).
 *  Resolves null when the SVG has no readable dimensions or drawing fails. */
export async function rasterizeSvgToPngDataUri(svg: string, scale = 2): Promise<string | null> {
  const dims = svgDimensions(svg);
  if (!dims) return null;
  // WebKit refuses to draw an SVG image without explicit width/height (mermaid
  // emits width="100%" + a viewBox), so pin the intrinsic size first.
  const sized = withExplicitSize(svg, dims);
  const url = URL.createObjectURL(new Blob([sized], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("svg image failed to load"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(dims.width * scale));
    canvas.height = Math.max(1, Math.round(dims.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Intrinsic diagram size from the root svg's viewBox (mermaid always emits
 *  one), falling back to numeric width/height attributes. */
function svgDimensions(svg: string): { width: number; height: number } | null {
  const root = svg.match(/<svg[^>]*>/)?.[0];
  if (!root) return null;
  const viewBox = root.match(/viewBox\s*=\s*"([\d.\s+-]+)"/)?.[1]?.trim().split(/\s+/);
  if (viewBox?.length === 4) {
    const width = Number(viewBox[2]);
    const height = Number(viewBox[3]);
    if (width > 0 && height > 0) return { width, height };
  }
  const width = Number(root.match(/\bwidth\s*=\s*"([\d.]+)"/)?.[1]);
  const height = Number(root.match(/\bheight\s*=\s*"([\d.]+)"/)?.[1]);
  return width > 0 && height > 0 ? { width, height } : null;
}

function withExplicitSize(svg: string, dims: { width: number; height: number }): string {
  return svg.replace(/<svg([^>]*)>/, (_match, attrs: string) => {
    const cleaned = attrs
      .replace(/\swidth\s*=\s*"[^"]*"/, "")
      .replace(/\sheight\s*=\s*"[^"]*"/, "");
    return `<svg${cleaned} width="${dims.width}" height="${dims.height}">`;
  });
}
