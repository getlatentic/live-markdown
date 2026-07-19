/**
 * Drawn selection over a virtualized viewport (#166).
 *
 * CodeMirror renders only the visible viewport, and the browser's native
 * `::selection` can only highlight DOM that exists — so with native painting,
 * a Cmd+A or Shift-extended selection shows highlight only on whatever
 * happened to be rendered, and scrolling away and back loses it entirely.
 * This layer paints selection ranges FROM LOGICAL STATE
 * (`state.selection` × the current viewport), so the highlight is correct at
 * every scroll position by construction.
 *
 * Why not CM6's own `drawSelection()`: its wrapped-line handling reverse-maps
 * the editor's far-left/right edge through `posAtCoords` per endpoint, and on
 * lines that start with hidden markers + widgets that probe jitters between
 * before/after the hidden prefix, flashing between one-piece and three-piece
 * painting per drag update (#90). The rects here derive only from FORWARD
 * geometry — `coordsAtPos` of the actual endpoints plus line-block boxes —
 * with no reverse edge probe anywhere:
 *
 *   * endpoints in the same visual row → one rect between their coords;
 *   * a wrapped or multi-line range → a partial rect for the first row, a
 *     partial rect for the last row, and ONE full-width rect for everything
 *     between (which also spans block widgets and hidden rows);
 *   * a block widget wholly inside a range additionally gets a translucent
 *     ABOVE-content tint (`cm-selectionWidgetTint`): widgets paint opaque
 *     backgrounds over a below-content layer, so without it a selected
 *     table/diagram would show no feedback at all.
 *
 * Known coarseness: partial rows of RTL text paint full-width (bidi span
 * splitting is deliberately not reimplemented here); LTR documents paint
 * glyph-accurately.
 *
 * The native `::selection` stays for the tablev2 cell editors (their own
 * contenteditable islands) and is made transparent everywhere else — the DOM
 * selection itself is untouched, so IME, copy, and focus behavior keep
 * working on the real selection.
 */

import { Prec, type Extension, type SelectionRange } from "@codemirror/state";
import {
  BlockType,
  Direction,
  EditorView,
  layer,
  RectangleMarker,
  type BlockInfo,
} from "@codemirror/view";

/** Client-rect → document-space base, mirroring CM6's own layer arithmetic. */
function layerBase(view: EditorView): { left: number; top: number } {
  const rect = view.scrollDOM.getBoundingClientRect();
  const left =
    view.textDirection === Direction.LTR
      ? rect.left
      : rect.right - view.scrollDOM.clientWidth * view.scaleX;
  return {
    left: left - view.scrollDOM.scrollLeft * view.scaleX,
    top: rect.top - view.scrollDOM.scrollTop * view.scaleY,
  };
}

interface ContentEdges {
  left: number;
  right: number;
}

/** The horizontal band text can occupy, in client coordinates. */
function contentEdges(view: EditorView): ContentEdges {
  const rect = view.contentDOM.getBoundingClientRect();
  const line = view.contentDOM.querySelector(".cm-line");
  const style = line ? window.getComputedStyle(line) : null;
  const padLeft = style ? parseInt(style.paddingLeft) || 0 : 0;
  const padRight = style ? parseInt(style.paddingRight) || 0 : 0;
  return { left: rect.left + padLeft, right: rect.right - padRight };
}

function isTextBlock(block: BlockInfo): boolean {
  return block.type === BlockType.Text || Array.isArray(block.type);
}

class Rect {
  constructor(
    readonly left: number,
    readonly top: number,
    readonly right: number,
    readonly bottom: number,
  ) {}
}

/**
 * Selection rectangles for one range, clamped to the viewport. Every rect is
 * derived from forward endpoint geometry; positions whose coords are
 * unavailable (jsdom, or an endpoint inside a replaced range) degrade to the
 * enclosing block's box rather than throwing.
 */
function rectsForRange(view: EditorView, range: SelectionRange, edges: ContentEdges): Rect[] {
  if (range.to <= view.viewport.from || range.from >= view.viewport.to) return [];
  const from = Math.max(range.from, view.viewport.from);
  const to = Math.min(range.to, view.viewport.to);
  const startBlock = view.lineBlockAt(from);
  const endBlock = view.lineBlockAt(to);
  const contentTop = view.contentDOM.getBoundingClientRect().top;

  // A selection endpoint sitting on a widget block has no glyph coords; its
  // "row" is the widget's whole box.
  const startCoords = isTextBlock(startBlock) ? view.coordsAtPos(from, 1) : null;
  const endCoords = isTextBlock(endBlock) ? view.coordsAtPos(to, -1) : null;
  const startTop = startCoords ? startCoords.top : contentTop + startBlock.top;
  const startBottom = startCoords ? startCoords.bottom : contentTop + startBlock.bottom;
  const endTop = endCoords ? endCoords.top : contentTop + endBlock.top;
  const endBottom = endCoords ? endCoords.bottom : contentTop + endBlock.bottom;
  const startLeft = startCoords ? startCoords.left : edges.left;
  const endRight = endCoords ? endCoords.right : edges.right;

  // Same visual row: row boxes share their top edge, so the endpoint tops
  // are equal by construction (adjacent rows differ by a full row height).
  if (endTop - startTop < 1) {
    return [new Rect(startLeft, startTop, Math.max(endRight, startLeft), endBottom)];
  }

  const rects: Rect[] = [
    // Partial first row: selection start to the row's right edge.
    new Rect(startLeft, startTop, edges.right, startBottom),
    // Everything between the first and last rows — full width. Wrapped rows
    // of the endpoint lines, whole middle lines, and block widgets all fall
    // inside this band, which is what makes the shape probe-free.
    new Rect(edges.left, startBottom, edges.right, endTop),
    // Partial last row: the row's left edge to the selection end.
    new Rect(edges.left, endTop, endRight, endBottom),
  ];
  return rects.filter((r) => r.bottom > r.top || r.right > r.left);
}

const selectionLayer = layer({
  above: false,
  class: "cm-selectionLayer",
  update: (update) =>
    update.docChanged || update.selectionSet || update.viewportChanged || update.geometryChanged,
  markers(view) {
    const base = layerBase(view);
    const edges = contentEdges(view);
    const markers: RectangleMarker[] = [];
    for (const range of view.state.selection.ranges) {
      if (range.empty) continue;
      for (const rect of rectsForRange(view, range, edges)) {
        markers.push(
          new RectangleMarker(
            "cm-selectionBackground",
            rect.left - base.left,
            rect.top - base.top,
            Math.max(0, rect.right - rect.left),
            rect.bottom - rect.top,
          ),
        );
      }
    }
    return markers;
  },
});

/** Translucent tint ABOVE block widgets wholly covered by a selection — the
 *  below-content band is hidden behind their opaque backgrounds. */
const widgetTintLayer = layer({
  above: true,
  class: "cm-selectionWidgetLayer",
  update: (update) =>
    update.docChanged || update.selectionSet || update.viewportChanged || update.geometryChanged,
  markers(view) {
    const covering = view.state.selection.ranges.filter((r) => !r.empty);
    if (covering.length === 0) return [];
    const base = layerBase(view);
    const edges = contentEdges(view);
    const contentTop = view.contentDOM.getBoundingClientRect().top;
    const markers: RectangleMarker[] = [];
    for (const block of view.viewportLineBlocks) {
      if (isTextBlock(block)) continue;
      if (!covering.some((r) => r.from <= block.from && r.to >= block.to)) continue;
      markers.push(
        new RectangleMarker(
          "cm-selectionWidgetTint",
          edges.left - base.left,
          contentTop + block.top - base.top,
          Math.max(0, edges.right - edges.left),
          block.bottom - block.top,
        ),
      );
    }
    return markers;
  },
});

// The drawn layer replaces the native highlight; the DOM selection itself
// stays (IME, copy, focus). The tablev2 cell editors are separate
// contenteditable islands that keep the native paint.
const hideNativeSelection = Prec.highest(
  EditorView.theme({
    ".cm-content ::selection, .cm-content::selection": {
      backgroundColor: "transparent",
    },
    '.cm-content [contenteditable="plaintext-only"] ::selection, .cm-content [contenteditable="plaintext-only"]::selection':
      {
        backgroundColor: "var(--cds-highlight, #d0e2ff)",
      },
  }),
);

export const drawnSelection: Extension = [selectionLayer, widgetTintLayer, hideNativeSelection];
