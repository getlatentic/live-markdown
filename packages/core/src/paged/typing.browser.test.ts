/**
 * @browser: real key presses into a paged view, as a person types.
 */
import { userEvent } from "@vitest/browser/context";
import { afterEach, expect, it } from "vitest";

import { memorySource } from "./memorySource";
import { createPagedMarkdownView, type PagedMarkdownView } from "./pagedView";

const section = (n: number): string => `## Section ${n}\n\nA paragraph of text for section ${n}, with **bold** and \`code\`, long enough to wrap now and then.\n\n- item one of ${n}\n- item two\n\n| a | b |\n| - | - |\n| ${n} | x |\n\n`;
const TEXT = Array.from({ length: 12_000 }, (_, n) => section(n)).join("");

let paged: PagedMarkdownView | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  paged?.destroy();
  host?.remove();
});

it("takes every key typed at the end of a paragraph", async () => {
  const source = memorySource(TEXT);
  host = document.body.appendChild(document.createElement("div"));
  host.style.cssText = "height:600px;width:800px;display:flex;flex-direction:column";
  paged = createPagedMarkdownView(host, source);
  await paged.settled();
  const { view } = paged;
  const end = view.state.doc.line(3).to;
  view.focus();
  view.dispatch({ selection: { anchor: end } });
  await userEvent.keyboard(" Typed in the three megabyte note.");
  await paged.sent();
  expect(view.state.doc.line(3).text).toBe("A paragraph of text for section 0, with **bold** and `code`, long enough to wrap now and then. Typed in the three megabyte note.");
  expect(source.text().startsWith("## Section 0\n\nA paragraph of text for section 0, with **bold** and `code`, long enough to wrap now and then. Typed in the three megabyte note.\n\n- item")).toBe(true);
});
