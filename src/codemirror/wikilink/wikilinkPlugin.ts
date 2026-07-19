/**
 * Wikilink decoration plugin — recognises `[[target]]` and
 * `[[target|alias]]` spans in the visible viewport, hides the
 * `[[` / `|target` / `]]` markup, and styles the visible label as
 * a clickable link.
 *
 * Why a separate plugin from `markdownDecorationsPlugin`: wikilinks
 * aren't part of CommonMark / GFM, so Lezer's parser doesn't emit a
 * node for them. We scan the visible text directly, skipping matches
 * in code contexts (`codeContext.ts`) where `[[…]]` is literal. Same
 * shape as the Tiptap `wikilinkExtension` — port of that logic, not
 * a new design.
 *
 * Click navigation lives in `clickModel.ts` (it shares the
 * link-target resolution path).
 */

import { Facet, type Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
} from "@codemirror/view";

import { parseWikilinkBody } from "../../links/wikilink";
import { inCode, viewportTree } from "../core/codeContext";

const WIKILINK_RE = /\[\[([^\]\n]+?)\]\]/g;

/** Hides the `[[ … | ]]` syntax characters. */
const HIDE = Decoration.replace({});

/** Class on the visible label so CSS can paint it as a link. */
const linkMark = Decoration.mark({ class: "cm-wikilink" });

/**
 * Workspace-relative current file path. Wired by the editor's React
 * shell so the navigation click can resolve relative-style
 * wikilinks (`./note`, `../note`).
 */
export const wikilinkFromPathFacet = Facet.define<string | undefined, string | undefined>({
  combine: (vals) => vals[0],
});

/**
 * Set of every workspace-relative path. Used to resolve a wikilink
 * target to a real file. Combine prefers the first registered set
 * (the editor only adds one).
 */
export const wikilinkTargetsFacet = Facet.define<
  ReadonlySet<string>,
  ReadonlySet<string>
>({
  combine: (vals) => vals[0] ?? new Set(),
});

/**
 * Build the decoration set for the visible viewport. Walks visible
 * ranges, scans each line's text for `[[…]]` matches, and emits
 * hide-replace + mark decorations.
 */
function buildDecorations(view: EditorView): { decorations: DecorationSet; atomic: DecorationSet } {
  const builder: Range<Decoration>[] = [];
  const atomicBuilder: Range<Decoration>[] = [];
  const tree = viewportTree(view);

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    WIKILINK_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WIKILINK_RE.exec(text)) !== null) {
      const body = match[1] ?? "";
      const { target } = parseWikilinkBody(body);
      if (target === "") continue;

      const matchStart = from + match.index;
      const matchEnd = matchStart + match[0].length;
      if (inCode(tree, matchStart) || inCode(tree, matchEnd - 2)) continue;
      const bodyStart = matchStart + 2; // after `[[`
      const bodyEnd = matchEnd - 2; // before `]]`

      // Compute the visible-label range. `[[target|alias]]` shows
      // `alias`; `[[target]]` shows `target`.
      const pipe = body.indexOf("|");
      let labelStart = bodyStart;
      let labelEnd = bodyEnd;
      if (pipe !== -1) {
        const aliasRaw = body.slice(pipe + 1);
        if (aliasRaw.trim() !== "") {
          labelStart = bodyStart + pipe + 1;
        } else {
          labelEnd = bodyStart + pipe;
        }
      }

      // Hide `[[` (and the `target|` prefix if there's an alias).
      builder.push(HIDE.range(matchStart, labelStart));
      atomicBuilder.push(HIDE.range(matchStart, labelStart));
      // Style the visible label.
      builder.push(linkMark.range(labelStart, labelEnd));
      // Hide `]]` (and the trailing target if the alias was empty).
      builder.push(HIDE.range(labelEnd, matchEnd));
      atomicBuilder.push(HIDE.range(labelEnd, matchEnd));
    }
  }

  // Decorations must be sorted by `from` then `startSide`. The
  // produced order from the regex scan is already document-order so
  // `sort: true` is a cheap defensive insurance.
  return {
    decorations: Decoration.set(builder, true),
    atomic: Decoration.set(atomicBuilder, true),
  };
}

export const wikilinkPlugin = ViewPlugin.fromClass(
  class implements PluginValue {
    decorations: DecorationSet;
    atomic: DecorationSet;
    constructor(view: EditorView) {
      const built = buildDecorations(view);
      this.decorations = built.decorations;
      this.atomic = built.atomic;
    }
    update(update: ViewUpdate) {
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
