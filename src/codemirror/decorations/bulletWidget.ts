/**
 * Bullet widget — a real DOM element CM6 places where the hidden
 * `ListMark` (`-` / `*` / `1.`) used to be.
 *
 * Why a widget and not a CSS `::before`:
 *   * `::before` is a pseudo-element. It paints in the right spot
 *     but is NOT part of CM6's line metric (the requestMeasure
 *     cycle reads `offsetTop` / `getBoundingClientRect` on real
 *     elements and lines, not pseudo siblings). With `::before` the
 *     bullet drifts visually as font size or padding changes, and
 *     click coordinates on the bullet column return the wrong byte.
 *   * A `WidgetType` rendered via `Decoration.replace({widget})`
 *     becomes a real `<span>` in the line — its width, height, and
 *     baseline participate in measurement. Click→byte is exact;
 *     scroll alignment is exact.
 *
 * Same pattern Zettlr uses for its `BulletWidget` (see
 * `markdown-editor/renderers/render-emphasis.ts`).
 */

import { Decoration, WidgetType, type EditorView } from "@codemirror/view";

import { type NodeRule, type Paint, none } from "./paint";

export class BulletWidget extends WidgetType {
  /**
   * Eq returns true if two widgets are interchangeable — when CM6
   * reuses the existing DOM instead of replacing it. Bullets are
   * stateless so any two bullet widgets are equivalent.
   */
  override eq(_other: BulletWidget): boolean {
    return true;
  }

  override toDOM(_view: EditorView): HTMLElement {
    const el = document.createElement("span");
    el.className = "cm-bullet-widget";
    el.textContent = "•";
    return el;
  }

  /**
   * Widgets can swallow input events; we don't want our bullet to.
   * `ignoreEvent` returning `false` lets the click pass through to
   * the editor, so clicking on the bullet column lands the caret at
   * the start of the list item content.
   */
  override ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Ordered-list marker widget — the counterpart of {@link BulletWidget} for
 * `OrderedList` items. An ordered item's hidden `ListMark` is its number
 * (`1.`, `2.`, …), so unlike a bullet (which swaps `-` for `•`) this renders the
 * marker's own text — otherwise a numbered list would render as bullets.
 */
export class OrderedMarkerWidget extends WidgetType {
  constructor(private readonly marker: string) {
    super();
  }

  /** Carries its number, so CM6 only rebuilds the DOM when the number changes. */
  override eq(other: OrderedMarkerWidget): boolean {
    return other.marker === this.marker;
  }

  override toDOM(_view: EditorView): HTMLElement {
    const el = document.createElement("span");
    el.className = "cm-bullet-widget cm-ordered-marker";
    el.textContent = this.marker;
    return el;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

/* ---------------- The ListMark rule ---------------- */



const BULLET_REPLACE = Decoration.replace({ widget: new BulletWidget() });

/**
 * A `-`/`*`/`+`/`1.` list mark → bullet, its number, or (for a task item)
 * nothing beside the checkbox.
 */
export const listMarkRule: NodeRule = (ctx): Paint => {
  // A marker renders only once it's COMPLETE — followed by a space. A lone
  // `-` at the end of a line is text the user is still typing; rendering it
  // as a bullet mid-type is the surprise we avoid (CommonMark does count it
  // as an empty item).
  if (ctx.state.doc.sliceString(ctx.to, ctx.to + 1) !== " ") {
    return none;
  }
  const atomicTo = ctx.to + 1;
  const listItem = ctx.node.parent;
  // A task item's checkbox IS its marker (`ListItem` → `ListMark` + `Task`):
  // hide the list mark rather than drawing a bullet next to the checkbox.
  if (listItem?.getChild("Task")) {
    return { paint: "hide", atomicTo };
  }
  // An ordered item renders its number, never a `•`. Renumber on display
  // (CommonMark): start at the first item's number and increment by position,
  // so `1. 1. 1.` shows as `1. 2. 3.`. The source delimiter (`.`/`)`) is kept.
  const list = listItem?.parent;
  if (list?.name === "OrderedList") {
    const state = ctx.state;
    const delimiter = state.sliceDoc(ctx.from, ctx.to).replace(/^\d+/, "") || ".";
    const firstMark = list.firstChild?.getChild("ListMark");
    const start = firstMark
      ? Number.parseInt(state.sliceDoc(firstMark.from, firstMark.to), 10)
      : 1;
    let offset = 0;
    for (let sibling = listItem?.prevSibling; sibling; sibling = sibling.prevSibling) {
      if (sibling.name === "ListItem") offset += 1;
    }
    const ordinal = (Number.isNaN(start) ? 1 : start) + offset;
    return {
      paint: "widget",
      deco: Decoration.replace({ widget: new OrderedMarkerWidget(`${ordinal}${delimiter}`) }),
      atomicTo,
    };
  }
  return { paint: "widget", deco: BULLET_REPLACE, atomicTo };
};
