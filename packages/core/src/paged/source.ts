/**
 * A file too large to hold, as the view reads it: a window at a time.
 * Places in the file are bytes, as on disk; the text of a window is a string.
 */

/** A piece of the file's text. */
export interface PagedWindow {
  /** The bytes of the file the text covers. */
  from: number;
  to: number;
  /** The number of the first line, from 0, where it is known. */
  firstLine: number | null;
  text: string;
  /** The window starts where a block starts with nothing open above it, so
   *  its text reads as it would after reading the whole file. */
  exact: boolean;
}

export interface PagedSource {
  /** Bytes in the file. */
  readonly size: number;
  /** About `target` bytes of text with the byte `around` in it. */
  window(around: number, target: number): Promise<PagedWindow>;
  /** About `target` bytes of text that start at the byte `from`, which is
   *  where an earlier window ended. */
  windowFrom(from: number, target: number): Promise<PagedWindow>;
  /** About `target` bytes of text that end at the byte `end`, which is where
   *  an earlier window started. */
  windowBefore(end: number, target: number): Promise<PagedWindow>;
}
