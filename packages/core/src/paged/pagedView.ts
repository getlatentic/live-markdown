/**
 * A markdown file of any size, shown and edited a few windows at a time.
 *
 * The view holds a run of windows of the file as one document. As the user
 * scrolls toward an edge of it, the next window is added there and the one
 * farthest away is dropped, so the document stays about the same length
 * whatever the size of the file. An edit is made in the document and sent
 * to the source as the bytes of the file it replaces.
 */
import { Annotation, type ChangeSet, EditorState, type Extension, Transaction } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

import { markdownDecorationsPlugin } from "../codemirror/core";
import { mergeExtensions } from "../codemirror/extensions/loader";
import type { MarkdownExtension } from "../codemirror/extensions/types";
import { builtInModules, documentFacets, editingSurface, hostSeams, type DocumentSurroundings, type HostCallbacks } from "../editorSurface";
import { Held, utf8Length } from "./held";
import { pagedScrollbar, type PagedScrollbar } from "./scrollbar";
import type { PagedSource, PagedWindow } from "./source";

/** About how many bytes one window is. */
const WINDOW_BYTES = 256 * 1024;
/** The most windows held at once. */
const MOST_WINDOWS = 5;
/** This near an edge of the document, in characters, the next window is fetched. */
const NEAR_EDGE = 40_000;

export interface PagedViewOptions extends DocumentSurroundings, HostCallbacks {
  /** Names the file, as the editor's `filePath` does. */
  filePath?: string;
  /** Modules of the host's own, after the built-in ones. */
  extensions?: readonly MarkdownExtension[];
  /** The byte of the file the view opens at: a place `onMove` gave
   *  earlier. The start of the file without it. */
  startAt?: number;
  /** The view moved: the byte of the file at its top. */
  onMove?: (byte: number) => void;
  /** The user edited the text. The edit is on its way to the source:
   *  `sent()` resolves when it is there. */
  onEdit?: () => void;
  /** The source refused an edit. The view shows the source's text again. */
  onEditFailed?: (error: unknown) => void;
}

export interface PagedMarkdownView {
  readonly view: EditorView;
  /** Shows the text at the byte `byte` of the file. */
  jumpTo(byte: number): Promise<void>;
  /** The bytes of the file the view holds now. */
  held(): { from: number; to: number };
  /** Bytes in the file, with the edits made here. */
  size(): number;
  /** Resolves when every edit made so far is at the source. Await it
   *  before saving. */
  sent(): Promise<void>;
  /** Resolves when no window is being fetched and none is needed. */
  settled(): Promise<void>;
  destroy(): void;
}

/** Marks the transactions that swap windows: they are not the user's edits. */
const windowSwap = Annotation.define<boolean>();

/** A swap is not the user's to undo. */
const SWAP = [windowSwap.of(true), Transaction.addToHistory.of(false)];

/** An edit as the source takes it: bytes of the file, and the text for them. */
interface FileEdit {
  from: number;
  to: number;
  text: string;
}

function extensionsFor(options: PagedViewOptions, editable: boolean): Extension[] {
  const merged = mergeExtensions([...builtInModules(), ...(options.extensions ?? [])]);
  return [
    // A window's text is the file's, byte for byte: only "\n" ends a line,
    // so a "\r" before it stays in the text and is counted.
    EditorState.lineSeparator.of("\n"),
    ...(editable ? [] : [EditorState.readOnly.of(true), EditorState.changeFilter.of((tr) => tr.annotation(windowSwap) === true)]),
    ...editingSurface(merged.grammar),
    ...documentFacets(options, options.filePath),
    ...hostSeams(() => options),
    markdownDecorationsPlugin,
    ...merged.extensions,
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
  /** Bytes in the file, with the edits made here. */
  private bytes: number;
  /** The edits the source does not have yet, oldest first. */
  private readonly unsent: FileEdit[] = [];

  constructor(
    parent: HTMLElement,
    private readonly source: PagedSource,
    private readonly options: PagedViewOptions,
  ) {
    this.bytes = source.size;
    this.root = parent.appendChild(document.createElement("div"));
    this.root.className = "cm-paged";
    this.root.style.cssText = "display:flex;flex:1 1 auto;min-height:0;height:100%";
    const fileEnds = keymap.of([
      { key: "Mod-Home", mac: "Cmd-ArrowUp", run: () => (void this.jumpTo(0), true) },
      { key: "Mod-End", mac: "Cmd-ArrowDown", run: () => (void this.jumpTo(this.bytes), true) },
    ]);
    this.view = new EditorView({
      parent: this.root,
      state: EditorState.create({
        extensions: [
          fileEnds,
          ...extensionsFor(options, source.edit !== undefined),
          EditorView.updateListener.of((update) => {
            for (const tr of update.transactions) if (tr.docChanged && !tr.annotation(windowSwap)) this.userEdited(tr);
            if (update.viewportChanged || update.geometryChanged) this.moved();
          }),
        ],
      }),
    });
    this.view.dom.style.cssText = "flex:1 1 auto;min-width:0;height:100%";
    this.view.scrollDOM.addEventListener("scroll", this.moved, { passive: true });
    this.scrollbar = pagedScrollbar((share) => void this.jumpTo(Math.round(share * this.bytes)));
    this.root.appendChild(this.scrollbar.element);
    void this.jumpTo(options.startAt ?? 0);
  }

  held(): { from: number; to: number } {
    return { from: this.windows.from, to: this.windows.to };
  }

  size(): number {
    return this.bytes;
  }

  sent(): Promise<void> {
    return this.queued(() => this.sendEdits());
  }

  jumpTo(byte: number): Promise<void> {
    // The thumb can ask for many places while one is being fetched: only
    // the last one asked for is fetched.
    this.wantedJump = Math.min(Math.max(0, byte), this.bytes);
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
      if (this.closed || (!this.filling && !this.edgeNear() && this.wantedJump === null && this.unsent.length === 0)) return;
      if (this.unsent.length > 0) void this.sent();
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

  /**
   * A transaction of the user's changed the text. Each change is counted in
   * bytes against the text before it, and kept for the source. The changes
   * are taken last first: a change does not move the ones above it.
   */
  private userEdited(tr: Transaction): void {
    const before = tr.startState.doc;
    const read = (from: number, to: number): string => before.sliceString(from, to);
    const changes: { from: number; to: number; text: string }[] = [];
    tr.changes.iterChanges((from, to, _fromAfter, _toAfter, inserted) => changes.push({ from, to, text: inserted.toString() }));
    for (const { from, to, text } of changes.reverse()) {
      const byteFrom = this.windows.exactByteAt(from, read);
      const byteTo = byteFrom + utf8Length(read(from, to));
      const added = utf8Length(text);
      this.windows.edited({ from, to, chars: text.length }, { from: byteFrom, to: byteTo, added });
      this.bytes += added - (byteTo - byteFrom);
      this.unsent.push({ from: byteFrom, to: byteTo, text });
    }
    void this.sent();
    this.options.onEdit?.();
  }

  /** Sends the edits the source does not have, oldest first, one at a
   *  time. Runs in the queue, so no window is asked for between two. */
  private async sendEdits(): Promise<void> {
    for (let edit = this.unsent[0]; edit && !this.closed; edit = this.unsent[0]) {
      try {
        await this.source.edit?.(edit.from, edit.to, edit.text);
      } catch (error) {
        await this.editFailed(error);
        return;
      }
      this.unsent.shift();
    }
  }

  /** The source refused an edit, so the document is no longer its text.
   *  The edits not sent are dropped and the source's text is shown again. */
  private async editFailed(error: unknown): Promise<void> {
    const top = this.windows.from;
    this.unsent.length = 0;
    this.bytes = this.source.size;
    this.options.onEditFailed?.(error);
    await this.showAt(top);
  }

  /** The window with `byte` in it, as the source has it with every edit
   *  made here. An edit made while it was fetched is sent, and the window
   *  fetched again. */
  private async windowAt(byte: number): Promise<PagedWindow> {
    for (;;) {
      await this.sendEdits();
      const window = await this.source.window(Math.min(byte, this.bytes), WINDOW_BYTES);
      if (this.unsent.length === 0 || this.closed) return window;
    }
  }

  /** Replaces what is held by the window with `byte` in it. */
  private async showAt(byte: number): Promise<void> {
    const window = await this.windowAt(byte);
    if (this.closed) return;
    this.windows.only(window);
    const { doc } = this.view.state;
    this.view.dispatch({ changes: { from: 0, to: doc.length, insert: window.text }, annotations: SWAP });
    // The last window of a file can be a few lines: the text above it is
    // fetched before the place is shown, so the page is full.
    if (window.text.length < NEAR_EDGE && this.windows.from > 0) await this.extend("above");
    if (this.closed) return;
    const atEnd = byte >= this.bytes;
    const pos = atEnd ? this.view.state.doc.length : this.view.state.doc.lineAt(Math.min(this.windows.posOf(byte), this.view.state.doc.length)).from;
    this.view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: atEnd ? "end" : "start" }) });
  }

  /** Which edge of the document the view is near, with more of the file beyond it. */
  private edgeNear(): "below" | "above" | null {
    const { from, to } = this.view.viewport;
    if (this.view.state.doc.length - to < NEAR_EDGE && this.windows.to < this.bytes) return "below";
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
    // The source is asked with every edit made so far. One made while the
    // window is fetched is inside the held text, so it changes neither the
    // window's text nor where it joins.
    await this.sendEdits();
    const window = edge === "below" ? await this.source.windowFrom(this.windows.to, WINDOW_BYTES) : await this.source.windowBefore(this.windows.from, WINDOW_BYTES);
    if (this.closed || window.text === "") return false;
    const length = this.view.state.doc.length;
    const tooMany = this.windows.count >= MOST_WINDOWS;
    const changes = this.view.state.changes(edge === "below" ? this.addedBelow(window, tooMany, length) : this.addedAbove(window, tooMany, length));
    this.view.dispatch({ changes, effects: this.inPlace(changes), annotations: SWAP });
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
        const size = Math.max(1, this.bytes);
        this.scrollbar.show(Math.min(1, top / size), Math.min(1, (bottom - top) / size));
        this.options.onMove?.(top);
      },
    });
    this.fill();
  };
}

/** Shows the file `source` reads in `parent`, a few windows at a time. The
 *  text is edited there when the source takes edits. */
export function createPagedMarkdownView(parent: HTMLElement, source: PagedSource, options: PagedViewOptions = {}): PagedMarkdownView {
  return new Paged(parent, source, options);
}
