import { type EditorState, type Range, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

import { MathWidget } from "./mathWidget";

const INLINE_MATH_RE = /(?<![\\$])\$(?!\s)([^\n$]+?)(?<!\s)\$(?!\d)/g;

function computeDecorations(state: EditorState): { decorations: DecorationSet; atomic: DecorationSet } {
  const marks: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];
  const doc = state.doc;
  const totalLines = doc.lines;

  let lineNum = 1;
  while (lineNum <= totalLines) {
    const line = doc.line(lineNum);
    const text = line.text;

    // Single-line block: `$$ … $$` on one line.
    const single = text.match(/^\$\$(.+)\$\$\s*$/);
    if (single) {
      const replace = Decoration.replace({ widget: new MathWidget(single[1], true) });
      marks.push(replace.range(line.from, line.to));
      atomic.push(replace.range(line.from, line.to));
      lineNum += 1;
      continue;
    }

    // Multi-line block: a lone `$$` opens it; scan to the next lone `$$`. This
    // span crosses line breaks, which is why the whole thing is a StateField —
    // a ViewPlugin may not contribute decorations that replace line breaks.
    if (text.trim() === "$$") {
      let close = lineNum + 1;
      while (close <= totalLines && doc.line(close).text.trim() !== "$$") {
        close += 1;
      }
      if (close <= totalLines) {
        const closeLine = doc.line(close);
        const tex = doc.sliceString(line.to, closeLine.from).trim();
        const replace = Decoration.replace({ widget: new MathWidget(tex, true) });
        marks.push(replace.range(line.from, closeLine.to));
        atomic.push(replace.range(line.from, closeLine.to));
        lineNum = close + 1;
        continue;
      }
    }

    // Inline `$ … $`.
    INLINE_MATH_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = INLINE_MATH_RE.exec(text)) !== null) {
      const matchStart = line.from + m.index;
      const matchEnd = matchStart + m[0].length;
      const replace = Decoration.replace({ widget: new MathWidget(m[1], false) });
      marks.push(replace.range(matchStart, matchEnd));
      atomic.push(replace.range(matchStart, matchEnd));
    }
    lineNum += 1;
  }

  return {
    decorations: Decoration.set(marks, true),
    atomic: Decoration.set(atomic, true),
  };
}

export const mathPlugin = StateField.define<{ decorations: DecorationSet; atomic: DecorationSet }>({
  create: (state) => computeDecorations(state),
  update: (value, tr) => (tr.docChanged ? computeDecorations(tr.state) : value),
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.decorations),
    EditorView.atomicRanges.of((view) => view.state.field(field, false)?.atomic ?? Decoration.none),
  ],
});
