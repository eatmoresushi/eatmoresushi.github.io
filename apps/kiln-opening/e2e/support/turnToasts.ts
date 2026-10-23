/**
 * The other players' turn toast in the e2e drivers (owner review 2026-10-17, item 3). Owner: B1.
 *
 * The toast is drawn over nothing: it sits at the top of the world's cell, in a band the world
 * gives up while it shows (the table scrolls by the band, so it keeps its place on screen; a
 * control with the keyboard focus ring stays in view, the table moving down instead), under
 * the jump bar on desktop and tablet (a row of its own above the world, which never scrolls under
 * it) and under the top bar on phones. What the band takes from the top of the table is scrolled
 * out of view, not covered. The queue has no cap, so a toast can stay for many turns in a row;
 * the drivers never need to press its ×: they bring a table target into sight, as a player would
 * scroll to it, and, should anything still lie over its centre (a regression), scroll it to the
 * middle of the world.
 */
import type { Locator } from "@playwright/test";

/** Whether something other than `target` (the jump bar, the turn toast) lies over its centre. */
async function covered(target: Locator): Promise<boolean> {
  return target
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit !== null && !element.contains(hit) && hit.closest(".jump-nav, .turn-toasts") !== null;
    })
    .catch(() => false);
}

/** Scrolls `target` into sight, clear of the jump bar and the turn toast, so a real pointer click reaches it. */
export async function revealPastTurnToast(target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => undefined);
  if (!(await covered(target))) return;
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" })).catch(() => undefined);
}
