Feature: Block commands — list indent / outdent

  Tab nests a list item one level under its preceding sibling — by the parent
  marker's width, so the result parses as a CommonMark sublist — and Shift-Tab
  promotes it back. A freshly nested ordered item restarts at 1. Tab on the
  first item of a level (nothing to nest under) and Shift-Tab at the top level
  leave the document unchanged.

  Scenario: Tab nests an ordered item under its sibling, restarting at 1
    Given the document:
      """
      1. first
      2. ‸second
      """
    When I "indent the list item"
    Then the document is:
      """
      1. first
         1. second
      """

  Scenario: Tab nests a bullet under its sibling by two columns
    Given the document:
      """
      - first
      - ‸second
      """
    When I "indent the list item"
    Then the document is:
      """
      - first
        - second
      """

  Scenario: Tab on the first item does nothing — nothing to nest under
    Given the document:
      """
      1. ‸only
      """
    When I "indent the list item"
    Then the document is:
      """
      1. only
      """

  Scenario: Shift-Tab outdents a nested item back to the top level
    Given the document:
      """
      - first
        - ‸second
      """
    When I "outdent the list item"
    Then the document is:
      """
      - first
      - second
      """

  Scenario: Shift-Tab at the top level does nothing
    Given the document:
      """
      - ‸item
      """
    When I "outdent the list item"
    Then the document is:
      """
      - item
      """
