import { describe, expect, it } from "vitest";

import { Held, utf8Length } from "./held";
import type { PagedWindow } from "./source";

const window = (from: number, to: number, chars: number): PagedWindow => ({ from, to, firstLine: null, text: "x".repeat(chars), exact: true });

describe("the windows a paged view holds", () => {
  it("cover the bytes from the first window's start to the last window's end", () => {
    const held = new Held();
    held.only(window(100, 200, 80));
    held.addBelow(window(200, 300, 100));
    held.addAbove(window(0, 100, 100));
    expect([held.from, held.to, held.count, held.chars]).toEqual([0, 300, 3, 280]);
  });

  it("give the length of a dropped window, so the document can drop the same text", () => {
    const held = new Held();
    held.only(window(0, 100, 90));
    held.addBelow(window(100, 200, 70));
    expect(held.dropFirst()).toBe(90);
    expect([held.from, held.to]).toEqual([100, 200]);
    held.addBelow(window(200, 300, 50));
    expect(held.dropLast()).toBe(50);
    expect([held.from, held.to]).toEqual([100, 200]);
  });

  it("place the edges of a window exactly, and its inside by share", () => {
    const held = new Held();
    held.only(window(1000, 2000, 500)); // two bytes a character
    held.addBelow(window(2000, 2400, 400)); // one byte a character
    expect(held.byteAt(0)).toBe(1000);
    expect(held.byteAt(250)).toBe(1500);
    expect(held.byteAt(500)).toBe(2000);
    expect(held.byteAt(700)).toBe(2200);
    expect(held.byteAt(900)).toBe(2400);
    expect(held.posOf(1500)).toBe(250);
    expect(held.posOf(2200)).toBe(700);
    expect(held.posOf(500)).toBe(0);
    expect(held.posOf(9999)).toBe(900);
  });
});

describe("an edit in the windows held", () => {
  const text = "aé😀b";
  const read = (from: number, to: number): string => (text + "0123456789").slice(from, to);

  it("counts a place in bytes from the text, whatever the characters are", () => {
    const held = new Held();
    held.only({ from: 500, to: 500 + utf8Length(text), firstLine: null, text, exact: true });
    held.addBelow(window(0, 10, 10));
    expect(utf8Length(text)).toBe(1 + 2 + 4 + 1);
    expect([0, 1, 2, 4, 5].map((pos) => held.exactByteAt(pos, read))).toEqual([500, 501, 503, 507, 508]);
    expect(held.exactByteAt(8, read)).toBe(511);
  });

  it("grows the window it is in and moves the windows below", () => {
    const held = new Held();
    held.only(window(100, 200, 100));
    held.addBelow(window(200, 300, 100));
    held.edited({ from: 50, to: 50, chars: 3 }, { from: 150, to: 150, added: 5 });
    expect([held.from, held.to, held.count, held.chars]).toEqual([100, 305, 2, 203]);
    expect(held.byteAt(103)).toBe(205);
    expect(held.dropFirst()).toBe(103);
    expect([held.from, held.to]).toEqual([205, 305]);
  });

  it("takes text out of each window it crosses, and drops a window it empties", () => {
    const held = new Held();
    held.only(window(0, 100, 100));
    held.addBelow(window(100, 200, 100));
    held.addBelow(window(200, 300, 100));
    held.edited({ from: 90, to: 250, chars: 1 }, { from: 90, to: 250, added: 1 });
    expect([held.from, held.to, held.count, held.chars]).toEqual([0, 141, 2, 141]);
    expect(held.dropFirst()).toBe(91);
    expect([held.from, held.to]).toEqual([91, 141]);
  });

  it("keeps a place in the file when all of the text is removed", () => {
    const held = new Held();
    held.only(window(40, 140, 100));
    held.edited({ from: 0, to: 100, chars: 0 }, { from: 40, to: 140, added: 0 });
    expect([held.from, held.to, held.count, held.chars]).toEqual([40, 40, 1, 0]);
    held.edited({ from: 0, to: 0, chars: 2 }, { from: 40, to: 40, added: 2 });
    expect([held.from, held.to, held.chars]).toEqual([40, 42, 2]);
  });
});
