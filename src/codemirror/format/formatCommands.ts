/**
 * Formatting commands — spec section 9.
 *
 * Cmd/Ctrl + B → toggle bold (`**…**`)
 * Cmd/Ctrl + I → toggle italic (`*…*`)
 * Cmd/Ctrl + E → toggle inline code (`` `…` ``)
 *
 * Toggle, not insert: pressing Cmd+B with the caret already inside a
 * `StrongEmphasis` removes the bold, mirroring Tiptap / Pages / Word.
 *
 * Cmd+K (link popover) is Phase 2.8 — it needs a UI affordance and
 * is intentionally not bound here.
 *
 * These commands work uniformly on collapsed selections (where they
 * just insert the markers and place the caret between them) and on
 * non-collapsed selections (where they wrap the visible content).
 */

import { EditorSelection, Prec, type EditorState } from "@codemirror/state";
import { type Command, EditorView, keymap } from "@codemirror/view";
import { lineStructure } from "../core/lineStructure";
import { treeAt } from "../core/treeAt";

type SyntaxNodeLike = {
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly parent: SyntaxNodeLike | null;
};

interface FormatSpec {
  readonly markName: string; // Lezer node name for the wrapping construct
  readonly opener: string;
  readonly closer: string;
  /** CommonMark's flanking rules make emphasis delimiters literal when the
   * opener is followed — or the closer preceded — by whitespace: `**compose **`
   * is plain text, not bold. Specs with this flag wrap only the selection's
   * non-whitespace core, leaving edge spaces outside the markers (Word /
   * Pages / Obsidian behavior). Code spans have no flanking rule and may
   * meaningfully contain edge spaces, so they wrap verbatim. */
  readonly keepEdgeWhitespaceOutside: boolean;
}

const FORMAT_BOLD: FormatSpec = {
  markName: "StrongEmphasis",
  opener: "**",
  closer: "**",
  keepEdgeWhitespaceOutside: true,
};
const FORMAT_ITALIC: FormatSpec = {
  markName: "Emphasis",
  opener: "*",
  closer: "*",
  keepEdgeWhitespaceOutside: true,
};
const FORMAT_CODE: FormatSpec = {
  markName: "InlineCode",
  opener: "`",
  closer: "`",
  keepEdgeWhitespaceOutside: false,
};

function nearestAncestor(
  view: EditorView,
  pos: number,
  name: string,
): { from: number; to: number } | null {
  let node: SyntaxNodeLike | null = treeAt(view.state, pos).resolveInner(
    pos,
    1,
  ) as unknown as SyntaxNodeLike;
  while (node) {
    if (node.name === name) return { from: node.from, to: node.to };
    node = node.parent;
  }
  return null;
}

/**
 * Delimiters + content for a code span, per CommonMark: the backtick fence
 * must be LONGER than any backtick run inside the content (`` `a`b` `` is
 * broken source), and content that starts or ends with a backtick needs one
 * space of padding — the renderer strips exactly one space from each side.
 */
function codeSpanWrap(core: string): { fence: string; content: string } {
  const runs = core.match(/`+/g) ?? [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
  const fence = "`".repeat(longest + 1);
  const pad = core.startsWith("`") || core.endsWith("`") ? " " : "";
  return { fence, content: pad + core + pad };
}

/** Undo {@link codeSpanWrap}: measure the actual fence off the source (any
 * run length), then strip the one-space padding pair the grammar treats as
 * invisible. Null when the text isn't a well-formed span. */
function codeSpanUnwrap(text: string): string | null {
  const fence = /^`+/.exec(text)?.[0];
  if (!fence || !text.endsWith(fence) || text.length < fence.length * 2) return null;
  let content = text.slice(fence.length, text.length - fence.length);
  if (content.startsWith(" ") && content.endsWith(" ") && content.trim() !== "") {
    content = content.slice(1, -1);
  }
  return content;
}

/** The opener and closer of `spec` standing alone around `pos`: not part of
 *  a longer run of the same character, which is another construct's pair. */
function emptyPairAround(state: EditorState, pos: number, spec: FormatSpec): { from: number; to: number } | null {
  const from = pos - spec.opener.length;
  const to = pos + spec.closer.length;
  if (from < 0 || state.sliceDoc(from, pos) !== spec.opener || state.sliceDoc(pos, to) !== spec.closer) return null;
  const longer = state.sliceDoc(from - 1, from) === spec.opener[0] || state.sliceDoc(to, to + 1) === spec.closer[0];
  return longer ? null : { from, to };
}

/** One replacement, and where the construct's content stands in it. */
interface Edit {
  from: number;
  to: number;
  insert: string;
  contentAt: number;
  contentLength: number;
}

/** The selected text of each line from `from` to `to`, starting where the
 *  line's own text starts. Code keeps its text as written. */
function selectedParts(state: EditorState, from: number, to: number): { from: number; to: number }[] {
  const parts: { from: number; to: number }[] = [];
  for (let n = state.doc.lineAt(from).number; n <= state.doc.lineAt(to).number; n++) {
    const line = state.doc.line(n);
    const structure = lineStructure(state, line);
    const textStart = (structure.list ?? structure.heading)?.markTo ?? structure.contentFrom;
    const part = { from: Math.max(from, textStart), to: Math.min(to, line.to) };
    if (!structure.inCode && state.sliceDoc(part.from, part.to).trim() !== "") parts.push(part);
  }
  return parts;
}

/** The construct `part` stands in, replaced by its content. Null when the
 *  part is not in one. */
function unwrapping(view: EditorView, part: { from: number }, spec: FormatSpec): Edit | null {
  const node = nearestAncestor(view, part.from + 1, spec.markName);
  if (!node) return null;
  const text = view.state.sliceDoc(node.from, node.to);
  const marked = text.startsWith(spec.opener) && text.endsWith(spec.closer) && text.length >= spec.opener.length + spec.closer.length;
  const content = spec.markName === "InlineCode" ? codeSpanUnwrap(text) : marked ? text.slice(spec.opener.length, text.length - spec.closer.length) : null;
  return content === null ? null : { ...node, insert: content, contentAt: 0, contentLength: content.length };
}

/** `part` inside the construct's markers, with the spaces at its edges left
 *  outside where the grammar wants them there. */
function wrapping(state: EditorState, part: { from: number; to: number }, spec: FormatSpec): Edit {
  const text = state.sliceDoc(part.from, part.to);
  const leading = spec.keepEdgeWhitespaceOutside ? text.length - text.trimStart().length : 0;
  const trailing = spec.keepEdgeWhitespaceOutside ? text.length - text.trimEnd().length : 0;
  const core = text.slice(leading, text.length - trailing);
  const code = spec.markName === "InlineCode" ? codeSpanWrap(core) : null;
  const opener = code?.fence ?? spec.opener;
  const inner = code?.content ?? core;
  const closer = code?.fence ?? spec.closer;
  return { from: part.from + leading, to: part.to - trailing, insert: opener + inner + closer, contentAt: opener.length, contentLength: inner.length };
}

/**
 * Emphasis cannot cross from one block into the next: markers around a
 * selection of several lines would be plain asterisks. Each line's selected
 * text is toggled on its own. The construct goes off where every line has
 * it, and on for the lines that lack it otherwise.
 */
function toggleLines(view: EditorView, spec: FormatSpec): boolean {
  const { state } = view;
  const sel = state.selection.main;
  const parts = selectedParts(state, sel.from, sel.to);
  const off = parts.map((part) => unwrapping(view, part, spec));
  const edits = off.every((edit): edit is Edit => edit !== null) ? off : parts.flatMap((part, i) => (off[i] ? [] : [wrapping(state, part, spec)]));
  if (edits.length === 0) return true;
  const changes = state.changes(edits);
  const [first, last] = [edits[0], edits[edits.length - 1]];
  const from = changes.mapPos(first.from, -1) + first.contentAt;
  const to = changes.mapPos(last.from, -1) + last.contentAt + last.contentLength;
  view.dispatch({ changes, selection: EditorSelection.range(from, to), userEvent: off === edits ? "input.format.unwrap" : "input.format.wrap" });
  return true;
}

function makeToggleCommand(spec: FormatSpec): Command {
  return (view) => {
    const sel = view.state.selection.main;
    if (view.state.doc.lineAt(sel.from).number !== view.state.doc.lineAt(sel.to).number) return toggleLines(view, spec);

    // Case 1: caret/selection sits inside an existing instance of this
    // construct → strip the markers (toggle off).
    const existing = nearestAncestor(view, sel.head, spec.markName);
    if (existing) {
      const { from, to } = existing;
      const text = view.state.sliceDoc(from, to);
      if (spec.markName === "InlineCode") {
        // Code spans carry variable-length fences + optional padding — undo
        // them off the actual source, not the spec's one-backtick default.
        const content = codeSpanUnwrap(text);
        if (content !== null) {
          view.dispatch({
            changes: { from, to, insert: content },
            selection: sel.empty
              ? EditorSelection.cursor(
                  Math.min(Math.max(from, sel.head - 1), from + content.length),
                )
              : EditorSelection.range(from, from + content.length),
            userEvent: "input.format.unwrap",
          });
          return true;
        }
      }
      if (text.startsWith(spec.opener) && text.endsWith(spec.closer)) {
        const content = text.slice(spec.opener.length, text.length - spec.closer.length);
        const newSelFrom = from;
        const newSelTo = from + content.length;
        view.dispatch({
          changes: { from, to, insert: content },
          selection: sel.empty
            ? EditorSelection.cursor(Math.max(newSelFrom, sel.head - spec.opener.length))
            : EditorSelection.range(newSelFrom, newSelTo),
          userEvent: "input.format.unwrap",
        });
        return true;
      }
    }

    // An empty pair is not this construct to the grammar, so no node marks
    // it: the caret between a pair the command just made toggles it off.
    const emptyPair = sel.empty ? emptyPairAround(view.state, sel.head, spec) : null;
    if (emptyPair) {
      view.dispatch({
        changes: emptyPair,
        selection: EditorSelection.cursor(emptyPair.from),
        userEvent: "input.format.unwrap",
      });
      return true;
    }

    // Case 2: wrap. Collapsed selection inserts markers + places caret
    // between them; ranged selection wraps the content.
    if (sel.empty) {
      const insert = spec.opener + spec.closer;
      view.dispatch({
        changes: { from: sel.head, insert },
        selection: EditorSelection.cursor(sel.head + spec.opener.length),
        userEvent: "input.format.wrap",
      });
      return true;
    }
    const content = view.state.sliceDoc(sel.from, sel.to);
    // Shrink the wrap to the selection's non-whitespace core where the grammar
    // demands it — wrapping edge spaces would emit markdown the parser is
    // REQUIRED to treat as literal text (see keepEdgeWhitespaceOutside).
    const leading = spec.keepEdgeWhitespaceOutside
      ? content.length - content.trimStart().length
      : 0;
    const trailing = spec.keepEdgeWhitespaceOutside
      ? content.length - content.trimEnd().length
      : 0;
    const core = content.slice(leading, content.length - trailing);
    if (!core) {
      // Nothing but whitespace selected — no formatting to apply.
      return true;
    }
    const wrapFrom = sel.from + leading;
    const wrapTo = sel.to - trailing;
    // Code spans size their fence to the content (backticks inside need a
    // longer fence) — the other constructs use the spec's fixed markers.
    const { opener, inner } =
      spec.markName === "InlineCode"
        ? (() => {
            const { fence, content: padded } = codeSpanWrap(core);
            return { opener: fence, inner: padded };
          })()
        : { opener: spec.opener, inner: core };
    const wrapped = opener + inner + opener;
    view.dispatch({
      changes: { from: wrapFrom, to: wrapTo, insert: wrapped },
      selection: EditorSelection.range(
        wrapFrom + opener.length,
        wrapFrom + opener.length + inner.length,
      ),
      userEvent: "input.format.wrap",
    });
    return true;
  };
}

export const formatCommands = {
  toggleBold: makeToggleCommand(FORMAT_BOLD),
  toggleItalic: makeToggleCommand(FORMAT_ITALIC),
  toggleInlineCode: makeToggleCommand(FORMAT_CODE),
};

export const formatCommandsKeymap = Prec.high(
  keymap.of([
    { key: "Mod-b", run: formatCommands.toggleBold },
    { key: "Mod-i", run: formatCommands.toggleItalic },
    { key: "Mod-e", run: formatCommands.toggleInlineCode },
  ]),
);
