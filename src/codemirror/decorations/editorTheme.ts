/**
 * Editor theme.
 *
 * Lives in `EditorView.baseTheme` rather than in `global.scss` for
 * three load-bearing reasons:
 *
 *   1. **Line-metric integrity.** CM6 measures line heights from the
 *      DOM through a `requestMeasure` cycle to compute click → byte
 *      and scroll → viewport mappings. Styles injected via
 *      `EditorView.theme` participate in that cycle at the right
 *      moment; styles from an external sheet can land *after* the
 *      first measurement, so clicks land on the wrong line until the
 *      next measure fires. (This was the click-drift the spike
 *      shipped — fixed by moving here.)
 *   2. **Specificity that beats the base theme without `!important`.**
 *      CM6 ships its monospace-and-purple base theme via the same
 *      mechanism; layering `EditorView.theme` on top is the only
 *      collision-free pattern.
 *   3. **No margin/padding on heading lines.** Margins between
 *      `.cm-line` siblings shift visual position without changing
 *      `offsetTop`, so the metric cache and the eye disagree —
 *      that's the canonical click-on-wrong-line bug. We change
 *      `font:` (which doesn't touch line-height), nothing else.
 *
 * Zettlr's `markdown-editor/theme/editor.ts` is the canonical
 * reference for this pattern in the open-source ecosystem.
 */

import { EditorView } from "@codemirror/view";

/**
 * `EditorView.theme` (not `baseTheme`) — `baseTheme` is the
 * low-priority slot meant for theme packages and gets out-specifity'd
 * by any app-level CSS (Carbon's globals in our case). `theme` is the
 * app-priority slot; our intent is to override CM6's defaults, so
 * this is the right tier.
 */
export const editorBaseTheme = EditorView.theme({
  // CM6 paints a focus outline by default. The caret IS the focus
  // indicator in Compose; the box would be visual noise.
  "&.cm-focused": {
    outline: "none",
  },

  // Body type. Override CM6's monospace default *here* (not in the
  // external stylesheet) so the measurement cycle sees it.
  ".cm-content": {
    fontFamily:
      "var(--cds-body-01-font-family, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif)",
    fontSize: "1rem",
    // Tight line-height: the caret height tracks the line box
    // (line-height × font-size), so anything above 1.4 starts to
    // feel disproportionate. 1.4 is the value Zettlr uses for the
    // same reason.
    lineHeight: "1.4",
    color: "var(--cds-text-primary, #161616)",
    maxWidth: "48rem",
    margin: "0 auto",
  },

  // Scroller padding — kept here so it's part of the same theme
  // bundle as the content metrics.
  ".cm-scroller": {
    padding: "1.5rem 3rem",
  },

  // Caret stroke. CM6 owns the height (it tracks the current line-box,
  // so headings get a heading-sized caret automatically per spec 6.2).
  // Width is 1 CSS px per spec; accessibility "thick caret" mode (2 px)
  // is a Phase-N follow-up.
  ".cm-cursor, .cm-dropCursor": {
    borderLeftWidth: "1px",
  },

  // Headings — `font:` shorthand changes size + weight *without*
  // setting line-height (it inherits the content's 1.5). The vertical
  // breathing room is `padding` not `margin` for the click-metric
  // reason above — sibling margins drift, sibling padding doesn't.
  ".cm-heading--1": {
    fontWeight: "700",
    fontSize: "2.0rem",
    lineHeight: "1.3",
    paddingTop: "0.6em",
    paddingBottom: "0.2em",
  },
  ".cm-heading--2": {
    fontWeight: "700",
    fontSize: "1.6rem",
    lineHeight: "1.3",
    paddingTop: "0.5em",
    paddingBottom: "0.15em",
  },
  ".cm-heading--3": {
    fontWeight: "700",
    fontSize: "1.3rem",
    lineHeight: "1.3",
    paddingTop: "0.4em",
    paddingBottom: "0.1em",
  },
  ".cm-heading--4": { fontWeight: "700", fontSize: "1.15rem", paddingTop: "0.3em" },
  ".cm-heading--5": { fontWeight: "700", fontSize: "1.05rem", paddingTop: "0.25em" },
  ".cm-heading--6": {
    fontWeight: "700",
    fontSize: "1.0rem",
    color: "var(--cds-text-secondary, #525252)",
    paddingTop: "0.2em",
  },

  // Inline / block styling. All sized by font + color only — never
  // by margin/padding, never by line-height override.
  ".cm-strong": { fontWeight: "700" },
  ".cm-emphasis": { fontStyle: "italic" },

  ".cm-inline-code": {
    fontFamily:
      "var(--cds-code-01-font-family, ui-monospace, \"SF Mono\", Menlo, monospace)",
    fontSize: "0.92em",
    padding: "0 0.25em",
    background: "var(--cds-layer-accent-01, #e8e8e8)",
    borderRadius: "3px",
  },

  ".cm-fenced-code": {
    fontFamily:
      "var(--cds-code-01-font-family, ui-monospace, \"SF Mono\", Menlo, monospace)",
    fontSize: "0.92em",
    background: "var(--cds-layer-accent-01, #f4f4f4)",
    paddingLeft: "0.75em",
    paddingBottom: "0",
  },

  ".cm-blockquote": {
    borderInlineStart: "3px solid var(--cds-border-subtle-02, #c6c6c6)",
    paddingInlineStart: "0.75em",
    color: "var(--cds-text-secondary, #525252)",
    fontStyle: "italic",
  },

  // List-item line: small left indent so the bullet widget sits in
  // its own column. Padding (not margin) keeps click metrics exact.
  ".cm-list-line": {
    paddingInlineStart: "0.5em",
  },

  // Bullet widget — styled here so the widget's HTML inherits the
  // right colour against body type.
  ".cm-bullet-widget": {
    display: "inline-block",
    width: "1em",
    color: "var(--cds-text-secondary, #525252)",
    fontWeight: "700",
  },

  // Ordered-list number (`1.`) — wider than a bullet's fixed 1em so multi-digit
  // markers fit, with a small gap before the item text. Normal weight: a bold
  // number reads as heavier than the body text it labels.
  ".cm-ordered-marker": {
    width: "auto",
    minWidth: "1.2em",
    marginRight: "0.3em",
    fontWeight: "normal",
  },

  // Task list checkbox — drawn as a Carbon checkbox, not the native control: a
  // 1rem square that fills with the icon token and shows a white tick when
  // checked. `appearance: none` is what replaces WebKit's small rounded default;
  // the box then matches the design system rather than approximating it with an
  // accent colour over the native shape.
  ".cm-task-checkbox": {
    appearance: "none",
    WebkitAppearance: "none",
    boxSizing: "border-box",
    position: "relative",
    width: "1rem",
    height: "1rem",
    margin: "0 0.4em 0 0",
    cursor: "pointer",
    verticalAlign: "-0.15em",
    border: "1px solid var(--cds-icon-primary, #161616)",
    borderRadius: "1px",
    background: "transparent",
  },
  ".cm-task-checkbox:checked": {
    background: "var(--cds-icon-primary, #161616)",
    borderColor: "var(--cds-icon-primary, #161616)",
  },
  // The tick: an L (right + bottom border) rotated 45° into a check.
  ".cm-task-checkbox:checked::after": {
    content: "''",
    position: "absolute",
    left: "5px",
    top: "1px",
    width: "4px",
    height: "8px",
    border: "solid var(--cds-icon-on-color, #ffffff)",
    borderWidth: "0 2px 2px 0",
    transform: "rotate(45deg)",
  },
  ".cm-task-checkbox:focus-visible": {
    outline: "2px solid var(--cds-focus, #0f62fe)",
    outlineOffset: "1px",
  },

  // Inline image widget. Constrained max-width so a single large
  // image doesn't blow up the editor; lazy loading via `<img loading="lazy">`.
  ".cm-image-widget": {
    display: "inline-block",
    maxWidth: "min(100%, 32rem)",
    height: "auto",
    borderRadius: "4px",
    margin: "0.25em 0",
  },

  // Horizontal-rule widget. Inline span styled as a full-width
  // border so the line stays inside CM6's line layout.
  ".cm-hr-widget": {
    display: "inline-block",
    width: "100%",
    height: "0",
    borderTop: "1px solid var(--cds-border-subtle-02, #c6c6c6)",
    verticalAlign: "middle",
  },

  ".cm-table-widget": {
    borderCollapse: "collapse",
    width: "100%",
    // `fixed` distributes width evenly across columns instead of letting the
    // auto algorithm shrink columns toward their content — with the inherited
    // `cm-lineWrapping` word-breaking, an auto-shrunk column wraps one
    // character per line ("T / o / p / i / c").
    tableLayout: "fixed",
  },
  ".cm-table-widget th, .cm-table-widget td": {
    border: "1px solid var(--cds-border-subtle-02, #c6c6c6)",
    padding: "0.4em 0.75em",
    verticalAlign: "top",
    // No native text-selection: a drag would otherwise zig-zag a ragged
    // selection across cells (uneven heights). `tableSelection.ts` tracks the
    // drag and tints whole cells uniformly instead; the cell editor re-enables
    // selection for its own content (below).
    userSelect: "none",
    WebkitUserSelect: "none",
    // Wrap at word boundaries like prose (overriding the `word-break: break-word`
    // cm-lineWrapping inherits onto `.cm-content`), but still break a single
    // over-long token (e.g. `complementarity/orchestration`) so it can't spill
    // past its fixed-width column into the neighbour.
    overflowWrap: "break-word",
    wordBreak: "normal",
  },
  ".cm-table-widget thead th": {
    background: "var(--cds-layer-accent-01, #e8e8e8)",
    fontWeight: "600",
    textAlign: "left",
  },
  // The cell editor's own content stays selectable so a mounted cell edits
  // normally (only the surrounding grid is locked, above).
  ".cm-table-widget .cm-content": {
    userSelect: "text",
    WebkitUserSelect: "text",
  },
  // Cell highlight: `--selected` is a drag-selection (tableSelection.ts);
  // `--hover` previews the row/column a "Comment on this row/column" menu item
  // targets; `--commenting` is held by the host while that comment composer is
  // open. All read as the same even tint.
  ".cm-table-cell--selected, .cm-table-cell--hover, .cm-table-cell--commenting": {
    backgroundColor: "var(--cds-highlight, #d0e2ff)",
  },

  // Hover inserters (tableHoverControls.ts). The wrapper reserves a top + left
  // padding gutter; JS parks the two "+" circles in it — clear of the grid, so
  // they never clip at a corner or sit under the header.
  ".cm-table-wrap": {
    position: "relative",
    // Vertical spacing is PADDING, never margin — the same rule the headings and
    // lists above follow. CM6 measures a block widget's height from its border
    // box (margins excluded), so a margin here under-measures the table and
    // drifts every click below it down onto the next line. The top padding
    // doubles as the hover-"+" gutter.
    paddingTop: "2.5em",
    paddingBottom: "0.5em",
    paddingLeft: "2em",
  },

  // Two-step delete (tableArmed.ts). The first Backspace/Delete next to a table
  // parks the caret at its edge and arms it: the table gets a blue "selected"
  // outline, and a green line is drawn at the armed edge — Zettlr's "green line
  // cursor behind the table" cue, signalling the next press removes it. The
  // caret is hidden while arming (it renders on the blank line just past the
  // table, which reads as "the cursor never moved") by hiding the drawn cursor
  // layer.
  "&.cm-table-arming .cm-cursorLayer": {
    display: "none",
  },
  ".cm-table-armed .cm-table-widget": {
    outline: "2px solid var(--cds-border-interactive, #0f62fe)",
    outlineOffset: "1px",
    position: "relative",
  },
  ".cm-table-wrap[data-armed-edge] .cm-table-widget::after": {
    content: "''",
    position: "absolute",
    left: "0",
    right: "0",
    height: "3px",
    background: "var(--cds-support-success, #24a148)",
    pointerEvents: "none",
  },
  ".cm-table-wrap[data-armed-edge=\"end\"] .cm-table-widget::after": {
    bottom: "-6px",
  },
  ".cm-table-wrap[data-armed-edge=\"start\"] .cm-table-widget::after": {
    top: "-6px",
  },
  ".cm-table-inserter": {
    position: "absolute",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    appearance: "none",
    border: "none",
    padding: "0",
    cursor: "pointer",
    zIndex: "3",
    background: "var(--cds-link-primary, #0f62fe)",
    color: "#ffffff",
    fontSize: "15px",
    lineHeight: "1",
    fontWeight: "600",
    boxShadow: "0 1px 4px rgba(0, 0, 0, 0.25)",
    opacity: "0.85",
  },
  ".cm-table-inserter:hover": { opacity: "1" },

  ".cm-image-menu": {
    background: "var(--cds-layer-01, #ffffff)",
    border: "1px solid var(--cds-border-subtle-01, #e0e0e0)",
    borderRadius: "2px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    padding: "0.25rem 0",
    minWidth: "11rem",
    fontFamily:
      "var(--cds-body-01-font-family, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif)",
    fontSize: "0.875rem",
  },
  ".cm-image-menu__item": {
    appearance: "none",
    background: "transparent",
    border: "none",
    textAlign: "start",
    padding: "0.4rem 0.75rem",
    cursor: "pointer",
    width: "100%",
    color: "var(--cds-text-primary, #161616)",
    font: "inherit",
  },
  ".cm-image-menu__item:hover": {
    background: "var(--cds-layer-hover-01, #e8e8e8)",
  },
  ".cm-image-menu__item--danger": {
    color: "var(--cds-text-error, #da1e28)",
  },

  ".cm-math-inline": {
    fontFamily: "KaTeX_Main, serif",
  },
  ".cm-math-block": {
    display: "block",
    margin: "0.5em 0",
    textAlign: "center",
    fontFamily: "KaTeX_Main, serif",
  },

  ".cm-html-inline, .cm-html-block": {
    display: "inline",
  },
  ".cm-html-block": {
    display: "block",
    margin: "0.5em 0",
  },

  ".cm-link": {
    color: "var(--cds-link-primary, #0f62fe)",
    textDecoration: "underline",
  },

  // Wikilink label — distinguish from regular markdown links via a
  // dashed underline so a non-technical reader can tell at a glance
  // that this is a vault-internal target. Matches the Tiptap version
  // (`.wikilink`).
  ".cm-wikilink": {
    color: "var(--cds-link-primary, #0f62fe)",
    textDecoration: "underline dashed",
    cursor: "pointer",
  },

  ".cm-highlight": {
    background: "var(--cds-highlight, #fff8c5)",
    padding: "0 0.1em",
    borderRadius: "2px",
  },

  ".cm-footnote-ref": {
    fontSize: "0.75em",
    verticalAlign: "super",
    color: "var(--cds-link-primary, #0f62fe)",
    cursor: "pointer",
  },

  ".cm-footnote-def": {
    fontSize: "0.875em",
    color: "var(--cds-text-secondary, #525252)",
    paddingInlineStart: "0.5em",
    borderInlineStart: "2px solid var(--cds-border-subtle-02, #c6c6c6)",
  },
});
