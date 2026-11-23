import { describe, expect, it } from "vitest";

import { Held } from "./held";
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
