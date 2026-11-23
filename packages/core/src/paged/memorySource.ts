/**
 * A paged source over text held in memory, for tests and for trying the
 * paged view without a file. A window starts and ends at the start of a
 * section (`## `) after an empty line, as a source over a file does at the
 * places its index names.
 */
import type { PagedSource, PagedWindow } from "./source";

export function memorySource(text: string): PagedSource & { read(from: number, to: number): string } {
  const bytes = new TextEncoder().encode(text);
  const decoder = new TextDecoder();
  // Every "\n\n## " in the bytes: the byte the "#" is at.
  const starts: number[] = [0];
  for (let at = 0; at + 4 < bytes.length; at++) {
    if (bytes[at] === 10 && bytes[at + 1] === 10 && bytes[at + 2] === 35 && bytes[at + 3] === 35) starts.push(at + 2);
  }
  starts.push(bytes.length);
  const lineOf = (byte: number): number => {
    let lines = 0;
    for (let at = 0; at < byte; at++) if (bytes[at] === 10) lines += 1;
    return lines;
  };
  const startAtOrBefore = (byte: number): number => starts.filter((start) => start <= byte).pop() ?? 0;
  const startAtOrAfter = (byte: number): number => starts.find((start) => start >= byte) ?? bytes.length;
  const read = (from: number, to: number): string => decoder.decode(bytes.subarray(from, to));
  const window = (from: number, to: number): PagedWindow => ({ from, to, firstLine: lineOf(from), text: read(from, to), exact: true });
  return {
    size: bytes.length,
    read,
    window: async (around, target) => {
      const from = startAtOrBefore(Math.min(around, bytes.length - 1));
      return window(from, startAtOrAfter(Math.max(from + target, around + 1)));
    },
    windowFrom: async (from, target) => window(from, startAtOrAfter(Math.min(bytes.length, from + target))),
    windowBefore: async (end, target) => window(startAtOrBefore(Math.max(0, end - target)), end),
  };
}
