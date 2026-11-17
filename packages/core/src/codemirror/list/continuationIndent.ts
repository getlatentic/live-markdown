/**
 * A line that continues a list item draws its text under the item's text.
 *
 * In the source such a line is indented by spaces as wide as the item's
 * marker (`- one` / `  more`). A space is far narrower than a drawn bullet or
 * number, so the part of the indentation that stands for the marker is
 * replaced by an invisible copy of that marker: the same element with the
 * same styles, hence the same width whatever the font or the number.
 *
 * Task items are left alone: their text continues under the checkbox.
 */

import { syntaxTree } from "@codemirror/language";
import { type EditorState, type Line, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";

import type { NodeLike } from "../core/paint";
import { treeAt } from "../core/treeAt";
import { BulletWidget, OrderedMarkerWidget, drawnNumber } from "./bulletWidget";

class MarkerSpace extends WidgetType {
  /** `number` is the drawn number of an ordered item, null for a bullet.
   *  `gap`: the item's marker is followed by a visible space. */
  constructor(private readonly number: string | null, private readonly gap: boolean) {
    super();
  }

  override eq(other: MarkerSpace): boolean {
    return other.number === this.number && other.gap === this.gap;
  }

  override toDOM(view: EditorView): HTMLElement {
    const marker = (this.number === null ? new BulletWidget() : new OrderedMarkerWidget(this.number)).toDOM(view);
    const space = document.createElement("span");
    space.className = "cm-list-marker-space";
    space.setAttribute("aria-hidden", "true");
    space.style.visibility = "hidden";
    space.append(marker, this.gap ? " " : "");
    return space;
  }
}

/** The list item `line` continues: the innermost one around its text that
 *  started on an earlier line. Null in code, and for a line that starts an item. */
function continuedItem(state: EditorState, line: Line, textFrom: number): NodeLike | null {
  for (let node: NodeLike | null = treeAt(state, textFrom).resolveInner(textFrom, 1) as unknown as NodeLike; node; node = node.parent) {
    if (node.name === "FencedCode" || node.name === "CodeBlock") return null;
    if (node.name === "ListItem") return node.from < line.from ? node : null;
  }
  return null;
}

/** The indentation of `line` that stands for the marker of the item it continues. */
function markerSpace(state: EditorState, line: Line): Range<Decoration> | null {
  const indent = /^ +/.exec(line.text)?.[0].length ?? 0;
  if (indent === 0 || indent === line.length) return null;
  const item = continuedItem(state, line, line.from + indent);
  const mark = item?.getChild("ListMark");
  if (!item || !mark || item.getChild("Task")) return null;
  const itemLine = state.doc.lineAt(mark.from);
  const itemIndent = mark.from - itemLine.from;
  const width = mark.to - mark.from + 1;
  // Indented less than the item's text: the line is drawn as it is written.
  if (indent < itemIndent + width) return null;
  // The painter hides the space after a marker only at the very start of a line.
  const gap = itemIndent > 0;
  const number = item.parent?.name === "OrderedList" ? drawnNumber(state, item) : null;
  const from = line.from + itemIndent;
  return Decoration.replace({ widget: new MarkerSpace(number, gap) }).range(from, from + width);
}

function build(view: EditorView): DecorationSet {
  const spaces: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos);
      const space = markerSpace(view.state, line);
      if (space) spaces.push(space);
      pos = line.to + 1;
    }
  }
  return Decoration.set(spaces);
}

export const continuationIndentPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = build(view);
    }

    update(update: ViewUpdate): void {
      const reparsed = syntaxTree(update.startState) !== syntaxTree(update.state);
      if (update.docChanged || update.viewportChanged || reparsed) this.decorations = build(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/** Draws list continuation lines under their item's text; the replaced
 *  indentation moves under the caret as one step. */
export const continuationIndent = [
  continuationIndentPlugin,
  EditorView.atomicRanges.of((view) => view.plugin(continuationIndentPlugin)?.decorations ?? Decoration.none),
];
