/**
 * The paint engine: the NodeRule/Paint rendering contract, the canonical
 * rules table, the viewport painter, the base theme, and the host-environment
 * facets. Every other feature folder builds on these.
 *
 * Folder front doors (this file and its siblings) are for composition roots —
 * the package index, the editor shell, and `extensions/`. Feature-folder
 * modules import each other by concrete module path instead, so module
 * initialization order never depends on a barrel's export order.
 *
 * Engine-internal, deliberately not re-exported: `registry` (consumed by the
 * painter and the table cell renderer), `lineStructure`, `hrWidget`, and
 * `editorTestHarness` (test-only — it pulls the whole extension set).
 */
export * from "./paint";
export * from "./plugin";
export * from "./editorTheme";
export * from "./hostFacets";
