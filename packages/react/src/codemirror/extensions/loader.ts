import type { ComposedExtension as CoreComposedExtension } from "@latentic/live-markdown-core/codemirror/extensions/loader";
import type { ReactNode } from "react";

export { composeExtensions, mergeExtensions } from "@latentic/live-markdown-core/codemirror/extensions/loader";
export type ComposedExtension = CoreComposedExtension<ReactNode>;
