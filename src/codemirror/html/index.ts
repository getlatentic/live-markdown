/**
 * Inline/block HTML in markdown: DOMPurify-sanitized rendering, plus the
 * "would this sanitize to something visible?" guard that keeps stripped tags
 * (`<yourname>`, `</b>`) as visible raw text instead of invisible holes.
 */
export * from "./htmlWidget";
