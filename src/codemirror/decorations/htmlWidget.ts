import DOMPurify from "dompurify";

import { type NodeRule, type Paint, none } from "./paint";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";

const SANITIZE_CONFIG = {
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button"] as string[],
  FORBID_ATTR: ["on*"] as string[],
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?|mailto|tel|data:image\/(?:png|jpeg|gif|webp|svg\+xml)):)/i,
  RETURN_TRUSTED_TYPE: false,
};

/**
 * Would this HTML draw anything the user can SEE once sanitized? A stripped
 * or unknown tag (`<yourname>`, `</b>`, `<script>…`) sanitizes to nothing —
 * replacing such a span with a widget renders the user's text invisibly, the
 * same dead-zone class as the hidden bare-URL bug. Callers keep the raw
 * source visible instead of widget-replacing when this is false.
 */
export function htmlRendersVisibly(html: string): boolean {
  const probe = document.createElement("template");
  probe.innerHTML = DOMPurify.sanitize(html, SANITIZE_CONFIG) as unknown as string;
  const content = probe.content;
  if ((content.textContent ?? "").trim() !== "") return true;
  return content.querySelector("img, br, hr") !== null;
}

export class HtmlWidget extends WidgetType {
  constructor(
    readonly html: string,
    readonly isBlock: boolean,
  ) {
    super();
  }

  override eq(other: HtmlWidget): boolean {
    return other.html === this.html && other.isBlock === this.isBlock;
  }

  override toDOM(_view: EditorView): HTMLElement {
    const container = document.createElement(this.isBlock ? "div" : "span");
    container.className = this.isBlock ? "cm-html-block" : "cm-html-inline";
    container.innerHTML = DOMPurify.sanitize(this.html, SANITIZE_CONFIG) as unknown as string;
    return container;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

/* ---------------- The HTMLTag / HTMLBlock rules ---------------- */

/** An inline `<tag>` → rendered HTML; a tag that sanitizes to nothing visible
 *  (`<yourname>`, `</b>`, `<script>`) stays raw text — never an invisible
 *  hole where the user's typing vanished. */
export const htmlInlineRule: NodeRule = (ctx): Paint => {
  const html = ctx.state.sliceDoc(ctx.from, ctx.to);
  if (!htmlRendersVisibly(html)) return none;
  return { paint: "widget", deco: Decoration.replace({ widget: new HtmlWidget(html, false) }) };
};

/** A single-line HTML block → rendered HTML. Multi-line blocks stay raw
 *  source: they fail CM6's "no plugin-level multi-line replace" rule, until a
 *  StateField carries them (Phase 5). Same invisible-hole guard as inline. */
export const htmlBlockRule: NodeRule = (ctx): Paint => {
  const doc = ctx.state.doc;
  if (doc.lineAt(ctx.from).number !== doc.lineAt(ctx.to).number) return none;
  const html = ctx.state.sliceDoc(ctx.from, ctx.to);
  if (!htmlRendersVisibly(html)) return none;
  return { paint: "widget", deco: Decoration.replace({ widget: new HtmlWidget(html, true) }) };
};
