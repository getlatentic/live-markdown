// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const version = () => Promise.resolve("0.16.47");
const katexLinks = () => [...document.head.querySelectorAll('link[rel="stylesheet"][href*="katex"]')] as HTMLLinkElement[];

/** jsdom fetches no stylesheet, so a link is settled by hand, as a browser would. */
function settleLinks(): void {
  for (const link of katexLinks()) link.dispatchEvent(new Event("load"));
}

afterEach(() => {
  for (const link of katexLinks()) link.remove();
  vi.doUnmock("../../katexStyles");
  vi.resetModules();
});

async function loadWithoutBundler() {
  vi.doMock("../../katexStyles", () => {
    throw new TypeError("a stylesheet cannot be imported as a module");
  });
  const { loadKatexStylesheet } = await import("./katexStylesheet");
  return loadKatexStylesheet;
}

describe("KaTeX's stylesheet", () => {
  it("comes from the import where a bundler handles it, and no link is added", async () => {
    const { loadKatexStylesheet } = await import("./katexStylesheet");
    await loadKatexStylesheet(version);
    expect(katexLinks()).toEqual([]);
  });

  it("is linked at KaTeX's own version where the import fails", async () => {
    const loadKatexStylesheet = await loadWithoutBundler();
    const loaded = loadKatexStylesheet(version);
    await vi.waitFor(() => expect(katexLinks()).toHaveLength(1));
    expect(katexLinks()[0].href).toBe("https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/katex.min.css");
    settleLinks();
    await expect(loaded).resolves.toBeUndefined();
  });

  it("settles when the link fails to load, so math still typesets", async () => {
    const loadKatexStylesheet = await loadWithoutBundler();
    const loaded = loadKatexStylesheet(version);
    await vi.waitFor(() => expect(katexLinks()).toHaveLength(1));
    katexLinks()[0].dispatchEvent(new Event("error"));
    await expect(loaded).resolves.toBeUndefined();
  });

  it("is not linked twice when the page already links KaTeX's stylesheet", async () => {
    const own = document.createElement("link");
    own.rel = "stylesheet";
    own.href = "https://example.com/katex/katex.min.css";
    document.head.append(own);
    const loadKatexStylesheet = await loadWithoutBundler();
    await loadKatexStylesheet(version);
    expect(katexLinks()).toEqual([own]);
  });
});
