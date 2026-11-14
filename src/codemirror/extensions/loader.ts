import { Prec, type Extension } from "@codemirror/state";
import { keymap as cmKeymap, type KeyBinding } from "@codemirror/view";
import { type MarkdownConfig } from "@lezer/markdown";

import { nodeRulesFacet } from "../core";
import { lineKeyRulesFacet, lineKindsFacet } from "../lineKeys/hostRules";
import { type MarkdownExtension, type ToolbarContribution } from "./types";

export interface ComposedExtension {
  extensions: Extension[];
  toolbar: ToolbarContribution[];
  /** The modules' additions to the grammar, for `editingStackWith`. The
   *  grammar is part of the language, so it cannot ride in `extensions`. */
  grammar: MarkdownConfig[];
}

/**
 * Merge extension modules into one set of CodeMirror extensions plus the
 * toolbar items and grammar they contribute. Later modules win: a host's
 * rules and keys are applied after the built-ins, so it can deliberately
 * override a construct or a key.
 */
export function mergeExtensions(modules: readonly MarkdownExtension[]): ComposedExtension {
  const extensions: Extension[] = [];
  const toolbar: ToolbarContribution[] = [];
  const grammar: MarkdownConfig[] = [];
  // Latest module first: among bindings and rules for one key, the first asked wins.
  const keyBindings: KeyBinding[] = [];
  const lineRules: Extension[] = [];
  const seenRuleNames = new Set<string>();

  for (const mod of modules) {
    if (mod.extensions?.length) extensions.push(...mod.extensions);
    if (mod.grammar?.length) grammar.push(...mod.grammar);
    if (mod.keymap?.length) keyBindings.unshift(...mod.keymap);
    if (mod.lineKinds?.length) lineRules.unshift(...mod.lineKinds.map((read) => lineKindsFacet.of(read)));
    if (mod.lineKeys?.length) lineRules.unshift(...mod.lineKeys.map((rule) => lineKeyRulesFacet.of(rule)));
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

  extensions.push(...lineRules);
  // Ahead of CodeMirror's stock keys, which bind most chords (Mod-Enter is
  // "insert blank line"): under them, a module's key never arrives.
  if (keyBindings.length) extensions.push(Prec.highest(cmKeymap.of(keyBindings)));

  return { extensions, toolbar, grammar };
}

/**
 * @deprecated Renamed to {@link mergeExtensions}. "compose" reads as the app
 * this package was extracted from rather than as the verb; the editor is meant
 * for more hosts than that one. Kept as an alias so the rename is not breaking.
 */
export const composeExtensions = mergeExtensions;
