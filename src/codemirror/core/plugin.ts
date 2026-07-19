/**
 * Markdown decoration plugin — the PAINTER. Walks the Lezer tree against the
 * visible viewport, asks each node's {@link NodeRule} how to render, and
 * applies the returned {@link Paint}.
 *
 * The painter contains *no* construct knowledge: rules live in the base
 * table (`NODE_RULES`) merged with any extension-contributed rules
 * (`nodeRulesFacet`). The one switch here is over `Paint` — CodeMirror's
 * closed set of mechanisms — so adding a construct, widget, contextual
 * override, or whole extension never edits this file.
 *
 * Perf shape (unchanged from the spike):
 *   * Walks `view.visibleRanges` against `syntaxTree(view.state)` —
 *     the work is proportional to the viewport, not the document.
 *   * Rebuilt on doc change or viewport change.
 *
 * Decoration ordering (CM6 requires `from`-then-`startSide` ascending):
 *   * Line decorations collected in one bucket, mark / replace in
 *     another. The final `Decoration.set` lets CM6 sort defensively,
 *     costing ~µs on the typical viewport — cheaper than risking the
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

import { nodeRulesFacet, type NodeLike, type NodeRules } from "./paint";
import { NODE_RULES } from "./registry";

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

/* ---------------- Effective rules ---------------- */

// Base + extension rules, merged once per distinct facet value (the facet
// result is referentially stable until providers change).
const mergedRulesCache = new WeakMap<NodeRules, NodeRules>();

function effectiveRules(view: EditorView): NodeRules {
  const extra = view.state.facet(nodeRulesFacet);
  if (Object.keys(extra).length === 0) return NODE_RULES;
  let merged = mergedRulesCache.get(extra);
  if (!merged) {
    merged = Object.assign({}, NODE_RULES, extra);
    mergedRulesCache.set(extra, merged);
  }
  return merged;
}

/* ---------------- The painter ---------------- */

interface BuildResult {
  decorations: DecorationSet;
  /**
   * Every hidden/replaced range, surfaced as `EditorView.atomicRanges` so
   * cursor motion (arrow keys, drag-select, double-click) treats hidden
   * markup as a single atom — the user moves "around" hidden `**` instead
   * of getting stranded between two invisible characters.
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
function expandTrailingSpace(
  view: EditorView,
  range: { from: number; to: number },
): number {
  const line = view.state.doc.lineAt(range.from);
  if (range.from !== line.from) return range.to;
  const charAfter = view.state.doc.sliceString(range.to, range.to + 1);
  return charAfter === " " ? range.to + 1 : range.to;
}

function buildDecorations(view: EditorView): BuildResult {
  const rules = effectiveRules(view);
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
        const rule = rules[node.name];
        if (!rule) {
          // Unknown node — the coverage test prevents this for the base
          // grammar; an extension grammar's node without a contributed rule
          // lands here. Skip silently rather than throw: a missing rule
          // must not break editing.
          return;
        }
        // `node.node` materializes a SyntaxNode (lezer's documented-expensive
        // path); most rules are constant combinators that never read it, so
        // the context exposes it — and the parent walk — through lazy getters
        // that only pay when a contextual rule actually asks.
        const paint = rule({
          name: node.name,
          from: node.from,
          to: node.to,
          get parentName() {
            return node.node.parent?.name;
          },
          get node() {
            return node.node as unknown as NodeLike;
          },
          state: view.state,
        });

        switch (paint.paint) {
          case "lineClass": {
            if (paint.span === "first") {
              const line = view.state.doc.lineAt(node.from);
              lineDecs.push(lineDeco(paint.className).range(line.from));
            } else {
              stampLineRange(lineDeco(paint.className), node.from, node.to);
            }
            return;
          }
          case "mark": {
            markDecs.push(markDeco(paint.className).range(node.from, node.to));
            return;
          }
          case "hide": {
            const range = paint.range ?? node;
            const hideEnd =
              paint.expandSpace === false ? range.to : expandTrailingSpace(view, range);
            markDecs.push(HIDE_MARKER.range(range.from, hideEnd));
            atomicBuilder.add(
              range.from,
              Math.max(hideEnd, paint.atomicTo ?? hideEnd),
              HIDE_MARKER,
            );
            return;
          }
          case "widget": {
            const hideEnd = expandTrailingSpace(view, node);
            markDecs.push(paint.deco.range(node.from, hideEnd));
            atomicBuilder.add(
              node.from,
              Math.max(hideEnd, paint.atomicTo ?? hideEnd),
              paint.deco,
            );
            return;
          }
          case "none":
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
      // No decoration depends on the cursor (markers never reveal on
      // proximity), so caret-only transactions skip the whole build path.
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
