/**
 * The opener-row language affordance (ADR 0002).
 *
 * A CLOSED fence with a language shows its styled CodeInfo text (the pill);
 * one without gets a "plain" placeholder pill widget so every block has a
 * click target. Clicking either opens the searchable language chooser;
 * right-clicking anywhere in a block opens the block menu (set language,
 * copy code). Pointer handling is delegated — one listener per editor — and
 * clicks are swallowed on mousedown so the fence caret guard (§12.9) never
 * sees them.
 */

import { syntaxTree } from "@codemirror/language";
import { type EditorState, type Extension, type Range, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";

import { fenceAtLoose, showCodeBlockMenu, showLanguageMenu } from "./codeLanguageMenu";

class PlainLangPill extends WidgetType {
  override eq(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const pill = document.createElement("span");
    pill.className = "cm-code-info cm-code-info--unset";
    pill.textContent = "plain";
    return pill;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

const PILL = Decoration.widget({ widget: new PlainLangPill(), side: 1 });

function buildPills(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "FencedCode") return;
      const marks = node.node.getChildren("CodeMark");
      if (marks.length < 2) return; // unclosed: the language flow is typing
      if (node.node.getChildren("CodeInfo").length > 0) return;
      ranges.push(PILL.range(marks[0].to));
    },
  });
  return Decoration.set(ranges, true);
}

const plainPillField = StateField.define<DecorationSet>({
  create: buildPills,
  update(value, tr) {
    if (tr.docChanged || syntaxTree(tr.state) !== syntaxTree(tr.startState)) {
      return buildPills(tr.state);
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** The fence containing the event point, resolved through the view. */
function fenceAtEvent(view: EditorView, event: MouseEvent): number | null {
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos === null) return null;
  const node = fenceAtLoose(view.state, pos);
  return node ? node.from : null;
}

const interactionPlugin = ViewPlugin.define((view) => {
  const onMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (!target.closest?.(".cm-code-info")) return;
    const fencePos = fenceAtEvent(view, event);
    if (fencePos === null) return;
    // Swallow the press: the pill is a control, not text — the caret must
    // not move (and §12.9 must not re-site it).
    event.preventDefault();
    event.stopPropagation();
    showLanguageMenu({ view, x: event.clientX, y: event.clientY, fencePos });
  };

  const onContextMenu = (event: MouseEvent): void => {
    const fencePos = fenceAtEvent(view, event);
    if (fencePos === null) return;
    event.preventDefault();
    showCodeBlockMenu({ view, x: event.clientX, y: event.clientY, fencePos });
  };

  view.dom.addEventListener("mousedown", onMouseDown, true);
  view.dom.addEventListener("contextmenu", onContextMenu);
  return {
    destroy() {
      view.dom.removeEventListener("mousedown", onMouseDown, true);
      view.dom.removeEventListener("contextmenu", onContextMenu);
    },
  };
});

export const codeLanguageUI: Extension = [plainPillField, interactionPlugin];
