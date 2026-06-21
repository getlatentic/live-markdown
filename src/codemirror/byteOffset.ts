import { type EditorState } from "@codemirror/state";

import { type SourceRange } from "../types";

/**
 * The editor's public {@link SourceRange} is contracted in UTF-8 byte offsets
 * (see types.ts) — that's what the host persists and maps with (chat excerpt
 * line:col, comment anchoring). CodeMirror, though, indexes the document in
 * UTF-16 code units. Convert at the one boundary where a range leaves the
 * editor (the selection snapshot, the table excerpt) so a multi-byte character
 * before the position doesn't skew the reported offset. For all-ASCII text the
 * two coincide and this is the identity.
 */
export function byteOffsetAt(state: EditorState, pos: number): number {
  const prefix = state.sliceDoc(0, pos);
  let bytes = 0;
  for (let i = 0; i < prefix.length; ) {
    const codePoint = prefix.codePointAt(i)!;
    bytes += codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
    i += codePoint >= 0x10000 ? 2 : 1;
  }
  return bytes;
}

/** A {@link SourceRange} (byte offsets) for the CM code-unit span `[from, to)`. */
export function byteRangeOf(state: EditorState, from: number, to: number): SourceRange {
  return { start: byteOffsetAt(state, from), end: byteOffsetAt(state, to) };
}
