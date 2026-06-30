Feature: Block commands — lists

  Bullet and ordered lists toggle on the current line, convert between each
  other in place, and apply to every line of a multi-line selection.

  Scenario: Turn a plain line into a bullet
    Given the document:
      """
      ‸Buy milk
      """
    When I "toggle a bullet list"
    Then the document is:
      """
      - Buy milk
      """

  Scenario: Toggle a bullet back off
    Given the document:
      """
      - ‸Buy milk
      """
    When I "toggle a bullet list"
    Then the document is:
      """
      Buy milk
      """

  Scenario: Convert an ordered item to a bullet
    Given the document:
      """
      1. ‸Buy milk
      """
    When I "toggle a bullet list"
    Then the document is:
      """
      - Buy milk
      """

  Scenario: Turn a plain line into an ordered item
    Given the document:
      """
      ‸Buy milk
      """
    When I "toggle an ordered list"
    Then the document is:
      """
      1. Buy milk
      """

  Scenario: Convert a bullet to an ordered item
    Given the document:
      """
      - ‸Buy milk
      """
    When I "toggle an ordered list"
    Then the document is:
      """
      1. Buy milk
      """

  Scenario: Number every line of a multi-line selection
    Given the document:
      """
      ‸first
      second‸
      """
    When I "toggle an ordered list"
    Then the document is:
      """
      1. first
      2. second
      """

  Scenario: Bullet every line of a multi-line selection
    Given the document:
      """
      ‸first
      second‸
      """
    When I "toggle a bullet list"
    Then the document is:
      """
      - first
      - second
      """

  Scenario: Bulleting a partly-bulleted selection makes every line a bullet
    Given the document:
      """
      ‸- a
      b‸
      """
    When I "toggle a bullet list"
    Then the document is:
      """
      - a
      - b
      """

  Scenario: A list toggles off only when every line is already a bullet
    Given the document:
      """
      ‸- a
      - b‸
      """
    When I "toggle a bullet list"
    Then the document is:
      """
      a
      b
      """

  Scenario: Numbering a mixed selection renumbers it sequentially from 1
    Given the document:
      """
      ‸3. a
      b‸
      """
    When I "toggle an ordered list"
    Then the document is:
      """
      1. a
      2. b
      """

  Scenario: A bullet replaces a heading marker rather than stacking on it
    Given the document:
      """
      ## ‸Section
      """
    When I "toggle a bullet list"
    Then the document is:
      """
      - ‸Section
      """

  Scenario: An ordered item replaces a heading marker too
    Given the document:
      """
      ## ‸Section
      """
    When I "toggle an ordered list"
    Then the document is:
      """
      1. ‸Section
      """
