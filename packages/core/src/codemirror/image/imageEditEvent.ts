import type { EditorView } from "@codemirror/view";

/**
 * The "edit this image's alt text" custom-event contract — a plain constant and
 * type with NO runtime CodeMirror dependency (the `EditorView` reference is
 * `import type`, erased at build). The lazy-loaded editor dispatches this event;
 * the host shell listens for it. Keeping the contract here means a host can
 * import the event name without pulling the whole editor into its initial
 * bundle (it previously came from `imageActionMenu`, which imports CodeMirror).
 */
export const IMAGE_EDIT_ALT_EVENT = "ai-editor:edit-image-alt";

export interface ImageEditAltEventDetail {
  view: EditorView;
  sourceFrom: number;
  sourceTo: number;
  currentAlt: string;
  rawSrc: string;
}
