Feature: Block commands — table

  Inserting a table drops a 2×2 GFM skeleton on its own block — in place on a
  blank line, otherwise pushed below the current line with a separating blank
  line — and selects the first header cell so you can name the column.

  Scenario: Insert a table on a blank line and select the first header
    Given the document:
      """
      ‸
      """
    When I "insert a table"
    Then the document is:
      """
      | ‸Header‸ | Header |
      | --- | --- |
      | Cell | Cell |
      """

  Scenario: Push the table below the current line with a blank separator
    Given the document:
      """
      Some prose‸
      """
    When I "insert a table"
    Then the document is:
      """
      Some prose

      | Header | Header |
      | --- | --- |
      | Cell | Cell |
      """

  Scenario: Reuse an existing blank line instead of adding another
    Given the document:
      """
      Some prose
      ‸
      """
    When I "insert a table"
    Then the document is:
      """
      Some prose
      | Header | Header |
      | --- | --- |
      | Cell | Cell |
      """
