import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

test("the host can end a session for everyone while Leave view remains resumable", async ({ browser, request }) => {
  await request.post("http://127.0.0.1:4173/test-api", {
    headers: { "x-e2e-user": "reset" },
    data: { operation: "e2e_reset", seed: 11 },
  });

  const { host, guest, close } = await openTwoWorkshops(browser);
  try {
    await host.goto("./");
    await host.getByLabel("Workshop name").fill("Mei");
    await host.getByRole("button", { name: "Create a room" }).click();
    const roomCode = (await host.getByTestId("room-code").textContent())?.trim() ?? "";

    await guest.goto("./");
    await guest.getByRole("tab", { name: "Join game" }).click();
    await guest.getByLabel("Room code").fill(roomCode);
    await guest.getByLabel("Workshop name").fill("Ren");
    await guest.getByRole("button", { name: "Join the workshop" }).click();

    await expect(guest.getByRole("button", { name: "End session", exact: true })).toHaveCount(0);
    await expect(guest.locator(".room-role")).toHaveText("Guest");
    await expect(host.locator(".room-role")).toHaveText("Host");
    await host.getByRole("button", { name: "End session", exact: true }).click();
    await expect(host.getByRole("dialog", { name: `End room ${roomCode} for everyone?` })).toBeVisible();
    await host.getByRole("button", { name: "Keep playing" }).click();
    await expect(host.getByRole("heading", { name: `Room ${roomCode}` })).toBeVisible();

    await host.getByRole("button", { name: "End session", exact: true }).click();
    await host.getByRole("button", { name: "End session for everyone" }).click();
    await expect(host.getByRole("heading", { name: "This workshop session has ended." })).toBeVisible();
    await expect(host.getByText("Mei ended room")).toBeVisible();
    await expect(guest.getByRole("heading", { name: "This workshop session has ended." })).toBeVisible();
    await expect(guest.getByText("Mei ended room")).toBeVisible();

    await guest.reload();
    await expect(guest.getByRole("heading", { name: "This workshop session has ended." })).toBeVisible();
    await guest.getByRole("button", { name: "Leave view" }).click();
    await expect(guest.getByLabel("Saved session")).toContainText(`Room ${roomCode}`);
    await guest.getByRole("button", { name: "Resume" }).click();
    await expect(guest.getByRole("heading", { name: "This workshop session has ended." })).toBeVisible();
    await guest.getByRole("button", { name: "Return home" }).click();
    await expect(guest.getByLabel("Saved session")).toContainText(`Room ${roomCode}`);
    await guest.getByRole("button", { name: "Forget seat" }).click();
    await expect(guest.getByLabel("Saved session")).toHaveCount(0);
    await expect(guest.getByLabel("Workshop name")).toBeVisible();
    expect(await guest.evaluate(() => localStorage.getItem("kiln-opening:last-seat"))).toBeNull();
  } finally {
    await close();
  }
});

test("starting Orders remain visible after an eligible redraw advances directly to Work", async ({ browser, request }) => {
  await request.post("http://127.0.0.1:4173/test-api", {
    headers: { "x-e2e-user": "reset" },
    data: { operation: "e2e_reset", seed: 2 },
  });

  const { host, guest, close } = await openTwoWorkshops(browser);
  try {
    await host.goto("./");
    await host.getByLabel("Workshop name").fill("Mei");
    await host.getByRole("button", { name: "Create a room" }).click();
    const roomCode = (await host.getByTestId("room-code").textContent())?.trim();

    await guest.goto("./");
    await guest.getByRole("tab", { name: "Join game" }).click();
    await guest.getByLabel("Room code").fill(roomCode ?? "");
    await guest.getByLabel("Workshop name").fill("Ren");
    await guest.getByRole("button", { name: "Join the workshop" }).click();
    await host.getByRole("button", { name: "Start with 2 players" }).click();

    await host.getByRole("button", { name: /Ru Kiln/ }).click();
    await guest.getByRole("button", { name: /Guan Kiln/ }).click();
    await expect(host.getByRole("heading", { name: "Your first commission" })).toBeVisible();
    await expect(host.getByRole("region", { name: "Workshop Orders" })).toContainText("M23");
    await expect(host.locator(".player-board.is-own")).toContainText("4 available workers · 2 locked");
    await expect(host.locator(".site-footer")).toContainText("Kiln Opening V1.0.4");

    await host.getByRole("button", { name: "Redraw" }).click();
    await expect(host.getByTestId("phase-name")).toHaveText("Work Phase");
    await expect(guest.getByTestId("phase-name")).toHaveText("Work Phase");

    for (const page of [host, guest]) {
      const progress = page.getByRole("region", { name: "Imperial Progress" });
      await expect(progress.locator("[data-progress-space]")).toHaveCount(6);
      await expect(progress.locator('[data-progress-space="0"] .progress-marker')).toHaveCount(2);
      await expect(progress).toContainText("Prefectural Recommendation");
      await expect(progress).toContainText("Awaiting Audience");
      await expect(progress).toContainText("Exhibition capacity 3");
      await expect(progress).toContainText("Single-ceramic Imperial Orders advance 1 space; multi-ceramic Imperial Orders advance 2");
      await expect(progress.getByTestId("imperial-seal-owner")).toHaveText("Imperial Seal · Unclaimed · 2 VP");
      const orders = page.getByRole("region", { name: "Workshop Orders" });
      await expect(orders.locator(".order-card")).toHaveCount(2);
      await expect(orders).toContainText("M16");
      await expect(orders).not.toContainText("M23");
    }

    const materials = guest.locator("details").filter({ hasText: "Materials Yard" });
    await materials.getByLabel("Worker").selectOption({ index: 1 });
    await expect(materials.getByRole("button", { name: "Gather materials" })).toBeEnabled();
    await materials.getByLabel("Clay").fill("3");
    await expect(materials.getByRole("button", { name: "Gather materials" })).toBeDisabled();
    await expect(materials.getByRole("status")).toContainText("exactly 3 total");
    await materials.getByLabel("Wood").fill("0");
    await expect(materials.getByRole("button", { name: "Gather materials" })).toBeEnabled();

    const forming = guest.locator("details").filter({ hasText: "Forming Studio" });
    await forming.getByText("Forming Studio", { exact: true }).click();
    await forming.getByLabel("Worker").selectOption({ index: 1 });
    await forming.getByLabel("Second shape (Shifu only)").selectOption("plate");
    await expect(forming.getByRole("button", { name: "Form ceramics" })).toBeDisabled();
    await expect(forming.getByRole("status")).toContainText("Apprentice may form only one");

    const glazing = guest.locator("details").filter({ hasText: "Glaze Workshop" });
    await glazing.getByText("Glaze Workshop", { exact: true }).click();
    await expect(glazing.locator('select[name="decoration1"] option')).toHaveText([
      "Plain · 1 Coin",
      "Carved · 2 Coins",
      "Impressed · 2 Coins",
      "Crackle · 2 Coins",
    ]);
    await expect(glazing.getByRole("button", { name: "Apply glaze" })).toBeDisabled();
    await expect(glazing.getByRole("status")).toContainText("no Shaped ceramic");

    const kilnYard = guest.locator("details").filter({ hasText: "Kiln Yard" });
    await kilnYard.getByText("Kiln Yard", { exact: true }).click();
    await expect(kilnYard.getByRole("button", { name: "Load kiln" })).toBeDisabled();
    await expect(kilnYard.getByRole("status")).toContainText("no Glazed ceramic");
    await expect(kilnYard).toContainText("gives no Wood");

    const imperialCards = guest.locator(".orders-board .order-imperial");
    await expect(imperialCards).toHaveCount(4);
    await expect(imperialCards.locator(".order-progress-reward")).toHaveCount(4);
    for (const reward of await imperialCards.locator(".order-progress-reward").allTextContents()) {
      expect(reward).toMatch(/^\+[12] Imperial Progress$/);
    }

    const office = guest.locator("details").filter({ hasText: "Market & Imperial Office" });
    await office.getByText("Market & Imperial Office", { exact: true }).click();
    await office.getByLabel("Worker").selectOption({ index: 1 });
    await expect(office.locator('select[name="officeAction"] option')).toHaveText(["coins", "take one"]);
    await expect(office).toContainText("optionally sell 1 Flawed ceramic");
    await expect(office.getByRole("button", { name: "Visit the Office" })).toBeEnabled();

    await office.getByLabel("Worker").selectOption({ index: 0 });
    await expect(office.locator('select[name="officeAction"] option').filter({ hasText: "Court Patronage · 5 Coins · +1 Progress" })).toHaveCount(1);
    await office.getByLabel("Office action").selectOption("court_patronage");
    await expect(office.getByRole("status")).toContainText("Complete an Imperial Order first");
    await expect(office.getByRole("button", { name: "Visit the Office" })).toBeDisabled();

    const guild = guest.locator("details").filter({ hasText: "Guild & Academy" });
    await guild.getByText("Guild & Academy", { exact: true }).click();
    await expect(guild).not.toContainText("Shifu only");
    await expect(guild).toContainText("Apprentice: pay printed cost");
    await expect(guild).toContainText("Shifu: may refresh one tile");
    await expect(guild.getByLabel("Worker")).toBeVisible();
    await expect(guild.getByRole("button", { name: "Begin Guild action" })).toBeEnabled();
    const firstTechniqueTile = guest.locator(".technique-tile").first();
    const firstTechniqueId = await firstTechniqueTile.getAttribute("data-technique-id");
    expect(firstTechniqueId).toMatch(/^T\d{2}$/);
    await expect(firstTechniqueTile).toContainText(firstTechniqueId ?? "");
    await guild.getByRole("button", { name: "Begin Guild action" }).click();
    await expect(guest.getByRole("button", { name: new RegExp(`^Replace ${firstTechniqueId} ·`) })).toBeVisible();
    await guest.getByRole("button", { name: "Keep the display" }).click();
    await guest.locator(".playtest-piece-command:not(:disabled)").first().click();

    const fullGuild = host.locator("details").filter({ hasText: "Guild & Academy" });
    await expect(fullGuild.getByText("Full", { exact: true })).toBeVisible();
    await fullGuild.getByText("Guild & Academy", { exact: true }).click();
    await expect(fullGuild.getByRole("button", { name: "Begin Guild action" })).toBeDisabled();
    await expect(fullGuild.getByRole("status")).toContainText("Guild & Academy is full");

    const hostOffice = host.locator("details").filter({ hasText: "Market & Imperial Office" });
    await hostOffice.getByText("Market & Imperial Office", { exact: true }).click();
    await hostOffice.getByLabel("Office action").selectOption("take_one_and_gain_two_coins");
    await hostOffice.getByRole("button", { name: "Visit the Office" }).click();
    await expect(host.getByRole("button", { name: /Blind draw the top Market Order/ })).toBeVisible();
    await expect(host.getByRole("button", { name: /Blind draw the top Imperial Order/ })).toBeVisible();
    await host.getByRole("button", { name: /Blind draw the top Market Order/ }).click();
    await expect(host.getByText(/Blind Market draw committed and revealed:/)).toBeVisible();
    await expect(host.getByTestId("phase-name")).toHaveText("Office — Optional Flawed sale");
    await expect(host.getByRole("heading", { name: "Sell Flawed Ceramics" })).toBeVisible();
    await expect(host.locator("body")).toContainText("You have no eligible Finished Flawed ceramics.");
    await host.getByRole("button", { name: "Continue without selling" }).click();
    await expect(guest.getByTestId("phase-name")).toHaveText("Work Phase");

    await host.setViewportSize({ width: 390, height: 844 });
    const mobileProgress = host.getByRole("region", { name: "Imperial Progress" });
    await expect(mobileProgress).toBeVisible();
    await expect(mobileProgress.locator(".progress-marker")).toHaveCount(2);
    await expect(mobileProgress.locator('[data-progress-space="5"]')).toContainText("Imperial Audience");
    await expect(mobileProgress.locator("table")).toBeVisible();
  } finally {
    await close();
  }
});

test("two workshops complete a firing, Order, reconnect, and five-round game", async ({ browser, request }) => {
  await request.post("http://127.0.0.1:4173/test-api", {
    headers: { "x-e2e-user": "reset" },
    data: { operation: "e2e_reset", seed: 1584 },
  });

  const { host, guest, close } = await openTwoWorkshops(browser);
  try {
    await host.goto("./");
    await host.getByLabel("Workshop name").fill("Mei");
    await host.getByRole("button", { name: "Create a room" }).click();
    const roomCode = (await host.getByTestId("room-code").textContent())?.trim();
    expect(roomCode).toMatch(/^T\d{5}$/);

    await guest.goto("./");
    await guest.getByRole("tab", { name: "Join game" }).click();
    await guest.getByLabel("Room code").fill(roomCode ?? "");
    await guest.getByLabel("Workshop name").fill("Ren");
    await guest.getByRole("button", { name: "Join the workshop" }).click();

    const start = host.getByRole("button", { name: "Start with 2 players" });
    await expect(start).toBeEnabled();
    await start.click();

    // Reverse-order tradition selection: seat one chooses before the First Player in this seed.
    await host.getByRole("button", { name: /Ru Kiln/ }).click();
    await guest.getByRole("button", { name: /Guan Kiln/ }).click();
    await expect(guest.getByTestId("phase-name")).toHaveText("Work Phase");

    // The deterministic commissions are M09 (Moon-white Vase) and M10 (carved Moon-white Censer).
    const guestForming = guest.locator("details").filter({ hasText: "Forming Studio" });
    await guestForming.getByText("Forming Studio", { exact: true }).click();
    await guestForming.getByLabel("Worker").selectOption({ index: 1 });
    await guestForming.getByLabel("Second shape (Shifu only)").selectOption("plate");
    await expect(guestForming.getByRole("button", { name: "Form ceramics" })).toBeDisabled();
    await expect(guestForming.getByRole("status")).toContainText("Apprentice may form only one");
    await guestForming.getByLabel("Worker").selectOption({ index: 0 });
    await guestForming.getByLabel("Second shape (Shifu only)").selectOption("");
    await guest.getByLabel("First shape").selectOption("vase");
    await guest.getByRole("button", { name: "Form ceramics" }).click();
    const hostForming = host.locator("details").filter({ hasText: "Forming Studio" });
    await hostForming.getByText("Forming Studio", { exact: true }).click();
    await hostForming.getByLabel("First shape").selectOption("censer");
    await hostForming.getByRole("button", { name: "Form ceramics" }).click();

    const fullForming = guest.locator("details").filter({ hasText: "Forming Studio" });
    await expect(fullForming.getByText("Full", { exact: true })).toBeVisible();
    await fullForming.getByText("Forming Studio", { exact: true }).click();
    await expect(fullForming.getByRole("button", { name: "Form ceramics" })).toBeDisabled();

    const guestGlaze = guest.locator("details").filter({ hasText: "Glaze Workshop" });
    await guestGlaze.getByText("Glaze Workshop", { exact: true }).click();
    await guestGlaze.getByLabel("Shifu mode").selectOption("free_single");
    await expect(guestGlaze.getByRole("button", { name: "Apply glaze" })).toBeDisabled();
    await expect(guestGlaze.getByRole("status")).toContainText("Only the Shifu");
    await guestGlaze.getByLabel("Shifu mode").selectOption("normal");
    await expect(guestGlaze.getByRole("button", { name: "Apply glaze" })).toBeEnabled();
    await guestGlaze.getByLabel("First glaze").selectOption("moon_white");
    await guestGlaze.getByLabel("First decoration").selectOption("plain");
    await guestGlaze.getByRole("button", { name: "Apply glaze" }).click();
    const hostGlaze = host.locator("details").filter({ hasText: "Glaze Workshop" });
    await hostGlaze.getByText("Glaze Workshop", { exact: true }).click();
    await hostGlaze.getByLabel("First glaze").selectOption("moon_white");
    await hostGlaze.getByLabel("First decoration").selectOption("carved");
    await hostGlaze.getByRole("button", { name: "Apply glaze" }).click();

    const fullGlaze = guest.locator("details").filter({ hasText: "Glaze Workshop" });
    await expect(fullGlaze.getByText("Full", { exact: true })).toBeVisible();

    const kilnYard = guest.locator("details").filter({ hasText: "Kiln Yard" });
    await kilnYard.getByText("Kiln Yard", { exact: true }).click();
    await kilnYard.locator('select[name="ceramic1"]').selectOption({ index: 1 });
    await kilnYard.getByLabel("First kiln space").selectOption("high_1");
    await kilnYard.locator('select[name="ceramic2"]').selectOption({ index: 1 });
    await expect(kilnYard.getByRole("button", { name: "Load kiln" })).toBeDisabled();
    await expect(kilnYard.getByRole("status")).toContainText("Apprentice may load at most one");
    await kilnYard.locator('select[name="ceramic2"]').selectOption("");
    await kilnYard.getByRole("button", { name: "Load kiln" }).click();
    const hostKilnYard = host.locator("details").filter({ hasText: "Kiln Yard" });
    await hostKilnYard.getByText("Kiln Yard", { exact: true }).click();
    await hostKilnYard.locator('select[name="ceramic1"]').selectOption({ index: 1 });
    await hostKilnYard.getByLabel("First kiln space").selectOption("middle_1");
    await hostKilnYard.getByRole("button", { name: "Load kiln" }).click();

    // V1.0.4 retains four initially usable workers; both may pass the last one.
    await guest.getByRole("button", { name: "Pass for this round" }).click();
    await host.getByRole("button", { name: "Pass for this round" }).click();

    // The locked amount is private: the submitter sees 2, while the opponent sees only status.
    await expect(guest.getByRole("heading", { name: "Choose Wood in secret" })).toBeVisible();
    await guest.getByRole("button", { name: "2 Wood" }).click();
    await expect(guest.getByRole("heading", { name: "Contribution locked" })).toBeVisible();
    await expect(guest.locator(".secret-value")).toContainText("2 Wood");
    await expect(host.getByRole("heading", { name: "Choose Wood in secret" })).toBeVisible();
    await expect(host.getByText("Ren: submitted (value hidden)")).toBeVisible();
    await expect(host.locator(".secret-value")).toHaveCount(0);
    await host.getByRole("button", { name: "2 Wood" }).click();
    await expect(guest.getByTestId("phase-name")).toHaveText("Order Phase");
    for (const page of [host, guest]) {
      const firingResult = page.getByTestId("last-firing-result");
      await expect(firingResult).toBeVisible();
      await expect(firingResult).toContainText("Fire card");
      await expect(firingResult).toContainText("Final Global Heat");
      await expect(firingResult).toContainText("Base + Fire");
    }
    await expect(guest.getByText("Reconnected to the latest authoritative state.")).toHaveCount(0);
    const revisionBeforeReconnect = await guest.getByTestId("revision").textContent();
    await guest.getByRole("button", { name: "Reconnect" }).click();
    await expect(guest.getByText("Reconnected to the latest authoritative state.")).toHaveCount(0);
    await expect(guest.getByTestId("revision")).toHaveText(revisionBeforeReconnect ?? "");
    await expect(guest.getByTestId("phase-name")).toHaveText("Order Phase");

    const completion = guest.locator(".completion-card").filter({ hasText: "M09" });
    await completion.getByRole("checkbox").first().check();
    await completion.getByRole("button", { name: "Complete M09" }).click();
    await expect(completion).toHaveCount(0);

    // Refresh exercises persisted seat recovery against the current authoritative revision.
    await guest.reload();
    await expect(guest.getByTestId("room-code")).toHaveText(roomCode ?? "");
    await expect(guest.getByTestId("phase-name")).toHaveText("Order Phase");
    await guest.getByRole("button", { name: "End Order turn" }).click();
    const hostCompletion = host.locator(".completion-card").filter({ hasText: "M10" });
    await hostCompletion.getByRole("checkbox").first().check();
    await hostCompletion.getByRole("button", { name: "Complete M10" }).click();
    await host.getByRole("button", { name: "End Order turn" }).click();

    // Rounds 2–5: both workshops pass, then close their Order turns. No kiln load means firing skips.
    await finishEmptyRound(host, guest);
    await finishEmptyRound(guest, host);
    await finishEmptyRound(host, guest);
    await finishEmptyRound(guest, host);

    await expect(host.getByRole("heading", { name: "Final results" })).toBeVisible();
    await expect(guest.getByTestId("phase-name")).toHaveText("Final results");
    await expect(host.locator(".score-table")).toContainText("Mei");
    await expect(host.locator(".score-table")).toContainText("Ren");
    await expect(host.locator(".score-table")).toContainText("Imperial Progress");
    await expect(host.locator(".score-table")).toContainText("Imperial Seal");
    await expect(host.locator(".score-table")).toContainText("End-game Exhibition");
  } finally {
    await close();
  }
});

async function openTwoWorkshops(browser: Browser): Promise<{
  host: Page;
  guest: Page;
  close: () => Promise<void>;
}> {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  return {
    host: await hostContext.newPage(),
    guest: await guestContext.newPage(),
    close: async () => {
      await Promise.all([hostContext.close(), guestContext.close()]);
    },
  };
}

async function finishEmptyRound(first: Page, second: Page): Promise<void> {
  await expect(first.getByTestId("phase-name")).toHaveText("Work Phase");
  await first.getByRole("button", { name: "Pass for this round" }).click();
  await second.getByRole("button", { name: "Pass for this round" }).click();
  await first.getByRole("button", { name: "End Order turn" }).click();
  await second.getByRole("button", { name: "End Order turn" }).click();
  await expect(first.getByTestId("phase-name")).not.toHaveText("Order Phase");
  if (await first.getByTestId("phase-name").textContent() === "End-game Exhibition") {
    await expect(second.getByTestId("phase-name")).toHaveText("End-game Exhibition");
    await first.getByRole("button", { name: "Submit Exhibition" }).click();
    await expect(first.getByRole("heading", { name: "Exhibition submitted" })).toBeVisible();
    await expect(second.getByText("1/2 Exhibition selections submitted")).toBeVisible();
    await second.getByRole("button", { name: "Submit Exhibition" }).click();
    await expect(first.getByTestId("phase-name")).toHaveText("Final results");
    await expect(second.getByTestId("phase-name")).toHaveText("Final results");
  }
}
