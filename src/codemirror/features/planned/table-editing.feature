Feature: Table editing — the full interaction surface (ADR 0001)

  The redesign's contract, written before the implementation. Every scenario is
  tagged with its test tier: @pure runs in Node against the table model/bridge
  rules; @browser runs in real WebKit (vitest.browser.config.ts) because it
  depends on layout, caret geometry, focus, or native selection — the things
  jsdom silently green-lights. Scenarios are wired to step definitions as the
  CellEditingSurface spike lands; until then this file is the reviewed spec.
  It lives in planned/ because the sibling runner globs ./*.feature and fails
  any scenario without steps — move it up one level as steps are written.

  Background:
    Given the document contains the table:
      """
      | Name | Role |
      | --- | --- |
      | Ada | Engineer |
      | Lin | Designer |
      """

  # ── 1–2. The document around the table ────────────────────────────────

  @browser
  Scenario: Arrow down from prose above enters the first cell
    Given the caret is on a prose line directly above the table
    When I press "ArrowDown"
    Then the caret is inside the "Name" header cell

  @browser
  Scenario: Arrow down from the last row exits below the table
    Given the caret is in the "Lin" cell
    When I press "ArrowDown"
    Then the caret is in the main document directly below the table

  @browser
  Scenario: Arrow up from the header exits above the table
    Given the caret is in the "Name" header cell
    When I press "ArrowUp"
    Then the caret is in the main document directly above the table

  # ── 3. Click goes exactly where clicked ───────────────────────────────

  @browser
  Scenario: Clicking mid-word in a cell places the caret at that character
    When I click between "A" and "d" in the "Ada" cell
    Then the caret is in the "Ada" cell at offset 1
    And typing "x" produces "Axda" in that cell

  @browser
  Scenario: Clicking an empty cell shows a visible caret in that cell
    Given the table has an empty cell
    When I click the empty cell
    Then that cell has focus and a visible caret
    And the main editor selection did not move

  # ── 4. Arrows inside a cell vs at its edges ───────────────────────────

  @browser
  Scenario: Arrows move within the cell text first
    Given the caret is in the "Ada" cell at offset 1
    When I press "ArrowRight"
    Then the caret is in the "Ada" cell at offset 2

  @pure
  Scenario: Arrow right at the cell's last offset targets the next cell
    Given the bridge state is row 1, column 0, offset 3 in cell "Ada"
    When the bridge receives "ArrowRight"
    Then the bridge action is "focus cell row 1 column 1 at offset 0"

  @pure
  Scenario: Arrow left at offset 0 targets the previous cell's end
    Given the bridge state is row 1, column 1, offset 0 in cell "Engineer"
    When the bridge receives "ArrowLeft"
    Then the bridge action is "focus cell row 1 column 0 at its last offset"

  @browser
  Scenario: Tab and Shift-Tab step through cells
    Given the caret is in the "Ada" cell
    When I press "Tab"
    Then the caret is inside the "Engineer" cell
    When I press "Shift-Tab"
    Then the caret is inside the "Ada" cell

  # ── 5. The mouse cannot fall out of the table ─────────────────────────

  @browser
  Scenario: Clicking anywhere on the table never moves the main caret
    Given the main caret is parked in prose above the table
    When I click each cell of the table in turn
    Then the main editor selection never changes
    And no caret ever renders above or below the table

  # ── 6–9. Structure commands ───────────────────────────────────────────

  @pure
  Scenario: Add a row below the current row
    When the "add row below" command runs from the "Ada" cell
    Then the table source gains one body row after row 1
    And every cell of the new row is empty

  @pure
  Scenario: Add a column after the current column
    When the "add column after" command runs from the "Name" header
    Then every row gains one cell after column 0
    And the delimiter row gains one "---" cell

  @pure
  Scenario: Delete the current row
    When the "delete row" command runs from the "Ada" cell
    Then the table source has one body row and it contains "Lin"

  @pure
  Scenario: Delete the current column
    When the "delete column" command runs from the "Role" header
    Then every row has exactly one cell
    And no cell contains "Engineer"

  # ── 10. Delete the whole table ────────────────────────────────────────

  @pure
  Scenario: Delete table removes exactly the table's source range
    When the "delete table" command runs
    Then the table's source lines are gone
    And the surrounding prose is untouched

  # ── 11–13. Visual selection of row / column / table ───────────────────

  @browser
  Scenario: Drag across cells selects whole cells, not ragged text
    When I press the mouse in the "Ada" cell and release in the "Designer" cell
    Then cells (1,0) through (2,1) render as selected
    And the native text selection is empty

  @browser
  Scenario: Copying a cell selection yields TSV
    Given cells (1,0) through (2,1) are selected
    When I copy
    Then the clipboard contains "Ada\tEngineer\nLin\tDesigner"

  @pure
  Scenario: Select-column resolves to every cell in that column
    When the "select column" command runs from the "Role" header
    Then the selection set is cells (0,1) (1,1) (2,1)

  # ── 14. Backspace and Delete ──────────────────────────────────────────

  @browser
  Scenario: Backspace mid-cell deletes one character in the cell
    Given the caret is in the "Ada" cell at offset 2
    When I press "Backspace"
    Then the cell contains "Aa"
    And the table structure is unchanged

  @pure
  Scenario: Backspace at offset 0 of a cell is a bridge decision, not a merge
    Given the bridge state is row 1, column 1, offset 0
    When the bridge receives "Backspace"
    Then the bridge action is "focus cell row 1 column 0 at its last offset"
    And the table source is unchanged

  # ── 15. Context menu ──────────────────────────────────────────────────

  @browser
  Scenario: Right-click on a cell opens the structure menu for that position
    When I right-click the "Lin" cell
    Then the table menu opens
    And its commands target row 2, column 0

  # ── Cross-cutting: the two spike gate conditions (ADR §Editing surface) ─

  @browser
  Scenario: A widget redraw mid-edit never loses the active cell edit
    Given I am typing in the "Ada" cell
    When an unrelated document change forces the table widget to update
    Then my in-progress cell text and caret position survive

  @browser
  Scenario: An external edit to another cell mid-edit merges cleanly
    Given I am typing "Ada2" in the "Ada" cell
    When the document changes "Designer" to "Writer" externally
    Then committing my edit produces a table containing both "Ada2" and "Writer"

  @browser
  Scenario: Undo after a cell edit is one step and CM-owned
    Given I typed "X" into the "Ada" cell and committed
    When I press "Mod-z"
    Then the table source shows "Ada" again
    And the undo happened in the main editor history
