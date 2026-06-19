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

import { syntaxTree } from "@codemirror/language";
import { EditorSelection, Prec } from "@codemirror/state";
import { type Command, EditorView, keymap } from "@codemirror/view";

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
}

const FORMAT_BOLD: FormatSpec = { markName: "StrongEmphasis", opener: "**", closer: "**" };
const FORMAT_ITALIC: FormatSpec = { markName: "Emphasis", opener: "*", closer: "*" };
const FORMAT_CODE: FormatSpec = { markName: "InlineCode", opener: "`", closer: "`" };

function nearestAncestor(
  view: EditorView,
  pos: number,
  name: string,
): { from: number; to: number } | null {
  let node: SyntaxNodeLike | null = syntaxTree(view.state).resolveInner(
    pos,
    1,
  ) as unknown as SyntaxNodeLike;
  while (node) {
    if (node.name === name) return { from: node.from, to: node.to };
    node = node.parent;
  }
  return null;
}

function makeToggleCommand(spec: FormatSpec): Command {
  return (view) => {
    const sel = view.state.selection.main;

    // Case 1: caret/selection sits inside an existing instance of this
    // construct → strip the markers (toggle off).
    const existing = nearestAncestor(view, sel.head, spec.markName);
    if (existing) {
      const { from, to } = existing;
      const text = view.state.sliceDoc(from, to);
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
    const wrapped = spec.opener + content + spec.closer;
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: wrapped },
      selection: EditorSelection.range(
        sel.from + spec.opener.length,
        sel.from + spec.opener.length + content.length,
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
