import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import { treeAt } from "./core";
import type { CaretContextSnapshot } from "./extensions/types";
import { onEditorUpdate } from "./updateBus";

export const EMPTY_CARET_CONTEXT: CaretContextSnapshot = {
  bold: false,
  italic: false,
  code: false,
  link: false,
  heading: 0,
  bulletList: false,
  orderedList: false,
  taskList: false,
  blockquote: false,
};

/** Every flag but `heading`, keyed by the syntax node that sets it. */
const FLAG_OF_NODE: Record<string, Exclude<keyof CaretContextSnapshot, "heading">> = {
  StrongEmphasis: "bold",
  Emphasis: "italic",
  InlineCode: "code",
  Link: "link",
  BulletList: "bulletList",
  OrderedList: "orderedList",
  Task: "taskList",
  Blockquote: "blockquote",
};

/** What the caret sits in: the formatting a toolbar shows as pressed. */
export function caretContext(state: EditorState): CaretContextSnapshot {
  const pos = state.selection.main.head;
  const context: { -readonly [K in keyof CaretContextSnapshot]: CaretContextSnapshot[K] } = { ...EMPTY_CARET_CONTEXT };
  for (let node: { name: string; parent: unknown } | null = treeAt(state, pos).resolveInner(pos, 1); node; ) {
    const flag = FLAG_OF_NODE[node.name];
    if (flag) context[flag] = true;
    else if (node.name.startsWith("ATXHeading")) context.heading = headingLevel(node.name);
    node = node.parent as typeof node;
  }
  // A task item lives inside a bullet list; it is a task, not a bullet.
  if (context.taskList) context.bulletList = false;
  return context;
}

function headingLevel(nodeName: string): CaretContextSnapshot["heading"] {
  const level = Number(nodeName.slice("ATXHeading".length));
  return level >= 1 && level <= 6 ? (level as CaretContextSnapshot["heading"]) : 0;
}

export function caretContextsEqual(a: CaretContextSnapshot, b: CaretContextSnapshot): boolean {
  return (Object.keys(EMPTY_CARET_CONTEXT) as (keyof CaretContextSnapshot)[]).every((key) => a[key] === b[key]);
}

/**
 * Call `report` with the caret context now and whenever it changes. Typing
 * inside one paragraph leaves it unchanged, so `report` is not called for
 * that. Returns the unsubscribe.
 */
export function watchCaretContext(view: EditorView, report: (context: CaretContextSnapshot) => void): () => void {
  let current = caretContext(view.state);
  report(current);
  return onEditorUpdate(view, (update) => {
    if (!update.docChanged && !update.selectionSet) return;
    const next = caretContext(update.state);
    if (caretContextsEqual(next, current)) return;
    current = next;
    report(next);
  });
}
