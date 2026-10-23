/**
 * Smoke test of the V1.6.1 app (UI_V1.6.1_ARCHITECTURE §10.2 A2 acceptance, §9.6). Created by
 * A2; owned by B6 after phase A. Runs at 1440 only: the `desktop-1440` project against
 * `npm run dev:local`, and the `ci-smoke` project against `vite preview` of `npm run build:e2e`.
 *
 * Through the real store, client and local backend (`/test-api-v161`): one human creates a room,
 * adds two computers, starts, sees live revisions in the (stub) panes, and finishes a full game
 * by pressing the dev canonical-move button whenever it is their decision. It drives only the
 * test-driver hooks (`name`, `data-action`, `data-window`, `data-dev`), which the phase B
 * screens keep. The work turn hides the decision pane until a placement is chosen on the table
 * (owner review, 2026-10-17), and the dev button with it: there it is pressed with a dispatched
 * click (it is a dev tool, not a player's control; the forms are played in `full_game.spec`).
 */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { resetBackend } from "./support/localBackend.ts";

const SMOKE_WIDTH = 1440;
const MAX_MOVES = 1_500;

// Decided from the `viewport` option alone, so the other projects skip without launching a
// browser (the phone and tablet projects use WebKit).
test.skip(({ viewport }) => viewport?.width !== SMOKE_WIDTH, "the smoke test runs at 1440 only (desktop-1440, ci-smoke)");

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

test("one human and two computers play a full game with the canonical-move button", async ({ page, request }) => {
  test.setTimeout(600_000);
  await resetBackend(request, { seed: 720, policy: "canonical" });
  const errors = collectErrors(page);

  await page.goto("next/");
  await expect(page).toHaveTitle(/Kiln Opening/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", /^(light|dark)$/);

  // Home → lobby.
  await page.locator('input[name="displayName"]').fill("Lin");
  await page.locator('[data-action="create-room"]').click();
  await expect(page.locator("[data-room-code]")).toBeVisible();
  await page.locator('[data-action="add-computer"]').click();
  await expect(page.locator("[data-seat-index]")).toHaveCount(2);
  await page.locator('[data-action="add-computer"]').click();
  await expect(page.locator("[data-seat-index]")).toHaveCount(3);

  // Lobby → game.
  await page.locator('[data-action="start-game"]').click();
  const pane = page.locator("aside.pane");
  await expect(pane).toBeVisible();
  await expect(page.locator("form.pane-form")).toHaveAttribute("data-window", /.+/);
  const firstRevision = Number(await pane.getAttribute("data-revision"));

  // Play: press the canonical move whenever it is our decision, until the final window.
  const final = page.locator('form[data-window="final"]');
  const ready = page.locator('form[data-window="final"], [data-dev="canonical-move"]:not([aria-disabled]):not([aria-busy])');
  const canonical = page.locator('[data-dev="canonical-move"]');
  const windowsSeen = new Set<string>();
  let moves = 0;
  let lastRevision = firstRevision;
  while (moves < MAX_MOVES) {
    // Attached, not visible: during the work turn the button sits in the hidden pane.
    await expect(ready.first()).toBeAttached({ timeout: 60_000 });
    if (await final.isVisible()) break;
    const revision = Number(await pane.getAttribute("data-revision"));
    expect(revision).toBeGreaterThanOrEqual(lastRevision);
    lastRevision = revision;
    windowsSeen.add((await page.locator("form.pane-form").getAttribute("data-window")) ?? "");
    if (await canonical.isVisible()) await canonical.click();
    else await canonical.dispatchEvent("click");
    moves += 1;
    // Wait for the answer: the button is busy while sending, then the view moves on.
    await expect(page.locator('[data-dev="canonical-move"][aria-busy]')).toHaveCount(0, { timeout: 60_000 });
  }

  await expect(final).toBeVisible();
  const finalRevision = Number(await pane.getAttribute("data-revision"));
  expect(finalRevision).toBeGreaterThan(firstRevision);
  expect(moves).toBeGreaterThan(20);
  expect(moves).toBeLessThan(MAX_MOVES);
  for (const kind of ["kiln_selection", "work"]) expect([...windowsSeen], kind).toContain(kind);
  await expect(page.locator('form[data-window="final"] ~ * [data-dev="canonical-move"]')).toHaveCount(0);
  expect(errors).toEqual([]);
  test.info().annotations.push({ type: "moves", description: `${moves} human moves; revisions ${firstRevision} → ${finalRevision}; windows ${[...windowsSeen].sort().join(", ")}` });
});
