# @latentic/live-markdown

[![npm](https://img.shields.io/npm/v/@latentic/live-markdown)](https://www.npmjs.com/package/@latentic/live-markdown)
[![CI](https://github.com/getlatentic/live-markdown/actions/workflows/ci.yml/badge.svg)](https://github.com/getlatentic/live-markdown/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@latentic/live-markdown)](LICENSE)

**WYSIWYG markdown editing for React — where the markdown is still the document.**

A markdown editor built on [CodeMirror 6](https://codemirror.net/). Headings, tables, LaTeX math, Mermaid diagrams, images, footnotes and code blocks render inline as you type — there is no split-screen preview pane to sync, and no syntax left on screen to read past.

And unlike rich-text editors built on ProseMirror, Tiptap, Slate or Lexical, there is no intermediate document model to translate through. `value` in and `onChange` out are the same markdown string, byte for byte, YAML frontmatter included.

```tsx
import { CodeMirrorMarkdownEditor } from "@latentic/live-markdown";

<CodeMirrorMarkdownEditor
  value={markdown}
  onChange={setMarkdown}
  mode="wysiwyg"       // or "source" for raw markdown
/>
```

---

## Why @latentic/live-markdown

Most markdown editors fall into two camps:

| Camp | Examples | Trade-off |
|------|----------|-----------|
| **Raw editors** | CodeMirror, Monaco, Ace | Fast, plain text — but users see `## Heading`, not a heading |
| **Rich editors** | Tiptap, ProseMirror, Slate, Lexical | WYSIWYG — but the internal model is a custom AST, not markdown. Round-tripping to `.md` is lossy or fragile |

**@latentic/live-markdown sits in between.** The source of truth is the raw markdown string. CodeMirror parses it with Lezer, and a decoration engine replaces syntax tokens with rendered widgets in real time — `## Heading` becomes a styled heading, `- item` becomes a bullet, `![alt](src)` becomes an inline image. You edit the rendered form directly — no syntax on screen, no preview pane to keep in sync — while `value` in and `onChange` out stays a plain markdown string. No AST translation, no serialization bugs, no format lock-in.

The boundary semantics this demands — what every keystroke does at every construct edge — are specified in [docs/interaction-spec.md](docs/interaction-spec.md) and enforced by its conformance matrix (`interactionMatrix.test.ts`); block-level behaviors are specified executably in `src/codemirror/features/*.feature`.

### How it compares

| Feature | @latentic/live-markdown | Tiptap / ProseMirror | ink-mde | @mdxeditor/editor | Novel |
|---------|-----------|---------------------|---------|-------------------|-------|
| Source of truth | Markdown string | Custom AST | Markdown string | MDX AST | ProseMirror AST |
| Rich rendering | Inline decorations | DOM nodes | Syntax highlight only | DOM nodes | DOM nodes |
| Round-trip fidelity | Byte-for-byte | Lossy (serializer) | Byte-for-byte | MDX subset | Lossy |
| YAML frontmatter | Preserved, never stripped | Plugin (varies) | No | Plugin | No |
| LaTeX math | Inline KaTeX | Plugin | No | Plugin | No |
| Mermaid diagrams | Rendered inline | Plugin | No | Plugin | No |
| Large files (1 MB+) | Fast (CodeMirror) | Slow (DOM-per-node) | Fast | Slow | Slow |
| Tables | GFM, cell navigation | Plugin | Basic | Plugin | Slash command |
| Image paste/drop | Built-in | Plugin | No | Plugin | Plugin |
| Framework | React | React / Vue / vanilla | Vanilla / adapters | React | React |
| Bundle size | 57 KB gzipped* | ~120 KB+ | ~40 KB | ~150 KB+ | ~200 KB+ |

\* Measured on the published bundle. CodeMirror, KaTeX and Mermaid are external, so you pay for a renderer only where your documents use one — the other figures are the projects' own published numbers and are not all drawn on the same basis.

### Key differentiators

- **Markdown in, markdown out.** No AST translation layer. The `value` prop is a markdown string; `onChange` returns a markdown string. What you put in is exactly what you get out, byte for byte. YAML frontmatter is preserved and never stripped.

- **Rich editing without leaving markdown.** Headings, bold, italic, strikethrough, inline code, block code, bullet lists, ordered lists, task lists, tables, horizontal rules, images, footnotes, LaTeX math, and wikilinks all render inline. The user never sees raw syntax unless they switch to source mode.

- **Fast on large files.** Built on CodeMirror 6's virtual viewport — only visible lines are rendered. A 1 MB document opens instantly and scrolls at 60 fps. ProseMirror/Tiptap-based editors create a DOM node per text node and degrade on large documents.

- **Per-tab state caching.** When used with tabbed interfaces, editor state (cursor position, scroll offset, undo history) is cached per file and restored instantly on tab switch — a pointer swap, not a re-parse.

- **Extension system.** Add custom markdown rendering by contributing `NodeRule`s — one function per syntax node deciding how it paints (line class, styled span, hidden marker, or widget). Built-in extensions: highlight marks, footnotes, math (KaTeX), tables (cell navigation + resize), wikilinks.

- **Toolbar slot, not toolbar opinions.** The editor renders a host-supplied `toolbar` around the live `EditorView`, and `selectionActions` around the current selection — both are render props (`(ctx) => ReactNode`). The host app owns Save, Export, Comments, or whatever actions it needs — the editor stays agnostic.

---

## Features

### Inline rendering
- **Headings** (ATX `#` only — setext `---`/`===` disabled for predictability)
- **Bold**, **italic**, **strikethrough**, **inline code**
- **Block code** with language label
- **Bullet lists**, **ordered lists**, **task lists** (interactive checkboxes)
- **Tables** — GFM syntax, cell-by-cell Tab navigation, column resize
- **Images** — inline preview, drag-and-drop, clipboard paste
- **Horizontal rules**
- **Footnotes** — inline marker with hover preview
- **LaTeX math** — inline `$...$` and display `$$...$$` via KaTeX
- **Mermaid diagrams** — a ```` ```mermaid ```` fence renders as a live diagram; click to select, double-click for the source
- **Wikilinks** — `[[Page]]` and `[[Page|alias]]` with Cmd/Ctrl-click navigation
- **Links** — Cmd/Ctrl-click to open, auto-detection

### Editing
- **Rich / Source mode toggle** — switch between rendered and raw markdown
- **Smart list continuation** — Enter continues the current list item tightly (no blank-line gap)
- **Cursor model** — arrow keys skip hidden syntax markers, land on visible content
- **Delete normalizer** — Backspace/Delete removes visible content, collapses empty format spans
- **Format commands** — Cmd+B (bold), Cmd+I (italic), Cmd+E (inline code)
- **Block commands** — Cmd+1..3 (heading levels), Cmd+Shift+7..9 (lists, blockquote)
- **Click model** — Cmd/Ctrl-click on links and wikilinks to navigate; single click places caret at visible content, never inside a hidden marker
- **Image insert** — toolbar button opens a file picker, inserts at caret

### Data
- **Frontmatter** — YAML frontmatter is parsed, held aside during editing, and recombined on save. Never stripped, never corrupted, never shown in the editor body.
- **Autosave debounce** — `onChange` fires 500ms after the last keystroke (configurable)
- **State caching** — per-file `EditorState` cache for instant tab switching

---

## Installation

```sh
npm install @latentic/live-markdown
# or
pnpm add @latentic/live-markdown
```

Peer dependencies: `react` and `react-dom` (18+).

All *in-editor* styling (headings, code, lists, tables, image widgets, links) ships with the editor as a CodeMirror theme and applies automatically — no CSS import needed. For the outer container layout (so the editor fills its parent and scrolls), import the small stylesheet once:

```ts
import "@latentic/live-markdown/styles.css";
```

Skip it if your app already lays the editor out as a flex child.

Mathematics is the exception. KaTeX renders through its own stylesheet, which no CodeMirror theme can supply — without it `$x$` still typesets, just unstyled (a fraction stops stacking). If your documents use math:

```ts
import "katex/dist/katex.min.css";
```

---

## Usage

### Basic

```tsx
import { useState } from "react";
import { CodeMirrorMarkdownEditor } from "@latentic/live-markdown";

function Editor() {
  const [doc, setDoc] = useState("# Hello\n\nStart writing...");

  return (
    <CodeMirrorMarkdownEditor
      value={doc}
      onChange={(newValue) => setDoc(newValue)}
    />
  );
}
```

### Source mode

```tsx
<CodeMirrorMarkdownEditor value={doc} onChange={setDoc} mode="source" />
```

### With toolbar actions

The `toolbar` render prop receives the live `EditorView`, so host buttons can drive editor commands:

```tsx
<CodeMirrorMarkdownEditor
  value={doc}
  onChange={setDoc}
  toolbar={({ view }) => <button onClick={() => save(view.state.doc.toString())}>Save</button>}
/>
```

### Wikilinks

```tsx
<CodeMirrorMarkdownEditor
  value={doc}
  onChange={setDoc}
  linkTargets={new Set(["notes/Daily.md", "notes/Ideas.md"])}
  onNavigateToLink={(path) => openFile(path)}
/>
```

---

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | — | The markdown content (controlled) |
| `onChange` | `(value: string, changes: DocumentTextChange[]) => void` | — | Called after edits, debounced |
| `mode` | `"wysiwyg" \| "source"` | `"wysiwyg"` | Rich rendering or raw markdown |
| `toolbar` | `(ctx: { view: EditorView }) => ReactNode` | — | Host-rendered toolbar, given the live editor view |
| `selectionActions` | `(ctx: { selection, dismiss }) => ReactNode` | — | Host-rendered actions for the current selection (e.g. a comment bubble) |
| `linkTargets` | `ReadonlySet<string>` | — | Known file paths for wikilink resolution |
| `onNavigateToLink` | `(path: string) => void` | — | Called on Cmd/Ctrl-click of an internal link |
| `workspaceRoot` | `string` | — | Root path for resolving relative image URLs |
| `filePath` | `string` | — | Current file path (for image resolution context) |
| `resolveImageSrc` | `ResolveImageSrc` | render as-is | Map a markdown image `src` to a loadable URL |
| `saveImageBytes` | `SaveImageBytes` | inline as `data:` | Persist a pasted/dropped image at a workspace-relative path |
| `onOpenExternalUrl` | `OpenExternalUrl` | new browser tab | Open a clicked external link |

---

## Extensions

A `MarkdownExtension` bundles everything a feature needs: `NodeRule`s (how the syntax nodes its grammar introduces should paint), CM6 `extensions`, a `keymap`, and optional `toolbar` contributions. Rules are merged into the painter through a facet, so an extension adds a construct without touching the core rules table.

Built-in extensions:
- `highlightExtension` — highlight/mark rendering
- `footnoteExtension` — footnote markers with inline preview
- `mathExtension` — LaTeX math via KaTeX
- `tableExtension` — GFM tables with cell navigation
- `wikilinkExtension` — `[[wikilink]]` rendering and navigation

```tsx
import { composeExtensions, mathExtension, tableExtension } from "@latentic/live-markdown";

const composed = composeExtensions([mathExtension, tableExtension]);
// composed.extensions — CM6 Extension[] (each extension's node rules ride
//                        along via a facet, so this is all the editor needs)
// composed.toolbar    — merged ToolbarContribution[]
```

### A custom extension

A rule is one function per Lezer node name, returning how that node paints. The `mark` combinator covers the common "style this span" case. Rules merge last-wins, so an extension can introduce a construct from its own grammar or deliberately restyle a built-in one:

```tsx
import { composeExtensions, mark, type MarkdownExtension } from "@latentic/live-markdown";

const fancyEmphasis: MarkdownExtension = {
  name: "fancy-emphasis",
  version: "1.0.0",
  rules: {
    // override how the built-in Emphasis node paints
    Emphasis: mark("cm-fancy-emphasis"),
  },
};

const composed = composeExtensions([fancyEmphasis]);
```

`Paint` is a closed set — line class, span mark, hide, widget, or nothing — while node names grow, so styling a construct is always one rule in one place.

---

## Architecture

```
value (markdown string)
  │
  ├─ parseFrontmatter() ─→ frontmatter (held in ref) + body
  │
  body ─→ CodeMirror EditorState
            │
            ├─ Lezer markdown parser (tokenizes)
            ├─ Paint engine (each node's NodeRule → Decoration)
            ├─ Extension plugins (math, tables, footnotes, ...)
            └─ EditorView (renders only the visible viewport)
                    │
                    onChange ─→ serializeMarkdown(frontmatter + body)
                                  │
                                  └─ markdown string out
```

The decoration engine walks the Lezer syntax tree on every document change, asks each node's `NodeRule` how to render, and applies the returned paint as `Decoration.replace`, `Decoration.mark`, or `Decoration.line`. Widgets are stateless — they read from the document and write `dispatch` calls back. No intermediate AST, no custom document model.

---

## Roadmap

- [x] Host-injected toolbar and selection-action slots (bring your own UI)
- [x] Host-environment seams (image storage/resolution, link opening) with browser defaults
- [x] Self-themed editor surface (CodeMirror theme ships with the package)
- [x] Public extension API for contributing node rules (`MarkdownExtension.rules` → `nodeRulesFacet`)
- [ ] [Ship the engine without React](https://github.com/getlatentic/live-markdown/issues/1) — the editor is React only at its edge: of 195 source files, one component and one `type ReactNode` import name it. Splitting `/react` into a subpath entry frees the engine for any framework, or none
- [ ] Frontmatter as a toggleable extension (default on, disable via prop)
- [ ] Collaborative editing (CM6 collab extension)
- [ ] Slash commands (`/` menu for inserting blocks)

---

## Development

```sh
pnpm install
pnpm exec playwright install webkit   # once — for the browser tier below
pnpm check                            # typecheck + build + both test tiers
```

Tests run in two tiers, and the split is deliberate:

| tier | command | what it is for |
|---|---|---|
| default | `pnpm test` | everything that does not need layout — jsdom and node |
| browser | `pnpm test:browser` | real WebKit, for what jsdom cannot judge |

jsdom has no layout engine, so caret geometry, click placement, drawn selection
and KaTeX metrics all pass in it whatever they do on screen. Anything that
depends on where a box actually lands belongs in a `*.browser.test.ts`.

`pnpm build` is part of the gate rather than a release step: `tsc --noEmit`
never emits, so the errors that appear only when rolling up declarations — an
exported anonymous class, an inferred type naming a transitive dependency by
its package-manager path — stay invisible until a publish fails.

### Releasing

Publishing is caused by green CI, not preceded by it. `cargo`-style local
publishing is not wired up on purpose: a published version cannot be taken
back.

```sh
# 1. bump the version in package.json, land it on main
# 2. tag the merged commit
git tag v0.1.0 && git push origin v0.1.0
```

The tag triggers `publish.yml`, which refuses to build at all if the tag is not
an ancestor of `main` or disagrees with `package.json`, runs the full CI
workflow against the tagged commit as a job it `needs`, and only then publishes
with [npm provenance](https://docs.npmjs.com/generating-provenance-statements).

---

## License

[MIT](LICENSE)
