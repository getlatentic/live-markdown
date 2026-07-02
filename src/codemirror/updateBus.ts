/**
 * Editor-update fan-out that survives `view.setState`.
 *
 * Reactive chrome (toolbar pressed-states, the selection-actions bubble)
 * needs a callback on every selection/doc change. Injecting an
 * `EditorView.updateListener` with `StateEffect.appendConfig` only patches
 * the CURRENT state's configuration — the next `view.setState` (tab switch,
 * file reload) builds a fresh state from the base extensions and the
 * listener silently dies, freezing the chrome at the previous document's
 * context.
 *
 * The bus lives IN the base extensions, so every created state carries it,
 * while subscriptions key on the `EditorView` — the object that is stable
 * across state swaps.
 */

import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";

const subscribers = new WeakMap<EditorView, Set<(update: ViewUpdate) => void>>();

/** Include once in the editor's base extension list. */
export const updateBus = ViewPlugin.define((view) => ({
  update(update: ViewUpdate) {
    const set = subscribers.get(view);
    if (!set) return;
    for (const fn of [...set]) fn(update);
  },
}));

/**
 * Subscribe to every update of `view`, across all its future states.
 * Returns the unsubscribe function — call it in the effect cleanup.
 */
export function onEditorUpdate(
  view: EditorView,
  fn: (update: ViewUpdate) => void,
): () => void {
  let set = subscribers.get(view);
  if (!set) {
    set = new Set();
    subscribers.set(view, set);
  }
  set.add(fn);
  return () => {
    set.delete(fn);
  };
}
