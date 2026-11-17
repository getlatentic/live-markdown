/**
 * Clipboard HTML → Markdown (#134), the paste half of clipboard interop.
 *
 * Real-world clipboard HTML is hostile: Google Docs wraps everything in a
 * `<b id="docs-internal-guid…" style="font-weight:normal">` and expresses ALL
 * formatting as `<span style>`; Word exports `mso-` styled soup. The DOM is
 * normalized here first — styled spans become real `<strong>/<em>/<s>`
 * elements, wrapper lies are unwrapped — so turndown converts semantics, not
 * vendor quirks.
 */

import TurndownService from "turndown";
// @ts-expect-error — no published types; the joplin fork is the maintained
// GFM ruleset (tables, strikethrough, task lists).
import { gfm } from "@joplin/turndown-plugin-gfm";

/** Marks HTML that Compose itself put on the clipboard (see copyRich.ts).
 *  The paste handler sees it and uses the lossless text/plain markdown
 *  instead of re-converting our own rendering. */
export const COMPOSE_CLIPBOARD_ATTR = "data-compose-markdown";

export function isComposeClipboardHtml(html: string): boolean {
  return html.includes(COMPOSE_CLIPBOARD_ATTR);
}

function isBoldStyle(style: CSSStyleDeclaration): boolean {
  const weight = style.fontWeight;
  const numeric = Number(weight);
  return weight === "bold" || weight === "bolder" || (!Number.isNaN(numeric) && numeric >= 600);
}

/** Rewrite vendor styling into semantic elements, in place. */
function normalizeVendorDom(root: HTMLElement): void {
  // Google Docs signs its fragments with a guid-carrying <b> whose
  // font-weight is NORMAL — unwrap it or the whole paste turns bold.
  root.querySelectorAll("b[id^='docs-internal-guid']").forEach((wrapper) => {
    wrapper.replaceWith(...Array.from(wrapper.childNodes));
  });

  // Docs also wraps every list item's content in a <p>, which converts as a
  // LOOSE list (`-   item` + blank lines). Unwrap sole-child paragraphs so
  // lists come out tight, the house style.
  root.querySelectorAll("li > p:only-child").forEach((p) => {
    p.replaceWith(...Array.from(p.childNodes));
  });

  // Styled spans → semantic elements (Docs never emits <strong>/<em>).
  // Nested wrappers so bold+italic+strike combinations all survive.
  root.querySelectorAll("span").forEach((span) => {
    const style = span.style;
    if (!style) return;
    const tags: string[] = [];
    if (isBoldStyle(style)) tags.push("strong");
    if (style.fontStyle === "italic") tags.push("em");
    if (style.textDecoration.includes("line-through")) tags.push("s");
    if (tags.length === 0) return;
    const doc = span.ownerDocument;
    const outermost = doc.createElement(tags[0]);
    let innermost = outermost;
    for (const tag of tags.slice(1)) {
      const next = doc.createElement(tag);
      innermost.appendChild(next);
      innermost = next;
    }
    innermost.append(...Array.from(span.childNodes));
    span.replaceWith(outermost);
  });
}

function buildTurndown(): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
  });
  service.use(gfm);
  // Stock turndown pads every bullet to `-   ` (a 4-char unit). House style
  // is the tight `- item` / `1. item`, with continuation lines indented to
  // the marker's own width — still CommonMark-correct for nesting.
  service.addRule("tightListItem", {
    filter: "li",
    replacement: (content, node, options) => {
      const parent = node.parentNode as HTMLElement;
      let prefix = `${options.bulletListMarker} `;
      if (parent.nodeName === "OL") {
        const items = Array.from(parent.children).filter((child) => child.nodeName === "LI");
        const start = Number(parent.getAttribute("start") ?? "1");
        prefix = `${start + items.indexOf(node as Element)}. `;
      }
      const indent = " ".repeat(prefix.length);
      const inner = content
        .replace(/^\n+/, "")
        .replace(/\n+$/, "\n")
        .replace(/\n/gm, `\n${indent}`);
      return prefix + inner + (node.nextSibling && !/\n$/.test(inner) ? "\n" : "");
    },
  });
  // Images degrade honestly (#134): a remote image becomes a LINK — never a
  // hot-loading `![...]` embed — and an inline data: blob keeps only its alt
  // text (a base64 wall would bury the document).
  service.addRule("imagesAsLinks", {
    filter: "img",
    replacement: (_content, node) => {
      const img = node as HTMLImageElement;
      const alt = img.getAttribute("alt")?.trim() || "image";
      const src = img.getAttribute("src") ?? "";
      if (!src || src.startsWith("data:")) return alt === "image" ? "" : alt;
      return `[${alt}](${src})`;
    },
  });
  return service;
}

let service: TurndownService | null = null;

/** Convert clipboard HTML to house-style Markdown. Returns "" when nothing
 *  convertible remains (caller falls back to the native plain paste). */
export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.body.querySelectorAll("style,script,meta,head,title").forEach((el) => el.remove());
  normalizeVendorDom(doc.body);
  service ??= buildTurndown();
  return service.turndown(doc.body.innerHTML).trim();
}
