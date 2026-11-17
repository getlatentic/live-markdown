/**
 * Inline image widget — renders markdown `![alt](url)` as a real
 * `<img>` element.
 *
 * Source resolution goes through `resolveDisplaySrc` (the same
 * function the Tiptap editor uses), so workspace-relative paths
 * become `asset://…` URLs that the Tauri WebKit can stream from
 * disk.
 *
 * Click handling is intentionally minimal in this phase: the widget
 * doesn't intercept clicks, so a click lands the caret at the
 * widget's boundary. Spec section 7.6 calls for "click selects image
 * block + toolbar"; that ships when the image metadata editor lands
 * in a later phase.
 */

import { Facet } from "@codemirror/state";
import { type NodeRule, type Paint } from "../core/paint";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";

import { type ImageResolveContext } from "../../imageSrcResolver";
import { resolveImageSrcFacet } from "../core/hostFacets";
import { showImageActionMenu } from "./imageActionMenu";

/**
 * Resolver facet — wired by the React editor so the plugin can turn
 * relative `images/foo.png` into a `<img src=…>` the webview can
 * fetch. Combine returns the first registered resolver, or a no-op
 * if none.
 */
export const imageContextFacet = Facet.define<
  ImageResolveContext,
  ImageResolveContext
>({
  combine: (values) => values[0] ?? { fileDir: null },
});

/** Rendered heights per image, so a re-render (tab switch, edits above)
 *  reserves the real space instead of re-guessing. Keyed by resolve context +
 *  src — the same image in two docs can render at different widths. */
const measuredImageHeights = new Map<string, number>();

/** Pre-load estimate. CM6 places everything below an unmeasured widget with
 *  this; images previously claimed one text line, so each unloaded image hid
 *  ~180px of scroll error that surfaced as a viewport jump on load. */
const IMAGE_ESTIMATE_PX = 200;

export class ImageWidget extends WidgetType {
  private readonly measureKey: string;

  constructor(
    readonly alt: string,
    readonly rawSrc: string,
    readonly ctx: ImageResolveContext,
    /** Source range of the `![alt](src)` markdown that produced this widget. */
    readonly sourceFrom: number,
    readonly sourceTo: number,
  ) {
    super();
    this.measureKey = `${ctx.fileDir ?? ""}\n${rawSrc}`;
  }

  override eq(other: ImageWidget): boolean {
    return (
      other.alt === this.alt &&
      other.rawSrc === this.rawSrc &&
      other.ctx.fileDir === this.ctx.fileDir &&
      other.sourceFrom === this.sourceFrom
    );
  }

  override toDOM(view: EditorView): HTMLElement {
    const img = document.createElement("img");
    img.className = "cm-image-widget";
    img.alt = this.alt;
    img.src = view.state.facet(resolveImageSrcFacet)(this.rawSrc, this.ctx);
    img.loading = "lazy";
    // The real height arrives asynchronously; record it and re-measure NOW —
    // in a controlled pass — rather than letting CM discover the layout shift
    // during the user's next scroll or selection.
    img.addEventListener("load", () => {
      const height = img.offsetHeight || img.naturalHeight;
      if (height > 0) {
        measuredImageHeights.set(this.measureKey, height);
      }
      view.requestMeasure();
    });
    img.addEventListener("error", () => view.requestMeasure());
    img.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showImageActionMenu({
        x: e.clientX,
        y: e.clientY,
        view,
        alt: this.alt,
        rawSrc: this.rawSrc,
        sourceFrom: this.sourceFrom,
        sourceTo: this.sourceTo,
      });
    });
    return img;
  }

  override ignoreEvent(): boolean {
    return false;
  }

  override get estimatedHeight(): number {
    return measuredImageHeights.get(this.measureKey) ?? IMAGE_ESTIMATE_PX;
  }
}

/* ---------------- The Image rule ---------------- */

/** `![alt](src)` → an inline `<img>` widget; src resolution via the host
 *  facet (workspace-relative paths → asset URLs). */
export const imageRule: NodeRule = (ctx): Paint => {
  const state = ctx.state;
  const label = ctx.node.getChild("LinkLabel");
  const url = ctx.node.getChild("URL");
  const alt = label ? state.sliceDoc(label.from, label.to) : "";
  const rawSrc = url ? state.sliceDoc(url.from, url.to) : "";
  const imageCtx = state.facet(imageContextFacet);
  return {
    paint: "widget",
    deco: Decoration.replace({
      widget: new ImageWidget(alt, rawSrc, imageCtx, ctx.from, ctx.to),
    }),
  };
};
