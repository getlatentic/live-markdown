/**
 * How each `hide-with-widget` registry entry becomes a concrete widget.
 *
 * The registry names WHICH widget a node gets (serialisable data, coverage-
 * tested); this map owns HOW that widget is built — the per-construct runtime
 * knowledge data can't carry: a checkbox's checked state, an ordered item's
 * display number, an image's src, whether an HTML span would even draw
 * anything. `plugin.ts` dispatches here by name and stays a pure tree-walker.
 *
 * On the two ends a builder can return (§8.1/§8.2a): the DECORATION hides the
 * marker (plus its separator space only when line-leading — mid-line the
 * space IS the gap between widget and text); the ATOMIC range may extend
 * further (`atomicEnd`) so motion and deletion treat marker + space as one
 * unit at any nesting depth and Backspace never nibbles the separator.
 */

import { Decoration, type EditorView } from "@codemirror/view";

import { BulletWidget, OrderedMarkerWidget } from "./bulletWidget";
import { CellDividerWidget } from "./cellDividerWidget";
import { HorizontalRuleWidget } from "./hrWidget";
import { HtmlWidget, htmlRendersVisibly } from "./htmlWidget";
import { ImageWidget, imageContextFacet } from "./imageWidget";
import { type WidgetName } from "./registry";
import { TaskCheckboxWidget } from "./taskCheckboxWidget";

// Structural stand-in for a Lezer node (`@lezer/common` is a transitive dep
// this package deliberately doesn't import from — tableModel's convention).
interface NodeLike {
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly parent: NodeLike | null;
  readonly firstChild: NodeLike | null;
  readonly prevSibling: NodeLike | null;
  getChild(type: string): NodeLike | null;
}

export interface WidgetNode {
  readonly from: number;
  readonly to: number;
  readonly node: NodeLike;
}

export type WidgetOutcome =
  /** Replace the (hidden) marker span with this widget. */
  | { readonly replace: Decoration; readonly atomicEnd?: number }
  /** Hide the marker with NO widget (a task item's list mark — the checkbox
   *  is the marker). The caller uses its shared hide decoration. */
  | { readonly hide: true; readonly atomicEnd?: number }
  /** Leave the node as raw visible source. */
  | null;

type WidgetBuilder = (node: WidgetNode, view: EditorView, hideEnd: number) => WidgetOutcome;

// Stateless widgets are singletons: allocating per node per viewport build is
// pure GC pressure (CM6 reuses DOM via eq, but skipping the allocation and
// getting identity-equality is cheaper still).
const BULLET_REPLACE = Decoration.replace({ widget: new BulletWidget() });
const HR_REPLACE = Decoration.replace({ widget: new HorizontalRuleWidget() });
const CELL_DIVIDER_REPLACE = Decoration.replace({ widget: new CellDividerWidget() });

/** A `-`/`*`/`+`/`1.` list mark → bullet, number, or (for a task item)
 *  nothing beside the checkbox. */
function buildListMark(node: WidgetNode, view: EditorView): WidgetOutcome {
  // A marker renders only once it's COMPLETE — followed by a space. A lone
  // `-` at the end of a line is text the user is still typing; rendering it
  // as a bullet mid-type is the surprise we avoid (CommonMark does count it
  // as an empty item).
  if (view.state.doc.sliceString(node.to, node.to + 1) !== " ") {
    return null;
  }
  const atomicEnd = node.to + 1;
  const listItem = node.node.parent;
  // A task item's checkbox IS its marker (`ListItem` → `ListMark` + `Task`):
  // hide the list mark rather than drawing a bullet next to the checkbox.
  if (listItem?.getChild("Task")) {
    return { hide: true, atomicEnd };
  }
  // An ordered item renders its number, never a `•`. Renumber on display
  // (CommonMark): start at the first item's number and increment by position,
  // so `1. 1. 1.` shows as `1. 2. 3.`. The source delimiter (`.`/`)`) is kept.
  const list = listItem?.parent;
  if (list?.name === "OrderedList") {
    const delimiter = view.state.sliceDoc(node.from, node.to).replace(/^\d+/, "") || ".";
    const firstMark = list.firstChild?.getChild("ListMark");
    const start = firstMark
      ? Number.parseInt(view.state.sliceDoc(firstMark.from, firstMark.to), 10)
      : 1;
    let offset = 0;
    for (let sibling = listItem?.prevSibling; sibling; sibling = sibling.prevSibling) {
      if (sibling.name === "ListItem") offset += 1;
    }
    const ordinal = (Number.isNaN(start) ? 1 : start) + offset;
    return {
      replace: Decoration.replace({ widget: new OrderedMarkerWidget(`${ordinal}${delimiter}`) }),
      atomicEnd,
    };
  }
  return { replace: BULLET_REPLACE, atomicEnd };
}

function buildTaskCheckbox(node: WidgetNode, view: EditorView): WidgetOutcome {
  const checked = /\[[xX]\]/.test(view.state.sliceDoc(node.from, node.to));
  const spaceFollows = view.state.doc.sliceString(node.to, node.to + 1) === " ";
  return {
    replace: Decoration.replace({ widget: new TaskCheckboxWidget(checked, node.from) }),
    ...(spaceFollows ? { atomicEnd: node.to + 1 } : {}),
  };
}

function buildImage(node: WidgetNode, view: EditorView): WidgetOutcome {
  const label = node.node.getChild("LinkLabel");
  const url = node.node.getChild("URL");
  const alt = label ? view.state.sliceDoc(label.from, label.to) : "";
  const rawSrc = url ? view.state.sliceDoc(url.from, url.to) : "";
  const ctx = view.state.facet(imageContextFacet);
  return {
    replace: Decoration.replace({
      widget: new ImageWidget(alt, rawSrc, ctx, node.from, node.to),
    }),
  };
}

function buildHtmlInline(node: WidgetNode, view: EditorView): WidgetOutcome {
  const html = view.state.sliceDoc(node.from, node.to);
  // A tag that sanitizes to nothing visible (`<yourname>`, `</b>`, `<script>`)
  // stays raw text — never an invisible hole where the user's typing vanished.
  if (!htmlRendersVisibly(html)) return null;
  return { replace: Decoration.replace({ widget: new HtmlWidget(html, false) }) };
}

function buildHtmlBlock(node: WidgetNode, view: EditorView): WidgetOutcome {
  // Multi-line HTML blocks fail CM6's "no plugin-level multi-line replace"
  // rule — they stay raw source until a StateField carries them (Phase 5).
  const fromLine = view.state.doc.lineAt(node.from).number;
  const toLine = view.state.doc.lineAt(node.to).number;
  if (fromLine !== toLine) return null;
  const html = view.state.sliceDoc(node.from, node.to);
  if (!htmlRendersVisibly(html)) return null;
  return { replace: Decoration.replace({ widget: new HtmlWidget(html, true) }) };
}

export const WIDGET_BUILDERS: Record<WidgetName, WidgetBuilder> = {
  bullet: buildListMark,
  "task-checkbox": buildTaskCheckbox,
  image: buildImage,
  hr: () => ({ replace: HR_REPLACE }),
  "cell-divider": () => ({ replace: CELL_DIVIDER_REPLACE }),
  "html-inline": buildHtmlInline,
  "html-block": buildHtmlBlock,
};
