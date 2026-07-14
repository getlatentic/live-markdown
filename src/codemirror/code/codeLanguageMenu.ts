/**
 * Language + block menus for fenced code (ADR 0002).
 *
 * Typing the language right after ``` works while the block is still empty
 * (§12.4 keeps the caret on the opener) — these menus are the POINTER path,
 * and the only path once a block has content: the opener-row pill (real or
 * "plain" placeholder) opens a searchable chooser, and right-click anywhere
 * in a block offers "Set language…" and "Copy code". Menus mount on
 * document.body with inline styles (outside the editor's scoped theme), the
 * same pattern as the table menu.
 */

import { EditorSelection, type ChangeSpec, type EditorState } from "@codemirror/state";
import { type EditorView } from "@codemirror/view";
import { languages } from "@codemirror/language-data";

import { fenceAt } from "./fenceAutoClose";

/** `fenceAt` resolves side -1 and misses the fence's own from-boundary — the
 *  very position callers naturally pass (node.from). Probe one step in. */
export function fenceAtLoose(state: EditorState, pos: number) {
  return fenceAt(state, pos) ?? fenceAt(state, Math.min(pos + 1, state.doc.length));
}

/** Replace the fence's info string (everything after the opening marks on the
 *  opener line) with `info`; null clears it. Null result = no fence at pos. */
export function setFenceInfo(
  state: EditorState,
  fencePos: number,
  info: string | null,
): ChangeSpec | null {
  const node = fenceAtLoose(state, fencePos);
  if (!node) return null;
  const opener = node.getChildren("CodeMark")[0];
  if (!opener) return null;
  const openerLine = state.doc.lineAt(node.from);
  return { from: opener.to, to: openerLine.to, insert: info ?? "" };
}

/** The block's code content (between opener and closer lines). */
export function fenceContent(state: EditorState, fencePos: number): string | null {
  const node = fenceAtLoose(state, fencePos);
  if (!node) return null;
  const marks = node.getChildren("CodeMark");
  if (marks.length < 2) return null;
  const openerLine = state.doc.lineAt(node.from);
  const closerLine = state.doc.lineAt(marks[marks.length - 1].from);
  if (closerLine.from - 1 <= openerLine.to) return "";
  return state.sliceDoc(openerLine.to + 1, closerLine.from - 1);
}

/** Write the block's content to the clipboard; returns it (for tests). */
export function copyFenceCode(view: EditorView, fencePos: number): string | null {
  const content = fenceContent(view.state, fencePos);
  if (content === null) return null;
  void navigator.clipboard?.writeText(content).catch(() => {
    // Clipboard API denied (rare in the webview): execCommand fallback.
    const area = document.createElement("textarea");
    area.value = content;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  });
  return content;
}

interface MenuHandle {
  root: HTMLElement;
  destroy(): void;
}

function mountMenu(x: number, y: number): MenuHandle {
  const root = document.createElement("div");
  root.className = "cm-code-menu";
  root.setAttribute("role", "menu");
  root.style.cssText =
    "position:fixed;z-index:1000;min-width:12rem;padding:0.25rem;" +
    "background:var(--cds-layer-01,#ffffff);border:1px solid var(--cds-border-subtle-01,#e0e0e0);" +
    "border-radius:6px;box-shadow:0 2px 12px rgba(0,0,0,0.18);font-size:0.875rem;";
  root.style.left = `${x}px`;
  root.style.top = `${y}px`;
  document.body.appendChild(root);

  const onOutside = (event: MouseEvent): void => {
    if (!root.contains(event.target as Node)) destroy();
  };
  const onEscape = (event: KeyboardEvent): void => {
    if (event.key === "Escape") destroy();
  };
  function destroy(): void {
    root.remove();
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onEscape, true);
  }
  // Defer registration past the event that opened the menu.
  setTimeout(() => {
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onEscape, true);
  }, 0);

  const clamp = () => {
    const rect = root.getBoundingClientRect();
    if (rect.right > window.innerWidth) root.style.left = `${x - rect.width}px`;
    if (rect.bottom > window.innerHeight) root.style.top = `${Math.max(0, y - rect.height)}px`;
  };
  queueMicrotask(clamp);
  return { root, destroy };
}

function itemButton(label: string, hint?: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cm-code-menu__item";
  button.style.cssText =
    "display:flex;justify-content:space-between;gap:1rem;width:100%;padding:0.3rem 0.6rem;" +
    "border:none;background:none;text-align:left;cursor:pointer;border-radius:4px;color:inherit;";
  button.addEventListener("mouseenter", () => (button.style.background = "var(--cds-layer-hover-01,#e8e8e8)"));
  button.addEventListener("mouseleave", () => (button.style.background = "none"));
  const name = document.createElement("span");
  name.textContent = label;
  button.appendChild(name);
  if (hint) {
    const alias = document.createElement("span");
    alias.textContent = hint;
    alias.style.cssText = "color:var(--cds-text-secondary,#6f6f6f);font-size:0.75rem;";
    button.appendChild(alias);
  }
  return button;
}

/** The markdown info string we write for a chosen language: its shortest
 *  alias (`ts`, `js`, `py`) — the idiomatic fence tag. */
export function infoFor(name: string): string | null {
  const lang = languages.find((l) => l.name === name);
  if (!lang) return null;
  return [...lang.alias, lang.name.toLowerCase()].sort((a, b) => a.length - b.length)[0];
}

export interface LanguageEntry {
  label: string;
  hint?: string;
  info: string | null;
  haystack: string;
}

/** Fence tags Compose RENDERS rather than parses — no CodeMirror grammar
 *  exists for them, so they'd otherwise be absent from the chooser, and
 *  type-time auto-close (§12.4) makes this menu the only way to give a
 *  from-scratch fence its language. */
const RENDERED_FENCE_TAGS: LanguageEntry[] = [
  {
    label: "Mermaid",
    hint: "diagram",
    info: "mermaid",
    haystack: "mermaid diagram flowchart sequence graph chart",
  },
];

/** Every choosable entry: Plain text first, then grammars and rendered tags
 *  merged A→Z. */
export function languageEntries(): LanguageEntry[] {
  return [
    { label: "Plain text", info: null, haystack: "plain text none" },
    ...[
      ...languages.map((l) => ({
        label: l.name,
        hint: infoFor(l.name) ?? undefined,
        info: infoFor(l.name),
        haystack: `${l.name} ${l.alias.join(" ")}`.toLowerCase(),
      })),
      ...RENDERED_FENCE_TAGS,
    ].sort((a, b) => a.label.localeCompare(b.label)),
  ];
}

export interface LanguageMenuArgs {
  view: EditorView;
  x: number;
  y: number;
  /** Any position inside the target fence. */
  fencePos: number;
}

/** Searchable language chooser; picking dispatches the info-string change as
 *  one undo step. */
export function showLanguageMenu(args: LanguageMenuArgs): void {
  const menu = mountMenu(args.x, args.y);

  const search = document.createElement("input");
  search.type = "text";
  search.placeholder = "Search languages…";
  search.className = "cm-code-menu__search";
  search.style.cssText =
    "width:100%;box-sizing:border-box;margin-bottom:0.25rem;padding:0.3rem 0.5rem;" +
    "border:1px solid var(--cds-border-subtle-01,#e0e0e0);border-radius:4px;font:inherit;outline-color:var(--cds-focus,#0f62fe);";
  menu.root.appendChild(search);

  const list = document.createElement("div");
  list.style.cssText = "max-height:16rem;overflow-y:auto;";
  menu.root.appendChild(list);

  const apply = (info: string | null): void => {
    const change = setFenceInfo(args.view.state, args.fencePos, info) as {
      from: number;
      to: number;
      insert: string;
    } | null;
    menu.destroy();
    if (change) {
      // Language chosen → drop the caret at the start of the first content
      // line, ready to type the code (or diagram) itself.
      const newLength = args.view.state.doc.length - (change.to - change.from) + change.insert.length;
      const anchor = Math.min(change.from + change.insert.length + 1, newLength);
      args.view.dispatch({
        changes: change,
        selection: EditorSelection.cursor(anchor),
        userEvent: "input.code.language",
      });
    }
    args.view.focus();
  };

  const entries = languageEntries();

  const render = (filter: string): void => {
    list.textContent = "";
    const needle = filter.trim().toLowerCase();
    for (const entry of entries.filter((e) => !needle || e.haystack.includes(needle))) {
      const button = itemButton(entry.label, entry.hint);
      button.addEventListener("click", () => apply(entry.info));
      list.appendChild(button);
    }
  };
  render("");
  search.addEventListener("input", () => render(search.value));
  // Enter picks the top visible match.
  search.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    list.querySelector("button")?.click();
  });
  search.focus();
}

/** Right-click menu for a code block: set language, copy content. */
export function showCodeBlockMenu(args: LanguageMenuArgs): void {
  const menu = mountMenu(args.x, args.y);
  const language = itemButton("Set language…");
  language.addEventListener("click", () => {
    menu.destroy();
    showLanguageMenu(args);
  });
  const copy = itemButton("Copy code");
  copy.addEventListener("click", () => {
    copyFenceCode(args.view, args.fencePos);
    menu.destroy();
    args.view.focus();
  });
  menu.root.append(language, copy);
}
