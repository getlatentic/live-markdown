import DOMPurify from "dompurify";
import { EditorView, WidgetType } from "@codemirror/view";

const SANITIZE_CONFIG = {
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button"] as string[],
  FORBID_ATTR: ["on*"] as string[],
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?|mailto|tel|data:image\/(?:png|jpeg|gif|webp|svg\+xml)):)/i,
  RETURN_TRUSTED_TYPE: false,
};

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
