// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor, text } from "../core/editorTestHarness";
import { fenceContent, infoFor, languageEntries, setFenceInfo } from "./codeLanguageMenu";
import { codeLanguageUI } from "./codeLangAffordance";

describe("setFenceInfo", () => {
  afterEach(destroyEditors);

  it("adds a language to a plain fence", () => {
    const view = makeEditor("```\ncode\n```", 0);
    view.dispatch({ changes: setFenceInfo(view.state, 0, "js")! });
    expect(text(view)).toBe("```js\ncode\n```");
  });

  it("replaces an existing language (and stray trailing text)", () => {
    const view = makeEditor("```js extra\ncode\n```", 0);
    view.dispatch({ changes: setFenceInfo(view.state, 2, "ts")! });
    expect(text(view)).toBe("```ts\ncode\n```");
  });

  it("clears the language with null", () => {
    const view = makeEditor("```js\ncode\n```", 0);
    view.dispatch({ changes: setFenceInfo(view.state, 0, null)! });
    expect(text(view)).toBe("```\ncode\n```");
  });

  it("returns null outside any fence", () => {
    const view = makeEditor("plain prose", 0);
    expect(setFenceInfo(view.state, 2, "js")).toBeNull();
  });
});

describe("fenceContent", () => {
  afterEach(destroyEditors);

  it("returns the block's code and empty for a bare pair", () => {
    const view = makeEditor("```js\na\nb\n```", 0);
    expect(fenceContent(view.state, 0)).toBe("a\nb");
    const bare = makeEditor("```\n```", 0);
    expect(fenceContent(bare.state, 0)).toBe("");
  });
});

describe("infoFor", () => {
  it("writes the shortest idiomatic alias", () => {
    expect(infoFor("TypeScript")).toBe("ts");
    expect(infoFor("JavaScript")).toBe("js");
    expect(infoFor("NoSuchLanguage")).toBeNull();
  });
});

describe("languageEntries", () => {
  it("offers renderer-backed tags (Mermaid) alongside the grammars", () => {
    const mermaid = languageEntries().find((entry) => entry.label === "Mermaid");
    expect(mermaid?.info).toBe("mermaid");
  });

  it("keeps Plain text first and the rest sorted A→Z (Mermaid merged in, not appended)", () => {
    const entries = languageEntries();
    expect(entries[0]).toMatchObject({ label: "Plain text", info: null });
    const labels = entries.slice(1).map((entry) => entry.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });
});

describe("plain-pill affordance", () => {
  afterEach(destroyEditors);

  it("a languageless CLOSED fence gets the placeholder pill", () => {
    const view = makeEditor("```\ncode\n```", 0, [codeLanguageUI]);
    expect(view.dom.querySelectorAll(".cm-code-info--unset")).toHaveLength(1);
  });

  it("a fence WITH a language gets no placeholder", () => {
    const view = makeEditor("```js\ncode\n```", 0, [codeLanguageUI]);
    expect(view.dom.querySelectorAll(".cm-code-info--unset")).toHaveLength(0);
  });

  it("an UNCLOSED fence gets no placeholder (typing owns the flow)", () => {
    const view = makeEditor("```\ncode below", 0, [codeLanguageUI]);
    expect(view.dom.querySelectorAll(".cm-code-info--unset")).toHaveLength(0);
  });
});
