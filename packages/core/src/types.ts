/**
 * Core value types for the editor's public surface.
 *
 * `SourceRange` is a half-open byte range into the document; `DocumentTextChange`
 * describes one edit. They are structurally identical to the host app's own
 * range/change types, so a host can pass its `onChange` straight through without
 * adapting — structural typing makes them interchangeable.
 */

/** A half-open range into the document, in UTF-8 byte offsets. */
export interface SourceRange {
  start: number;
  end: number;
}

/** One text edit: the replaced byte range and the text inserted in its place. */
export interface DocumentTextChange {
  range: SourceRange;
  text: string;
}
