/**
 * Cell text ↔ source transforms (GFM). A raw `|` inside a cell starts a new
 * column; the only literal pipe is `\|`. Surfaces edit the UNESCAPED text and
 * re-escape on commit, so typing `|` in a cell can never shift the row.
 * Canonical home for the redesign (ADR 0001); the nested-editor copies retire
 * with `tableCellSubview.ts`.
 */

export function unescapePipes(source: string): string {
  return source.replace(/\\\|/g, "|");
}

export function escapePipes(text: string): string {
  return text.replace(/\|/g, "\\|");
}
