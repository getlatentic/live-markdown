import { EditorView } from "@codemirror/view";

import {
  buildImageMarkdown,
  insertImageBlob,
} from "../../imageInsert";
import { saveImageBytesFacet } from "./hostFacets";
import { IMAGE_EDIT_ALT_EVENT, type ImageEditAltEventDetail } from "./imageEditEvent";

interface ShowMenuArgs {
  x: number;
  y: number;
  view: EditorView;
  alt: string;
  rawSrc: string;
  sourceFrom: number;
  sourceTo: number;
}

export function showImageActionMenu(args: ShowMenuArgs): void {
  const menu = document.createElement("div");
  menu.className = "cm-image-menu";
  menu.setAttribute("role", "menu");
  menu.style.position = "fixed";
  menu.style.left = `${args.x}px`;
  menu.style.top = `${args.y}px`;
  menu.style.zIndex = "1000";

  function destroy() {
    menu.remove();
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onEscape, true);
  }

  function onOutside(e: MouseEvent) {
    if (!menu.contains(e.target as Node)) destroy();
  }

  function onEscape(e: KeyboardEvent) {
    if (e.key === "Escape") destroy();
  }

  function makeItem(label: string, onClick: () => void, danger = false): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = danger
      ? "cm-image-menu__item cm-image-menu__item--danger"
      : "cm-image-menu__item";
    b.setAttribute("role", "menuitem");
    b.textContent = label;
    b.addEventListener("click", () => {
      onClick();
      destroy();
    });
    return b;
  }

  menu.appendChild(
    makeItem("Edit alt text…", () => {
      const event = new CustomEvent<ImageEditAltEventDetail>(IMAGE_EDIT_ALT_EVENT, {
        detail: {
          view: args.view,
          sourceFrom: args.sourceFrom,
          sourceTo: args.sourceTo,
          currentAlt: args.alt,
          rawSrc: args.rawSrc,
        },
      });
      window.dispatchEvent(event);
    }),
  );

  menu.appendChild(
    makeItem("Replace image…", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        void (async () => {
          try {
            const result = await insertImageBlob({
              blob: file,
              saveBytes: args.view.state.facet(saveImageBytesFacet),
            });
            const newMd = buildImageMarkdown(result);
            args.view.dispatch({
              changes: { from: args.sourceFrom, to: args.sourceTo, insert: newMd },
              userEvent: "input.replace.image",
            });
          } catch (error) {
            console.error("Failed to replace image:", error);
          }
        })();
      };
      input.click();
    }),
  );

  menu.appendChild(
    makeItem("Copy markdown source", () => {
      const source = args.view.state.sliceDoc(args.sourceFrom, args.sourceTo);
      void navigator.clipboard.writeText(source);
    }),
  );

  menu.appendChild(
    makeItem(
      "Delete image",
      () => {
        args.view.dispatch({
          changes: { from: args.sourceFrom, to: args.sourceTo, insert: "" },
          userEvent: "delete.image",
        });
      },
      true,
    ),
  );

  document.body.appendChild(menu);

  const rect = menu.getBoundingClientRect();
  const overflowRight = rect.right - window.innerWidth;
  if (overflowRight > 0) menu.style.left = `${args.x - overflowRight - 8}px`;
  const overflowBottom = rect.bottom - window.innerHeight;
  if (overflowBottom > 0) menu.style.top = `${args.y - overflowBottom - 8}px`;

  setTimeout(() => {
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onEscape, true);
  }, 0);
}
