import { type Extension } from "@codemirror/state";
import { keymap as cmKeymap } from "@codemirror/view";

import { type MarkdownExtension, type ToolbarContribution } from "./types";

export interface ComposedExtension {
  extensions: Extension[];
  toolbar: ToolbarContribution[];
}

export function composeExtensions(modules: readonly MarkdownExtension[]): ComposedExtension {
  const extensions: Extension[] = [];
  const toolbar: ToolbarContribution[] = [];
  const allKeyBindings: import("@codemirror/view").KeyBinding[] = [];
  const seenRegistryNames = new Set<string>();

  for (const mod of modules) {
    if (mod.extensions?.length) extensions.push(...mod.extensions);
    if (mod.keymap?.length) allKeyBindings.push(...mod.keymap);
    if (mod.toolbar?.length) toolbar.push(...mod.toolbar);
    if (mod.registry) {
      for (const name of Object.keys(mod.registry)) {
        if (seenRegistryNames.has(name)) {
          // eslint-disable-next-line no-console
          console.warn(
            `MarkdownExtension "${mod.name}" overrides registry entry "${name}" already provided by another extension.`,
          );
        }
        seenRegistryNames.add(name);
      }
    }
  }

  if (allKeyBindings.length) extensions.push(cmKeymap.of(allKeyBindings));

  return { extensions, toolbar };
}
