/**
 * Caret, click, and delete invariants of Rich Edit Mode (the interaction
 * spec): the caret never lands inside hidden markup, backspace deletes
 * visible content first, clicks resolve to visible positions, and typed
 * whitespace can't dissolve emphasis.
 */
export * from "./clickModel";
export * from "./cursorModel";
export * from "./deleteNormalizer";
export * from "./flankingGuard";
export * from "./visiblePosition";
