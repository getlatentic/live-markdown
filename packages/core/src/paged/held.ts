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

  addBelow(window: PagedWindow): void {
    this.pieces.push(pieceOf(window));
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
