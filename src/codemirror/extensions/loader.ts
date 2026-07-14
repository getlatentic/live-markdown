import { type Extension } from "@codemirror/state";
import { keymap as cmKeymap } from "@codemirror/view";

import { nodeRulesFacet } from "../decorations/paint";
import { type MarkdownExtension, type ToolbarContribution } from "./types";

export interface ComposedExtension {
  extensions: Extension[];
  toolbar: ToolbarContribution[];
}

export function composeExtensions(modules: readonly MarkdownExtension[]): ComposedExtension {
  const extensions: Extension[] = [];
  const toolbar: ToolbarContribution[] = [];
  const allKeyBindings: import("@codemirror/view").KeyBinding[] = [];
  const seenRuleNames = new Set<string>();

  for (const mod of modules) {
    if (mod.extensions?.length) extensions.push(...mod.extensions);
    if (mod.keymap?.length) allKeyBindings.push(...mod.keymap);
    if (mod.toolbar?.length) toolbar.push(...mod.toolbar);
    if (mod.rules) {
      // An extension's node rules feed the decoration painter through the
      // facet — introducing (or deliberately overriding) a construct never
      // touches the base table.
      extensions.push(nodeRulesFacet.of(mod.rules));
      for (const name of Object.keys(mod.rules)) {
        if (seenRuleNames.has(name)) {
          // eslint-disable-next-line no-console
          console.warn(
            `MarkdownExtension "${mod.name}" overrides node rule "${name}" already provided by another extension.`,
          );
        }
        seenRuleNames.add(name);
      }
    }
  }

  if (allKeyBindings.length) extensions.push(cmKeymap.of(allKeyBindings));

  return { extensions, toolbar };
}
