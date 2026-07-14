// @vitest-environment jsdom
/**
 * TDD for the two live reports on #101 (round 3):
 * 1. The space after a checkbox / nested bullet must stay VISIBLE (it is the
 *    gap between the widget and the text — hiding it draws the caret flush
 *    against the checkbox edge)…
 * 2. …while still being ATOMIC (part of the marker for motion/deletion), so
 *    Backspace never nibbles it (§8.1/§8.2a).
 */
import type { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { visibleBackspace } from "../interaction/deleteNormalizer";
import { destroyEditors, makeEditor, text } from "../core/editorTestHarness";
import { markdownDecorationsPlugin } from "../core/plugin";

function ranges(set: { between(f: number, t: number, cb: (f: number, t: number) => void): void } | undefined, len: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  set?.between(0, len, (from, to) => {
    out.push([from, to]);
  });
  return out;
}

function covered(rs: Array<[number, number]>, pos: number): boolean {
  return rs.some(([f, t]) => f <= pos && pos < t);
}

describe("marker trailing space: visible but atomic", () => {
  afterEach(destroyEditors);

  it("task item: the space after [ ] is not hidden, yet is atomic", () => {
    const doc = "- [ ] word";
    const view: EditorView = makeEditor(doc, doc.length);
    const plugin = view.plugin(markdownDecorationsPlugin);
    const decs = ranges(plugin?.decorations, doc.length);
    const atomics = ranges(plugin?.atomic, doc.length);
    const space = doc.indexOf("] ") + 1; // the gap char
    expect(covered(decs, space)).toBe(false); // visible gap
    expect(covered(atomics, space)).toBe(true); // still part of the marker
  });

  it("nested bullet: the space after the dash is not hidden, yet is atomic", () => {
    const doc = "- outer\n  - inner";
    const view = makeEditor(doc, doc.length);
    const plugin = view.plugin(markdownDecorationsPlugin);
    const decs = ranges(plugin?.decorations, doc.length);
    const atomics = ranges(plugin?.atomic, doc.length);
    const space = doc.indexOf("- inner") + 1;
    expect(covered(decs, space)).toBe(false);
    expect(covered(atomics, space)).toBe(true);
  });

  it("empty task item: one backspace removes the whole marker", () => {
    const doc = "- [ ] kfkf\n- [ ] ";
    const view = makeEditor(doc, doc.length);
    visibleBackspace(view);
    expect(text(view)).toBe("- [ ] kfkf\n");
  });

  it("`- [ ]` without trailing space is NOT a task — brackets are visible text", () => {
    // GFM requires whitespace after the brackets; without it there is no
    // TaskMarker node, the line is a bullet whose content is literal `[ ]`
    // (rendered raw, no checkbox), and Backspace deletes the visible `]`.
    const doc = "- [ ] kfkf\n- [ ]";
    const view = makeEditor(doc, doc.length);
    visibleBackspace(view);
    expect(text(view)).toBe("- [ ] kfkf\n- [ ");
  });
});
