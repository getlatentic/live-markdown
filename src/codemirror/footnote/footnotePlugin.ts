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

const FOOTNOTE_REF_RE = /(?<!\])\[\^([^\]\s]+)\](?!:)/g;
const FOOTNOTE_DEF_LINE_RE = /^\[\^([^\]\s]+)\]:\s/;

const refLabelMark = Decoration.mark({ class: "cm-footnote-ref" });
const refHide = Decoration.replace({});
const defLineDeco = Decoration.line({ class: "cm-footnote-def" });

function buildDecorations(view: EditorView): { decorations: DecorationSet; atomic: DecorationSet } {
  const lineDecs: Range<Decoration>[] = [];
  const markDecs: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];
  const tree = viewportTree(view);

  for (const { from, to } of view.visibleRanges) {
    let lineNum = view.state.doc.lineAt(from).number;
    const lastLineNum = view.state.doc.lineAt(to).number;
    while (lineNum <= lastLineNum) {
      const line = view.state.doc.line(lineNum);

      if (FOOTNOTE_DEF_LINE_RE.test(line.text) && !inCode(tree, line.from)) {
        lineDecs.push(defLineDeco.range(line.from));
      } else {
        FOOTNOTE_REF_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = FOOTNOTE_REF_RE.exec(line.text)) !== null) {
          const matchStart = line.from + m.index;
          const matchEnd = matchStart + m[0].length;
          if (inCode(tree, matchStart) || inCode(tree, matchEnd - 1)) continue;
          const labelStart = matchStart + 2;
          const labelEnd = matchEnd - 1;
          if (labelEnd <= labelStart) continue;

          markDecs.push(refHide.range(matchStart, labelStart));
          atomic.push(refHide.range(matchStart, labelStart));
          markDecs.push(refLabelMark.range(labelStart, labelEnd));
          markDecs.push(refHide.range(labelEnd, matchEnd));
          atomic.push(refHide.range(labelEnd, matchEnd));
        }
      }

      lineNum += 1;
    }
  }

  return {
    decorations: Decoration.set(lineDecs.concat(markDecs), true),
    atomic: Decoration.set(atomic, true),
  };
}

export const footnotePlugin = ViewPlugin.fromClass(
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
