Feature: Block commands — blockquote

  A blockquote is a container, not a line type: it toggles the `>` marker on the
  current line (or every line of a selection) and composes with whatever the line
  already is — quoting a heading keeps the heading.

  Scenario: Quote a line
    Given the document:
      """
      ‸To be or not to be
      """
    When I "toggle a blockquote"
    Then the document is:
      """
      > To be or not to be
      """

  Scenario: Unquote a line
    Given the document:
      """
      > ‸To be or not to be
      """
    When I "toggle a blockquote"
    Then the document is:
      """
      To be or not to be
      """

  Scenario: Quote every line of a multi-line selection
    Given the document:
      """
      ‸first
      second‸
      """
    When I "toggle a blockquote"
    Then the document is:
      """
      > first
      > second
      """

  Scenario: Quoting composes with the line's existing type
    Given the document:
      """
      ## ‸Section
      """
    When I "toggle a blockquote"
    Then the document is:
      """
      > ## ‸Section
      """
