/**
 * Mermaid fences (#125) — a CLOSED ```mermaid fence renders as a diagram
 * block while the caret is outside it; a caret or selection touching the
 * fence reveals the source (the code-block contract), and leaving re-renders.
 *
 * A StateField, not a ViewPlugin: the replacement spans line breaks, and CM6
 * only honours block-level multi-line replaces delivered via a field (same
 * constraint as tableField/mathPlugin).
 */

import { isMermaidFenceInfo } from "./mermaidRender";
import { type EditorState, type Range, RangeSet, RangeValue, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

import { nodesNamed, readAfter, readAll } from "../core/treeRanges";
import { MermaidWidget } from "./mermaidWidget";

// Structural stand-in for a Lezer node — `@lezer/common` is a transitive
// dep this package deliberately doesn't import from (same convention as
// tableModel's SyntaxNodeLike).
type FenceNodeLike = {
  readonly from: number;
  readonly to: number;
  getChild(type: string): { readonly from: number; readonly to: number } | null;
  getChildren(type: string): readonly unknown[];
};

export interface MermaidFence {
  from: number;
  to: number;
  source: string;
}


function mermaidFenceAt(state: EditorState, node: FenceNodeLike): MermaidFence | null {
  const info = node.getChild("CodeInfo");
  if (!info || !isMermaidFenceInfo(state.sliceDoc(info.from, info.to))) return null;
  // Closed fences only (opener AND closer CodeMark). An unclosed fence runs
  // to the end of the doc — rendering it while the user is still typing
  // lines would yank the block out from under the caret.
  if (node.getChildren("CodeMark").length < 2) return null;
  // A block replace must cover whole lines. A fence indented inside a list
  // item starts mid-line, so it stays as source instead.
  const opener = state.doc.lineAt(node.from);
  const closer = state.doc.lineAt(node.to);
  if (node.from !== opener.from || node.to !== closer.to) return null;
  const text = node.getChild("CodeText");
  return {
    from: node.from,
    to: node.to,
    source: text ? state.sliceDoc(text.from, text.to) : "",
  };
}

/** A diagram fence as the field keeps it: where it stands is the range it
 *  is stored at, which moves with the text. */
class FenceSource extends RangeValue {
  constructor(readonly source: string) {
    super();
  }

  override eq(other: FenceSource): boolean {
    return other.source === this.source;
  }
}

const diagramFences = nodesNamed<FenceSource>("FencedCode", (state, node) => {
  const fence = mermaidFenceAt(state, node);
  return fence ? [new FenceSource(fence.source).range(fence.from, fence.to)] : [];
});

/** A fence reveals its source only when a selection ENDPOINT sits strictly
 *  inside it — click-to-edit places the caret there, and selecting within the
 *  revealed source keeps it revealed. A selection merely SPANNING the fence
 *  (drag-across, select-all, copying a region) keeps the diagram rendered:
 *  flipping to source mid-drag read as "copying turns it back into code",
 *  and the height jump made the drag jumpy. */
function selectionReveals(state: EditorState, fence: MermaidFence): boolean {
  const inside = (pos: number) => pos > fence.from && pos < fence.to;
  return state.selection.ranges.some((range) => inside(range.anchor) || inside(range.head));
}

interface MermaidFieldValue {
  fences: RangeSet<FenceSource>;
  decorations: DecorationSet;
}

/** A selection fully covering the fence — the click-to-select state. The
 *  widget paints it (native selection can't draw over a block widget). */
function selectionCovers(state: EditorState, fence: MermaidFence): boolean {
  return state.selection.ranges.some(
    (range) => !range.empty && range.from <= fence.from && range.to >= fence.to,
  );
}

function build(state: EditorState, fences: RangeSet<FenceSource>): MermaidFieldValue {
  const ranges: Range<Decoration>[] = [];
  for (const cursor = fences.iter(); cursor.value; cursor.next()) {
    const fence: MermaidFence = { from: cursor.from, to: cursor.to, source: cursor.value.source };
    if (selectionReveals(state, fence)) continue;
    ranges.push(
      Decoration.replace({
        widget: new MermaidWidget(fence.source, selectionCovers(state, fence)),
        block: true,
      }).range(fence.from, fence.to),
    );
  }
  return { fences, decorations: Decoration.set(ranges, true) };
}

export const mermaidField = StateField.define<MermaidFieldValue>({
  create: (state) => build(state, readAll(state, diagramFences)),
  update(value, tr) {
    // The fences are kept up to date by the blocks around each edit, and as
    // the parser moves on (`treeRanges.ts`). A caret move alone flips a fence
    // between widget and source, from the fences already known.
    const fences = readAfter(value.fences, tr, diagramFences);
    return fences !== value.fences || tr.selection ? build(tr.state, fences) : value;
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.decorations),
    // The replaced span is atomic: the caret skips over the widget instead
    // of stepping through hidden fence source. Revealed fences carry no
    // replace decoration, so caret motion inside them stays free.
    EditorView.atomicRanges.of(
      (view) => view.state.field(field, false)?.decorations ?? Decoration.none,
    ),
  ],
});
