# Changelog

## [0.3.1] - 2026-08-29

### Fixed

- **The task tick is centred in its box, and its stroke is lighter.** The tick
  is an `L` rotated 45°, and the L's ink sits below and right of its own rect
  centre — the rotation turns that diagonal offset into a purely downward one of
  0.065em. The rect therefore has to ride that much above the box centre to look
  centred: `top: 0.125em`, not the geometric `0.1875em`, which renders visibly
  low. Stroke 0.125em → 0.1em, from 14.3% of the box to 11.4%.

## [0.3.0] - 2026-08-29

### Added

- **A host can contribute extension modules.** `extensions?: readonly
  MarkdownExtension[]` on the editor, merged in one pass with the built-ins and
  host-last, so a module can deliberately override a construct and the merger
  still warns when a node rule is redefined. Applies in source mode as well as
  wysiwyg — a keymap is not a rendering concern. Read when an editor state is
  built, so building the array inline cannot remount the editor.

  Toolbar contributions now reach the host through the `toolbar` slot's
  context; the merger always collected them and the component dropped them.

- `composeExtensions` is renamed **`mergeExtensions`**, with the old name kept
  as a deprecated alias. "compose" read as the name of an app rather than as the
  verb, which is the wrong signal for a package meant for many hosts.

### Fixed

- **A checked task box reads as checked in dark.** The tick used
  `--cds-icon-on-color` — white in every theme — against a fill of
  `--cds-icon-primary`, which inverts. In dark that was #ffffff on #f4f4f4, a
  contrast ratio of 1.10. It now uses `--cds-background`, the inverse of the
  fill by construction.

- **The task box is sized to the text.** 1rem beside 1rem text is as tall as the
  whole em box; it now derives from its own `font-size: 0.875em`, with box, tick
  and baseline offset all in `em` of that, and sits on the x-height instead of
  hanging off the baseline.

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
