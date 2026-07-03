# Rich-editor interaction spec

The editor is a WYSIWYG surface over a markdown source of truth. Every
keystroke, click, and command is a **source edit**; the Lezer tree re-parses
and the decorations re-render. This spec defines what those edits must be at
every construct boundary — the semantics that regexes and ad-hoc position
math kept getting wrong (#61, #84, #88, #92, #94, #95).

Section numbers are stable and cited from code comments (`spec §8.2` etc.).
Sections 6–8 restore the numbering the cursor/click/delete modules were built
against; 9–10 are new. Block-level behaviors (lists, headings, quotes,
fences, tables, tasks) are specified executably in
`src/codemirror/features/*.feature`; this document owns the **inline
constructs and boundary semantics**, enforced by
`src/codemirror/decorations/interactionMatrix.test.ts`.

## §1 Architecture — the compiler pipeline

The editor is organized as a compiler whose program is the markdown source:

- **Front-end**: Lezer parses the source incrementally; the syntax tree is
  the ONLY semantic authority (I3). `lineStructure` and `resolveInner`
  ancestor walks are the query layer; no regex may decide what text *is*.
- **Middle**: commands are tree-queried, source-emitted transforms — they
  read node ranges (marker positions, construct extents) and emit minimal
  source edits whose re-parse yields the intended tree (`blockCommands`,
  `formatCommands`, `deleteNormalizer`, `flankingGuard`, `listContinuation`,
  `fenceAutoClose`).
- **Back-end**: the decoration registry maps every node type to its visual
  treatment (`registry.ts` — audited for completeness against the parser's
  node set), rendered as CM decorations/widgets.

Conformance status of the remaining non-tree components (#61):
wikilinks still use a parallel regex scanner (→ `WikiLink` grammar node,
sub-task 2); table geometry keeps a hand-maintained coordinate map
(→ single `docPos ↔ (row, col, cellOffset)` source map, sub-task 3).

## §5 Invariants

- **I1 — No raw markers by side effect.** A rich-mode edit must never turn a
  rendered construct into literal marker text. If an insertion would
  invalidate a construct's own delimiters, the edit is re-sited or the
  construct re-emitted in valid form. Raw markdown appears only when the
  user asks for it (RAW mode) or types markers deliberately.
- **I2 — Visually identical states behave identically.** Two caret positions
  that render at the same visual spot (either side of a hidden marker) must
  not produce different outcomes for the same key. Where the grammar forces
  a difference, one position is canonical (§6.4).
- **I3 — The grammar decides structure.** What a line or span *is* comes
  from the syntax tree (`lineStructure`, `resolveInner`), never from a regex
  over the text. (#61)
- **I4 — Source edits are minimal.** Prefer the smallest source change that
  satisfies I1 (re-site one char) over rewriting the construct.

## §6 Caret & motion

- **6.1** The caret never rests strictly inside a hidden marker range.
- **6.2** All ranges reported to hosts are UTF-8 byte offsets
  (`byteOffset.ts`); editor-internal positions are CM char offsets.
- **6.3** Arrow motion steps between *visible* positions: one visible
  grapheme per press, hopping whole hidden ranges and whole atomic blocks
  (tables) in a single step (`visiblePosition.ts`, `cursorModel.ts`).
- **6.4** *(open decision)* Boundary canonicalization: at a construct's
  content end, the inside position (before the closing marker) and the
  outside position (after it) render identically but type differently
  (extend vs. plain — I2 tension). Candidate rule, Word-convention: cursor
  placement normalizes to the **inside** position (sticky end), and typing
  plain text after a trailing construct is reached by →/End (which stays
  outside) or by toggling the format off. Not yet implemented; tracked with
  the toolbar-pressed-state implications in the conformance matrix.

## §7 Pointer

- **7.1** Clicks land on visible positions; hidden ranges render at zero
  width, so a click cannot target them. A click past the end of a line lands
  after any trailing hidden markers (the outside boundary — see §6.4).
- **7.2** Cmd/Ctrl-click on a link or wikilink follows it (`clickModel.ts`).
- **7.3** Right-click expands to the word under the pointer when no
  selection covers it, so the comment bubble has a target.
- **7.4** *(rule; #90 open against it)* Drag selection endpoints may snap
  outward over hidden markers, but never to positions the pointer did not
  cross — a drag over mid-line words must not flash or commit a whole-line
  selection because an intermediate sample touched the line's hidden prefix
  or crossed the line's vertical edge.

- **7.5** *(open cells)* Selection across an atomic object's boundary
  (prose→code block, prose→table): typing over or deleting such a selection
  must treat the atomic object as a unit — either the whole object is
  inside the selection (and is removed with it) or the selection stops at
  its boundary; a delete may never remove PART of a fence pair or table
  source. Conformance cells tracked in the matrix; behavior to be defined
  alongside §12.

## §8 Deletion

- **8.1** The unit of deletion is the **visible grapheme** adjacent to the
  caret — computed by skipping hidden ranges (`visibleCharBefore/After`),
  never folding a marker into the range. Holds from BOTH sides of a hidden
  marker (I2). (#88/#92)
- **8.2** Backspace at the visible start of a line joins lines: it removes
  the newline plus the line's **block prefix** (list/heading/quote marker),
  keeping inline content and its hidden markers intact. Mirror for Delete at
  a visible line end.
- **8.2a** When nothing visible stands between the caret and the line's own
  marker (checkbox, bullet, number, hashes — wherever the caret sits among
  hidden ranges, I2), Backspace removes that marker in place: the line
  becomes plain text where it stands, and joining up is the NEXT press
  (Word/Notion convention). The marker is never nibbled character by
  character; its trailing space is part of its atomic range at any nesting
  depth.
- **8.3** A deletion that empties a styled span removes the whole construct
  — markers included — never leaving `****` husks.
- **8.4** Tables delete in two steps: first press parks the caret at the
  table's edge and arms it; the second press removes the whole block. The
  hidden `| … |` source is never partially edited.

## §9 Insertion

- **9.1** Typing a non-whitespace character at a construct's content edge
  extends the construct (types inside the markers).
- **9.2 — Flanking guard.** Whitespace (space, newline) typed at the content
  edge of a flanking-sensitive construct (bold, italic, strikethrough) lands
  **outside** its markers — `**Compose** ` — because CommonMark makes a
  whitespace-flanked delimiter literal (I1). Hops outward through nesting.
  Inline code is exempt: no flanking rule, edge spaces meaningful. (#94)
- **9.3** Enter mid-construct: emphasis, inline code, and link text all
  legitimately span a soft line break in CommonMark — the construct stays
  valid and the conformance matrix asserts it survives the parse. The rule
  has teeth only for genuinely single-line constructs: wikilinks (regex-
  scanned today; conformance deferred until the `WikiLink` grammar node
  lands, #61) and table cells (handled by the cell subview's single-line
  filter). For those, Enter must split into valid halves or move the break
  outside — never emit a broken half-construct (I1).
- **9.4** Splitting a list/task item at its content start yields a valid
  empty item above (task: `- [ ] ` with its space — the grammar's minimal
  parseable spelling) and moves the content down with its marker and state.
  (#95)
- **9.5** A just-typed fence auto-closes on Enter with the caret inside;
  content below is released, not swallowed. (#91)
- **9.6** In-cell edits escape what the cell grammar requires (`\|`), and
  fence wrapping sizes its markers past the content's longest run (#85).

## §10 Conformance

`interactionMatrix.test.ts` enumerates construct × position × operation
cells and asserts the rules above. Cells whose current behavior diverges
from an accepted rule are tracked as issues and marked `it.fails` — the test
flips red the moment a fix lands, forcing the marker's removal. Open
decisions (§6.4) are characterized, not asserted.

## §11 Tables

Block-level table behavior is specified executably in
`features/table.feature`; the machinery has its own suites
(`tableGeometry`, `tableCellNav`, `tableCellSubview`, `tableSelection`,
`tableEditCommands`). The interaction rules that govern them here:

- **11.1** A table is one atomic block in the main editor: the caret never
  enters the hidden `| … |` source; arrows step over the whole grid (§6.3)
  and deletion is the two-step arm-then-remove (§8.4).
- **11.2** Cell editing happens in a per-cell subview holding the cell's
  UNESCAPED text; commits re-escape (`\|`) so a typed pipe can't shift
  columns (§9.6). Cells are single-line by transaction filter; Tab/arrow
  navigation at cell edges moves between cells (`tableCellNav`).
- **11.3** Structural edits (insert/delete row/column, header toggles) go
  through the table model, never through positional string surgery — the
  coordinate map consolidation is #61 sub-task 3.

## §12 Block boundaries (fenced code)

The fence lines are STRUCTURE, not text: no character-level edit may merge
a fence line with its neighbors — that corrupts the pair and re-pairs the
opener with a later fence, swallowing unrelated content (I1).

- **12.1 Solid walls from inside.** Backspace at the first content line's
  start and Delete at the last content line's end are no-ops. Exception:
  when the block has no content (or only empty content), the edit deletes
  the WHOLE block — markers included — like an empty styled span (§8.3).
- **12.2 Two-step approach from outside.** Backspace at the visible start
  of the line after a block parks the caret at the block's content end
  (first press) rather than joining text onto the closing fence; Delete at
  the end of the line before a block parks at the content start. An empty
  block is deleted whole instead of parked into.
- **12.3 Empty line above.** Backspace on an empty line directly above a
  block removes that line — the block visually moves up. (Plain line-join;
  already conformant.)
- **12.4 Auto-close is grammar-positioned.** The keystroke completing a
  fence opener at a line's CONTENT start (per `lineStructure` — top level,
  inside a list item, inside a quote) inserts the matching closer at the
  same content column plus an empty content line, and the caret lands ON
  the content line: the first visible row of a new block accepts code
  immediately. Typing before the third backtick supplies the language;
  the info string renders visibly (a small tag on the opener row), never
  as invisible text.
- **12.5 Enter on the opener of a closed block** whose first content line
  is empty moves the caret onto that line instead of inserting another.
- **12.6 Exit.** Enter on the block's empty last content line exits below
  the closing fence (§9.5).
- **12.7 Typing on the closing line re-sites.** A closing fence carries no
  info string in CommonMark — any trailing text stops it closing and the
  block re-opens over everything below. A keystroke landing on the closer
  line therefore goes to a fresh content line before the closer (the intent
  of typing on the block's last row is code at the end of the block). The
  opener line stays typeable: text there is the language tag, rendered as a
  visibly distinct chip (§12.4).
- **12.7 Fence rows re-site typing.** On a CLOSED block, characters typed on
  the closing line land on a fresh content line before the closer (trailing
  text would stop it closing and swallow the document below), and characters
  typed on the opener line land at the first content line's start — the
  block's first gray row means "code" to users, not the language tag. An
  UNCLOSED opener still types in place (the language flow for a pasted
  fence); editing an existing tag is a RAW-mode operation. This also closes
  the old gap where lengthening a closed opener re-opened the block.
- **12.8 Tab indents in code.** Inside a block's content, Tab inserts an
  indent unit and Shift-Tab removes leading indent — never focus
  navigation. Outside code both decline (lists keep `listIndent`,
  accessibility keeps the default).

Open: the same wall/park rules for other multi-line atomic objects
(tables already conform via §8.4 two-step; HTML blocks unaudited).
