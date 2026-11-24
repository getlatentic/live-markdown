/**
 * Random edits for tests that compare a state kept up to date edit by edit
 * with the same state built from nothing. Seeded, so a failure repeats.
 */
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState, type Extension, type TransactionSpec } from "@codemirror/state";

/** A small generator with a seed (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SAMPLE = `# Title

Some text with $x^2$ math and \`code\`.

| Name | Value |
| --- | --- |
| alpha | 1 |
| beta | 2 |

- one
- two
  - nested with $y$

$$
\\int_0^1 x
$$

\`\`\`js
const price = "$5 | $6";
\`\`\`

> a quote

\`\`\`mermaid
flowchart TD
  A --> B
\`\`\`

\`\`\`
no language
\`\`\`

| A | B |
| - | - |
| 3 | 4 |
after the table

    indented $z$ code

Last $a$ line.
`;

/** Pieces that start, end or break the constructs the editor draws. */
const PIECES = ["x", " ", "\n", "\n\n", "|", "-", "`", "```\n", "```mermaid\n", "~~~\n", "$", "$$\n", "- ", "> ", "    ", "| a | b |\n| - | - |\n| 1 | 2 |\n", "$q$ "];

export function randomEdit(state: EditorState, random: () => number): TransactionSpec {
  const length = state.doc.length;
  const from = Math.floor(random() * (length + 1));
  if (random() < 0.35 && length > 0) {
    return { changes: { from, to: Math.min(length, from + 1 + Math.floor(random() * (random() < 0.2 ? 60 : 4))) } };
  }
  return { changes: { from, insert: PIECES[Math.floor(random() * PIECES.length)] } };
}

/** A state with the markdown grammar, parsed to its end. */
export function parsedState(doc: string, extensions: Extension[]): EditorState {
  return parsed(EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage }), ...extensions] }));
}

export function parsed(state: EditorState): EditorState {
  if (ensureSyntaxTree(state, state.doc.length, 5000) === null) throw new Error("the markdown parse did not finish");
  return state;
}
