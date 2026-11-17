Feature: Block commands — code block

  Toggling a code block wraps the current line (or selection) in a ``` fence and
  drops the caret inside, and unwraps it when the fences are already there.

  Scenario: Wrap a line in a fenced code block
    Given the document:
      """
      const x = 1‸
      """
    When I "toggle a code block"
    Then the document is:
      """
      ```
      ‸const x = 1
      ```
      """

  Scenario: Unwrap an existing fenced code block
    Given the document:
      """
      ```
      const x = 1‸
      ```
      """
    When I "toggle a code block"
    Then the document is:
      """
      const x = 1
      """
