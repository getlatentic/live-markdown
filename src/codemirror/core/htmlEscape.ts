/** Entity-escaping for the string renderers (table cells), which build HTML
 *  text rather than DOM and so must neutralise markup in document content. */

export function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}
