/**
 * The phase 4 exit (UI_V1.6.1_ARCHITECTURE §9.6 `full_game.spec`). Owner: B6.
 *
 * Through the UI only, against `npm run dev:local` (or `vite preview` of `npm run build:e2e` for
 * the `@ci` case): create a room, add computers, start, and play to the final results. The
 * autopilot (`e2e/support/autopilot.ts`, the same one `form_driver_games` uses in happy-dom) reads
 * `data-window`, the form's native inputs and the table targets that drive it (workers are placed
 * from the table's Place shortcuts, and the Guild Hall's Tech or deck is chosen on the Tech
 * display: owner review, 2026-10-17), varies its choices seeded per game, and presses Confirm or
 * the alternative. Every press is a real pointer click; on phones the decision sheet is opened
 * first when it is collapsed, and a table target in another section is reached through the
 * section bar. The other players' turn toast (one queued turn at a time: owner review
 * 2026-10-17, item 3) is drawn over nothing, in a band the world gives up under the jump bar (a
 * row of its own above the world); a table target that is not in sight is scrolled into it
 * first, as a player would (`e2e/support/turnToasts.ts`).
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
 * - 1440 EN, 2 players, **steered** to the V1.6.2 windows a random autopilot rarely meets: the
 *   autopilot's `prefer` list sends the Shifu to the Guild Hall (the Glazing & Loading deck
 *   inspected, Colour Samples and then a Firing Tech taken when offered, the inspected Techs back
 *   under the deck in a chosen order) and an Apprentice to Glaze & Load, the Workshop or the
 *   Commission Market (its private look and reservations), and takes the Colour Samples swap,
 *   Protective Saggars' upgrade, Second Firing and the Fuel Ledger commitment whenever they are
 *   offered. A steered placement is completed inside its sub-editor (`within: ".b4-sub-region"`),
 *   a steered swap inside its form (the held Order to give up). It must confirm the Commission
 *   Market and Guild Hall windows; the V1.6.2 commands it sent are listed in the annotations;
 * - 390 ZH, 2 players;
 * - 844×390 EN, 3 players;
 * - 1024 ZH, 2 players;
 * - `@ci`: 1440 EN, 1 human + 1 computer, `e2e_reset { policy: "canonical" }`.
 *
 * Every V1.6.2 window is a form of native inputs like the others (the autopilot's header lists
 * them), and the Order cards' toggles and the Shared Kiln's spaces are table targets too: the
 * Commission Market's reservations may be made on the display and the look row, the Colour
 * Samples swap gives up a held Order on the hand row.
 */
import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { autopilotPick } from "./support/autopilot.ts";
import type { AutopilotPick } from "./support/autopilot.ts";
import { backendCall, resetBackend } from "./support/localBackend.ts";
import { revealPastTurnToast } from "./support/turnToasts.ts";

interface GameCase {
  title: string;
  width: number;
  height: number;
  locale: "en" | "zh-CN";
  players: 2 | 3 | 4;
  policy: "strategic" | "canonical";
  seed: number;
  /** Steered to the V1.6.2 windows (`STEER`). */
  steer?: boolean;
}

const CASES: readonly GameCase[] = [
  { title: "1440 EN, 1 human + 3 computers", width: 1440, height: 900, locale: "en", players: 4, policy: "strategic", seed: 1_441 },
  // Seed 1 (two players): Colour Samples (T10) and the Fuel Ledger (T12) are face up from the start.
  { title: "1440 EN, steered to the V1.6.2 windows, 1 human + 1 computer", width: 1440, height: 900, locale: "en", players: 2, policy: "canonical", seed: 1, steer: true },
  { title: "390 ZH, 1 human + 1 computer", width: 390, height: 844, locale: "zh-CN", players: 2, policy: "strategic", seed: 3_902 },
  { title: "844×390 EN, 1 human + 2 computers", width: 844, height: 390, locale: "en", players: 3, policy: "strategic", seed: 8_443 },
  { title: "1024 ZH, 1 human + 1 computer", width: 1024, height: 768, locale: "zh-CN", players: 2, policy: "strategic", seed: 1_024 },
  { title: "@ci 1440 EN, 1 human + 1 computer (canonical computers)", width: 1440, height: 900, locale: "en", players: 2, policy: "canonical", seed: 720 },
];

const MAX_PICKS = 20_000;

/**
 * Steered placements, the first that can be pressed (a Place shortcut is there only when the
 * placement is legal): the Shifu to the Guild Hall; an Apprentice to Glaze & Load, else Form &
 * Decorate, else the Commission Market; then the Shifu to the Commission Market, and an Apprentice
 * to Canal Wharf for the Coins the Guild Hall and the Workshop cost.
 */
const PLACE_PREFERENCES: readonly string[] = [
  '[data-act="place"][data-location-id="guild_hall"][data-worker="shifu"]',
  '[data-act="place"][data-location-id="glaze_load"][data-worker="apprentice"]',
  '[data-act="place"][data-location-id="form_decorate"][data-worker="apprentice"]',
  '[data-act="place"][data-location-id="commission_market"][data-worker="apprentice"]',
  '[data-act="place"][data-location-id="commission_market"][data-worker="shifu"]',
  '[data-act="place"][data-location-id="canal_wharf"][data-worker="apprentice"]',
];
/** The Colour Samples swap's opener above the world (before the worker action) and its option in the after-action window. */
const SWAP_PREFERENCES: readonly string[] = ['[data-pane-opener="colour_samples_swap"]', 'input[name="mode"][value="colour_samples_swap"]'];
/** The Shifu's Guild Hall takes, in the inspection's options or on the Tech display: Colour Samples, then a Firing Tech. */
const TAKE_PREFERENCES: readonly string[] = ["T10", "T12", "T14", "T11"].flatMap((techId) => [`input[name="take"][value="${techId}"]`, `[data-act="tech"][data-tech-id="${techId}"]`]);
/**
 * The Fuel Ledger commitment: Stoke, when the Contribution form offers the commitment at all (it
 * does only for the Fuel Ledger's owner), then the commitment itself.
 */
const FUEL_LEDGER_PREFERENCES: readonly string[] = ['form.pane-form:has(input[name="fuelLedger"]) input[name="card"][value="STOKE"]', 'input[name="fuelLedger"]'];
/** After Quality: Protective Saggars' upgrade, else Second Firing (its card is the autopilot's choice). */
const AFTER_QUALITY_PREFERENCES: readonly string[] = ['input[name="afterQuality"][value^="protective_saggars:"]', 'input[name="afterQuality"][value^="second_firing:"]'];
/**
 * The steered case's preferences (`AutopilotArgs.prefer`), in order. Each is pressed at most once
 * per decision; the seeded autopilot completes every form.
 */
const STEER: readonly string[] = [
  ...SWAP_PREFERENCES,
  ...AFTER_QUALITY_PREFERENCES,
  ...FUEL_LEDGER_PREFERENCES,
  ...TAKE_PREFERENCES,
  // The Shifu inspects the Glazing & Loading deck (Colour Samples face up, or among the 2 seen).
  '[data-act="inspect"][data-discipline="glazing_loading"]',
  ...PLACE_PREFERENCES,
];
/**
 * Preferences that are one choice: once one of a group is pressed, the rest of the group is
 * skipped in that decision. A placement and the swap open a form, which the autopilot then
 * completes inside (`within`: the placement's sub-editor, the swap's held Orders); a take, an
 * after-Quality ability and the Fuel Ledger commitment complete their form, so Confirm follows at
 * once when it can.
 */
const STEER_GROUPS: ReadonlyArray<{ preferences: readonly string[]; within: (preferred: string) => string | null; confirm: boolean }> = [
  { preferences: [...SWAP_PREFERENCES, ...PLACE_PREFERENCES], within: (preferred) => (SWAP_PREFERENCES.includes(preferred) ? '[data-b4="colour-samples-swap"]' : ".b4-sub-region"), confirm: false },
  { preferences: TAKE_PREFERENCES, within: () => null, confirm: true },
  { preferences: AFTER_QUALITY_PREFERENCES, within: () => null, confirm: true },
  { preferences: FUEL_LEDGER_PREFERENCES.slice(1), within: () => null, confirm: true },
];
/** Seeded picks inside a steered form before the autopilot may leave it. */
const MAX_WITHIN_PICKS = 60;
/** The V1.6.2 commands the steered case reports (a game sends whichever its seed and its choices allow). */
const V162_COMMANDS = new Set([
  "COMMISSION_CHOOSE",
  "GUILD_TAKE",
  "GUILD_FINISH",
  "COLOUR_SAMPLES_CHOOSE",
  "USE_COLOUR_SAMPLES_SWAP",
  "COLOUR_SAMPLES_SWAP_CHOOSE",
  "USE_PROTECTIVE_SAGGARS",
  "USE_SECOND_FIRING",
  "SECOND_FIRING_CHOOSE",
]);

/** The game commands this page sends (`game_action` bodies), by type; a Fuel Ledger commitment and S07 are counted apart. */
function recordCommands(page: Page): Map<string, number> {
  const sent = new Map<string, number>();
  page.on("request", (request) => {
    if (!request.url().includes("/test-api-v161") || request.method() !== "POST") return;
    interface Body {
      operation?: string;
      command?: { type?: string; fuelLedger?: boolean; orderId?: string };
    }
    let body: Body | null;
    try {
      body = request.postDataJSON() as Body | null;
    } catch {
      return;
    }
    const command = body?.operation === "game_action" ? body.command : undefined;
    if (command?.type === undefined) return;
    const keys = [command.type];
    if (command.type === "SUBMIT_CONTRIBUTION" && command.fuelLedger === true) keys.push("SUBMIT_CONTRIBUTION.fuelLedger");
    if (command.type === "COMPLETE_ORDER" && command.orderId === "S07") keys.push("COMPLETE_ORDER.S07");
    for (const key of keys) sent.set(key, (sent.get(key) ?? 0) + 1);
  });
  return sent;
}
/** D3/D4 vocabulary that must never be visible (rules panels are closed unless opened). */
const BANNED = /\b(?:odds|chance|probability|ladder|preview|expected)\b|cards (?:left|remaining)|left in the deck|概率|几率|余张|预估|预览|剩余火牌|牌堆剩余|Fire deck\W{0,3}\d|窑火牌堆(?:余|剩余?|共|还有|[：:（(]|\s)*\d/i;

/**
 * WebKit logs a console error for a fetch that a navigation cancels, even when the page
 * catches the rejection, and Playwright's WebKit driver reports that console error as a
 * `pageerror`. The session's poll is caught (sessionStore `runPoll`), so this one message is
 * expected only while the spec itself reloads the page; anywhere else it still fails.
 */
const RELOAD_CANCELLED_FETCH = /^Fetch API cannot load \S+ due to access control checks\.?$/;

interface ErrorLog {
  errors: string[];
  /** True while the spec's own `page.reload()` is in progress. */
  reloading: boolean;
  /** Cancelled-fetch messages seen during the spec's reload (annotated, not failures). */
  cancelledByReload: number;
}

function collectErrors(page: Page): ErrorLog {
  const log: ErrorLog = { errors: [], reloading: false, cancelledByReload: 0 };
  const record = (kind: string, text: string): void => {
    if (log.reloading && RELOAD_CANCELLED_FETCH.test(text)) {
      log.cancelledByReload += 1;
      return;
    }
    log.errors.push(`${kind}: ${text}`);
  };
  page.on("pageerror", (error) => record("pageerror", error.message));
  page.on("console", (message) => {
    if (message.type() === "error") record("console", message.text());
  });
  return log;
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

/**
 * Brings a table target into view on a phone: the section bar's tab of the section it sits in
 * (the other tabs' sections are hidden below 900px), with an open decision sheet lowered first.
 */
async function showTableTarget(page: Page, selector: string): Promise<void> {
  const tab = await page.locator(selector).evaluate((element) => element.closest("section[data-tab]")?.getAttribute("data-tab") ?? null);
  if (tab === null) return;
  const open = page.locator('.kit-sheet-strip[aria-expanded="true"]');
  if ((await open.count()) > 0 && (await open.first().isVisible())) await open.first().click();
  const button = page.locator(`.phone-nav-button[data-tab="${tab}"]`);
  if ((await button.count()) > 0 && (await button.first().isVisible())) await button.first().click();
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
      const errorLog = collectErrors(page);
      const sent = recordCommands(page);

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
      let placeShortcuts = 0;
      let confirms = 0;
      let switched = false;
      let reloaded = false;
      let reloadDue = false;
      // Steering state of the current decision (the pane's revision): preferences used, and the
      // sub-editor a steered placement is completed in.
      let decision = -1;
      let tried: string[] = [];
      let within: string | undefined;
      let withinPicks = 0;
      let confirmNext = false;
      for (let tick = 1; tick <= MAX_PICKS; tick += 1) {
        if ((await page.locator('form.pane-form[data-window="final"]').count()) > 0) break;
        if (game.steer === true) {
          const revision = await revisionOf(page);
          if (revision !== decision) {
            decision = revision;
            tried = [];
            within = undefined;
            withinPicks = 0;
            confirmNext = false;
          }
          if (within !== undefined && withinPicks >= MAX_WITHIN_PICKS) within = undefined;
        }
        const pick: AutopilotPick = await page.evaluate(autopilotPick, {
          seed: game.seed,
          tick,
          confirmChance: confirmNext ? 1 : 0.55,
          altChance: confirmNext ? 0 : 0.25,
          ...(game.steer === true ? { prefer: STEER, tried } : {}),
          ...(within === undefined ? {} : { within }),
        });
        if (pick.kind === "none" && within !== undefined) {
          // The steered sub-editor is gone (the pane moved on): choose freely again.
          within = undefined;
          continue;
        }
        if (pick.kind === "none" || pick.kind === "busy") {
          // Someone else acts (computers, the sealed Contribution of others), or ours is sending.
          await page.waitForTimeout(120);
          continue;
        }
        let target = page.locator(pick.selector);
        if (!(await target.isVisible())) {
          // A table target (Place shortcut, the Guild Hall's Tech display) or a pane control.
          if (pick.describe.startsWith("table ")) await showTableTarget(page, pick.selector);
          else await openSheetIfCollapsed(page);
          target = page.locator(pick.selector);
        }
        if (reloadDue) {
          // Reload once mid-game, on our own decision: the saved seat reconnects at the same revision.
          reloadDue = false;
          reloaded = true;
          const revision = await revisionOf(page);
          const own = (await page.locator(".own").first().innerText()).split("\n")[0] ?? "Lin";
          errorLog.reloading = true;
          await page.reload();
          await expect.poll(() => revisionOf(page), { timeout: 30_000 }).toBe(revision);
          errorLog.reloading = false;
          await expect(page.locator(".own").first()).toContainText(own);
          continue;
        }
        const before = await revisionOf(page);
        if (pick.kind === "choice" && pick.preferred !== undefined) {
          const preferred: string = pick.preferred;
          tried.push(preferred);
          const group = STEER_GROUPS.find((candidate) => candidate.preferences.includes(preferred));
          if (group !== undefined) {
            // One steered choice of the group per decision.
            tried.push(...group.preferences);
            const form = group.within(preferred);
            if (form !== null) {
              within = form;
              withinPicks = 0;
            }
            confirmNext = group.confirm;
          }
        } else {
          confirmNext = false;
          if (within !== undefined && pick.kind === "choice") withinPicks += 1;
        }
        if (pick.kind === "choice") {
          await revealPastTurnToast(target);
          await target.click();
          if (pick.describe.startsWith("table place")) placeShortcuts += 1;
          continue;
        }
        // Confirm and the alternative are pressed as a keyboard user would find them focused, so the
        // focus checks mean the same everywhere. Safari (WebKit) does not focus a button on click and
        // its mousedown clears focus to <body>, so there the focused button is pressed with Enter.
        await target.focus();
        if (pick.kind === "confirm") await watchConfirmFocus(page, pick.selector);
        if (page.context().browser()?.browserType().name() === "webkit") await target.press("Enter");
        else await target.click();
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
        // Reload at the 18th confirm: every game gives the human at least 21 (Kiln selection and 20
        // placements in a 2-player game), so a later decision always follows.
        if (!reloaded && confirms === 18) reloadDue = true;
      }
      await expect(page.locator('form.pane-form[data-window="final"]')).toBeAttached();
      const tally = [...windows.entries()].map(([window, n]) => `${window}×${n}`).join(", ");
      expect(switched && reloaded, `the language switch and the reload happened mid-game (switched ${switched}, reloaded ${reloaded}, ${confirms} confirms: ${tally})`).toBe(true);
      for (const window of ["kiln_selection", "work"]) expect(windows.get(window) ?? 0, window).toBeGreaterThan(0);
      // Every worker was placed from the table (owner review, 2026-10-17).
      expect(placeShortcuts, "Place shortcuts pressed on the table").toBeGreaterThan(0);
      if (game.steer === true) {
        // The Commission Market's look and reservation, and the Shifu's Guild Hall takes, through their forms.
        for (const window of ["commission", "guild_inspection"]) expect(windows.get(window) ?? 0, `${window} (steered)`).toBeGreaterThan(0);
        test.info().annotations.push({
          type: "V1.6.2 commands",
          description: [...sent.entries()]
            .filter(([type]) => V162_COMMANDS.has(type) || type.includes("."))
            .map(([type, n]) => `${type}×${n}`)
            .join(", "),
        });
      }
      if (errorLog.cancelledByReload > 0) test.info().annotations.push({ type: "reload", description: `${errorLog.cancelledByReload} fetch(es) cancelled by the spec's own reload (WebKit console noise)` });
      expect(errorLog.errors).toEqual([]);
      test.info().annotations.push({ type: "windows", description: [...windows.entries()].map(([window, n]) => `${window}×${n}`).join(", ") });
    });
  });
}
