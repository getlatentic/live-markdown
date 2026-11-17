import { describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";

import { composeExtensions, mergeExtensions } from "./loader";
import { type MarkdownExtension } from "./types";

function module_(name: string, extra: Partial<MarkdownExtension> = {}): MarkdownExtension {
  return { name, version: "1.0.0", ...extra };
}

describe("mergeExtensions", () => {
  it("keeps host order, so a later module can override an earlier one", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      mergeExtensions([
        module_("built-in", { rules: { Emphasis: {} as never } }),
        module_("host", { rules: { Emphasis: {} as never } }),
      ]);
      // The override is deliberate and allowed — but it must not be silent,
      // because a host that shadows a construct by accident sees no other sign.
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0]?.[0])).toContain("Emphasis");
      expect(String(warn.mock.calls[0]?.[0])).toContain("host");
    } finally {
      warn.mockRestore();
    }
  });

  it("says nothing when no rule is redefined", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      mergeExtensions([
        module_("a", { rules: { Emphasis: {} as never } }),
        module_("b", { rules: { StrongEmphasis: {} as never } }),
      ]);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("collects toolbar contributions in module order", () => {
    const item = (id: string) =>
      ({ id, group: "insert", label: id, icon: null, run: () => {} }) as never;
    const merged = mergeExtensions([
      module_("a", { toolbar: [item("one")] }),
      module_("b", { toolbar: [item("two")] }),
    ]);
    expect(merged.toolbar.map((c) => c.id)).toEqual(["one", "two"]);
  });

  it("merges every module's keymap into a single binding set", () => {
    const merged = mergeExtensions([
      module_("a", { keymap: [{ key: "Mod-1", run: () => true }] }),
      module_("b", { keymap: [{ key: "Mod-2", run: () => true }] }),
    ]);
    // One keymap extension for the lot, rather than one per module.
    const state = EditorState.create({ extensions: merged.extensions });
    expect(state).toBeTruthy();
  });

  it("handles an empty list without inventing extensions", () => {
    const merged = mergeExtensions([]);
    expect(merged.extensions).toEqual([]);
    expect(merged.toolbar).toEqual([]);
  });

  it("still answers to the old name, so the rename did not break hosts", () => {
    expect(composeExtensions).toBe(mergeExtensions);
  });
});
