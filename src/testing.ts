/**
 * For a host's own tests: the editor explored with the host's modules
 * mounted, and held to the checks the editor's own line keys are held to.
 * Needs a DOM, and is not for an application bundle.
 */
export { CHECKS, checkLineKeys, type LineKeyReport } from "./codemirror/lineKeys/check";
export { type Host, type Rule, type Transition } from "./codemirror/lineKeys/explore";
export { CARET, marked, mount, press, unmount } from "./codemirror/lineKeys/drive";
