/**
 * Task checkbox widget — renders `[ ]` / `[x]` as a real interactive
 * `<input type="checkbox">`. Clicking toggles the source.
 *
 * Per spec section 16.4: source `- [ ] Task` becomes a visible
 * `☐ Task` with a real checkbox. Toggling persists as source change
 * (`[ ]` ↔ `[x]`).
 */

import { Decoration, EditorView, WidgetType } from "@codemirror/view";

import { type NodeRule, type Paint } from "../core/paint";

export class TaskCheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    /**
     * Source position of the marker's first character (`[`). Used at
     * click time to dispatch the toggling change. Included in `eq()`
     * so CM6 doesn't reuse a widget whose `from` has drifted under
     * us — if the document was edited above the task item, the
     * dispatched range must be the *current* source position, not a
     * stale one.
     */
    readonly from: number,
  ) {
    super();
  }

  override eq(other: TaskCheckboxWidget): boolean {
    return other.checked === this.checked && other.from === this.from;
  }

  override toDOM(view: EditorView): HTMLElement {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.className = "cm-task-checkbox";
    // Stop propagation so clicking the checkbox doesn't also place
    // the caret at the marker position.
    input.addEventListener("mousedown", (e) => e.stopPropagation());
    input.addEventListener("click", (e) => {
      e.stopPropagation();
      const newMarker = this.checked ? "[ ]" : "[x]";
      view.dispatch({
        changes: { from: this.from, to: this.from + 3, insert: newMarker },
        userEvent: "input.format.task",
      });
    });
    return input;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

/* ---------------- The TaskMarker rule ---------------- */



/** `[ ]` / `[x]` → a real checkbox widget, checked state from the source. */
export const taskMarkerRule: NodeRule = (ctx): Paint => {
  const checked = /\[[xX]\]/.test(ctx.state.sliceDoc(ctx.from, ctx.to));
  const spaceFollows = ctx.state.doc.sliceString(ctx.to, ctx.to + 1) === " ";
  return {
    paint: "widget",
    deco: Decoration.replace({ widget: new TaskCheckboxWidget(checked, ctx.from) }),
    ...(spaceFollows ? { atomicTo: ctx.to + 1 } : {}),
  };
};
