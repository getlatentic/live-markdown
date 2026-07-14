// @vitest-environment jsdom
/**
 * Conformance matrix for docs/interaction-spec.md §10 — inline constructs ×
 * caret position × operation, run through the real input pipeline (flanking
 * guard + the app's Enter precedence chain). Cells whose current behavior
 * diverges from an accepted rule are `it.fails` with their issue number: the
 * moment a fix lands they flip red and the marker must come off.
 */
import { insertNewlineContinueMarkup } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import { insertNewline } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor, text } from "../core/editorTestHarness";
import { deleteNormalizerKeymap, visibleBackspace, visibleDeleteForward } from "./deleteNormalizer";
import { fenceAutoClose } from "../code/fenceAutoClose";
import { flankingGuard } from "./flankingGuard";
import { tightListContinuation } from "../list/listContinuation";

void deleteNormalizerKeymap;

/** Editor with the app's input-shaping extensions (not just decorations). */
function editor(doc: string, caret: number): EditorView {
  return makeEditor(doc, caret, [flankingGuard]);
}

/** A keystroke inserting `s` at the caret, through the transaction filters. */
function typeText(view: EditorView, s: string): void {
  const head = view.state.selection.main.head;
  view.dispatch({
    changes: { from: head, insert: s },
    selection: { anchor: head + s.length },
    userEvent: "input.type",
  });
}

/** Enter, in the app's precedence order (fence → list/task → markdown → default). */
function pressEnter(view: EditorView): void {
  if (fenceAutoClose(view)) return;
  if (tightListContinuation(view)) return;
  if (insertNewlineContinueMarkup(view)) return;
  insertNewline(view);
}

/** True when a node named `name` exists anywhere in the tree. */
function parses(view: EditorView, name: string): boolean {
  let found = false;
  syntaxTree(view.state).iterate({
    enter: (n) => {
      if (n.name === name) found = true;
    },
  });
  return found;
}

interface InlineConstruct {
  label: string;
  node: string;
  doc: string;
  content: string;
  /** §9.2 — whitespace at a content edge must move outside the markers. */
  flankingSensitive: boolean;
}

const CONSTRUCTS: InlineConstruct[] = [
  { label: "bold", node: "StrongEmphasis", doc: "**word**", content: "word", flankingSensitive: true },
  { label: "italic", node: "Emphasis", doc: "*word*", content: "word", flankingSensitive: true },
  { label: "strikethrough", node: "Strikethrough", doc: "~~word~~", content: "word", flankingSensitive: true },
  { label: "inline code", node: "InlineCode", doc: "`word`", content: "word", flankingSensitive: false },
];

function positions(c: InlineConstruct) {
  const contentStart = c.doc.indexOf(c.content);
  return {
    contentStart,
    mid: contentStart + 2,
    contentEnd: contentStart + c.content.length,
    outsideAfter: c.doc.length,
  };
}

function at(doc: string, pos: number, insert: string): string {
  return doc.slice(0, pos) + insert + doc.slice(pos);
}

describe.each(CONSTRUCTS)("interaction matrix — $label", (c) => {
  afterEach(destroyEditors);
  const p = positions(c);

  // ── §9.1 typing letters extends the construct ─────────────────────────────
  it("letter at content start types inside", () => {
    const view = editor(c.doc, p.contentStart);
    typeText(view, "x");
    expect(text(view)).toBe(at(c.doc, p.contentStart, "x"));
    expect(parses(view, c.node)).toBe(true);
  });

  it("letter mid-content types inside", () => {
    const view = editor(c.doc, p.mid);
    typeText(view, "x");
    expect(text(view)).toBe(at(c.doc, p.mid, "x"));
    expect(parses(view, c.node)).toBe(true);
  });

  it("letter at content end extends the construct", () => {
    const view = editor(c.doc, p.contentEnd);
    typeText(view, "x");
    expect(text(view)).toBe(at(c.doc, p.contentEnd, "x"));
    expect(parses(view, c.node)).toBe(true);
  });

  it("letter after the construct is plain", () => {
    const view = editor(c.doc, p.outsideAfter);
    typeText(view, "x");
    expect(text(view)).toBe(c.doc + "x");
    expect(parses(view, c.node)).toBe(true);
  });

  // ── §9.2 whitespace at the content edges ──────────────────────────────────
  it("space at content end lands per the flanking rule", () => {
    const view = editor(c.doc, p.contentEnd);
    typeText(view, " ");
    const expected = c.flankingSensitive ? c.doc + " " : at(c.doc, p.contentEnd, " ");
    expect(text(view)).toBe(expected);
    expect(parses(view, c.node)).toBe(true);
  });

  it("space at content start lands per the flanking rule", () => {
    const view = editor(c.doc, p.contentStart);
    typeText(view, " ");
    const expected = c.flankingSensitive ? " " + c.doc : at(c.doc, p.contentStart, " ");
    expect(text(view)).toBe(expected);
    expect(parses(view, c.node)).toBe(true);
  });

  // ── §8.1 deletion is the visible grapheme, from either boundary side ──────
  it("backspace from the inside end deletes just the last char", () => {
    const view = editor(c.doc, p.contentEnd);
    visibleBackspace(view);
    expect(text(view)).toBe(c.doc.replace("word", "wor"));
    expect(parses(view, c.node)).toBe(true);
  });

  it("backspace from past the closing marker deletes just the last char", () => {
    const view = editor(c.doc, p.outsideAfter);
    visibleBackspace(view);
    expect(text(view)).toBe(c.doc.replace("word", "wor"));
    expect(parses(view, c.node)).toBe(true);
  });

  it("forward-delete from the line start deletes just the first char", () => {
    const view = editor(c.doc, 0);
    visibleDeleteForward(view);
    expect(text(view)).toBe(c.doc.replace("word", "ord"));
    expect(parses(view, c.node)).toBe(true);
  });

  // ── §8.3 emptying collapses the construct entirely ────────────────────────
  it("deleting the whole content removes the construct, markers included", () => {
    const single = c.doc.replace("word", "w");
    const view = editor(single, single.length);
    visibleBackspace(view);
    expect(text(view)).toBe("");
  });
});

describe("interaction matrix — Enter mid-construct (§9.3)", () => {
  afterEach(destroyEditors);

  it("mid-bold Enter is a soft break the construct legitimately spans", () => {
    const view = editor("**wo rd**", "**wo".length);
    pressEnter(view);
    // One paragraph, soft-broken; the emphasis survives the line break.
    expect(text(view)).toBe("**wo\n rd**");
    expect(parses(view, "StrongEmphasis")).toBe(true);
  });

  // CommonMark lets inline code and link text span a soft line break — the
  // construct stays valid across it, so Enter mid-construct never leaks raw
  // markers here. (Wikilinks are the genuinely single-line case; their
  // conformance waits on the WikiLink grammar node, #61.)
  it("mid-code Enter is a soft break the span legitimately contains", () => {
    const view = editor("`word`", "`wo".length);
    pressEnter(view);
    expect(parses(view, "InlineCode")).toBe(true);
  });

  it("mid-link-text Enter keeps the link parsing", () => {
    const doc = "[text](https://x.dev)";
    const view = editor(doc, "[te".length);
    pressEnter(view);
    expect(parses(view, "Link")).toBe(true);
  });
});

describe("interaction matrix — links (§8.1, §9.1)", () => {
  afterEach(destroyEditors);
  const DOC = "[text](https://x.dev)";

  it("typing inside the link text stays link text", () => {
    const view = editor(DOC, "[te".length);
    typeText(view, "x");
    expect(text(view)).toBe("[texxt](https://x.dev)");
    expect(parses(view, "Link")).toBe(true);
  });

  it("backspace after the link deletes the last text char, not the hidden tail", () => {
    const view = editor(DOC, DOC.length);
    visibleBackspace(view);
    expect(text(view)).toBe("[tex](https://x.dev)");
    expect(parses(view, "Link")).toBe(true);
  });
});
