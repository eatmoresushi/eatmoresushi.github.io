/**
 * Focus rescue (UI_V1.6.1_ARCHITECTURE §8.2). Owner: B1 (shell, log, lobby).
 *
 * Phase A stub created by A2 (§4.3 rule 1), with the final shape. B1 fills in: on `focusin`,
 * record the nearest `[data-focus-fallback]` container; after each commit, if
 * `document.activeElement` is `<body>`, focus that container's heading, or the pane heading if
 * the container is gone too (a Place button after placing, an Order card after completion).
 */

/** Installs focus rescue on `root`; returns the cleanup (stub: does nothing yet). */
export function installFocusRescue(_root: HTMLElement): () => void {
  return () => undefined;
}

/** Runs the rescue once after a commit (stub: does nothing yet). */
export function rescueFocus(_root: HTMLElement): void {
  // B1.
}
