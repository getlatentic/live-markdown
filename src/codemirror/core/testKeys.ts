/**
 * Test-only: the chord CodeMirror's `Mod-` prefix resolves to HERE.
 *
 * `Mod` is Cmd on macOS and Ctrl everywhere else, and CodeMirror decides that
 * from `navigator.platform` — so a suite that presses `{Meta>}z{/Meta}`
 * literally tests undo on a Mac and tests nothing at all on Linux. The
 * keystroke reaches no binding, the assertion reads the un-undone text, and the
 * failure looks like a broken editor rather than a mis-aimed key. This picks the
 * modifier the same way the keymap does, so the two can never disagree.
 *
 * Not shipped — nothing in the package imports it outside tests.
 */

const nav = typeof navigator === "undefined" ? { platform: "" } : navigator;

export const MOD = /Mac|iP(hone|[oa]d)/.test(nav.platform) ? "Meta" : "Control";

/** A `userEvent.keyboard` sequence for `Mod-<keys>`. */
export function modChord(keys: string): string {
  return `{${MOD}>}${keys}{/${MOD}}`;
}
