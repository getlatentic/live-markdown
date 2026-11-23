/**
 * A markdown file of any size, shown a few windows at a time.
 *
 * The view holds a run of windows of the file as one document. As the user
 * scrolls toward an edge of it, the next window is added there and the one
 * farthest away is dropped, so the document stays about the same length
 * whatever the size of the file. The file is not edited here.
 */
import { Annotation, type ChangeSet, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

import { codeHighlight } from "../codemirror/code";
import { editorBaseTheme, markdownDecorationsPlugin, parseToEnd } from "../codemirror/core";
import { grammarAndStockKeysWith } from "../codemirror/editingStack";
import { footnoteExtension } from "../codemirror/extensions/footnoteExtension";
import { highlightExtension } from "../codemirror/extensions/highlightExtension";
import { mergeExtensions } from "../codemirror/extensions/loader";
import { mathExtension } from "../codemirror/extensions/mathExtension";
import { mermaidExtension } from "../codemirror/extensions/mermaidExtension";
import type { MarkdownExtension } from "../codemirror/extensions/types";
import { wikilinkExtension } from "../codemirror/extensions/wikilinkExtension";
import { tableField } from "../codemirror/table";
import { Held } from "./held";
import { pagedScrollbar, type PagedScrollbar } from "./scrollbar";
import type { PagedSource, PagedWindow } from "./source";

/** About how many bytes one window is. */
const WINDOW_BYTES = 256 * 1024;
/** The most windows held at once. */
const MOST_WINDOWS = 5;
/** This near an edge of the document, in characters, the next window is fetched. */
const NEAR_EDGE = 40_000;

export interface PagedViewOptions {
  /** Modules of the host's own, after the built-in ones. */
  extensions?: readonly MarkdownExtension[];
  /** The view moved: the byte of the file at its top. */
  onMove?: (byte: number) => void;
}

export interface PagedMarkdownView {
  readonly view: EditorView;
  /** Shows the text at the byte `byte` of the file. */
  jumpTo(byte: number): Promise<void>;
  /** The bytes of the file the view holds now. */
  held(): { from: number; to: number };
  /** Resolves when no window is being fetched and none is needed. */
  settled(): Promise<void>;
  destroy(): void;
}

/** Marks the transactions that swap windows: nothing else may change the text. */
const windowSwap = Annotation.define<boolean>();

/** Tables are drawn and not edited: the file is read a window at a time, and
 *  an edit here would be to a copy. */
const drawnTables: MarkdownExtension = { name: "paged-tables", version: "1.0.0", extensions: [tableField] };

function extensionsFor(host: readonly MarkdownExtension[]): Extension[] {
  const merged = mergeExtensions([wikilinkExtension, highlightExtension, footnoteExtension, mathExtension, mermaidExtension, drawnTables, ...host]);
  return [
    EditorState.readOnly.of(true),
    EditorState.changeFilter.of((tr) => tr.annotation(windowSwap) === true),
    ...grammarAndStockKeysWith(merged.grammar),
    codeHighlight,
    EditorView.lineWrapping,
    editorBaseTheme,
    markdownDecorationsPlugin,
    ...merged.extensions,
    parseToEnd,
    // The editor's scrollbar would show the windows held, not the file.
    EditorView.theme({ ".cm-scroller": { scrollbarWidth: "none" }, ".cm-scroller::-webkit-scrollbar": { display: "none" } }),
  ];
}

class Paged implements PagedMarkdownView {
  readonly view: EditorView;
  private readonly root: HTMLElement;
  private readonly scrollbar: PagedScrollbar;
  private readonly windows = new Held();
  /** Every fetch runs after the one before it, so each sees what the last
   *  one left: a window is never added to text it was not fetched for. */
  private queue: Promise<void> = Promise.resolve();
  private filling = false;
  private wantedJump: number | null = null;
  private closed = false;

  constructor(
    parent: HTMLElement,
    private readonly source: PagedSource,
    private readonly options: PagedViewOptions,
  ) {
    this.root = parent.appendChild(document.createElement("div"));
    this.root.className = "cm-paged";
    this.root.style.cssText = "display:flex;flex:1 1 auto;min-height:0;height:100%";
    const fileEnds = keymap.of([
      { key: "Mod-Home", mac: "Cmd-ArrowUp", run: () => (void this.jumpTo(0), true) },
      { key: "Mod-End", mac: "Cmd-ArrowDown", run: () => (void this.jumpTo(this.source.size), true) },
    ]);
    this.view = new EditorView({
      parent: this.root,
      state: EditorState.create({
        extensions: [fileEnds, ...extensionsFor(options.extensions ?? []), EditorView.updateListener.of((update) => (update.viewportChanged || update.geometryChanged) && this.moved())],
      }),
    });
    this.view.dom.style.cssText = "flex:1 1 auto;min-width:0;height:100%";
    this.view.scrollDOM.addEventListener("scroll", this.moved, { passive: true });
    this.scrollbar = pagedScrollbar((share) => void this.jumpTo(Math.round(share * this.source.size)));
    this.root.appendChild(this.scrollbar.element);
    void this.jumpTo(0);
  }

  held(): { from: number; to: number } {
    return { from: this.windows.from, to: this.windows.to };
  }

  jumpTo(byte: number): Promise<void> {
    // The thumb can ask for many places while one is being fetched: only
    // the last one asked for is fetched.
    this.wantedJump = Math.min(Math.max(0, byte), this.source.size);
    return this.queued(async () => {
      if (this.wantedJump === null) return;
      const wanted = this.wantedJump;
      this.wantedJump = null;
      await this.showAt(wanted);
      this.fill();
    });
  }

  async settled(): Promise<void> {
    for (;;) {
      await this.queue;
      await new Promise<void>((resolve) => this.view.requestMeasure({ read: () => resolve() }));
      if (this.closed || (!this.filling && !this.edgeNear() && this.wantedJump === null)) return;
      this.fill();
    }
  }

  destroy(): void {
    this.closed = true;
    this.view.scrollDOM.removeEventListener("scroll", this.moved);
    this.scrollbar.destroy();
    this.view.destroy();
    this.root.remove();
  }

  private queued(task: () => Promise<void>): Promise<void> {
    const run = (): Promise<void> => (this.closed ? Promise.resolve() : task());
    this.queue = this.queue.then(run, run);
    return this.queue;
  }

  /** Replaces what is held by the window with `byte` in it. */
  private async showAt(byte: number): Promise<void> {
    const window = await this.source.window(byte, WINDOW_BYTES);
    if (this.closed) return;
    this.windows.only(window);
    const { doc } = this.view.state;
    this.view.dispatch({ changes: { from: 0, to: doc.length, insert: window.text }, annotations: windowSwap.of(true) });
    // The last window of a file can be a few lines: the text above it is
    // fetched before the place is shown, so the page is full.
    if (window.text.length < NEAR_EDGE && this.windows.from > 0) await this.extend("above");
    if (this.closed) return;
    const atEnd = byte >= this.source.size;
    const pos = atEnd ? this.view.state.doc.length : this.view.state.doc.lineAt(Math.min(this.windows.posOf(byte), this.view.state.doc.length)).from;
    this.view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: atEnd ? "end" : "start" }) });
  }

  /** Which edge of the document the view is near, with more of the file beyond it. */
  private edgeNear(): "below" | "above" | null {
    const { from, to } = this.view.viewport;
    if (this.view.state.doc.length - to < NEAR_EDGE && this.windows.to < this.source.size) return "below";
    if (from < NEAR_EDGE && this.windows.from > 0) return "above";
    return null;
  }

  /** Fetches windows until no edge is near, unless a jump is waiting. */
  private fill(): void {
    if (this.filling || !this.edgeNear()) return;
    this.filling = true;
    void this.queued(async () => {
      try {
        for (let edge = this.edgeNear(); edge && this.wantedJump === null && !this.closed; edge = this.edgeNear()) {
          if (!(await this.extend(edge))) break;
        }
      } finally {
        this.filling = false;
      }
    });
  }

  /** Adds the next window at `edge`, and drops the one at the other end
   *  when there are too many. What the user is looking at stays in place.
   *  False when there was no more text there. */
  private async extend(edge: "below" | "above"): Promise<boolean> {
    const window = edge === "below" ? await this.source.windowFrom(this.windows.to, WINDOW_BYTES) : await this.source.windowBefore(this.windows.from, WINDOW_BYTES);
    if (this.closed || window.text === "") return false;
    const length = this.view.state.doc.length;
    const tooMany = this.windows.count >= MOST_WINDOWS;
    const changes = this.view.state.changes(edge === "below" ? this.addedBelow(window, tooMany, length) : this.addedAbove(window, tooMany, length));
    this.view.dispatch({ changes, effects: this.inPlace(changes), annotations: windowSwap.of(true) });
    return true;
  }

  /** The effect that keeps the line at the top of the page where it is
   *  through `changes`. The editor's own snapshot does this, except at the
   *  very start of the document: text added above its first line would stay
   *  on screen, and the line the user was on would be pushed below it. */
  private inPlace(changes: ChangeSet) {
    const scrollTop = this.view.scrollDOM.scrollTop;
    const top = this.view.lineBlockAtHeight(scrollTop);
    if (top.from > 0) return this.view.scrollSnapshot().map(changes);
    return EditorView.scrollIntoView(changes.mapPos(top.from, 1), { y: "start", yMargin: top.top - scrollTop });
  }

  private addedBelow(window: PagedWindow, tooMany: boolean, length: number) {
    this.windows.addBelow(window);
    const dropped = tooMany ? [{ from: 0, to: this.windows.dropFirst() }] : [];
    return [...dropped, { from: length, insert: window.text }];
  }

  private addedAbove(window: PagedWindow, tooMany: boolean, length: number) {
    this.windows.addAbove(window);
    const dropped = tooMany ? [{ from: length - this.windows.dropLast(), to: length }] : [];
    return [{ from: 0, insert: window.text }, ...dropped];
  }

  /** The view scrolled or was laid out again: report the place, and fetch
   *  the next window when an edge is near. */
  private readonly moved = (): void => {
    this.view.requestMeasure({
      key: this,
      read: (view) => {
        const top = view.lineBlockAtHeight(view.scrollDOM.scrollTop).from;
        const bottom = view.lineBlockAtHeight(view.scrollDOM.scrollTop + view.scrollDOM.clientHeight).to;
        return { top: this.windows.byteAt(top), bottom: this.windows.byteAt(bottom) };
      },
      write: ({ top, bottom }) => {
        const size = Math.max(1, this.source.size);
        this.scrollbar.show(Math.min(1, top / size), Math.min(1, (bottom - top) / size));
        this.options.onMove?.(top);
      },
    });
    this.fill();
  };
}

/** Shows the file `source` reads in `parent`, a few windows at a time. */
export function createPagedMarkdownView(parent: HTMLElement, source: PagedSource, options: PagedViewOptions = {}): PagedMarkdownView {
  return new Paged(parent, source, options);
}
