import { describe, expect, it } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";

import { MarkdownEditor } from "./MarkdownEditor";

describe("server rendering", () => {
  it("renders the empty container with no page to draw in", async () => {
    expect(typeof document).toBe("undefined");
    const html = await renderToString(createSSRApp({ render: () => h(MarkdownEditor, { modelValue: "# Hello" }) }));
    expect(html).toBe('<div class="cm-editor-host"><!----><div class="cm-editor-host__scroll"></div><!----></div>');
  });
});
