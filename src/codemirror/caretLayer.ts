/**
 * Drawn caret WITHOUT drawn selection (#62, #90 — interaction-spec §7.4).
 *
 * The caret must be drawn from `EditorState.selection`: WKWebView paints the
 * native contentEditable caret on BOTH sides of an atomic widget boundary
 * (#62). But `drawSelection()` also repaints selection RANGES from logical
 * coordinates, and its wrapped-line detection probes `posAtCoords` at the
 * editor's far-left edge per endpoint — on lines whose start is a hidden
 * marker + widget zone (task checkboxes), sub-pixel y differences flip that
 * probe between before/after the hidden prefix, the row-extent equality
 * fails, and a mid-line selection paints as the full-line two-piece wrap
 * pattern, flashing per drag update (#90).
 *
 * So: draw ONLY the caret (this layer), and leave range painting to the
 * engine's native ::selection — glyph-accurate by construction, no
 * coordinate probing. Known trade-off: secondary (multi-cursor) ranges get
 * carets but no native highlight, since the DOM selection mirrors only the
 * main range; Compose doesn't bind multi-range selection gestures.
 *
 * The layer keeps the `cm-cursorLayer` class so existing styling hooks
 * (table arming's caret-hide, the base theme's blink animation) apply.
 */

import { Prec, type Extension } from "@codemirror/state";
import { EditorView, layer, RectangleMarker, type ViewUpdate } from "@codemirror/view";

function relevant(update: ViewUpdate): boolean {
  return (
    update.docChanged ||
    update.selectionSet ||
    update.geometryChanged ||
    update.viewportChanged ||
    update.focusChanged
  );
}

const caretLayer = layer({
  above: true,
  class: "cm-cursorLayer",
  update(update, dom) {
    // Restart the blink so a just-moved caret is immediately visible.
    if (update.selectionSet) {
      dom.style.animationName = dom.style.animationName === "cm-blink" ? "cm-blink2" : "cm-blink";
    }
    return relevant(update);
  },
  markers(view) {
    const markers: RectangleMarker[] = [];
    for (const range of view.state.selection.ranges) {
      if (!range.empty) continue;
      const cls =
        range === view.state.selection.main
          ? "cm-cursor cm-cursor-primary"
          : "cm-cursor cm-cursor-secondary";
      markers.push(...RectangleMarker.forRange(view, cls, range));
    }
    return markers;
  },
});

// The drawn caret replaces the native one; the native SELECTION stays.
const hideNativeCaret = Prec.highest(
  EditorView.theme({
    ".cm-content": { caretColor: "transparent" },
    // Native-caret islands: tablev2 cells edit with the BROWSER caret (no
    // drawn caret of their own), so they win the color back — a direct rule
    // on the element beats the inherited transparent.
    '.cm-content [contenteditable="plaintext-only"]': {
      caretColor: "var(--cds-text-primary, #161616)",
    },
    // While a cell edit is active the drawn caret would ghost at the parked
    // main-selection position; the surface stamps this class on the editor.
    "&.cm-tablev2-editing .cm-cursorLayer": { display: "none" },
  }),
);

export const drawnCaret: Extension = [caretLayer, hideNativeCaret];
