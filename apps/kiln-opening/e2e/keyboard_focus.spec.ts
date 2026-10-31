/**
 * A keyboard player's focus while the other players' turns show (owner review 2026-10-17, items 2
 * and 3; UI_V1.6.1_ARCHITECTURE §8.2, §9.6). Owner: B6. Runs at 1440 only (desktop-1440), against
 * `npm run dev:local`.
 *
 * At the start of the viewer's work turn the decision pane hides and focus goes back to the
 * table: to the Place shortcut the player used, which the world scrolls into view when the focus
 * ring shows (`state/pane.ts`, `focusTable`). The other players' turn toasts then open a band at
 * the top of the world's cell, and the world scrolls by as much so the table keeps its place
 * (`shell/toastRoom.ts`), but never the keyboard focus out of view: the world scrolls only as far
 * as keeps it in view, and the table moves down for the rest.
 *
 * One human on the keyboard only and two computers. The Kiln selection is made with the dev
 * canonical-move button. Then, for three work turns, the human focuses Canal Wharf's Place
 * shortcut for an Apprentice (the location is never full), presses Enter, focuses Confirm,
 * scrolls the world to its bottom (the table out of view, as after the Guild Hall's jump to the
 * Tech display) and presses Enter. The computers play, the turn comes back with the shortcut
 * focused again, and their toasts show. A frame sampler records every frame in which a control
 * with the focus ring in the world lies above the world's top edge: there must be none, and some
 * frames must have shown that focus in view with a toast up.
 *
 * A second test checks the split Confirm's keys in a real browser (owner UI decision D21;
 * `DecisionPane`): Enter sends the command with `endTurn: true` from the heading the pane focuses,
 * Shift+Enter sends it without the field, a held Enter (the one that pressed Place) confirms nothing,
 * and Enter on the focused primary button sends one command, not two. A placement that cannot open the
 * after-action step has no second button.
 *
 * A third test plays to an Order Phase turn with something to do and checks a real keyboard there:
 * Enter on the heading and on an unchosen radio ends nothing, the radio's Enter chooses it, and Done
 * ends the turn only with its own press.
 */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { resetBackend } from "./support/localBackend.ts";

const WIDTH = 1440;
const TURNS = 3;

// Decided from the viewport alone, so the other projects skip without launching a browser.
test.skip(({ viewport }) => viewport?.width !== WIDTH, "runs at 1440 only (desktop-1440)");

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

interface FocusFrames {
  /** Frames with the focus ring on a control in the world above the world's top edge. */
  hidden: Array<{ label: string; top: number; worldTop: number }>;
  /** Frames with the focus ring on a control in the world, in view, while a turn toast showed. */
  inViewWithToast: number;
  stop: boolean;
}

/** Installs the frame sampler in the page (serialized: self-contained). */
function sampleFocusFrames(): void {
  const record: FocusFrames = { hidden: [], inViewWithToast: 0, stop: false };
  (window as unknown as { __focusFrames: FocusFrames }).__focusFrames = record;
  const frame = (): void => {
    if (record.stop) return;
    const world = document.querySelector<HTMLElement>(".shell-world");
    const active = document.activeElement;
    if (world !== null && active instanceof HTMLElement && active !== world && world.contains(active) && active.getClientRects().length > 0 && active.matches(":focus-visible")) {
      const top = active.getBoundingClientRect().top;
      const worldTop = world.getBoundingClientRect().top;
      if (top < worldTop - 0.5) {
        record.hidden.push({ label: active.getAttribute("aria-label") ?? active.textContent?.slice(0, 40) ?? active.tagName, top: Math.round(top), worldTop: Math.round(worldTop) });
      } else if (document.querySelector(".turn-toast") !== null) {
        record.inViewWithToast += 1;
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

async function revisionOf(page: Page): Promise<number> {
  return Number((await page.locator("aside.pane").getAttribute("data-revision")) ?? "0");
}

/** The game commands this page sends, in order. */
function recordCommands(page: Page): Array<{ type: string; endTurn?: boolean }> {
  const sent: Array<{ type: string; endTurn?: boolean }> = [];
  page.on("request", (request) => {
    if (!request.url().includes("/test-api-v161") || request.method() !== "POST") return;
    const body = request.postDataJSON() as { operation?: string; command?: { type: string; endTurn?: boolean } } | null;
    if (body?.operation === "game_action" && body.command !== undefined) sent.push(body.command);
  });
  return sent;
}

test("the split Confirm: Enter ends the turn, Shift+Enter does not, a held Enter confirms nothing", async ({ page, request }) => {
  test.setTimeout(240_000);
  await resetBackend(request, { seed: 720, policy: "canonical" });
  const errors = collectErrors(page);
  await page.goto("./");
  await page.locator('input[name="displayName"]').fill("Lin");
  await page.locator('[data-action="create-room"]').click();
  await expect(page.locator("[data-room-code]")).toBeVisible();
  await page.locator('[data-action="add-computer"]').click();
  await expect(page.locator("[data-seat-index]")).toHaveCount(2);
  await page.locator('[data-action="start-game"]').click();
  await expect(page.locator("aside.pane")).toBeAttached();

  const placing = page.locator('[data-shell][data-pane="hidden"]');
  const canonical = page.locator('[data-dev="canonical-move"]:not([aria-disabled]):not([aria-busy])');
  for (let move = 0; move < 10; move += 1) {
    await expect(placing.or(canonical).first()).toBeAttached({ timeout: 60_000 });
    if ((await placing.count()) > 0) break;
    await canonical.first().dispatchEvent("click");
    await expect(page.locator('[data-dev="canonical-move"][aria-busy]')).toHaveCount(0, { timeout: 60_000 });
  }
  await expect(placing).toHaveCount(1);

  const sent = recordCommands(page);
  const heading = page.locator("aside.pane h2");
  const primary = page.locator('aside.pane [data-action="confirm"]');
  const secondary = page.locator('aside.pane [data-action="confirm-stay"]');
  const place = (worker: "apprentice" | "shifu") => page.locator(`[data-act="place"][data-location-id="canal_wharf"][data-worker="${worker}"]`).first();
  /** Waits for the command to be answered and the viewer's next work turn. */
  const answered = async (count: number) => {
    await expect.poll(() => sent.length, { timeout: 30_000 }).toBe(count);
    await expect(placing).toHaveCount(1, { timeout: 60_000 });
  };

  // An Apprentice at Canal Wharf: pressed with a held Enter. The repeat lands on the heading the pane
  // focused, and confirms nothing. Round 1 holds nothing the after-action step could open on, and this
  // placement cannot change that: there is one button.
  await place("apprentice").focus();
  await page.keyboard.down("Enter");
  await expect(heading).toBeFocused();
  await page.keyboard.down("Enter");
  await page.keyboard.up("Enter");
  await expect(primary).toHaveText("Place · end turn");
  await expect(secondary).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(sent, "a held Enter sent nothing").toEqual([]);
  // Enter from the heading: the default, in one command.
  await page.keyboard.press("Enter");
  await answered(1);
  expect(sent[0]).toMatchObject({ type: "PLACE_CANAL_WHARF", endTurn: true });

  // The Shifu at Canal Wharf brings an Order into the hand, but with no Finished ceramic that opens
  // nothing either: one button. Shift+Enter from the heading still sends no field, and the engine
  // ends the turn by itself (R27).
  await place("shifu").focus();
  await page.keyboard.press("Enter");
  await expect(heading).toBeFocused();
  await expect(secondary).toHaveCount(0);
  await page.keyboard.press("Shift+Enter");
  await answered(2);
  expect(sent[1]?.type).toBe("PLACE_CANAL_WHARF");
  expect(sent[1]?.endTurn, "Shift+Enter omits the field").toBeUndefined();

  // Enter on the focused primary button: its own click, and one command.
  await place("apprentice").focus();
  await page.keyboard.press("Enter");
  await expect(heading).toBeFocused();
  await primary.focus();
  await page.keyboard.press("Enter");
  await answered(3);
  expect(sent[2]).toMatchObject({ type: "PLACE_CANAL_WHARF", endTurn: true });
  expect(errors).toEqual([]);
});

test("the Order Phase: Enter on the heading or a radio never gives up the window; Done takes its own press", async ({ page, request }) => {
  test.setTimeout(300_000);
  await resetBackend(request, { seed: 720, policy: "canonical" });
  const errors = collectErrors(page);
  await page.goto("./");
  await page.locator('input[name="displayName"]').fill("Lin");
  await page.locator('[data-action="create-room"]').click();
  await expect(page.locator("[data-room-code]")).toBeVisible();
  await page.locator('[data-action="add-computer"]').click();
  await expect(page.locator("[data-seat-index]")).toHaveCount(2);
  await page.locator('[data-action="start-game"]').click();
  await expect(page.locator("aside.pane")).toBeAttached();

  // The dev button plays the viewer's moves, until an Order Phase turn opens with something to do.
  const radios = page.locator('aside.pane form[data-window="orders"] input[name="freeAction"]');
  const canonical = page.locator('[data-dev="canonical-move"]:not([aria-disabled]):not([aria-busy])');
  await expect(async () => {
    if ((await radios.count()) > 0) return;
    if ((await canonical.count()) > 0) await canonical.first().dispatchEvent("click");
    expect(await radios.count()).toBeGreaterThan(0);
  }).toPass({ timeout: 240_000, intervals: [100] });

  const sent = recordCommands(page);
  const heading = page.locator("aside.pane h2");
  const done = page.locator('aside.pane [data-action="alt"]');
  // Where focus lands when the window opens, and where a stray Enter goes.
  await heading.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Enter");
  await page.waitForTimeout(300);
  expect(sent, "Enter on the heading sends nothing").toEqual([]);
  await expect(done).not.toHaveAttribute("aria-keyshortcuts", "Enter");

  // A real Tab from the heading reaches the list; Enter chooses the entry it is on.
  const focusedRadio = page.locator('aside.pane input[name="freeAction"]:focus');
  for (let tab = 0; tab < 12 && (await focusedRadio.count()) === 0; tab += 1) await page.keyboard.press("Tab");
  await expect(focusedRadio).toHaveCount(1);
  await expect(focusedRadio).not.toBeChecked();
  await page.keyboard.press("Enter");
  await expect(focusedRadio).toBeChecked();
  await page.waitForTimeout(300);
  expect(sent, "Enter on an unchosen radio sends nothing").toEqual([]);

  // Done with its own press ends the turn. (The Enter on a chosen radio is the labelled default.)
  await done.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => sent.length, { timeout: 30_000 }).toBe(1);
  expect(sent[0]?.type).toBe("END_ORDER_TURN");
  expect(errors).toEqual([]);
});

test("the focus ring stays in view while the other players' turn toasts open above the table", async ({ page, request }) => {
  test.setTimeout(240_000);
  await resetBackend(request, { seed: 720, policy: "canonical" });
  const errors = collectErrors(page);

  await page.goto("./");
  await page.locator('input[name="displayName"]').fill("Lin");
  await page.locator('[data-action="create-room"]').click();
  await expect(page.locator("[data-room-code]")).toBeVisible();
  for (let seat = 2; seat <= 3; seat += 1) {
    await page.locator('[data-action="add-computer"]').click();
    await expect(page.locator("[data-seat-index]")).toHaveCount(seat);
  }
  await page.locator('[data-action="start-game"]').click();
  await expect(page.locator("aside.pane")).toBeAttached();
  // The pointer rests away from the toast (hovering it would stop its clock).
  await page.mouse.move(4, 896);

  // The Kiln selection with the dev button, until the viewer's first work turn (the pane hidden).
  const placing = page.locator('[data-shell][data-pane="hidden"]');
  const canonical = page.locator('[data-dev="canonical-move"]:not([aria-disabled]):not([aria-busy])');
  for (let move = 0; move < 10; move += 1) {
    await expect(placing.or(canonical).first()).toBeAttached({ timeout: 60_000 });
    if ((await placing.count()) > 0) break;
    await canonical.first().dispatchEvent("click");
    await expect(page.locator('[data-dev="canonical-move"][aria-busy]')).toHaveCount(0, { timeout: 60_000 });
  }
  await expect(placing).toHaveCount(1);

  await page.evaluate(sampleFocusFrames);
  const world = page.locator(".shell-world");
  const toast = page.locator(".turn-toast");
  const returned = page.locator('[data-act="place"][data-location-id="canal_wharf"]:focus');
  for (let turn = 1; turn <= TURNS; turn += 1) {
    await expect(placing).toHaveCount(1, { timeout: 60_000 });
    // Each turn starts with the band closed: the toasts of the turns before have all shown.
    await expect(toast).toHaveCount(0, { timeout: 30_000 });
    // A key press first, so the browser shows the focus ring on what is focused next.
    await page.keyboard.press("Tab");
    await page.locator('[data-act="place"][data-location-id="canal_wharf"][data-worker="apprentice"]').focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("aside.pane")).toBeVisible();
    const confirm = page.locator('aside.pane [data-action="confirm"]');
    await expect(confirm).not.toHaveAttribute("aria-disabled", "true");
    await confirm.focus();
    // The table out of view, as after the Guild Hall's jump to the Tech display.
    await world.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: "instant" }));
    const before = await revisionOf(page);
    await page.keyboard.press("Enter");
    await expect.poll(() => revisionOf(page), { timeout: 60_000, message: `turn ${String(turn)}: no answer to Confirm` }).toBeGreaterThan(before);
    // The computers play; the turn comes back with focus on Canal Wharf's Place shortcut.
    await expect(placing).toHaveCount(1, { timeout: 60_000 });
    await expect(returned).toHaveCount(1);
  }
  await expect(toast).toHaveCount(0, { timeout: 30_000 });

  const frames = await page.evaluate(() => {
    const record = (window as unknown as { __focusFrames: FocusFrames }).__focusFrames;
    record.stop = true;
    return { hidden: record.hidden.slice(0, 10), inViewWithToast: record.inViewWithToast };
  });
  expect(frames.hidden, "frames with the focus ring above the world's top").toEqual([]);
  expect(frames.inViewWithToast, "frames with the focus ring in view while a toast showed").toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
