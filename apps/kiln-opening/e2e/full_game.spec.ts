/**
 * The phase 4 exit (UI_V1.6.1_ARCHITECTURE §9.6 `full_game.spec`). Owner: B6.
 *
 * Through the UI only, against `npm run dev:local` (or `vite preview` of `npm run build:e2e` for
 * the `@ci` case): create a room, add computers, start, and play to the final results. The
 * autopilot (`e2e/support/autopilot.ts`, the same one `form_driver_games` uses in happy-dom) reads
 * `data-window` and the form's native inputs, varies its choices seeded per game, and presses
 * Confirm or the alternative. Every press is a real pointer click; on phones the decision sheet is
 * opened first when it is collapsed.
 *
 * After **every** Confirm:
 * - none of the IDs the local backend's `e2e_secret_ids` oracle names for this seat appear in the
 *   page (text or attributes);
 * - none of the D3/D4 vocabulary is visible (odds, previews, cards left, a Fire-deck count…);
 * - `document.activeElement` is not `<body>`;
 * - Confirm held focus while it was sending (`aria-busy`).
 * The language is switched once mid-game, and the page is reloaded once mid-game: the same seat
 * comes back at the same revision (reconnect).
 *
 * Cases (each runs in its own project only):
 * - 1440 EN, 4 players (1 human + 3 computers);
 * - 390 ZH, 2 players;
 * - 844×390 EN, 3 players;
 * - 1024 ZH, 2 players;
 * - `@ci`: 1440 EN, 1 human + 1 computer, `e2e_reset { policy: "canonical" }`.
 */
import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { autopilotPick } from "./support/autopilot.ts";
import type { AutopilotPick } from "./support/autopilot.ts";
import { backendCall, resetBackend } from "./support/localBackend.ts";

interface GameCase {
  title: string;
  width: number;
  height: number;
  locale: "en" | "zh-CN";
  players: 2 | 3 | 4;
  policy: "strategic" | "canonical";
  seed: number;
}

const CASES: readonly GameCase[] = [
  { title: "1440 EN, 1 human + 3 computers", width: 1440, height: 900, locale: "en", players: 4, policy: "strategic", seed: 1_441 },
  { title: "390 ZH, 1 human + 1 computer", width: 390, height: 844, locale: "zh-CN", players: 2, policy: "strategic", seed: 3_902 },
  { title: "844×390 EN, 1 human + 2 computers", width: 844, height: 390, locale: "en", players: 3, policy: "strategic", seed: 8_443 },
  { title: "1024 ZH, 1 human + 1 computer", width: 1024, height: 768, locale: "zh-CN", players: 2, policy: "strategic", seed: 1_024 },
  { title: "@ci 1440 EN, 1 human + 1 computer (canonical computers)", width: 1440, height: 900, locale: "en", players: 2, policy: "canonical", seed: 720 },
];

const MAX_PICKS = 20_000;
/** D3/D4 vocabulary that must never be visible (rules panels are closed unless opened). */
const BANNED = /\b(?:odds|chance|probability|ladder|preview|expected)\b|cards (?:left|remaining)|left in the deck|概率|几率|余张|预估|预览|剩余火牌|牌堆剩余|Fire deck\W{0,3}\d|窑火牌堆(?:余|剩余?|共|还有|[：:（(]|\s)*\d/i;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function secretIds(request: APIRequestContext, roomCode: string): Promise<string[]> {
  const result = await backendCall<{ revision: number | null; ids: string[] }>(request, { operation: "e2e_secret_ids", roomCode, viewerSeat: 0 });
  if (!result.ok) throw new Error(`e2e_secret_ids failed: ${result.error.code}`);
  return result.value.ids;
}

/** Pane revision, or -1 while no pane is shown. */
async function revisionOf(page: Page): Promise<number> {
  const value = await page.locator("aside.pane").first().getAttribute("data-revision", { timeout: 1_000 }).catch(() => null);
  return value === null ? -1 : Number(value);
}

/** Opens the phone decision sheet when it is collapsed, so its controls can be pressed. */
async function openSheetIfCollapsed(page: Page): Promise<void> {
  const strip = page.locator('.kit-sheet-strip[aria-expanded="false"]');
  if ((await strip.count()) > 0 && (await strip.first().isVisible())) await strip.first().click();
}

/** Watches the Confirm button: whether it kept focus while `aria-busy` (sending). */
async function watchConfirmFocus(page: Page, selector: string): Promise<void> {
  await page.evaluate((sel) => {
    const button = document.querySelector(sel);
    const record = { sawBusy: false, focusedWhileBusy: true, lostTo: "" };
    (window as unknown as { __confirmFocus: typeof record }).__confirmFocus = record;
    if (button === null) return;
    const revision = () => document.querySelector("aside.pane")?.getAttribute("data-revision") ?? "";
    const sentAt = revision();
    const lost = () => {
      // Only while this very button is still on the page and sending, before the answer arrived:
      // the answer re-renders the pane (the button may go) and moves focus to the next heading (§8.2).
      if (!button.isConnected || button.getAttribute("aria-busy") !== "true" || revision() !== sentAt) return;
      if (document.activeElement !== button) {
        record.focusedWhileBusy = false;
        record.lostTo = `${document.activeElement === null ? "none" : document.activeElement.outerHTML.slice(0, 160)} (revision ${revision()})`;
      }
    };
    const check = () => {
      if (button.isConnected && button.getAttribute("aria-busy") === "true") record.sawBusy = true;
      // Judged a moment later, once a commit that removes the button has finished.
      window.setTimeout(lost, 0);
    };
    const observer = new MutationObserver(check);
    button.addEventListener("focusout", check);
    observer.observe(button, { attributes: true, attributeFilter: ["aria-busy"] });
    window.setTimeout(() => observer.disconnect(), 30_000);
  }, selector);
}

async function afterConfirmChecks(page: Page, request: APIRequestContext, roomCode: string, step: string): Promise<void> {
  const ids = await secretIds(request, roomCode);
  const leaks = await page.evaluate((secret) => {
    const html = document.documentElement.outerHTML;
    return secret.filter((id) => new RegExp(`\\b${id}\\b`).test(html));
  }, ids);
  expect(leaks, `${step}: secret IDs in the page`).toEqual([]);
  const visible = await page.evaluate(() => document.body.innerText);
  expect(visible.match(BANNED)?.[0] ?? null, `${step}: D3/D4 vocabulary`).toBeNull();
  expect(await page.evaluate(() => document.activeElement !== null && document.activeElement !== document.body), `${step}: focus fell to <body>`).toBe(true);
  const focus = await page.evaluate(() => (window as unknown as { __confirmFocus?: { sawBusy: boolean; focusedWhileBusy: boolean; lostTo: string } }).__confirmFocus ?? null);
  if (focus !== null && focus.sawBusy) expect(focus.focusedWhileBusy, `${step}: Confirm lost focus while sending, to ${focus.lostTo}`).toBe(true);
}

for (const game of CASES) {
  test.describe(game.title, () => {
    // Decided from the viewport alone, so other projects skip without launching a browser.
    test.skip(({ viewport }) => viewport?.width !== game.width || viewport.height !== game.height, `runs at ${game.width}×${game.height} only`);

    test("plays to the final results through the UI", async ({ page, request }) => {
      test.setTimeout(1_800_000);
      await resetBackend(request, { seed: game.seed, policy: game.policy });
      const errors = collectErrors(page);

      // Home: the language through the UI, then a room.
      await page.goto("next/");
      await page.locator(`.kit-seg-btn[lang="${game.locale === "en" ? "en" : "zh-Hans"}"]`).first().click();
      await expect(page.locator("html")).toHaveAttribute("lang", game.locale === "en" ? "en" : "zh-Hans");
      await page.locator('input[name="displayName"]').fill("Lin");
      await page.locator('[data-action="create-room"]').click();
      const codeHolder = page.locator("[data-room-code]");
      await expect(codeHolder).toBeVisible();
      const roomCode = (await codeHolder.getAttribute("data-room-code")) ?? "";
      expect(roomCode).not.toBe("");
      for (let seat = 2; seat <= game.players; seat += 1) {
        await page.locator('[data-action="add-computer"]').click();
        await expect(page.locator("[data-seat-index]")).toHaveCount(seat);
      }
      await page.locator('[data-action="start-game"]').click();
      await expect(page.locator("aside.pane")).toBeAttached();

      const windows = new Map<string, number>();
      let confirms = 0;
      let switched = false;
      let reloaded = false;
      let reloadDue = false;
      for (let tick = 1; tick <= MAX_PICKS; tick += 1) {
        if ((await page.locator('form.pane-form[data-window="final"]').count()) > 0) break;
        const pick: AutopilotPick = await page.evaluate(autopilotPick, { seed: game.seed, tick, confirmChance: 0.55, altChance: 0.25 });
        if (pick.kind === "none" || pick.kind === "busy") {
          // Someone else acts (computers, the sealed Contribution of others), or ours is sending.
          await page.waitForTimeout(120);
          continue;
        }
        let target = page.locator(pick.selector);
        if (!(await target.isVisible())) {
          await openSheetIfCollapsed(page);
          target = page.locator(pick.selector);
        }
        if (reloadDue) {
          // Reload once mid-game, on our own decision: the saved seat reconnects at the same revision.
          reloadDue = false;
          reloaded = true;
          const revision = await revisionOf(page);
          const own = (await page.locator(".own").first().innerText()).split("\n")[0] ?? "Lin";
          await page.reload();
          await expect.poll(() => revisionOf(page), { timeout: 30_000 }).toBe(revision);
          await expect(page.locator(".own").first()).toContainText(own);
          continue;
        }
        const before = await revisionOf(page);
        if (pick.kind === "choice") {
          await target.click();
          continue;
        }
        // Confirm and the alternative are pressed as a keyboard user would find them focused
        // (WebKit does not focus a button on click), so the focus checks mean the same everywhere.
        await target.focus();
        if (pick.kind === "confirm") await watchConfirmFocus(page, pick.selector);
        await target.click();
        // A command was sent: wait for the answer (a new revision, or the form unchanged on a rejection).
        await expect.poll(() => revisionOf(page), { timeout: 60_000, message: `${pick.window}: no answer to ${pick.describe}` }).toBeGreaterThan(before);
        windows.set(pick.window, (windows.get(pick.window) ?? 0) + 1);
        confirms += 1;
        await afterConfirmChecks(page, request, roomCode, `${pick.window} #${confirms}`);

        if (!switched && confirms === 12) {
          // Switch the language once mid-game: the screen re-renders, the seat and state stay.
          switched = true;
          const other = game.locale === "en" ? "zh-Hans" : "en";
          // The top bar's one compact language button (CR B1-5): it shows the other language.
          const toggle = page.locator(`header .language-switch[lang="${other}"]`).first();
          await toggle.click();
          await expect(page.locator("html")).toHaveAttribute("lang", other);
        }
        if (!reloaded && confirms === 24) reloadDue = true;
      }
      await expect(page.locator('form.pane-form[data-window="final"]')).toBeAttached();
      expect(switched && reloaded, "the language switch and the reload happened mid-game").toBe(true);
      for (const window of ["kiln_selection", "work"]) expect(windows.get(window) ?? 0, window).toBeGreaterThan(0);
      expect(errors).toEqual([]);
      test.info().annotations.push({ type: "windows", description: [...windows.entries()].map(([window, n]) => `${window}×${n}`).join(", ") });
    });
  });
}
