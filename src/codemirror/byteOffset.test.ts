// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { byteOffsetAt, byteRangeOf } from "./byteOffset";
import { destroyEditors, makeEditor } from "./decorations/editorTestHarness";

describe("byteOffset", () => {
  afterEach(destroyEditors);

  it("is the identity for ASCII text", () => {
    const state = makeEditor("hello world", 0).state;
    expect(byteOffsetAt(state, 0)).toBe(0);
    expect(byteOffsetAt(state, 5)).toBe(5);
    expect(byteOffsetAt(state, 11)).toBe(11);
  });

  it("counts a 3-byte char (→) as 3 bytes but 1 code unit", () => {
    const state = makeEditor("a→b", 0).state; // → = U+2192, 3 UTF-8 bytes
    expect(byteOffsetAt(state, 1)).toBe(1); // after "a"
    expect(byteOffsetAt(state, 2)).toBe(4); // after "a→"
    expect(byteOffsetAt(state, 3)).toBe(5); // after "a→b"
  });

  it("counts an astral char (😀, surrogate pair) as 4 bytes / 2 code units", () => {
    const state = makeEditor("a😀b", 0).state; // 😀 = U+1F600, 4 bytes, 2 UTF-16 units
    expect(byteOffsetAt(state, 1)).toBe(1); // after "a"
    expect(byteOffsetAt(state, 3)).toBe(5); // after "a😀" (code units 1→3)
    expect(byteOffsetAt(state, 4)).toBe(6); // after "a😀b"
  });

  it("byteRangeOf maps both ends past a multi-byte run", () => {
    const state = makeEditor("→→x", 0).state; // two 3-byte arrows
    expect(byteRangeOf(state, 2, 3)).toEqual({ start: 6, end: 7 });
  });
});
