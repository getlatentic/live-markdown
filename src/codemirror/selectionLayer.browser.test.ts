/**
 * Real-WebKit geometry for the drawn selection layer (#166).
 *
 * The bug class under test: native ::selection can only highlight rendered
 * DOM, so over a virtualized viewport a whole-document selection showed
 * highlight only on whatever happened to be rendered, and scrolling away and
 * back lost it. These cases pin the layer's contract on real layout:
 * rects derive from `state.selection` × the CURRENT viewport, at every
 * scroll position.
 */

import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor, makeFullEditor } from "./core/editorTestHarness";
import { editorBaseTheme } from "./core/editorTheme";
import { drawnSelection } from "./selectionLayer";

const SCROLLBOX = EditorView.theme({
  "&": { height: "240px" },
  ".cm-scroller": { overflow: "auto" },
});

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
/** Let CM run its measure/draw cycle (scroll handling needs two frames). */
async function settle(): Promise<void> {
  await frame();
  await frame();
}

function selectionRects(view: EditorView): DOMRect[] {
  return Array.from(
    view.dom.querySelectorAll<HTMLElement>(".cm-selectionLayer .cm-selectionBackground"),
    (el) => el.getBoundingClientRect(),
  );
}

function rectCovering(rects: DOMRect[], x: number, y: number): DOMRect | undefined {
  return rects.find((r) => x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1);
}

const TALL_DOC = Array.from({ length: 150 }, (_, i) => `paragraph ${i} with several words`).join(
  "\n\n",
);

describe("drawnSelection over a virtualized viewport", () => {
  afterEach(destroyEditors);

  it("select-all paints every visible line, after scrolling to the bottom AND back to the top", async () => {
    const view = makeEditor(TALL_DOC, 0, [drawnSelection, SCROLLBOX]);
    await settle();
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    await settle();

    // Bottom: the head's neighborhood is painted.
    view.scrollDOM.scrollTop = view.scrollDOM.scrollHeight;
    await settle();
    const lastLine = view.state.doc.lineAt(view.state.doc.length);
    const lastCoords = view.coordsAtPos(lastLine.from, 1)!;
    expect(
      rectCovering(selectionRects(view), lastCoords.left + 2, (lastCoords.top + lastCoords.bottom) / 2),
    ).toBeDefined();

    // Back to the top: the FIRST line is painted again — the native-selection
    // model lost exactly this.
    view.scrollDOM.scrollTop = 0;
    await settle();
    const firstCoords = view.coordsAtPos(1, 1)!;
    const rects = selectionRects(view);
    expect(
      rectCovering(rects, firstCoords.left + 2, (firstCoords.top + firstCoords.bottom) / 2),
    ).toBeDefined();

    // And the visible band is covered wall-to-wall: a mid-viewport line too.
    const midLine = view.state.doc.lineAt(view.lineBlockAtHeight(120).from);
    const midCoords = view.coordsAtPos(midLine.from, 1);
    if (midCoords) {
      expect(
        rectCovering(rects, midCoords.left + 2, (midCoords.top + midCoords.bottom) / 2),
      ).toBeDefined();
    }
  });

  it("extend-to-end from the top, scroll to the head, scroll back: the anchor line stays painted", async () => {
    const view = makeEditor(TALL_DOC, 0, [drawnSelection, SCROLLBOX]);
    await settle();
    const anchor = view.state.doc.line(1).from + 4;
    view.dispatch({
      selection: { anchor, head: view.state.doc.length },
      effects: EditorView.scrollIntoView(view.state.doc.length),
    });
    await settle();
    expect(view.scrollDOM.scrollTop).toBeGreaterThan(0);

    view.scrollDOM.scrollTop = 0;
    await settle();
    const anchorCoords = view.coordsAtPos(anchor, 1)!;
    // The selection starts mid-line: painted from the anchor's x — not just
    // "the first line only", and not nothing.
    const hit = rectCovering(
      selectionRects(view),
      anchorCoords.left + 2,
      (anchorCoords.top + anchorCoords.bottom) / 2,
    );
    expect(hit).toBeDefined();
    // Rows below the anchor row are painted full-width by the between band.
    const secondPara = view.state.doc.line(3);
    const belowCoords = view.coordsAtPos(secondPara.from, 1);
    if (belowCoords) {
      expect(
        rectCovering(selectionRects(view), belowCoords.left + 2, (belowCoords.top + belowCoords.bottom) / 2),
      ).toBeDefined();
    }
  });

  it("a same-row selection paints one sub-row rect anchored at the endpoint coords", async () => {
    const view = makeEditor("plain words here", 0, [drawnSelection]);
    await settle();
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    await settle();
    const rects = selectionRects(view);
    expect(rects.length).toBe(1);
    const from = view.coordsAtPos(0, 1)!;
    const to = view.coordsAtPos(5, -1)!;
    expect(Math.abs(rects[0].left - from.left)).toBeLessThan(2);
    expect(Math.abs(rects[0].right - to.right)).toBeLessThan(2);
  });

  it("mid-line drag over a task-list line paints a stable shape (no #90 flip)", async () => {
    const view = makeEditor("- [ ] alpha beta gamma delta", 0, [drawnSelection]);
    await settle();
    const from = view.state.doc.toString().indexOf("beta");
    view.dispatch({ selection: { anchor: from, head: from + 4 } });
    await settle();
    const first = selectionRects(view).length;
    // Force two more measure cycles at the same state — the #90 failure mode
    // was per-update flipping between 1-piece and 3-piece painting.
    view.requestMeasure();
    await settle();
    view.requestMeasure();
    await settle();
    expect(selectionRects(view).length).toBe(first);
    expect(first).toBe(1);
  });

  it("a block widget wholly inside the selection gets the above-content tint", async () => {
    const doc = ["intro line", "", "| H | H |", "| --- | --- |", "| a | b |", "", "outro line"].join(
      "\n",
    );
    // Themed like the real app: the base theme's padding-not-margin rule is
    // what makes a widget's measured block box equal its visual box.
    const view = makeFullEditor(doc, 0, [drawnSelection, editorBaseTheme]);
    await settle();
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    // The table widget mounts first and is height-measured a cycle later
    // (geometryChanged then repaints the layer) — wait for a stable height.
    let lastHeight = -1;
    for (let i = 0; i < 20; i++) {
      await settle();
      const widgetBlock = view.viewportLineBlocks.find((b) => typeof b.type === "number" && b.type !== 0);
      const height = widgetBlock ? widgetBlock.bottom - widgetBlock.top : -1;
      if (height > 0 && height === lastHeight) break;
      lastHeight = height;
    }
    const tableEl = view.dom.querySelector(".cm-table-widget");
    expect(tableEl).not.toBeNull();
    const tableRect = tableEl!.getBoundingClientRect();
    const tints = Array.from(
      view.dom.querySelectorAll<HTMLElement>(".cm-selectionWidgetLayer .cm-selectionWidgetTint"),
      (el) => el.getBoundingClientRect(),
    );
    const overlapping = tints.find(
      (t) => t.top <= tableRect.top + 2 && t.bottom >= tableRect.bottom - 2,
    );
    expect(overlapping).toBeDefined();
  });
});
