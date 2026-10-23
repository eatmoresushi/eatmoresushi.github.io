/**
 * Two humans at one table (UI_V1.6.1_ARCHITECTURE §9.6 `two_humans.spec`). Owner: B6.
 *
 * Two browser contexts, so two distinct `x-e2e-user`s and two seats, play Round 1 through the
 * real lobby, store, client and local backend (`/test-api-v161`). A steered driver gives both
 * players a Shared Kiln ceramic (Form & Decorate, then Glaze & Load) so both are eligible to
 * contribute, and sends Lin's Shifu to the Commission Market, whose placement always opens its
 * Select 3 first: a private look at the top 3 Main Orders (v1.6.2 L64, L202, change 25). Everything
 * else is chosen by the shared autopilot
 * (`e2e/support/autopilot.ts`).
 *
 * Checked:
 * - **the private Commission top 3** is visible only to its owner: Lin sees the 3 Orders
 *   ("only you"); Zhao's waiting pane says only that Lin is looking at 3 cards, and none of those
 *   Order IDs reaches Zhao's page or any payload Zhao's client receives (also checked against
 *   the local backend's `e2e_secret_ids` oracle). Lin reserves one of them (the Shifu's
 *   `reservations` checkboxes); the other two are discarded face down (owner ruling R25) and
 *   stay secret;
 * - **the turn toasts** (owner review, 2026-10-17): Zhao's page shows Lin's moves (Lin's Shifu
 *   at the Commission Market), never Zhao's own and never a looked-at Order. They show one turn
 *   at a time (item 3), so the check waits for Lin's Commission Market turn to have its turn; the
 *   toast is drawn over nothing (in a band the world gives up), and a table target that is not in
 *   sight is scrolled into it first (`support/turnToasts.ts`);
 * - **the secret Contribution**: after Lin submits, Lin sees the sealed card ("only you"); Zhao
 *   sees only that Lin has chosen, and no payload Zhao's client receives carries a Contribution
 *   card until both have submitted; then both cards are revealed on both pages.
 *
 * A second game (seed 1) checks the other private looks of AGENTS.md "Hidden information",
 * over two rounds, and the Guild Hall Shifu's two takes (v1.6.2 L207, owner revision
 * 2026-10-17). Lin's Shifu inspects the Glazing & Loading Tech deck at the Guild Hall and takes
 * the face-up Colour Samples (one `GUILD_TAKE`); Colour Samples, when gained, Selects 3 (the top 3
 * Main Orders, or a face-up one instead, `SELECT_CHOOSE`); back in the inspection, Lin's second take is the face-up Test Pieces (another
 * discipline), and with both takes made only the bottom order of the two inspected Techs is left
 * (`GUILD_FINISH`), which Lin changes. In Round 2 Lin loads a ceramic, contributes, and peeks at
 * the top Fire card with Test Pieces.
 * - **the Guild Hall inspection and its bottom order**: neither inspected Tech reaches Zhao's
 *   page or client;
 * - **the Colour Samples look and the discard**: none of the 3 looked-at Orders (one goes to
 *   Lin's hand, two are discarded face down, owner ruling R25) reaches Zhao;
 * - **the Test Pieces peek**: Lin sees the card ("only you"); Zhao's client receives no
 *   `TEST_PIECES_PEEKED` secret, and Zhao's page shows no peeked card;
 * - in both games, no payload Zhao's client receives carries a secret addressed to Lin
 *   (`"visibleTo":"<Lin>"`), while Lin's own client does receive them.
 *
 * The Colour Samples swap, Protective Saggars, Second Firing's choice, Ge's Crackle, Kiln Master's
 * marker at loading, the Magistrate's Hall Shifu's Crown Order, a Flawed ceramic's sale and Fuel
 * Ledger's own Contribution cards are sent from their real forms in the steered
 * `form_driver_games` games (happy-dom, the real `DecisionPane` over the engine), and in
 * `full_game.spec`'s steered case in a real browser.
 *
 * Owner revision 4 has no salvage window (a Flawed ceramic is sold in its owner's own turn, R20);
 * hand-trim races are not steered through the browser: platform `parallel_windows.test.ts` and the
 * session tests cover them (§9.6, E15).
 */
import { expect, test } from "@playwright/test";
import type { Browser, Page, TestInfo } from "@playwright/test";
import { autopilotPick } from "./support/autopilot.ts";
import { backendCall, resetBackend } from "./support/localBackend.ts";
import { revealPastTurnToast } from "./support/turnToasts.ts";

const WIDTH = 1440;
const HEIGHT = 900;
const SEED = 2_202;
/** A sealed or revealed Contribution card in a payload (Fuel Ledger's own 2 included, v1.6.2 change 26). */
const CONTRIBUTION_CARD = /"card":"(?:BANK|TEND|STOKE|FUEL_LEDGER_BANK|FUEL_LEDGER_STOKE)"/;
const ENABLED_CARD = 'form.pane-form input[name="card"]:not([aria-disabled="true"])';

type Placement = {
  worker: "apprentice" | "shifu";
  location: string;
  /** Sub-editor radios to choose before the autopilot completes the rest (name, value). */
  picks?: ReadonlyArray<readonly [string, string]>;
};
type Plans = Readonly<Record<"host" | "guest", readonly Placement[]>>;

/** Round 1 placements, in each player's own order: a Shared Kiln ceramic for both, Lin's look. */
const PLANS: Plans = {
  host: [
    { worker: "apprentice", location: "form_decorate" },
    { worker: "apprentice", location: "glaze_load" },
    { worker: "shifu", location: "commission_market" },
    { worker: "apprentice", location: "canal_wharf" },
  ],
  guest: [
    { worker: "apprentice", location: "form_decorate" },
    { worker: "apprentice", location: "glaze_load" },
    { worker: "shifu", location: "canal_wharf" },
    { worker: "apprentice", location: "canal_wharf" },
  ],
};

interface Player {
  who: "host" | "guest";
  name: string;
  page: Page;
  /** Bodies of every local-backend response this client received, in order. */
  received: string[];
  placements: number;
  tick: number;
  errors: string[];
}

/**
 * Records every turn toast the page shows, with its player, as it appears, grows or gives way to
 * the next queued turn: they close by themselves after 3s, so the test reads the record instead
 * of racing them. Serialized into the page by `addInitScript`, so it stays self-contained.
 */
function recordTurnToasts(): void {
  const seen: Array<{ player: string; text: string }> = [];
  const keys = new Set<string>();
  (window as unknown as { __turnToasts: typeof seen }).__turnToasts = seen;
  const scan = (): void => {
    for (const toast of Array.from(document.querySelectorAll<HTMLElement>(".turn-toast"))) {
      const entry = { player: toast.dataset["playerId"] ?? "", text: toast.textContent ?? "" };
      const key = `${entry.player}|${entry.text}`;
      if (keys.has(key)) continue;
      keys.add(key);
      seen.push(entry);
    }
  };
  document.addEventListener("DOMContentLoaded", () => {
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
}

async function turnToastsSeen(player: Player): Promise<Array<{ player: string; text: string }>> {
  return player.page.evaluate(() => (window as unknown as { __turnToasts?: Array<{ player: string; text: string }> }).__turnToasts ?? []);
}

async function newPlayer(browser: Browser, info: TestInfo, who: Player["who"], name: string): Promise<Player> {
  const baseURL = info.project.use.baseURL;
  const context = await browser.newContext({ ...(baseURL === undefined ? {} : { baseURL }), viewport: { width: WIDTH, height: HEIGHT } });
  const page = await context.newPage();
  await page.addInitScript(recordTurnToasts);
  const player: Player = { who, name, page, received: [], placements: 0, tick: 0, errors: [] };
  page.on("response", (response) => {
    if (!response.url().includes("/test-api-v161")) return;
    void response.text().then(
      (text) => player.received.push(text),
      () => undefined,
    );
  });
  page.on("pageerror", (error) => player.errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") player.errors.push(`console: ${message.text()}`);
  });
  return player;
}

async function windowOf(page: Page): Promise<string | null> {
  return page.locator("form.pane-form[data-window]").first().getAttribute("data-window", { timeout: 1_000 }).catch(() => null);
}

async function revisionOf(page: Page): Promise<number> {
  const value = await page.locator("aside.pane").first().getAttribute("data-revision", { timeout: 1_000 }).catch(() => null);
  return value === null ? -1 : Number(value);
}

/** Presses the form's Confirm (or alternative) and waits for the answer: a new revision. */
async function send(player: Player, action: "confirm" | "alt"): Promise<void> {
  const button = player.page.locator(`form.pane-form [data-action="${action}"]`).first();
  await expect(button).not.toHaveAttribute("aria-disabled", "true");
  const before = await revisionOf(player.page);
  await button.click();
  await expect.poll(() => revisionOf(player.page), { timeout: 30_000, message: `${player.name}: no answer` }).toBeGreaterThan(before);
}

/** One autopilot move on this player's form; true when something was pressed. */
async function autopilot(player: Player, options: { within?: string; confirmChance?: number; altChance?: number } = {}): Promise<boolean> {
  player.tick += 1;
  const pick = await player.page.evaluate(autopilotPick, {
    seed: SEED + (player.who === "host" ? 0 : 7_919),
    tick: player.tick,
    confirmChance: options.confirmChance ?? 0.6,
    altChance: options.altChance ?? 0.2,
    ...(options.within === undefined ? {} : { within: options.within }),
  });
  if (pick.kind === "none" || pick.kind === "busy") return false;
  if (pick.kind === "choice") {
    const target = player.page.locator(pick.selector);
    await revealPastTurnToast(target);
    await target.click();
    return true;
  }
  const before = await revisionOf(player.page);
  await player.page.locator(pick.selector).click();
  await expect.poll(() => revisionOf(player.page), { timeout: 30_000, message: `${player.name}: no answer to ${pick.describe}` }).toBeGreaterThan(before);
  return true;
}

/** Checks a radio (or checkbox) of the form if it is not checked yet. */
async function choose(page: Page, name: string, value: string): Promise<void> {
  const input = page.locator(`form.pane-form input[name="${name}"][value="${value}"]`).first();
  await expect(input, `${name}=${value} is offered`).toBeAttached();
  if (!(await input.isChecked())) await input.click();
  await expect(input).toBeChecked();
}

/** Presses a table toggle (Place shortcut, Tech display target) if it is not pressed yet. */
async function press(page: Page, selector: string, what: string): Promise<void> {
  const target = page.locator(selector).first();
  await expect(target, `${what} is offered on the table`).toBeVisible();
  if ((await target.getAttribute("aria-pressed")) !== "true") {
    await revealPastTurnToast(target);
    await target.click();
  }
  await expect(target).toHaveAttribute("aria-pressed", "true");
}

/**
 * A sub-editor pick: the Guild Hall's discipline or Tech is chosen on the Tech display (owner
 * review, 2026-10-17); everything else is a radio of the form.
 */
async function pick(page: Page, name: string, value: string): Promise<void> {
  if (name === "discipline") return press(page, `[data-act="inspect"][data-discipline="${value}"]`, `inspect ${value}`);
  if (name === "techId") return press(page, `[data-act="tech"][data-tech-id="${value}"]`, `Tech ${value}`);
  return choose(page, name, value);
}

/** One steered Work Phase placement, then Confirm. Workers are placed from the table's Place shortcuts. */
async function place(player: Player, plans: Plans = PLANS): Promise<void> {
  const plan = plans[player.who][player.placements];
  if (plan === undefined) throw new Error(`${player.name} has no placement planned`);
  await press(player.page, `[data-act="place"][data-location-id="${plan.location}"][data-worker="${plan.worker}"]`, `Place ${plan.worker} at ${plan.location}`);
  for (const [name, value] of plan.picks ?? []) await pick(player.page, name, value);
  // The rest of the sub-editor (Shape, Decoration, vessel, Glaze, kiln space…) by the autopilot.
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const confirm = player.page.locator('form.pane-form [data-action="confirm"]').first();
    if ((await confirm.getAttribute("aria-disabled")) !== "true") break;
    if (!(await autopilot(player, { within: ".b4-sub-region", confirmChance: 0, altChance: 0 }))) throw new Error(`${player.name}: the ${plan.location} form cannot be completed`);
  }
  await send(player, "confirm");
  player.placements += 1;
}

async function secretIdsOf(request: Parameters<typeof backendCall>[0], roomCode: string, viewerSeat: number): Promise<string[]> {
  const result = await backendCall<{ ids: string[] }>(request, { operation: "e2e_secret_ids", roomCode, viewerSeat });
  if (!result.ok) throw new Error(`e2e_secret_ids failed: ${result.error.code}`);
  return result.value.ids;
}

/** Lin creates the room, Zhao joins it from another browser, Lin starts; returns the room code. */
async function startRoom(host: Player, guest: Player): Promise<string> {
  await host.page.goto("next/");
  await host.page.locator('input[name="displayName"]').fill(host.name);
  await host.page.locator('[data-action="create-room"]').click();
  const code = (await host.page.locator("[data-room-code]").getAttribute("data-room-code")) ?? "";
  expect(code).not.toBe("");
  await guest.page.goto("next/");
  await guest.page.locator('input[name="displayName"]').fill(guest.name);
  await guest.page.locator('input[name="roomCode"]').fill(code);
  await guest.page.locator('[data-action="join-room"]').click();
  await expect(host.page.locator("[data-seat-index]")).toHaveCount(2, { timeout: 15_000 });
  await expect(guest.page.locator("[data-seat-index]")).toHaveCount(2, { timeout: 15_000 });
  await host.page.locator('[data-action="start-game"]').click();
  for (const player of [host, guest]) await expect(player.page.locator("aside.pane")).toBeAttached({ timeout: 15_000 });
  return code;
}

/** The viewer's own player ID, from the decision pane's own summary. */
async function playerIdOf(player: Player): Promise<string> {
  const id = (await player.page.locator(".own[data-player-id]").first().getAttribute("data-player-id")) ?? "";
  expect(id, `${player.name}'s player ID`).not.toBe("");
  return id;
}

/** No payload `viewer` received carries a secret addressed to `owner`; `owner`'s own client did receive some. */
function expectSecretsAddressed(viewer: Player, owner: Player, ownerId: string): void {
  const addressed = `"visibleTo":"${ownerId}"`;
  expect(owner.received.some((text) => text.includes(addressed)), `${owner.name}'s client received its own secrets`).toBe(true);
  for (const text of viewer.received) expect(text.includes(addressed), `a secret for ${owner.name} reached ${viewer.name}'s client`).toBe(false);
}

/**
 * IDs only `owner` may see: secret for `viewer` by the backend's oracle (when `oracle`), never on
 * `viewer`'s page, and never in a payload `viewer` received since `from`.
 */
async function expectHiddenFrom(viewer: Player, ids: readonly string[], from: number, oracle: string[] | null, what: string): Promise<void> {
  const html = await viewer.page.content();
  for (const id of ids) {
    if (oracle !== null) expect(oracle, `${what}: ${id} is secret for ${viewer.name}`).toContain(id);
    expect(html, `${what}: ${id} on ${viewer.name}'s page`).not.toMatch(new RegExp(`\\b${id}\\b`));
    for (const text of viewer.received.slice(from)) expect(text, `${what}: ${id} reached ${viewer.name}'s client`).not.toMatch(new RegExp(`"${id}"`));
  }
}

test.skip(({ viewport }) => viewport?.width !== WIDTH || viewport.height !== HEIGHT, "two browser contexts at 1440 only");

test("the secret Contribution and the private Commission look stay with their owner", async ({ browser, request }, testInfo) => {
  test.setTimeout(300_000);
  await resetBackend(request, { seed: SEED, policy: "canonical" });
  const host = await newPlayer(browser, testInfo, "host", "Lin");
  const guest = await newPlayer(browser, testInfo, "guest", "Zhao");

  // Lin creates the room; Zhao joins it from another browser; Lin starts.
  const code = await startRoom(host, guest);

  let lookChecked = false;
  let lookedIds: string[] = [];
  let contributionChecked = false;
  for (let step = 0; step < 400 && !contributionChecked; step += 1) {
    let acted = false;
    for (const player of [host, guest]) {
      const window = await windowOf(player.page);
      if (window === null || window === "waiting" || window === "final") continue;
      const other = player === host ? guest : host;

      if (window === "work" && (await player.page.locator('[data-act="place"]').count()) > 0) {
        await place(player);
        acted = true;
        continue;
      }

      if (window === "commission" && player === host && !lookChecked) {
        // Lin's private look: the 3 Orders only Lin can see.
        const looked = host.page.locator(".ordwrap--look [data-order-id]");
        await expect(looked).toHaveCount(3);
        const ids = await looked.evaluateAll((cards) => cards.map((card) => card.getAttribute("data-order-id") ?? ""));
        lookedIds = ids;
        const receivedFrom = guest.received.length;
        // Zhao's waiting pane says who is looking at how many cards, never which.
        await expect(guest.page.locator("[data-waiting]")).toContainText(`${host.name} is looking at 3 cards in private`, { timeout: 10_000 });
        await expect(guest.page.locator(".ordwrap--look")).toHaveCount(0);
        const guestSecrets = await secretIdsOf(request, code, 1);
        const guestHtml = await guest.page.content();
        for (const id of ids) {
          expect(guestSecrets, `${id} is secret for Zhao`).toContain(id);
          expect(guestHtml, `${id} on Zhao's page`).not.toMatch(new RegExp(`\\b${id}\\b`));
        }
        for (const id of guestSecrets) expect(guestHtml, `secret ${id} on Zhao's page`).not.toMatch(new RegExp(`\\b${id}\\b`));
        // Lin reserves one of them (the Shifu effect may reserve up to 2, from the display and the
        // look); the other two are discarded face down (R25), still secret.
        await choose(host.page, "reservations", `look:${ids[0]!}`);
        await send(host, "confirm");
        lookChecked = true;
        await guest.page.waitForTimeout(1_500);
        for (const text of guest.received.slice(receivedFrom)) for (const id of ids) expect(text, `${id} reached Zhao's client`).not.toMatch(new RegExp(`"${id}"`));
        acted = true;
        continue;
      }

      if (window === "contributions") {
        // Lin submits first; Zhao's page waits for that.
        if (player === guest) continue;
        // Both players have a Shared Kiln ceramic, so both are eligible (L239).
        await expect(other.page.locator('form.pane-form[data-window="contributions"]')).toBeAttached({ timeout: 15_000 });
        await host.page.locator(ENABLED_CARD).first().click();
        const card = await host.page.locator('form.pane-form input[name="card"]:checked').getAttribute("value");
        const guestFrom = guest.received.length;
        const hostFrom = host.received.length;
        await send(host, "confirm");

        // Lin sees the sealed card, marked "only you"; nothing is revealed yet.
        await expect(host.page.locator("[data-sealed-contribution]")).toBeVisible();
        await expect(host.page.locator("[data-contribution]")).toHaveCount(0);
        expect(host.received.slice(hostFrom).some((text) => text.includes(`"card":"${card}"`)), "Lin's client holds Lin's sealed card").toBe(true);
        // Zhao sees only that Lin has chosen, and Zhao's client never receives a card.
        await expect(guest.page.locator('form.pane-form[data-window="contributions"]')).toBeAttached();
        await guest.page.waitForTimeout(1_500);
        await expect(guest.page.locator("[data-sealed-contribution], [data-contribution]")).toHaveCount(0);
        for (const text of guest.received.slice(guestFrom)) expect(text, "a Contribution card reached Zhao's client before the reveal").not.toMatch(CONTRIBUTION_CARD);

        // Zhao submits: both cards are revealed to both players. Since revision 4 there is no
        // Heat-marker step, so a firing with no decision left finishes at once and the reveal is
        // read where it stays (the owner removed the last-firing recap, D16): the public reveal
        // event reaches both clients, and both game logs show the reveal naming both players.
        const revealFrom = { host: host.received.length, guest: guest.received.length };
        await guest.page.locator(ENABLED_CARD).last().click();
        await send(guest, "confirm");
        for (const [viewer, from] of [[host, revealFrom.host], [guest, revealFrom.guest]] as const) {
          await expect
            .poll(() => viewer.received.slice(from).some((text) => text.includes("CONTRIBUTIONS_REVEALED") && text.includes(`"card":"${card}"`)), { timeout: 15_000 })
            .toBe(true);
          const logButton = viewer.page.locator("button.game-log-button");
          if ((await logButton.getAttribute("aria-expanded")) !== "true") await logButton.click();
          const reveal = viewer.page.locator(".game-log-entry", { hasText: "Contributions revealed" }).last();
          await expect(reveal).toBeVisible({ timeout: 15_000 });
          await expect(reveal).toContainText("Lin");
          await expect(reveal).toContainText("Zhao");
          await logButton.click();
          await expect(logButton).toHaveAttribute("aria-expanded", "false");
        }
        contributionChecked = true;
        acted = true;
        break;
      }

      // Every other window (Kiln selection, the Commission steps, the end of a turn…).
      if (await autopilot(player)) acted = true;
    }
    if (!acted) await host.page.waitForTimeout(200);
  }
  expect(lookChecked, "Lin looked at the top 3 Main Orders").toBe(true);
  expect(contributionChecked, "both players contributed").toBe(true);
  expectSecretsAddressed(guest, host, await playerIdOf(host));

  // The turn toasts on Zhao's page: Lin's moves only, in public words.
  const hostId = await playerIdOf(host);
  // One turn at a time, 3s each: Lin's Commission Market turn may still wait behind the earlier ones.
  const sawCommission = async () => (await turnToastsSeen(guest)).some((toast) => toast.player === hostId && toast.text.includes(`${host.name} placed their Shifu at Commission Market`));
  await expect.poll(sawCommission, { timeout: 60_000, message: "Zhao saw a toast of Lin's Commission Market turn" }).toBe(true);
  const toasts = await turnToastsSeen(guest);
  for (const toast of toasts) {
    expect(toast.player, `a toast of Zhao's own move: ${toast.text}`).toBe(hostId);
    for (const id of lookedIds) expect(toast.text, `the looked-at ${id} in a toast`).not.toMatch(new RegExp(`\\b${id}\\b`));
  }
  expect([...host.errors, ...guest.errors]).toEqual([]);
});

/**
 * Seed 36 (two players, owner revision 4's setup): the Glazing & Loading display shows Colour
 * Samples (T10, 2 Coins), the Firing display Test Pieces (T13, 3 Coins), and the Glazing & Loading
 * deck has two other Techs on top for the inspection. Lin's first Apprentice earns the 2 Coins that
 * make both takes affordable (3 + 2 = 2 + 3). In Round 2 Glaze & Load burns 1 Wood (kiln fuel,
 * change 35) and Lin still has the Wood Test Pieces costs.
 */
const LOOKS_SEED = 36;
const LOOKS_PLANS: Plans = {
  host: [
    // Round 1: Coins first, then the Shifu's two takes at the Guild Hall (Colour Samples, then Test Pieces).
    { worker: "apprentice", location: "canal_wharf" },
    { worker: "shifu", location: "guild_hall", picks: [["discipline", "glazing_loading"]] },
    { worker: "apprentice", location: "canal_wharf" },
    { worker: "apprentice", location: "canal_wharf" },
    // Round 2: a Shared Kiln ceramic, so Lin contributes and may use Test Pieces.
    { worker: "apprentice", location: "form_decorate" },
    { worker: "apprentice", location: "glaze_load" },
    { worker: "shifu", location: "canal_wharf" },
    { worker: "apprentice", location: "canal_wharf" },
  ],
  guest: [
    { worker: "apprentice", location: "form_decorate" },
    { worker: "apprentice", location: "glaze_load" },
    { worker: "shifu", location: "canal_wharf" },
    { worker: "apprentice", location: "canal_wharf" },
    { worker: "apprentice", location: "canal_wharf" },
    { worker: "apprentice", location: "canal_wharf" },
    { worker: "shifu", location: "canal_wharf" },
    { worker: "apprentice", location: "canal_wharf" },
  ],
};

test("the Guild Hall inspection and its two takes, the Colour Samples look and the Test Pieces peek stay with their owner", async ({ browser, request }, testInfo) => {
  test.setTimeout(600_000);
  await resetBackend(request, { seed: LOOKS_SEED, policy: "canonical" });
  const host = await newPlayer(browser, testInfo, "host", "Lin");
  const guest = await newPlayer(browser, testInfo, "guest", "Zhao");
  const code = await startRoom(host, guest);
  const hostId = await playerIdOf(host);

  let inspected: string[] = [];
  let inspectedFrom = 0;
  let secondTake = false;
  let returned = false;
  let looked: string[] = [];
  let lookedFrom = 0;
  let peeked = false;
  for (let step = 0; step < 800 && !peeked; step += 1) {
    let acted = false;
    for (const player of [host, guest]) {
      const window = await windowOf(player.page);
      if (window === null || window === "waiting" || window === "final") continue;

      if (window === "work" && (await player.page.locator('[data-act="place"]').count()) > 0) {
        await place(player, LOOKS_PLANS);
        acted = true;
        continue;
      }

      if (window === "guild_inspection" && player === host) {
        const form = host.page.locator('[data-b4="guild-inspection"]');
        if ((await form.getAttribute("data-return-only")) !== null) {
          // Both takes made: only the bottom order of the two inspected Techs is left (B2), and Lin changes it.
          await expect(form.locator('input[name="take"]')).toHaveCount(0);
          const reorder = host.page.locator(".kit-reorder-list li").first().locator('.kit-reorder-buttons button:not([aria-disabled="true"])').first();
          await reorder.click();
          await send(host, "confirm");
          returned = true;
        } else if ((await form.getAttribute("data-takes")) === "0") {
          // Lin's private inspection: the two Techs from the top of the deck, only Lin sees them.
          inspected = await form.locator("fieldset").first().locator('input[name="take"]').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
          expect(inspected, "two inspected Techs").toHaveLength(2);
          expect(inspected).not.toContain("T10");
          inspectedFrom = guest.received.length;
          await expect(guest.page.locator('[data-b4="guild-inspection"]')).toHaveCount(0);
          await expectHiddenFrom(guest, inspected, 0, await secretIdsOf(request, code, 1), "inspection");
          // The first take: the face-up Colour Samples, at its printed cost.
          await choose(host.page, "take", "T10");
          await send(host, "confirm");
        } else {
          // The second take, of another discipline: the face-up Test Pieces. The inspected Techs
          // (Glazing & Loading, like Colour Samples) are still shown, unavailable, and still private.
          await expectHiddenFrom(guest, inspected, inspectedFrom, null, "inspection, second take");
          await choose(host.page, "take", "T13");
          await send(host, "confirm");
          secondTake = true;
        }
        acted = true;
        continue;
      }

      if (window === "colour_samples" && player === host) {
        // Colour Samples when gained, its Select 3: the top 3 Main Orders, only Lin sees them (the
        // display's Orders are the other reservations offered, change 25).
        const options = host.page.locator('form.pane-form input[name="reservations"][value^="look:"]');
        await expect(options).toHaveCount(3);
        looked = await options.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value.replace(/^look:/, "")));
        await expect(host.page.locator('form.pane-form input[name="reservations"][value^="slot:"]').first()).toBeAttached();
        lookedFrom = guest.received.length;
        await expect(guest.page.locator('[data-b4="colour-samples"]')).toHaveCount(0);
        await expectHiddenFrom(guest, looked, 0, await secretIdsOf(request, code, 1), "Colour Samples look");
        // One into Lin's hand, two discarded face down (R25): all three stay secret for Zhao.
        await choose(host.page, "reservations", `look:${looked[0]!}`);
        await send(host, "confirm");
        await guest.page.waitForTimeout(1_500);
        await expectHiddenFrom(guest, looked, lookedFrom, await secretIdsOf(request, code, 1), "after the Colour Samples look");
        acted = true;
        continue;
      }

      if (window === "contributions") {
        // Tend costs no Wood, so Lin keeps 1 Wood for Test Pieces.
        const card = player === host ? player.page.locator('form.pane-form input[name="card"][value="TEND"]') : player.page.locator(ENABLED_CARD).first();
        if ((await player.page.locator("[data-sealed-contribution]").count()) > 0) continue;
        await card.click();
        await send(player, "confirm");
        acted = true;
        continue;
      }

      if (window === "test_pieces" && player === host) {
        const peek = host.page.locator('form.pane-form input[name="peek"]');
        if ((await peek.count()) > 0) {
          const guestFrom = guest.received.length;
          await choose(host.page, "peek", "peek");
          await send(host, "confirm");
          // Lin sees the card, marked "only you"; Zhao sees neither the card nor its value.
          await expect(host.page.locator('form.pane-form input[name="bury"]').first()).toBeAttached();
          await expect(host.page.locator(".dw-sec", { hasText: "The card you saw" })).toBeVisible();
          await guest.page.waitForTimeout(1_500);
          await expect(guest.page.locator('form.pane-form[data-window="test_pieces"]')).toHaveCount(0);
          await expect(guest.page.getByText("The card you saw")).toHaveCount(0);
          for (const text of guest.received.slice(guestFrom)) expect(text, "the Test Pieces peek reached Zhao's client").not.toMatch(/"type":"TEST_PIECES_PEEKED"[^}]*"secret"/);
          expect(host.received.some((text) => /TEST_PIECES_PEEKED/.test(text)), "Lin's client received the peek").toBe(true);
          await choose(host.page, "bury", "bury");
          await send(host, "confirm");
          peeked = true;
          acted = true;
          break;
        }
      }

      if (await autopilot(player)) acted = true;
    }
    if (!acted) await host.page.waitForTimeout(200);
  }
  expect(inspected, "Lin inspected the Glazing & Loading deck").toHaveLength(2);
  expect(secondTake, "Lin's Shifu took a second Tech of another discipline").toBe(true);
  expect(returned, "Lin chose the bottom order of the two inspected Techs").toBe(true);
  expect(looked, "Lin looked at the top 3 Main Orders").toHaveLength(3);
  expect(peeked, "Lin peeked with Test Pieces").toBe(true);
  // The inspected Techs (still in the deck) and the looked-at Orders never reached Zhao.
  const oracle = await secretIdsOf(request, code, 1);
  await expectHiddenFrom(guest, inspected.filter((id) => oracle.includes(id)), inspectedFrom, null, "inspection, at the end");
  await expectHiddenFrom(guest, looked, lookedFrom, oracle, "Colour Samples, at the end");
  expectSecretsAddressed(guest, host, hostId);
  expect([...host.errors, ...guest.errors]).toEqual([]);
});
