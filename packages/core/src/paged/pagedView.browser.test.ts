/**
 * @browser: a file shown a few windows at a time. Scrolling is the subject,
 * so this needs a browser that lays text out and scrolls it.
 */
import { afterEach, describe, expect, it } from "vitest";

import { memorySource } from "./memorySource";
import { createPagedMarkdownView, type PagedMarkdownView } from "./pagedView";

const SECTIONS = 12_000;
const section = (n: number): string => `## Section ${n} é\n\nA paragraph of text for section ${n}, with **bold** and \`code\`, long enough to wrap now and then on a narrow page.\n\n- item one of ${n}\n- item two\n\n`;
const TEXT = Array.from({ length: SECTIONS }, (_, n) => section(n)).join("");
const source = memorySource(TEXT);

/** The most the view may hold: five windows and what one window overshoots. */
const MOST_HELD_BYTES = 6 * 256 * 1024;

let paged: PagedMarkdownView | null = null;
let host: HTMLElement | null = null;

async function mounted(): Promise<PagedMarkdownView> {
  host = document.body.appendChild(document.createElement("div"));
  host.style.cssText = "height:600px;width:800px;display:flex;flex-direction:column";
  paged = createPagedMarkdownView(host, source);
  await paged.settled();
  return paged;
}

afterEach(() => {
  paged?.destroy();
  host?.remove();
  paged = null;
  host = null;
});

const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** What the view holds is exactly that part of the file, and not too much. */
function expectHeldIsTheFile(view: PagedMarkdownView): void {
  const { from, to } = view.held();
  expect(to - from).toBeLessThanOrEqual(MOST_HELD_BYTES);
  expect(view.view.state.doc.toString()).toBe(source.read(from, to));
}

/** The number of the first section whose heading is on screen. */
function sectionOnScreen(view: PagedMarkdownView): number {
  const top = view.view.scrollDOM.getBoundingClientRect().top;
  for (const line of view.view.contentDOM.querySelectorAll<HTMLElement>(".cm-line")) {
    const match = /^Section (\d+)/.exec(line.textContent ?? "");
    if (match && line.getBoundingClientRect().bottom > top) return Number(match[1]);
  }
  return -1;
}

async function scrollBy(view: PagedMarkdownView, pixels: number): Promise<void> {
  view.view.scrollDOM.scrollTop += pixels;
  await frame();
  await view.settled();
}

describe("a file shown a few windows at a time", () => {
  it("opens on the start of the file, holding one part of it", async () => {
    const view = await mounted();
    expect(view.held().from).toBe(0);
    expect(sectionOnScreen(view)).toBe(0);
    expectHeldIsTheFile(view);
    expect(source.size).toBeGreaterThan(MOST_HELD_BYTES);
  });

  it("goes on through the file to its end as it is scrolled, never holding more than a few windows", async () => {
    const view = await mounted();
    let last = sectionOnScreen(view);
    let dropped = false;
    for (let step = 0; step < 400 && view.held().to < source.size; step++) {
      await scrollBy(view, 20_000);
      expectHeldIsTheFile(view);
      const now = sectionOnScreen(view);
      expect(now, `step ${step}`).toBeGreaterThan(last);
      last = now;
      dropped ||= view.held().from > 0;
    }
    expect(dropped).toBe(true);
    expect(view.held().to).toBe(source.size);
  }, 180_000);

  it("keeps what is on screen in place when a window is added or dropped", async () => {
    const view = await mounted();
    for (let step = 0; step < 60; step++) {
      const before = sectionOnScreen(view);
      const heldBefore = view.held();
      view.view.scrollDOM.scrollTop += 4_000;
      await frame();
      const mid = sectionOnScreen(view);
      await view.settled();
      const heldAfter = view.held();
      // Fetching the next window, and dropping the first, does not move the page.
      if (heldAfter.from !== heldBefore.from || heldAfter.to !== heldBefore.to) {
        expect(Math.abs(sectionOnScreen(view) - mid), `step ${step}, from section ${before}`).toBeLessThanOrEqual(1);
      }
    }
  }, 120_000);

  it("comes back up through the file to its start", async () => {
    const view = await mounted();
    for (let step = 0; step < 80; step++) await scrollBy(view, 20_000);
    expect(view.held().from).toBeGreaterThan(0);
    let last = sectionOnScreen(view);
    for (let step = 0; step < 400 && sectionOnScreen(view) > 0; step++) {
      await scrollBy(view, -20_000);
      expectHeldIsTheFile(view);
      const now = sectionOnScreen(view);
      expect(now, `step ${step}`).toBeLessThanOrEqual(last);
      last = now;
    }
    expect(view.held().from).toBe(0);
    expect(sectionOnScreen(view)).toBe(0);
  }, 120_000);

  it("jumps to any place in the file", async () => {
    const view = await mounted();
    await view.jumpTo(Math.floor(source.size / 2));
    await view.settled();
    expectHeldIsTheFile(view);
    const middle = sectionOnScreen(view);
    expect(Math.abs(middle - SECTIONS / 2)).toBeLessThan(40);
    await view.jumpTo(source.size);
    await view.settled();
    expect(view.held().to).toBe(source.size);
    expect(view.view.state.doc.toString().endsWith(section(SECTIONS - 1))).toBe(true);
    await view.jumpTo(0);
    await view.settled();
    expect(sectionOnScreen(view)).toBe(0);
  });

  it("shows where it is in the whole file on its own scrollbar, and goes where the thumb is put", async () => {
    const view = await mounted();
    const bar = host!.querySelector<HTMLElement>(".cm-paged-scrollbar")!;
    const thumb = bar.querySelector<HTMLElement>(".cm-paged-scrollbar__thumb")!;
    await frame();
    expect(thumb.getBoundingClientRect().top - bar.getBoundingClientRect().top).toBeLessThan(2);
    await view.jumpTo(Math.floor(source.size / 2));
    await view.settled();
    await frame();
    const share = (thumb.getBoundingClientRect().top - bar.getBoundingClientRect().top) / (bar.clientHeight - thumb.offsetHeight);
    expect(share).toBeGreaterThan(0.45);
    expect(share).toBeLessThan(0.55);
    const rect = bar.getBoundingClientRect();
    const at = (y: number): PointerEventInit => ({ clientX: rect.left + 6, clientY: y, pointerId: 1, bubbles: true });
    bar.dispatchEvent(new PointerEvent("pointerdown", at(rect.top + rect.height * 0.9)));
    bar.dispatchEvent(new PointerEvent("pointerup", at(rect.top + rect.height * 0.9)));
    await frame();
    await view.settled();
    expect(sectionOnScreen(view)).toBeGreaterThan(SECTIONS * 0.8);
  });

  it("is not edited by typing", async () => {
    const view = await mounted();
    const before = view.view.state.doc.toString();
    view.view.dispatch({ changes: { from: 0, insert: "typed" }, userEvent: "input.type" });
    expect(view.view.state.doc.toString()).toBe(before);
  });
});
