// @vitest-environment jsdom
/**
 * Fenced code gets a real NESTED parse from its info string (ADR 0002): the
 * `codeLanguages` wiring mounts the code grammar inside CodeText, which is
 * what the codeHighlight style colors. Probed via resolveInner — mounted
 * overlay trees are invisible to a plain tree iterate. The lazy-load path
 * (no preload) rides the view's idle work loop, which jsdom doesn't drive;
 * preloading reproduces the state the app reaches after the import lands.
 */
import { forceParsing, syntaxTree } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
});

function makeView(doc: string): EditorView {
  view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [markdown({ base: markdownLanguage, codeLanguages: languages })],
    }),
    parent: document.body,
  });
  forceParsing(view, view.state.doc.length, 1000);
  return view;
}

/** Ancestor chain names at `pos` (side +1), innermost first. */
function chainAt(v: EditorView, pos: number): string[] {
  const names: string[] = [];
  for (
    let node: { name: string; parent: unknown } | null = syntaxTree(v.state).resolveInner(pos, 1);
    node;
    node = node.parent as { name: string; parent: unknown } | null
  ) {
    names.push(node.name);
  }
  return names;
}

describe("fenced-code nested parsing", () => {
  it("a ```js fence parses its content with the JavaScript grammar", async () => {
    await languages.find((l) => l.name === "JavaScript")!.load();
    const doc = "```js\nconst x = f(1)\n```";
    const v = makeView(doc);
    const chain = chainAt(v, doc.indexOf("const") + 1);
    expect(chain).toContain("VariableDeclaration");
    expect(chain).toContain("Script");
  });

  it("an unknown language stays plain fenced code (no crash)", () => {
    const doc = "```nosuchlang\nwhatever\n```";
    const v = makeView(doc);
    const chain = chainAt(v, doc.indexOf("whatever") + 1);
    expect(chain).toContain("CodeText");
    expect(chain).not.toContain("Script");
  });
});
