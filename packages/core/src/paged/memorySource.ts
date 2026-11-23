/**
 * A paged source over text held in memory, for tests and for trying the
 * paged view without a file. A window starts and ends at the start of a
 * section (`## `) after an empty line, as a source over a file does at the
 * places its index names.
 */
import type { PagedSource, PagedWindow } from "./source";

export interface MemorySource extends Required<PagedSource> {
  /** The text of the bytes `[from, to)`. */
  read(from: number, to: number): string;
  /** The whole text as it stands. */
  text(): string;
}

/** Every "\n\n## " in `bytes`: the byte the "#" is at. The start and the
 *  end of the text are starts too. */
function sectionStarts(bytes: Uint8Array): number[] {
  const starts: number[] = [0];
  for (let at = 0; at + 4 < bytes.length; at++) {
    if (bytes[at] === 10 && bytes[at + 1] === 10 && bytes[at + 2] === 35 && bytes[at + 3] === 35) starts.push(at + 2);
  }
  starts.push(bytes.length);
  return starts;
}

export function memorySource(text: string): MemorySource {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let bytes = encoder.encode(text);
  let starts = sectionStarts(bytes);
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
    get size() {
      return bytes.length;
    },
    read,
    text: () => decoder.decode(bytes),
    window: async (around, target) => {
      const from = startAtOrBefore(Math.min(around, bytes.length - 1));
      return window(from, startAtOrAfter(Math.max(from + target, around + 1)));
    },
    windowFrom: async (from, target) => window(from, startAtOrAfter(Math.min(bytes.length, from + target))),
    windowBefore: async (end, target) => window(startAtOrBefore(Math.max(0, end - target)), end),
    edit: async (from, to, added) => {
      if (from > to || to > bytes.length) throw new Error(`an edit of bytes ${from} to ${to} is outside a text of ${bytes.length}`);
      const insert = encoder.encode(added);
      const next = new Uint8Array(bytes.length - (to - from) + insert.length);
      next.set(bytes.subarray(0, from));
      next.set(insert, from);
      next.set(bytes.subarray(to), from + insert.length);
      bytes = next;
      starts = sectionStarts(bytes);
    },
  };
}
