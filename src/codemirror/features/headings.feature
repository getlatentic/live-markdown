Feature: Block commands — headings

  A heading is a line type. Applying it replaces whatever the line was — a plain
  line, a list item, or another heading level — and applying the same level
  again turns it back into a plain line. The caret stays with the text, never
  stranded before the marker.

  Scenario: Promote a plain line to a heading
    Given the document:
      """
      ‸My title
      """
    When I "toggle heading 2"
    Then the document is:
      """
      ## ‸My title
      """

  Scenario: Toggle the same heading level back off
    Given the document:
      """
      ## ‸My title
      """
    When I "toggle heading 2"
    Then the document is:
      """
      ‸My title
      """

  Scenario: Swap one heading level for another in place
    Given the document:
      """
      # ‸My title
      """
    When I "toggle heading 2"
    Then the document is:
      """
      ## ‸My title
      """

  Scenario: A heading replaces a bullet marker rather than stacking on it
    Given the document:
      """
      - ‸Buy milk
      """
    When I "toggle heading 2"
    Then the document is:
      """
      ## ‸Buy milk
      """

  Scenario: A heading replaces an ordered marker too
    Given the document:
      """
      1. ‸Buy milk
      """
    When I "toggle heading 2"
    Then the document is:
      """
      ## ‸Buy milk
      """

  Scenario: Apply a heading to every line of a multi-line selection
    Given the document:
      """
      ‸first
      second‸
      """
    When I "toggle heading 3"
    Then the document is:
      """
      ### first
      ### second
      """

  Scenario: Heading 1 then 3 keeps swapping the level, never stacking markers
    Given the document:
      """
      ‸note
      """
    When I "toggle heading 1"
    And I "toggle heading 3"
    Then the document is:
      """
      ### note
      """
