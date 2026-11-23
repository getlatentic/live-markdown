/**
 * The editor without a UI framework: one function that mounts a CodeMirror
 * view in an element and keeps a markdown string in step with it. The React
 * and Vue packages are thin wrappers over this.
 */

import { Annotation, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { parseFrontmatter, serializeMarkdown, type Frontmatter } from "./frontmatter";
import type { DocumentTextChange } from "./types";
import type { RenderClipboardHtml } from "./codemirror/clipboard/copyRich";
import {
  markdownDecorationsPlugin,
  type CommentOnExcerpt,
  type OpenExternalUrl,
  type ResolveImageSrc,
  type SaveImageBytes,
} from "./codemirror/core";
import { mergeExtensions, type MarkdownExtension, type ToolbarContribution } from "./codemirror/extensions";
import { builtInModules, documentFacets, editingSurface, hostSeams } from "./editorSurface";

export type MarkdownEditorMode = "wysiwyg" | "source";

/**
 * What a host can change while the editor lives. Callbacks are read at call
 * time, so the latest one always runs. The rest (`extensions`, `linkTargets`,
 * `workspaceRoot`, and whether a callback is present at all) is read when a
 * document's state is built: on create, on a switch to a document not seen
 * before, and on a mode change.
 */
export interface MarkdownEditorSettings<Icon = never> {
  /** Called with the whole markdown file, front matter included, 500 ms after
   *  the last edit, and at once on `flush()`. */
  onChange: (value: string, changes: DocumentTextChange[]) => void;
  mode?: MarkdownEditorMode;
  workspaceRoot?: string;
  linkTargets?: ReadonlySet<string>;
  onNavigateToLink?: (path: string) => void;
  /** Host modules, merged after the built-ins so a host can override one.
   *  They apply in both modes. */
  extensions?: readonly MarkdownExtension<Icon>[];
  /** Map an image `src` to a loadable URL. Default: use it as written. */
  resolveImageSrc?: ResolveImageSrc;
  /** Store a pasted or dropped image. Default: inline it as a `data:` URL. */
  saveImageBytes?: SaveImageBytes;
  /** Open a clicked external link. Default: a new browser tab. */
  onOpenExternalUrl?: OpenExternalUrl;
  /** Comment on a table row or column. Default: no such menu items. */
  onCommentOnExcerpt?: CommentOnExcerpt;
  /** Render a copied selection to HTML. Default: plain-text copies. */
  renderClipboardHtml?: RenderClipboardHtml;
  /** Called after a switch to another document has painted. */
  onAfterContentSwap?: () => void;
}

export interface MarkdownEditorOptions<Icon = never> extends MarkdownEditorSettings<Icon> {
  value: string;
  /** Names the document. Each path keeps its own caret, scroll and undo. */
  filePath?: string;
  /** Text an earlier editor held but never emitted (its `pendingEdit()`). It
   *  is shown in place of `value` and emitted after the usual delay, so a
   *  host that rebuilds the editor loses no typing. */
  draft?: string | null;
}

export interface MarkdownEditor<Icon = never> {
  readonly view: EditorView;
  /** Toolbar items the modules of the current document asked for. */
  readonly toolbar: readonly ToolbarContribution<Icon>[];
  /** The whole markdown file as the editor holds it now. */
  getValue(): string;
  /** The file text if an edit is waiting to be emitted, else `null`. */
  pendingEdit(): string | null;
  /** Replace the content of the current document. A value the editor itself
   *  emitted is ignored, so feeding `onChange` back in is safe. */
  setValue(value: string): void;
  /** Show `value` as the document at `filePath`. The same path replaces the
   *  content; another path switches document, emitting the outgoing
   *  document's pending edit first. */
  setDocument(value: string, filePath: string | undefined): void;
  setMode(mode: MarkdownEditorMode): void;
  setOptions(patch: Partial<MarkdownEditorSettings<Icon>>): void;
  /** Emit a pending edit now. Call it before saving. */
  flush(): void;
  /** Remove the editor. A pending edit is dropped: `flush()` first to keep it. */
  destroy(): void;
}

export function createMarkdownEditor<Icon = never>(
  parent: HTMLElement,
  options: MarkdownEditorOptions<Icon>,
): MarkdownEditor<Icon> {
  return new Editor(parent, options);
}

const AUTOSAVE_DEBOUNCE_MS = 500;

/** Marks the editor's own content swaps, so the change listener can tell them
 *  from the user's edits. A flag held across updates cannot: `setState` fires
 *  no update to clear it, and the next real edit is then swallowed. */
const programmaticSwap = Annotation.define<boolean>();

/** FNV-1a. Tells an echo of the editor's own output from new content. */
function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16);
}

class Editor<Icon> implements MarkdownEditor<Icon> {
  readonly view: EditorView;
  toolbar: readonly ToolbarContribution<Icon>[] = [];

  private settings: MarkdownEditorSettings<Icon>;
  private filePath: string | undefined;
  private frontmatter: Frontmatter | null;
  /** Hash of the last file text emitted or accepted. An incoming value that
   *  matches is the editor's own echo. */
  private lastHash: string;
  private builtMode: MarkdownEditorMode;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /**
   * One state per document, so a switch back is a pointer swap that keeps the
   * caret, scroll and undo, with no parse. `syncedHash` is the file text each
   * state reflects: a different incoming hash means the file changed while the
   * document was away, and the state is rebuilt.
   */
  private readonly states = new Map<string, EditorState>();
  private readonly syncedHash = new Map<string, string>();

  constructor(parent: HTMLElement, { value, filePath, draft, ...settings }: MarkdownEditorOptions<Icon>) {
    this.settings = settings;
    this.filePath = filePath;
    this.builtMode = settings.mode ?? "wysiwyg";
    const parsed = parseFrontmatter(value);
    this.frontmatter = parsed.frontmatter;
    this.lastHash = hashString(value);
    const state = this.buildState(parsed.body);
    if (filePath !== undefined) this.remember(filePath, state, this.lastHash);
    this.view = new EditorView({ state, parent });
    if (draft != null && draft !== value) this.typeOver(parseFrontmatter(draft).body);
  }

  pendingEdit(): string | null {
    const full = this.getValue();
    return hashString(full) === this.lastHash ? null : full;
  }

  getValue(): string {
    return serializeMarkdown({ frontmatter: this.frontmatter, body: this.view.state.doc.toString() });
  }

  setValue(value: string): void {
    this.setDocument(value, this.filePath);
  }

  setDocument(value: string, filePath: string | undefined): void {
    const hash = hashString(value);
    if (filePath === this.filePath) {
      if (hash !== this.lastHash) this.replaceContent(value, hash);
      return;
    }
    this.leaveDocument();
    const parsed = parseFrontmatter(value);
    this.frontmatter = parsed.frontmatter;
    this.lastHash = hash;
    this.filePath = filePath;
    const key = filePath ?? "";
    const cached = this.states.get(key);
    if (cached && this.syncedHash.get(key) === hash) {
      this.view.setState(cached);
    } else {
      const state = this.buildState(parsed.body);
      this.remember(key, state, hash);
      this.view.setState(state);
    }
    requestAnimationFrame(() => this.settings.onAfterContentSwap?.());
  }

  /** The decorations differ per mode, so every cached state is stale: rebuild
   *  the current one from its live text, and the others when next shown. */
  setMode(mode: MarkdownEditorMode): void {
    this.settings = { ...this.settings, mode };
    if (mode === this.builtMode) return;
    this.builtMode = mode;
    this.states.clear();
    this.syncedHash.clear();
    const state = this.buildState(this.view.state.doc.toString());
    if (this.filePath !== undefined) this.remember(this.filePath, state, this.lastHash);
    this.view.setState(state);
  }

  setOptions(patch: Partial<MarkdownEditorSettings<Icon>>): void {
    this.settings = { ...this.settings, ...patch };
  }

  flush(): void {
    this.cancelTimer();
    this.emitIfChanged();
  }

  destroy(): void {
    this.cancelTimer();
    this.view.destroy();
  }

  /** Replace the body as the user would: the change listener sees an edit. */
  private typeOver(body: string): void {
    this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: body } });
  }

  private replaceContent(value: string, hash: string): void {
    const parsed = parseFrontmatter(value);
    this.frontmatter = parsed.frontmatter;
    this.lastHash = hash;
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: parsed.body },
      annotations: programmaticSwap.of(true),
    });
    if (this.filePath !== undefined) this.syncedHash.set(this.filePath, hash);
  }

  /** The view outlives the switch, so a timer left running would fire against
   *  the incoming document. Emit the outgoing edit now, then keep its state. */
  private leaveDocument(): void {
    if (this.timer !== null) {
      this.cancelTimer();
      this.emitIfChanged();
    }
    if (this.filePath !== undefined) this.states.set(this.filePath, this.view.state);
  }

  private emitIfChanged(): void {
    const full = this.getValue();
    const hash = hashString(full);
    if (hash === this.lastHash) return;
    this.lastHash = hash;
    if (this.filePath !== undefined) this.syncedHash.set(this.filePath, hash);
    this.settings.onChange(full, []);
  }

  private scheduleEmit(): void {
    this.cancelTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.emitIfChanged();
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  private cancelTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private remember(key: string, state: EditorState, hash: string): void {
    this.states.set(key, state);
    this.syncedHash.set(key, hash);
  }

  private buildState(body: string): EditorState {
    const wysiwyg = (this.settings.mode ?? "wysiwyg") === "wysiwyg";
    // One merge pass, host last: two passes would each keep their own set of
    // seen rule names, and a host overriding a built-in would not be warned.
    const merged = mergeExtensions<Icon>([
      ...(wysiwyg ? builtInModules() : []),
      ...(this.settings.extensions ?? []),
    ]);
    this.toolbar = merged.toolbar;
    return EditorState.create({
      doc: body,
      extensions: [
        ...editingSurface(merged.grammar),
        ...documentFacets(this.settings, this.filePath),
        ...hostSeams(() => this.settings),
        userEditListener(() => this.scheduleEmit()),
        ...(wysiwyg ? [markdownDecorationsPlugin] : []),
        ...merged.extensions,
      ],
    });
  }
}

function userEditListener(onUserEdit: () => void): Extension {
  return EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    if (update.transactions.every((tr) => tr.annotation(programmaticSwap))) return;
    onUserEdit();
  });
}
