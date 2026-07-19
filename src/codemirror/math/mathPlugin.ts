import { type EditorState, type Range, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

import { docTree, inCode } from "../core/codeContext";
import { MathWidget } from "./mathWidget";

const INLINE_MATH_RE = /(?<![\\$])\$(?!\s)([^\n$]+?)(?<!\s)\$(?!\d)/g;

function computeDecorations(state: EditorState): { decorations: DecorationSet; atomic: DecorationSet } {
  const marks: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];
  const doc = state.doc;
  const totalLines = doc.lines;
  const tree = docTree(state);
  // A `$$` line delimits a block only in prose — inside a code block it is
  // literal text, neither an opener nor a closer.
  const blockMarkAt = (num: number): boolean => {
    const line = doc.line(num);
    return line.text.trim() === "$$" && !inCode(tree, line.from + line.text.indexOf("$"));
  };

  let lineNum = 1;
  while (lineNum <= totalLines) {
    const line = doc.line(lineNum);
    const text = line.text;

    // Single-line block: `$$ … $$` on one line.
    const single = text.match(/^\$\$(.+)\$\$\s*$/);
    if (single && !inCode(tree, line.from)) {
      const replace = Decoration.replace({ widget: new MathWidget(single[1], true) });
      marks.push(replace.range(line.from, line.to));
      atomic.push(replace.range(line.from, line.to));
      lineNum += 1;
      continue;
    }

    // Multi-line block: a lone `$$` opens it; scan to the next lone `$$`. This
    // span crosses line breaks, so it must be a `block: true` replacement and
    // is delivered via a StateField — CM6 forbids both a plugin-supplied and a
    // non-block replace from covering a line break, and a real layout engine
    // renders such a span as raw source rather than the widget.
    if (blockMarkAt(lineNum)) {
      let close = lineNum + 1;
      while (close <= totalLines && !blockMarkAt(close)) {
        close += 1;
      }
      if (close <= totalLines) {
        const closeLine = doc.line(close);
        const tex = doc.sliceString(line.to, closeLine.from).trim();
        const replace = Decoration.replace({ widget: new MathWidget(tex, true), block: true });
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
      if (inCode(tree, matchStart) || inCode(tree, matchEnd - 1)) continue;
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
