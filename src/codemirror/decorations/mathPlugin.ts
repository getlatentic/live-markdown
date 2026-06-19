import { type Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
} from "@codemirror/view";

import { MathWidget } from "./mathWidget";

const INLINE_MATH_RE = /(?<![\\$])\$(?!\s)([^\n$]+?)(?<!\s)\$(?!\d)/g;

function buildDecorations(view: EditorView): { decorations: DecorationSet; atomic: DecorationSet } {
  const marks: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    let lineNum = view.state.doc.lineAt(from).number;
    const lastLineNum = view.state.doc.lineAt(to).number;
    while (lineNum <= lastLineNum) {
      const line = view.state.doc.line(lineNum);
      const text = line.text;

      const blockMatch = text.match(/^\$\$(.+)\$\$\s*$/);
      if (blockMatch) {
        const tex = blockMatch[1];
        const replace = Decoration.replace({
          widget: new MathWidget(tex, true),
        });
        marks.push(replace.range(line.from, line.to));
        atomic.push(replace.range(line.from, line.to));
      } else {
        INLINE_MATH_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = INLINE_MATH_RE.exec(text)) !== null) {
          const matchStart = line.from + m.index;
          const matchEnd = matchStart + m[0].length;
          const tex = m[1];
          const replace = Decoration.replace({
            widget: new MathWidget(tex, false),
          });
          marks.push(replace.range(matchStart, matchEnd));
          atomic.push(replace.range(matchStart, matchEnd));
        }
      }
      lineNum += 1;
    }
  }

  return {
    decorations: Decoration.set(marks, true),
    atomic: Decoration.set(atomic, true),
  };
}

export const mathPlugin = ViewPlugin.fromClass(
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
