// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";

import { byteOffsetAt, byteRangeOf } from "./byteOffset";
import { destroyEditors, makeEditor } from "./core/editorTestHarness";

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

// Well-formed code points only (no lone surrogates), mixing all four UTF-8
// widths: ASCII (1 byte), Latin/Greek (2), BMP symbols (3), astral/emoji (4).
const codePointArb = fc.integer({ min: 0, max: 0x10ffff }).filter((c) => c < 0xd800 || c > 0xdfff);
const unicodeText = fc.array(codePointArb, { maxLength: 40 }).map((cps) => String.fromCodePoint(...cps));
const utf8Len = (s: string) => new TextEncoder().encode(s).length;

describe("byteOffset (property)", () => {
  it("equals the platform UTF-8 encoder at every code-point boundary", () => {
    fc.assert(
      fc.property(unicodeText, (text) => {
        const state = EditorState.create({ doc: text });
        // Walk code-point boundaries — what real selections and excerpts produce
        // (UI cursor motion and hit-testing land on grapheme/code-point breaks).
        // At each, the byte offset must equal the platform UTF-8 encoder for the
        // prefix — the UTF-16↔UTF-8 conversion that drifted before. A byte offset
        // *inside* a surrogate pair is undefined, so it's out of scope by design.
        let pos = 0;
        for (const ch of text) {
          expect(byteOffsetAt(state, pos)).toBe(utf8Len(text.slice(0, pos)));
          pos += ch.length; // 1 (BMP) or 2 (astral) UTF-16 units
        }
        expect(byteOffsetAt(state, text.length)).toBe(utf8Len(text));
      }),
    );
  });
});
