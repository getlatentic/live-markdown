/**
 * Markdown decoration plugin — the ViewPlugin that walks the Lezer
 * tree against the visible viewport and applies whatever the
 * registry says for each node.
 *
 * The plugin contains *no* node-name knowledge: every decision is a
 * lookup against `MARKDOWN_DECORATION_REGISTRY`. New constructs are
 * added by editing the registry, not by editing this file.
 *
 * Perf shape (unchanged from the spike):
 *   * Walks `view.visibleRanges` against `syntaxTree(view.state)` —
 *     the work is proportional to the viewport, not the document.
 *   * Rebuilt on doc change, selection change (so the cursor-on-line
 *     reveal works), or viewport change.
 *
 * Decoration ordering (CM6 requires `from`-then-`startSide` ascending):
 *   * Line decorations collected in one bucket, mark / replace in
 *     another. Line decorations naturally sort before marks that
 *     start at the same line offset.
 *   * The final `Decoration.set` lets CM6 sort defensively, costing
 *     ~µs on the typical viewport — cheaper than risking the
 *     "decorations out of order" runtime error.
 */

import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, type Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  type DecorationSet,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
} from "@codemirror/view";

import { lookupDecoration, type RegistryEntry } from "./registry";
import { BulletWidget } from "./bulletWidget";
import { TaskCheckboxWidget } from "./taskCheckboxWidget";
import { ImageWidget, imageContextFacet } from "./imageWidget";
import { HorizontalRuleWidget } from "./hrWidget";
import { CellDividerWidget } from "./cellDividerWidget";
import { HtmlWidget } from "./htmlWidget";

/* ---------------- Decoration instances ----------------- */
//
// Cached per `className` so we don't allocate a Decoration per node
// per build. CM6 dedups internally, but skipping the call is cheaper.

const lineDecoCache = new Map<string, Decoration>();
const markDecoCache = new Map<string, Decoration>();
const HIDE_MARKER = Decoration.replace({});

// Widget-replace decorations are shared singletons — every list bullet
// is rendered by the same `Decoration` and the same `WidgetType`
// instance. CM6's `WidgetType.eq` would have let us get away with
// fresh allocations (it reuses DOM when eq returns true), but allocating
// fresh `Decoration.replace` and `WidgetType` instances on every
// viewport change is wasted GC pressure. One instance, reused forever.
const BULLET_WIDGET = new BulletWidget();
const BULLET_REPLACE = Decoration.replace({ widget: BULLET_WIDGET });

function lineDeco(className: string): Decoration {
  let d = lineDecoCache.get(className);
  if (!d) {
    d = Decoration.line({ class: className });
    lineDecoCache.set(className, d);
  }
  return d;
}

function markDeco(className: string): Decoration {
  let d = markDecoCache.get(className);
  if (!d) {
    d = Decoration.mark({ class: className });
    markDecoCache.set(className, d);
  }
  return d;
}

/* ---------------- The builder ---------------- */

interface BuildResult {
  decorations: DecorationSet;
  /**
   * Every range hidden by a `hide-always` decoration. Surfaced as
   * `EditorView.atomicRanges` so cursor motion (arrow keys, drag-
   * select, double-click) treats the hidden markup as a single
   * atom — the user moves "around" hidden `**` instead of getting
   * stranded between two invisible characters.
   */
  atomic: DecorationSet;
}

/**
 * Block-level markers (`# ` heading, `> ` quote, `- ` list item) are
 * followed by exactly one separator space; we hide that space along
 * with the marker so the rendered line starts at the first content
 * char. Inline markers (`*`, backticks) don't have this — only the
 * line-leading case applies.
 */
function expandTrailingSpace(view: EditorView, node: { from: number; to: number }): number {
  const line = view.state.doc.lineAt(node.from);
  if (node.from !== line.from) return node.to;
  const charAfter = view.state.doc.sliceString(node.to, node.to + 1);
  return charAfter === " " ? node.to + 1 : node.to;
}

function buildDecorations(view: EditorView): BuildResult {
  const lineDecs: Range<Decoration>[] = [];
  const markDecs: Range<Decoration>[] = [];
  const atomicBuilder = new RangeSetBuilder<Decoration>();
  const tree = syntaxTree(view.state);

  // Stamp a Decoration.line on every line overlapping the given
  // range. CM6 requires `Decoration.line` to be anchored at a line
  // start; this helper does the line-iteration once for callers.
  const stampLineRange = (deco: Decoration, from: number, to: number) => {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      lineDecs.push(deco.range(line.from));
      if (line.to >= to) break;
      pos = line.to + 1;
    }
  };

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        const entry: RegistryEntry | undefined = lookupDecoration(node.name);
        if (!entry) {
          // Unknown node — the coverage test prevents this in
          // committed code, but a stray dev branch with a new
          // extension would land here. Skip silently rather than
          // throw: a missing decoration shouldn't break editing.
          return;
        }

        switch (entry.kind) {
          case "heading-line": {
            // Whole-line decoration anchored at the line start.
            const line = view.state.doc.lineAt(node.from);
            lineDecs.push(lineDeco(entry.className).range(line.from));
            return;
          }
          case "line": {
            stampLineRange(lineDeco(entry.className), node.from, node.to);
            return;
          }
          case "mark": {
            markDecs.push(markDeco(entry.className).range(node.from, node.to));
            return;
          }
          case "hide-always": {
            const hideEnd = expandTrailingSpace(view, node);
            markDecs.push(HIDE_MARKER.range(node.from, hideEnd));
            atomicBuilder.add(node.from, hideEnd, HIDE_MARKER);
            return;
          }
          case "escape": {
            // Hide only the leading backslash of `\x`; the escaped char stays
            // visible, so `\'` renders as `'`.
            markDecs.push(HIDE_MARKER.range(node.from, node.from + 1));
            atomicBuilder.add(node.from, node.from + 1, HIDE_MARKER);
            return;
          }
          case "hide-with-widget": {
            const hideEnd = expandTrailingSpace(view, node);
            let replace;
            switch (entry.widget) {
              case "bullet": {
                // A `-`/`*`/`+` renders as a `•` only once it's a COMPLETE
                // bullet marker — i.e. FOLLOWED BY A SPACE. A lone `-` (end of
                // line, or any non-space after it) is literal text the user is
                // still typing, so it stays a visible `-` until they add the
                // space that turns the line into a list item. CommonMark counts
                // a bare `-` as an empty list item, but rendering that as a
                // bullet mid-type is the surprise we're avoiding.
                if (view.state.doc.sliceString(node.to, node.to + 1) !== " ") {
                  return;
                }
                replace = BULLET_REPLACE;
                break;
              }
              case "task-checkbox": {
                const markerText = view.state.sliceDoc(node.from, node.to);
                const checked = /\[[xX]\]/.test(markerText);
                replace = Decoration.replace({
                  widget: new TaskCheckboxWidget(checked, node.from),
                });
                break;
              }
              case "image": {
                const labelNode = node.node.getChild("LinkLabel");
                const urlNode = node.node.getChild("URL");
                const alt = labelNode
                  ? view.state.sliceDoc(labelNode.from, labelNode.to)
                  : "";
                const rawSrc = urlNode
                  ? view.state.sliceDoc(urlNode.from, urlNode.to)
                  : "";
                const ctx = view.state.facet(imageContextFacet);
                replace = Decoration.replace({
                  widget: new ImageWidget(alt, rawSrc, ctx, node.from, node.to),
                });
                break;
              }
              case "hr":
                replace = Decoration.replace({ widget: new HorizontalRuleWidget() });
                break;
              case "cell-divider":
                replace = Decoration.replace({ widget: new CellDividerWidget() });
                break;
              case "html-inline": {
                const html = view.state.sliceDoc(node.from, node.to);
                replace = Decoration.replace({ widget: new HtmlWidget(html, false) });
                break;
              }
              case "html-block": {
                // Multi-line HTML blocks fail CM6's "no plugin-level
                // multi-line replace" rule. Only inline-into-paragraph
                // HTMLBlock (single-line) is decorated; multi-line
                // blocks stay as raw source until the StateField
                // refactor (Phase 5) lets us do block widgets safely.
                const fromLine = view.state.doc.lineAt(node.from).number;
                const toLine = view.state.doc.lineAt(node.to).number;
                if (fromLine !== toLine) return;
                const html = view.state.sliceDoc(node.from, node.to);
                replace = Decoration.replace({ widget: new HtmlWidget(html, true) });
                break;
              }
            }
            markDecs.push(replace.range(node.from, hideEnd));
            atomicBuilder.add(node.from, hideEnd, replace);
            return;
          }
          case "structural":
          case "render-raw":
            // Both kinds explicitly skip — the difference is
            // documentary. `structural` is "this is a parser
            // grouping construct"; `render-raw` is "the user sees
            // this but Phase 2+ will style it." Either way: nothing
            // to push.
            return;
        }
      },
    });
  }

  // Line decorations before mark/replace at the same point — this is
  // the canonical CM6 ordering. Concat-then-sort is one O(n log n)
  // for the whole viewport, dwarfed by the parse cost.
  const all: Range<Decoration>[] = lineDecs.concat(markDecs);
  return {
    decorations: Decoration.set(all, /* sort */ true),
    atomic: atomicBuilder.finish(),
  };
}

export const markdownDecorationsPlugin = ViewPlugin.fromClass(
  class implements PluginValue {
    decorations: DecorationSet;
    atomic: DecorationSet;
    constructor(view: EditorView) {
      const built = buildDecorations(view);
      this.decorations = built.decorations;
      this.atomic = built.atomic;
    }
    update(update: ViewUpdate) {
      // Drop selectionSet from the rebuild predicate — no decoration
      // depends on the cursor any more (we don't reveal markers on
      // proximity), so cursor motion shouldn't trigger a viewport
      // re-walk. That's measurable snappiness: keystrokes that only
      // move the caret now skip the entire decoration build path.
      if (update.docChanged || update.viewportChanged) {
        const built = buildDecorations(update.view);
        this.decorations = built.decorations;
        this.atomic = built.atomic;
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none),
  },
);
