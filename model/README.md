# The line-key machine

What Backspace, Enter, Tab, Shift-Tab, Delete and a typed marker (`# `, `## `, `- `, `1. `, `- [ ] `, `> `, ` ``` `) do on every kind of line.

## Where the rules live

For Backspace, Delete, Enter, Tab, Shift-Tab and a typed marker, pressed with a caret, the rule is a lookup:

1. `src/codemirror/lineKeys/lineKey.ts` reads the state: the kind of the caret's line, the kind of the line above, and where the caret is.
2. `src/codemirror/lineKeys/table.ts` names the action for that state and key.
3. `src/codemirror/lineKeys/actions.ts` runs it.

To change what a key does, change a cell of the table. To add a behaviour, add an action and name it in a cell.

What the table does not hold:

- **CodeMirror's Enter.** `continueMarkup` and `newline` run CodeMirror's own commands. The table decides that they run; how a list or a quote carries on to the new line is CodeMirror's.
- **Code blocks and tables.** `blockRule` leaves the key to their rules (`interaction-spec.md` §8.4, §12).
- **The space after a split.** `interaction/splitSpace.ts` drops it from the result of any Enter.
- **A selection.** A key pressed with one is not a line key.
- **Four guards inside actions**, where the two lines do not settle the answer: `markerToIndent` asks the parser whether the line stays in its item, `removeIndent` whether it is in one, `joinHeadingAbove` whether a code fence is above, and `deleteAfter` whether a table is below.

The files below are the same rules seen from outside: every state the editor can be put in, and what the key did there.

| File | What it is |
| --- | --- |
| `line-keys.tsv` | One rule per state and key, with a document that shows it. Read off the editor. |
| `line-keys.uncovered.tsv` | Places a key leaves the caret that no rule starts from. |
| `LineKeysRules.tla` | The same rules as TLA+ data. Generated. |
| `LineKeys.tla`, `LineKeys.cfg` | The model and the properties TLC checks. Written by hand. |

## State

A state is the pair of lines at the caret and where the caret is in its line:

- the kind of the caret's line and of the line above it (below it, for Delete);
- the caret at the `start`, `middle` or `end` of the text, or `blank` on a line with no text;
- `loose`, in a list with an empty line between two of its items.

The parser decides each kind (`src/codemirror/lineKeys/lineKind.ts`). An outcome names the lines the pair became, as written, and where the caret is among them.

## How the table is made

`src/codemirror/lineKeys/explore.ts` builds every combination of line, line above, and surrounding document. It presses each key through the editor's own bindings (`editingStack.ts`, the list the component loads) and records the result.

`lineKeys.test.ts` then checks four things:

- **One outcome per state.** Two documents in the same state give the same outcome. A failure means a rule depends on something further away than the two lines.
- **The table.** The rules equal `line-keys.tsv`. A change of behaviour shows as changed rows.
- **Closure.** A key leaves the caret only in a state the table covers, apart from the places in `line-keys.uncovered.tsv`.
- **Progress.** Every Backspace rule lowers (structure, length, caret position), in that order. Backspace held down therefore ends at the start of the document.

After a change that is meant:

```bash
pnpm vitest run src/codemirror/lineKeys -u
```

Read the diff of `line-keys.tsv` before you commit it.

## The TLA+ model

`LineKeys.tla` reads the rules and checks, over every sequence of keys:

- the machine never reaches a state outside the table without leaving the model (`TypeOK`);
- each state has at most one rule per key (`Deterministic`);
- Backspace has a rule in every state (`BackspaceCovered`);
- Enter at the end of a line can be undone by Backspace, in at most two presses (`EnterUndone`). In a list it takes two: the first removes the new item's marker.

A rule's `next` is every covered state that reads as the lines the rule leaves. That is a superset of what the editor does, so a property that holds in the model holds in the editor.

Run it from `model/`, with `tla2tools.jar` from the TLA+ releases in `.tools/`:

```bash
java -cp ../.tools/tla2tools.jar tlc2.TLC -config LineKeys.cfg LineKeys.tla
```

Expect `Model checking completed. No error has been found.`.

Code blocks and tables are outside the model. Their keys have their own rules (`interaction-spec.md` §8.4, §12).
