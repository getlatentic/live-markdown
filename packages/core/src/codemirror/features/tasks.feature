Feature: Block commands — task list

  A task list toggles a `- [ ] ` checkbox on the current line (or every line of a
  selection) — a line type alongside bullets and numbers, replacing any other
  marker on the line.

  Scenario: Turn a plain line into a task
    Given the document:
      """
      ‸write tests
      """
    When I "toggle a task list"
    Then the document is:
      """
      - [ ] write tests
      """

  Scenario: Toggle a task back off
    Given the document:
      """
      - [ ] ‸write tests
      """
    When I "toggle a task list"
    Then the document is:
      """
      write tests
      """

  Scenario: A bullet becomes a task, gaining a checkbox
    Given the document:
      """
      - ‸buy milk
      """
    When I "toggle a task list"
    Then the document is:
      """
      - [ ] buy milk
      """

  Scenario: A heading becomes a task (markers are mutually exclusive)
    Given the document:
      """
      ## ‸section
      """
    When I "toggle a task list"
    Then the document is:
      """
      - [ ] section
      """

  Scenario: Make every line of a selection a task
    Given the document:
      """
      ‸first
      second‸
      """
    When I "toggle a task list"
    Then the document is:
      """
      - [ ] first
      - [ ] second
      """
