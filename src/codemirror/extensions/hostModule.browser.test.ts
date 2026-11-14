/**
 * @browser: a host module's key and line-key rule, pressed for real. A real
 * key event goes through every binding in the editor, in their order.
 */
import { userEvent } from "@vitest/browser/context";
import { afterEach, describe, expect, it } from "vitest";

import { MAC, marked, mount, unmount } from "../lineKeys/drive";
import type { MarkdownExtension } from "./types";

const MOD = MAC ? "Meta" : "Control";

let view: ReturnType<typeof mount> | null = null;
afterEach(() => {
  if (view) unmount(view);
  view = null;
});

const sent: string[] = [];
const host: MarkdownExtension = {
  name: "host",
  version: "1.0.0",
  keymap: [{ key: "Mod-Enter", run: (editor) => sent.push(editor.state.doc.toString()) > 0 }],
  lineKinds: [(_state, line) => (line.text.startsWith(": ") ? "definition" : null)],
  lineKeys: [
    {
      key: "Enter",
      line: "definition",
      at: "end",
      run(editor, { pos }) {
        editor.dispatch({ changes: { from: pos, insert: "\n: " }, selection: { anchor: pos + 3 } });
        return true;
      },
    },
  ],
};

async function typed(doc: string, keys: string): Promise<string> {
  view = mount(doc, [host]);
  view.focus();
  await userEvent.keyboard(keys);
  return marked(view);
}

describe("a host module, with real keys", () => {
  it("takes a chord CodeMirror binds, and the text stays as it was", async () => {
    sent.length = 0;
    expect(await typed("text‸", `{${MOD}>}{Enter}{/${MOD}}`)).toBe("text‸");
    expect(sent).toEqual(["text"]);
  });

  it("decides Enter on its own kind of line, and typing goes on from there", async () => {
    expect(await typed(": term‸", "{Enter}next")).toBe(": term\n: next‸");
  });

  it("leaves Enter in a list to the editor's table", async () => {
    expect(await typed("- item‸", "{Enter}next")).toBe("- item\n- next‸");
  });
});
