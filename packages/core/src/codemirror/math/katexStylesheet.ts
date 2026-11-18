/**
 * KaTeX's stylesheet, for the page the editor runs in.
 *
 * With a bundler, importing `katexStyles` adds it. A page that loads the
 * package unbundled, from esm.sh or another CDN, cannot import a stylesheet as
 * a module, so the import fails. There the stylesheet is linked from jsDelivr
 * at the version of KaTeX that typesets the math; its fonts resolve beside it.
 */

const CDN = "https://cdn.jsdelivr.net/npm/katex@";

/** Resolves once the stylesheet applies, or once there is nothing more to do. */
export function loadKatexStylesheet(version: () => Promise<string>): Promise<void> {
  return import("../../katexStyles").then(
    () => undefined,
    () => version().then(linkStylesheet),
  );
}

function linkStylesheet(version: string): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  // The host may link KaTeX's stylesheet itself, as KaTeX's own docs say to.
  if (document.querySelector('link[rel="stylesheet"][href*="katex"]')) return Promise.resolve();
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `${CDN}${version}/dist/katex.min.css`;
  const settled = new Promise<void>((resolve) => {
    link.addEventListener("load", () => resolve(), { once: true });
    link.addEventListener("error", () => resolve(), { once: true });
  });
  document.head.append(link);
  return settled;
}
