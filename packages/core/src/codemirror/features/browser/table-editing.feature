Feature: Table editing — the full interaction surface (ADR 0001)

  The redesign's contract, wired to step definitions in
  tablev2/tableEditingSteps.ts and run IN REAL WEBKIT by
  tablev2/tableEditing.feature.browser.test.ts (this directory is outside the
  jsdom runner's ./*.feature glob). @pure scenarios exercise the bridge/model
  math directly; @browser scenarios drive the real surface with real events.

  Background:
    Given a document with prose around this table:
      """
      | Name | Role |
      | --- | --- |
      | Ada | Engineer |
      | Lin | Designer |
      """

  # ── 1–2. The document around the table ────────────────────────────────

  @browser
  Scenario: Arrow down from the line above enters the first cell
    Given the caret is on the line directly above the table
    When I press "ArrowDown"
    Then the caret is inside the "Name" cell

  @browser
  Scenario: Arrow down from the last row exits below the table
    Given the caret is in the "Lin" cell
    When I press "ArrowDown"
    Then the caret is in the main document directly below the table

  @browser
  Scenario: Arrow up from the header exits above the table
    Given the caret is in the "Name" cell
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
    Given the table has an empty row
    When I click the empty row's first cell
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
    Given the bridge state is row 1, column 0, offset 3, length 3
    When the bridge receives "ArrowRight"
    Then the bridge targets row 1, column 1 at the start

  @pure
  Scenario: Arrow left at offset 0 targets the previous cell's end
    Given the bridge state is row 1, column 1, offset 0, length 8
    When the bridge receives "ArrowLeft"
    Then the bridge targets row 1, column 0 at the end

  @browser
  Scenario: Tab and Shift-Tab step through cells
    Given the caret is in the "Ada" cell
    When I press "Tab"
    Then the caret is inside the "Engineer" cell
    When I press "Shift-Tab"
    Then the caret is inside the "Ada" cell

  # ── 5. The mouse cannot fall out of the table ─────────────────────────

  @browser
  Scenario: Clicking cells never moves the main caret
    Given the main caret is parked in the prose above the table
    When I click each body cell of the table in turn
    Then the main editor selection never changes
    And the drawn caret stays hidden while a cell is edited

  # ── 6–10. Structure commands ──────────────────────────────────────────

  @pure
  Scenario: Add a row below the current row
    When the "add row below" command runs from the "Ada" cell
    Then the table has 3 body rows
    And every cell of body row 2 is empty

  @pure
  Scenario: Add a column after the current column
    When the "add column after" command runs from the "Name" cell
    Then every row has 3 cells
    And the delimiter row gains one "---" cell

  @pure
  Scenario: Delete the current row
    When the "delete row" command runs from the "Ada" cell
    Then the table has 1 body row and it contains "Lin"

  @pure
  Scenario: Delete the current column
    When the "delete column" command runs from the "Role" cell
    Then every row has 1 cell
    And no cell contains "Engineer"

  @pure
  Scenario: Delete table removes exactly the table's source range
    When the "delete table" command runs from the "Ada" cell
    Then the table's source lines are gone
    And the surrounding prose is untouched

  # ── 11–13. Visual selection of row / column / table ───────────────────

  @browser
  Scenario: Drag across cells selects whole cells, not ragged text
    When I press the mouse in the "Ada" cell and release in the "Designer" cell
    Then cells 1,0 through 2,1 render as selected
    And the native text selection is empty

  @browser
  Scenario: Copying a cell selection yields TSV
    Given cells 1,0 through 2,1 are selected
    When I copy
    Then the clipboard contains the selected cells as TSV

  @pure
  Scenario: Select-column resolves to every cell in that column
    When column 1 of a 3-row grid is selected
    Then the selection set is cells 0,1 and 1,1 and 2,1

  @browser
  Scenario: The menu's Select column paints the whole column
    When I right-click the "Ada" cell
    And I choose "Select column" from the table menu
    Then 3 cells render as selected

  # ── 14. Backspace and Delete ──────────────────────────────────────────

  @browser
  Scenario: Backspace mid-cell deletes one character in the cell
    Given the caret is in the "Ada" cell at offset 2
    When I press "Backspace"
    Then the "Ada" cell now contains "Aa"
    And the table structure is unchanged

  @pure
  Scenario: Backspace at offset 0 navigates, never merges
    Given the bridge state is row 1, column 1, offset 0, length 8
    When the bridge receives "Backspace"
    Then the bridge targets row 1, column 0 at the end

  # ── 15. Context menu ──────────────────────────────────────────────────

  @browser
  Scenario: Right-click opens the structure menu targeting that cell
    When I right-click the "Lin" cell
    Then the table menu opens
    And choosing "Insert row below" inserts a row after the "Lin" row

  # ── Cross-cutting: the spike gate conditions (ADR §Editing surface) ───

  @browser
  Scenario: A widget update mid-edit never loses the active cell edit
    Given I am typing "Q" at the end of the "Ada" cell
    When an unrelated document change forces the table widget to update
    Then my in-progress text and caret survive
    And further typing still lands at the caret

  @browser
  Scenario: An external edit to another cell merges cleanly
    Given I am typing "2" at the end of the "Ada" cell
    When the document changes "Designer" to "Writer" externally
    Then committing my edit produces a table containing both "Ada2" and "Writer"

  @browser
  Scenario: Undo after a cell edit is one step and CM-owned
    Given I typed "X" into the "Ada" cell and committed
    When I press "Mod-z"
    Then the table source shows "Ada" again
    And redo restores the committed edit
