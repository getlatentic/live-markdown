/**
 * The windows a paged view holds: which bytes of the file its document
 * covers, and where a place in the document is in the file.
 */
import type { PagedWindow } from "./source";

/** One window as held: its bytes in the file, and its length in the document. */
interface Piece {
  from: number;
  to: number;
  chars: number;
}

/** The windows in file order, each directly after the one before. */
export class Held {
  private pieces: Piece[] = [];

  /** The bytes of the file the document covers. */
  get from(): number {
    return this.pieces[0]?.from ?? 0;
  }

  get to(): number {
    return this.pieces[this.pieces.length - 1]?.to ?? 0;
  }

  get count(): number {
    return this.pieces.length;
  }

  /** The length of the document. */
  get chars(): number {
    return this.pieces.reduce((sum, piece) => sum + piece.chars, 0);
  }

  only(window: PagedWindow): void {
    this.pieces = [pieceOf(window)];
  }

  /** Adds the window under the last one. Its bytes are counted from where
   *  the held text ends now: edits made since it was asked for have moved
   *  that place, and not the window's text. */
  addBelow(window: PagedWindow): void {
    const from = this.pieces.length === 0 ? window.from : this.to;
    this.pieces.push({ from, to: from + (window.to - window.from), chars: window.text.length });
  }

  addAbove(window: PagedWindow): void {
    this.pieces.unshift(pieceOf(window));
  }

  /** Drops the first window. Returns its length in the document. */
  dropFirst(): number {
    return this.pieces.shift()?.chars ?? 0;
  }

  /** Drops the last window. Returns its length in the document. */
  dropLast(): number {
    return this.pieces.pop()?.chars ?? 0;
  }

  /**
   * The byte of the file at `pos` of the document. A window's text is not
   * read again to count its bytes: the place is taken as the same share of
   * the window's bytes as `pos` is of its characters. Exact at the edges of
   * a window, close inside it.
   */
  byteAt(pos: number): number {
    let start = 0;
    for (const piece of this.pieces) {
      if (pos <= start + piece.chars) {
        const share = piece.chars === 0 ? 0 : (pos - start) / piece.chars;
        return Math.round(piece.from + share * (piece.to - piece.from));
      }
      start += piece.chars;
    }
    return this.to;
  }

  /** The byte of the file at `pos` of the document, counted from the text:
   *  `read` gives the document's text between two places. */
  exactByteAt(pos: number, read: (from: number, to: number) => string): number {
    let start = 0;
    for (const piece of this.pieces) {
      if (pos <= start + piece.chars) return piece.from + utf8Length(read(start, pos));
      start += piece.chars;
    }
    return this.to;
  }

  /**
   * The document's text from `edit.from` to `edit.to`, which is the file's
   * bytes `bytes.from` to `bytes.to`, was replaced by text of `edit.chars`
   * characters and `bytes.added` bytes. The window the edit starts in takes
   * the new text; the windows below move with it.
   */
  edited(edit: { from: number; to: number; chars: number }, bytes: { from: number; to: number; added: number }): void {
    let start = 0;
    let at = this.from;
    let placed = false;
    const pieces: Piece[] = [];
    for (const piece of this.pieces) {
      const end = start + piece.chars;
      let chars = piece.chars - overlap(edit.from, edit.to, start, end);
      let length = piece.to - piece.from - overlap(bytes.from, bytes.to, piece.from, piece.to);
      if (!placed && edit.from <= end) {
        placed = true;
        chars += edit.chars;
        length += bytes.added;
      }
      start = end;
      if (chars === 0 && length === 0) continue;
      pieces.push({ from: at, to: at + length, chars });
      at += length;
    }
    this.pieces = pieces.length > 0 ? pieces : [{ from: at, to: at, chars: 0 }];
  }

  /** The place in the document of the byte `byte` of the file, by the same
   *  share; clamped to the document. */
  posOf(byte: number): number {
    let start = 0;
    for (const piece of this.pieces) {
      if (byte < piece.to) {
        const share = piece.to === piece.from ? 0 : Math.max(0, byte - piece.from) / (piece.to - piece.from);
        return Math.round(start + share * piece.chars);
      }
      start += piece.chars;
    }
    return start;
  }
}

const pieceOf = ({ from, to, text }: PagedWindow): Piece => ({ from, to, chars: text.length });

/** How much of `[from, to)` is inside `[start, end)`. */
const overlap = (from: number, to: number, start: number, end: number): number => Math.max(0, Math.min(to, end) - Math.max(from, start));

/** The number of bytes `text` is in a file. */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let at = 0; at < text.length; at++) {
    const unit = text.charCodeAt(at);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit < 0xdc00 && at + 1 < text.length) {
      // The two halves of a character outside the basic plane: four bytes.
      bytes += 4;
      at += 1;
    } else bytes += 3;
  }
  return bytes;
}
