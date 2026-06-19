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
import { EditorView, WidgetType } from "@codemirror/view";

import { type ImageResolveContext } from "../../imageSrcResolver";
import { resolveImageSrcFacet } from "./hostFacets";
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

export class ImageWidget extends WidgetType {
  constructor(
    readonly alt: string,
    readonly rawSrc: string,
    readonly ctx: ImageResolveContext,
    /** Source range of the `![alt](src)` markdown that produced this widget. */
    readonly sourceFrom: number,
    readonly sourceTo: number,
  ) {
    super();
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
}
