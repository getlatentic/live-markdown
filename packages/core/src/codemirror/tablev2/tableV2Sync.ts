/**
 * Surface synchronisation for the V2 table (ADR 0001): after every document
 * change the widget DOM has been patched or recreated — remap the surface's
 * table anchor through the change, then let it re-attach the active edit.
 */

import { EditorView } from "@codemirror/view";
import { type Extension } from "@codemirror/state";

import { type CellEditingSurface } from "./cellEditingSurface";

export function tableV2Sync(surface: CellEditingSurface): Extension {
  return EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    surface.mapThrough(update.changes);
    surface.reanchor(update.view);
  });
}
