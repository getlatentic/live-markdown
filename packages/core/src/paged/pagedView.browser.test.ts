/**
 * @browser: a file shown a few windows at a time. Scrolling is the subject,
 * so this needs a browser that lays text out and scrolls it.
 */
import { afterEach, describe, expect, it } from "vitest";

import { undo } from "@codemirror/commands";

import { memorySource, type MemorySource } from "./memorySource";
import { createPagedMarkdownView, type PagedMarkdownView, type PagedViewOptions } from "./pagedView";
import type { PagedSource } from "./source";

const SECTIONS = 12_000;
const section = (n: number): string => `## Section ${n} é\n\nA paragraph of text for section ${n}, with **bold** and \`code\`, long enough to wrap now and then on a narrow page.\n\n- item one of ${n}\n- item two\n\n`;
const TEXT = Array.from({ length: SECTIONS }, (_, n) => section(n)).join("");
let source: MemorySource = memorySource(TEXT);

/** The most the view may hold: five windows and what one window overshoots. */
const MOST_HELD_BYTES = 6 * 256 * 1024;

let paged: PagedMarkdownView | null = null;
let host: HTMLElement | null = null;

async function mountedOn(from: PagedSource, options: PagedViewOptions = {}): Promise<PagedMarkdownView> {
  host = document.body.appendChild(document.createElement("div"));
  host.style.cssText = "height:600px;width:800px;display:flex;flex-direction:column";
  paged = createPagedMarkdownView(host, from, options);
  await paged.settled();
  return paged;
}

function mounted(text = TEXT): Promise<PagedMarkdownView> {
  source = memorySource(text);
  return mountedOn(source);
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

  it("opens at a place it reported earlier", async () => {
    let top = 0;
    source = memorySource(TEXT);
    const first = await mountedOn(source, { onMove: (byte) => (top = byte) });
    await first.jumpTo(Math.floor(source.size / 2));
    await first.settled();
    await frame();
    const was = sectionOnScreen(first);
    first.destroy();
    host?.remove();
    const again = await mountedOn(source, { startAt: top });
    expect(again.held().from).toBeGreaterThan(0);
    expect(Math.abs(sectionOnScreen(again) - was)).toBeLessThanOrEqual(1);
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

  it("is not edited by typing when its source takes no edits", async () => {
    const { edit: _edit, ...readOnly } = memorySource(TEXT);
    const view = await mountedOn(readOnly);
    const before = view.view.state.doc.toString();
    view.view.dispatch({ changes: { from: 0, insert: "typed" }, userEvent: "input.type" });
    expect(view.view.state.doc.toString()).toBe(before);
  });
});

/** Where `text` is in the document the view holds. */
function placeOf(view: PagedMarkdownView, text: string): number {
  const at = view.view.state.doc.toString().indexOf(text);
  expect(at, text).toBeGreaterThanOrEqual(0);
  return at;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe("a file edited a few windows at a time", () => {
  it("sends what is typed at the top of the file to the source", async () => {
    const view = await mounted();
    view.view.dispatch({ changes: { from: 0, insert: "Typed é 😀\n\n" }, userEvent: "input.type" });
    await view.sent();
    expect(source.text()).toBe(`Typed é 😀\n\n${TEXT}`);
    expect(view.size()).toBe(source.size);
    expectHeldIsTheFile(view);
  });

  it("sends an edit made far into the file to the same place in the source", async () => {
    const view = await mounted();
    await view.jumpTo(Math.floor(source.size / 2));
    await view.settled();
    const heading = /## Section (\d+) é\n/.exec(view.view.state.doc.sliceString(300_000))!;
    const at = placeOf(view, heading[0]) + heading[0].length;
    view.view.dispatch({ changes: { from: at, insert: "\nNew text here.\n" } });
    await view.sent();
    expect(source.text()).toBe(TEXT.replace(heading[0], `${heading[0]}\nNew text here.\n`));
    expectHeldIsTheFile(view);
  });

  it("sends each change of an edit made in several places at once", async () => {
    const view = await mounted();
    const places = [5, 6, 7].map((n) => placeOf(view, `## Section ${n} é`));
    view.view.dispatch({ changes: [{ from: places[0], insert: "one é " }, { from: places[1], to: places[1] + 2, insert: "###" }, { from: places[2], insert: "three 😀 " }] });
    await view.sent();
    expect(source.text()).toBe(TEXT.replace("## Section 5 é", "one é ## Section 5 é").replace("## Section 6 é", "### Section 6 é").replace("## Section 7 é", "three 😀 ## Section 7 é"));
    expectHeldIsTheFile(view);
  });

  it("takes text out across the windows it holds", async () => {
    const view = await mounted();
    for (let step = 0; step < 30; step++) await scrollBy(view, 20_000);
    const { doc } = view.view.state;
    const from = doc.line(Math.floor(doc.lines / 5)).from;
    const to = doc.line(Math.floor((doc.lines * 4) / 5)).from;
    const held = view.held();
    const bytes = encoder.encode(TEXT);
    const removedFrom = held.from + encoder.encode(doc.sliceString(0, from)).length;
    const removedTo = held.from + encoder.encode(doc.sliceString(0, to)).length;
    view.view.dispatch({ changes: { from, to } });
    await view.sent();
    await view.settled();
    expect(source.text()).toBe(decoder.decode(bytes.subarray(0, removedFrom)) + decoder.decode(bytes.subarray(removedTo)));
    expectHeldIsTheFile(view);
  }, 60_000);

  it("keeps its place in the file through typing and scrolling together", async () => {
    const view = await mounted();
    let model = TEXT;
    for (let step = 0; step < 60; step++) {
      const { doc } = view.view.state;
      const line = doc.line(1 + ((step * 7919) % doc.lines));
      const added = step % 3 === 0 ? `é${step} ` : `\n\nAdded ${step} 😀.\n\n`;
      const removed = Math.min(step % 4, line.length);
      const start = decoder.decode(encoder.encode(model).subarray(0, view.held().from)).length + line.from;
      model = model.slice(0, start) + added + model.slice(start + removed);
      view.view.dispatch({ changes: { from: line.from, to: line.from + removed, insert: added } });
      // The page moves on at once: windows are fetched with edits still on their way.
      view.view.scrollDOM.scrollTop += step % 5 === 4 ? -30_000 : 25_000;
      if (step % 6 === 0) await frame();
      if (step % 10 === 9) await view.settled();
    }
    await view.settled();
    expect(source.text() === model).toBe(true);
    expect(view.size()).toBe(source.size);
    expectHeldIsTheFile(view);
  }, 120_000);

  it("takes an edit back at the source when it is undone", async () => {
    const view = await mounted();
    view.view.dispatch({ changes: { from: placeOf(view, "## Section 3 é"), insert: "Typed. " }, userEvent: "input.type" });
    await view.sent();
    expect(source.text()).not.toBe(TEXT);
    expect(undo(view.view)).toBe(true);
    await view.sent();
    expect(source.text()).toBe(TEXT);
  });

  it("counts the bytes of a file whose lines end in a carriage return and a line feed", async () => {
    const text = TEXT.split("\n").join("\r\n");
    const view = await mounted(text);
    expect(view.view.state.doc.toString()).toBe(source.read(view.held().from, view.held().to));
    const at = placeOf(view, "## Section 40 é");
    view.view.dispatch({ changes: { from: at, insert: "Typed. " } });
    await view.sent();
    expect(source.text()).toBe(text.replace("## Section 40 é", "Typed. ## Section 40 é"));
  });

  it("tells the host of each edit, and shows the source's text again when the source refuses one", async () => {
    const refusing = memorySource(TEXT);
    let edits = 0;
    let refused: unknown = null;
    const view = await mountedOn({ ...refusing, size: refusing.size, edit: () => Promise.reject(new Error("refused")) }, { onEdit: () => (edits += 1), onEditFailed: (error) => (refused = error) });
    view.view.dispatch({ changes: { from: 0, insert: "typed" }, userEvent: "input.type" });
    expect(edits).toBe(1);
    await view.settled();
    expect(refused).toBeInstanceOf(Error);
    expect(view.view.state.doc.toString().startsWith("## Section 0 é")).toBe(true);
    expect(view.size()).toBe(refusing.size);
  });
});
