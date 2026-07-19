import { type Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
} from "@codemirror/view";

import { inCode, viewportTree } from "../core/codeContext";

const HIGHLIGHT_RE = /==([^=\n]+?)==/g;
const HIDE = Decoration.replace({});
const highlightMark = Decoration.mark({ class: "cm-highlight" });

function buildDecorations(view: EditorView): { decorations: DecorationSet; atomic: DecorationSet } {
  const marks: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];
  const tree = viewportTree(view);

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    HIGHLIGHT_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = HIGHLIGHT_RE.exec(text)) !== null) {
      const matchStart = from + match.index;
      const matchEnd = matchStart + match[0].length;
      if (inCode(tree, matchStart) || inCode(tree, matchEnd - 2)) continue;
      const innerStart = matchStart + 2;
      const innerEnd = matchEnd - 2;
      if (innerEnd <= innerStart) continue;

      marks.push(HIDE.range(matchStart, innerStart));
      atomic.push(HIDE.range(matchStart, innerStart));
      marks.push(highlightMark.range(innerStart, innerEnd));
      marks.push(HIDE.range(innerEnd, matchEnd));
      atomic.push(HIDE.range(innerEnd, matchEnd));
    }
  }

  return {
    decorations: Decoration.set(marks, true),
    atomic: Decoration.set(atomic, true),
  };
}

export const highlightPlugin = ViewPlugin.fromClass(
  class implements PluginValue {
    decorations: DecorationSet;
    atomic: DecorationSet;
    constructor(view: EditorView) {
      const built = buildDecorations(view);
      this.decorations = built.decorations;
      this.atomic = built.atomic;
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        const built = buildDecorations(update.view);
        this.decorations = built.decorations;
        this.atomic = built.atomic;
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none),
  },
);
