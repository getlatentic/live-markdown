/**
 * The rendering contract: one polymorphic shape for "how does a Lezer node
 * render", replacing three parallel dispatch surfaces (a data-entry union, a
 * widget-name union + builders map, and a contextual-override switch).
 *
 *   NodeRule  = (ctx) => Paint      — one function per node NAME
 *   Paint     = which CM6 mechanism  — a CLOSED union
 *
 * The openness is split on the right axis: CONSTRUCTS grow (every new node
 * adds a rule — one entry, one place, usually one line via the combinators
 * below), while the ways to PAINT don't (line class / span mark / hide /
 * widget / nothing — CodeMirror's own vocabulary). The single switch over
 * `Paint` lives in the painter (plugin.ts) and never changes when a
 * construct is added.
 *
 * Context (the bare-URL lesson: a node name can mean different things in
 * different parents) is not a bolt-on — every rule IS a function of context;
 * simple rules just ignore it.
 *
 * Extensions contribute rules through {@link nodeRulesFacet}: a plugin that
 * introduces node names ships its rules alongside its grammar, touching no
 * core file.
 */

import { Facet, type EditorState } from "@codemirror/state";
import { type Decoration } from "@codemirror/view";

// Structural stand-in for a Lezer node (`@lezer/common` is a transitive dep
// this package deliberately doesn't import from).
export interface NodeLike {
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly parent: NodeLike | null;
  readonly firstChild: NodeLike | null;
  readonly nextSibling: NodeLike | null;
  readonly prevSibling: NodeLike | null;
  getChild(type: string): NodeLike | null;
}

/** Everything a rule may consult. */
export interface NodeContext {
  readonly name: string;
  readonly from: number;
  readonly to: number;
  /** The parent node's name — the common contextual discriminator. */
  readonly parentName: string | undefined;
  /** Full structural node, for rules that need siblings/children. */
  readonly node: NodeLike;
  /** Rules are pure over state — no view dependency, so non-editor
   *  renderers (table cells) can invoke the same rules. */
  readonly state: EditorState;
}

/** One painting instruction, in CodeMirror's own vocabulary. */
export type Paint =
  /** Stamp a line class — on the node's first line, or every spanned line. */
  | { readonly paint: "lineClass"; readonly className: string; readonly span: "first" | "all" }
  /** Style the node's span. */
  | { readonly paint: "mark"; readonly className: string }
  /**
   * Hide a range (default: the node, plus its one separator space when
   * line-leading) and make it atomic to caret motion. `atomicTo` widens the
   * atom past the hidden range (marker + space move as one unit).
   */
  | {
      readonly paint: "hide";
      readonly range?: { readonly from: number; readonly to: number };
      readonly expandSpace?: boolean;
      readonly atomicTo?: number;
    }
  /** Replace the (hidden) span with a widget decoration. */
  | { readonly paint: "widget"; readonly deco: Decoration; readonly atomicTo?: number }
  /** Leave the node alone — visible raw source. */
  | { readonly paint: "none" };

export interface RuleMeta {
  readonly intent: "render-raw" | "structural";
  readonly why: string;
}

/** How one node name renders. `meta` tags the deliberate do-nothing rules so
 *  the coverage test can insist their reason is documented. */
export type NodeRule = ((ctx: NodeContext) => Paint) & { readonly meta?: RuleMeta };

export type NodeRules = Readonly<Record<string, NodeRule>>;

/* ---------------- Combinators — the common rules as one-liners ------------ */

const NONE: Paint = { paint: "none" };

/** Style the node's span with a class. */
export function mark(className: string): NodeRule {
  const paint: Paint = { paint: "mark", className };
  return () => paint;
}

/** Stamp a line class on every line the node spans. */
export function line(className: string): NodeRule {
  const paint: Paint = { paint: "lineClass", className, span: "all" };
  return () => paint;
}

/** Stamp a line class on the node's first line only (headings). */
export function headingLine(className: string): NodeRule {
  const paint: Paint = { paint: "lineClass", className, span: "first" };
  return () => paint;
}

/** Hide the node (marker chrome), atomically. */
export function hideAlways(): NodeRule {
  const paint: Paint = { paint: "hide" };
  return () => paint;
}

/** Deliberately unstyled-for-now, visible raw — `why` documents the intent. */
export function raw(why: string): NodeRule {
  return Object.assign(() => NONE, { meta: { intent: "render-raw", why } as RuleMeta });
}

/** A parser grouping construct, never directly visible — `why` says which. */
export function structural(why: string): NodeRule {
  return Object.assign(() => NONE, { meta: { intent: "structural", why } as RuleMeta });
}

export const none: Paint = NONE;

/* ---------------- Extension seam ----------------------------------------- */

/**
 * Rules contributed by extensions, merged over the base table (an extension
 * may also deliberately override a base rule — last provider wins). The
 * painter reads THIS, never the base table directly.
 */
export const nodeRulesFacet = Facet.define<NodeRules, NodeRules>({
  combine(values) {
    return Object.assign({}, ...values);
  },
});
