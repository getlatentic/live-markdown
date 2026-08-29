# Changelog

## [0.2.0] - 2026-08-28

### Added

- **A host can theme fenced-code syntax colours.** Each palette entry carries a
  CSS custom property alongside its colour, and the editor paints
  `var(--md-code-…, <One Light value>)`, so a dark theme can restyle code.
  Previously impossible: the editor takes no `extensions` prop and the generated
  highlight classes are content-hashed, leaving no seam at all.

  The clipboard renderer deliberately keeps literal colours. Pasted HTML arrives
  with no stylesheet, so a `var()` there resolves to nothing and pastes
  colourless code into Google Docs or Word — and the document being pasted into
  is white whatever theme the editor was in.

  Roles are named individually (`--md-code-keyword`, `--md-code-string`, …) even
  where two share a value, so one can be restyled without the other. A host that
  sets no variables gets a byte-identical palette: the literal is the fallback.

## [0.1.1] - 2026-08-24

### Added

- `inlineScanRulesFacet`, `scanInline`, `escapeText`/`escapeAttr` and their
  types are exported. 0.1.0 shipped the seam but left it unreachable: a
  third-party extension could contribute a rule for a construct Lezer parses
  (`nodeRulesFacet`, public since 0.0.1) but not for one it does not, which is
  half a contract.

## [0.1.0] - 2026-08-24

First release from the editor's own repository, and the first with CI on more
than one platform.

### Fixed

- **A `[…]` keeps its brackets until it resolves to a link.** Lezer emits a
  `Link` node for every bracketed span; CommonMark only makes `[label]` a link
  when the document also carries a `[label]: url` definition. Reading the node
  as the answer hid the brackets out of ordinary prose — `arr[0]` rendered as
  `arr0`, `see [3]` as `see 3` — and stripped every optional argument from a
  pasted LaTeX block (`\begin{tikzpicture}[scale=0.42]`). Unresolved, the
  brackets are content: visible, unstyled, and no longer atomic to the caret.
  This also matches what a CommonMark exporter produces for the same input.

- **A table cell renders what the paragraph above it renders.** Cells walk the
  Lezer tree, and four constructs have no node in it — wikilinks,
  `==highlight==`, footnote references and `$math$` are found by scanning text.
  Cells showed `$x^2$` as source, and mangled two of the others outright
  (`[[Some Note]]` → `[Some Note]`). Features now contribute a pattern and its
  markup through `inlineScanRulesFacet`, and the cell renderer carves those
  spans out before walking the tree.

- **A parse budget that holds on more than the fastest machine.** `treeAt` spent
  at most 50ms driving the parse to a queried position, against a worst case
  measured at 43ms — seven milliseconds of headroom. On a slower machine
  `ensureSyntaxTree` returned null, the lookup fell back to the viewport-limited
  tree, and a delete crossed a fence boundary the guard should have walled.
  Now 150ms.

### Added

- `inlineScanRulesFacet` and `scanInline` — the seam for a construct Lezer does
  not parse, so any renderer can see it, not just the decoration plugins.
- `linkResolves` / `linkHasVisibleLabel` (`core/linkResolution`).

### Documentation

- `styles.css` still called the package `ai-editor`, and both it and the README
  promised that mathematics needs no CSS import. It does — KaTeX renders
  through its own stylesheet, which no CodeMirror theme can supply.

## [0.0.1] - 2026-08-23

Initial publish, extracted from the Compose monorepo.
