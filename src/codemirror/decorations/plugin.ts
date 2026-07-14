/**
 * Markdown decoration plugin — the ViewPlugin that walks the Lezer
 * tree against the visible viewport and applies whatever the
 * registry says for each node.
 *
 * The plugin contains *no* construct knowledge — three lookups own it:
 *   * `MARKDOWN_DECORATION_REGISTRY` — node name → rendering kind;
 *   * `contextualOverride` — parent-dependent exceptions (bare URLs,
 *     setext underlines);
 *   * `WIDGET_BUILDERS` — how each named widget is constructed.
 * New constructs are added by editing those, not this file.
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

import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, type Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  type DecorationSet,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
} from "@codemirror/view";

import { contextualOverride, lookupDecoration, type RegistryEntry } from "./registry";
import { WIDGET_BUILDERS } from "./widgetBuilders";

/* ---------------- Decoration instances ----------------- */
//
// Cached per `className` so we don't allocate a Decoration per node
// per build. CM6 dedups internally, but skipping the call is cheaper.

const lineDecoCache = new Map<string, Decoration>();
const markDecoCache = new Map<string, Decoration>();
const HIDE_MARKER = Decoration.replace({});

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
  // Force-parse through the viewport so a list/task marker stays rendered while
  // typing: the incremental tree can lag for the just-edited line on a large
  // doc, briefly dropping the widget back to raw source (#37). Bounded to the
  // viewport + a timeout, so a large note doesn't pay a full re-parse per key.
  const tree = ensureSyntaxTree(view.state, view.viewport.to, 100) ?? syntaxTree(view.state);

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
        const base: RegistryEntry | undefined = lookupDecoration(node.name);
        if (!base) {
          // Unknown node — the coverage test prevents this in
          // committed code, but a stray dev branch with a new
          // extension would land here. Skip silently rather than
          // throw: a missing decoration shouldn't break editing.
          return;
        }
        // Parent-dependent rendering (bare URLs, setext underlines) lives in
        // the registry's contextual table, not as ifs here.
        const entry = contextualOverride(node.name, node.node.parent?.name) ?? base;

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
            // WHICH widget is registry data; HOW it's built lives in the
            // WIDGET_BUILDERS map (per-construct runtime knowledge). A null
            // outcome leaves the node as raw visible source.
            const hideEnd = expandTrailingSpace(view, node);
            const outcome = WIDGET_BUILDERS[entry.widget](
              { from: node.from, to: node.to, node: node.node },
              view,
              hideEnd,
            );
            if (!outcome) return;
            const deco = "hide" in outcome ? HIDE_MARKER : outcome.replace;
            markDecs.push(deco.range(node.from, hideEnd));
            atomicBuilder.add(node.from, Math.max(hideEnd, outcome.atomicEnd ?? hideEnd), deco);
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
