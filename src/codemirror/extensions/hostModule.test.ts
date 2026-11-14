// @vitest-environment jsdom
/**
 * What a host's module can add from outside the package: syntax, a key, a
 * kind of line and rules for the line keys. Each is added through the
 * module's own fields and mounted the way the editor mounts it.
 */
import type { MarkdownConfig } from "@lezer/markdown";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mark } from "../core";
import { marked, mount, press, unmount } from "../lineKeys/drive";
import type { MarkdownExtension } from "./types";

let view: ReturnType<typeof mount> | null = null;
afterEach(() => {
  if (view) unmount(view);
  view = null;
});

const HASH = "#".charCodeAt(0);

/** `#word` in running text, as a node of its own. */
const tagSyntax: MarkdownConfig = {
  defineNodes: ["Tag"],
  parseInline: [
    {
      name: "Tag",
      parse(cx, next, pos) {
        if (next !== HASH) return -1;
        const word = /^#[a-z][\w-]*/.exec(cx.slice(pos, cx.end));
        return word ? cx.addElement(cx.elt("Tag", pos, pos + word[0].length)) : -1;
      },
    },
  ],
};

const tags: MarkdownExtension = { name: "tags", version: "1.0.0", grammar: [tagSyntax], rules: { Tag: mark("cm-tag") } };

/** A definition list: a line that starts `: `. */
const definitions: MarkdownExtension = {
  name: "definitions",
  version: "1.0.0",
  lineKinds: [(_state, line) => (line.text.startsWith(": ") ? "definition" : null)],
  lineKeys: [
    {
      key: "Enter",
      line: "definition",
      at: "end",
      run(editor, { pos, line }) {
        if (line.text === ": ") return false;
        editor.dispatch({ changes: { from: pos, insert: "\n: " }, selection: { anchor: pos + 3 } });
        return true;
      },
    },
  ],
};

describe("a host module's syntax", () => {
  it("is parsed, and painted by the module's rule", () => {
    view = mount("see #urgent today‸", [tags]);
    expect(view.contentDOM.querySelector(".cm-tag")?.textContent).toBe("#urgent");
  });

  it("is plain text without the module", () => {
    view = mount("see #urgent today‸");
    expect(view.contentDOM.querySelector(".cm-tag")).toBeNull();
  });
});

describe("a host module's key", () => {
  it("runs ahead of the stock binding of the same chord", () => {
    const submit = vi.fn(() => true);
    view = mount("text‸", [{ name: "submit", version: "1.0.0", keymap: [{ key: "Mod-Enter", run: submit }] }]);
    press(view, { key: "Enter", mod: true });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(marked(view)).toBe("text‸");
  });

  it("of the later module wins", () => {
    const calls: string[] = [];
    const bind = (name: string): MarkdownExtension => ({ name, version: "1.0.0", keymap: [{ key: "Mod-Enter", run: () => calls.push(name) > 0 }] });
    view = mount("text‸", [bind("first"), bind("second")]);
    press(view, { key: "Enter", mod: true });
    expect(calls).toEqual(["second"]);
  });
});

describe("a host module's line-key rules", () => {
  it("decide a key on a kind of line the module names", () => {
    view = mount(": term‸", [definitions]);
    press(view, "Enter");
    expect(marked(view)).toBe(": term\n: ‸");
  });

  it("pass the key to the editor's table when the rule does not apply", () => {
    view = mount(": ‸", [definitions]);
    press(view, "Enter");
    expect(marked(view)).toBe(": \n‸");
  });

  it("leave other lines to the table", () => {
    view = mount("- item‸", [definitions]);
    press(view, "Enter");
    expect(marked(view)).toBe("- item\n- ‸");
  });

  it("can name one of the editor's actions for a state of the table", () => {
    const keepHeading: MarkdownExtension = { name: "keep", version: "1.0.0", lineKeys: [{ key: "Backspace", line: "heading", at: "start", run: "nothing" }] };
    view = mount("# ‸Title", [keepHeading]);
    press(view, "Backspace");
    expect(marked(view)).toBe("# ‸Title");
  });

  it("of the later module are asked first", () => {
    const asked: string[] = [];
    const rule = (name: string): MarkdownExtension => ({ name, version: "1.0.0", lineKeys: [{ key: "Enter", run: () => asked.push(name) > 0 }] });
    view = mount("text‸", [rule("first"), rule("second")]);
    press(view, "Enter");
    expect(asked).toEqual(["second"]);
  });
});
