import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

test("starting Orders remain visible after an eligible redraw advances directly to Work", async ({ browser, request }) => {
  await request.post("http://127.0.0.1:4173/test-api", {
    headers: { "x-e2e-user": "reset" },
    data: { operation: "e2e_reset", seed: 1 },
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
    await expect(host.getByRole("region", { name: "Workshop Orders" })).toContainText("M20");

    await host.getByRole("button", { name: "Redraw" }).click();
    await expect(host.getByTestId("phase-name")).toHaveText("Work Phase");
    await expect(guest.getByTestId("phase-name")).toHaveText("Work Phase");

    for (const page of [host, guest]) {
      const orders = page.getByRole("region", { name: "Workshop Orders" });
      await expect(orders.locator(".order-card")).toHaveCount(2);
      await expect(orders).toContainText("M03");
      await expect(orders).not.toContainText("M20");
    }

    const materials = guest.locator("details").filter({ hasText: "Materials Yard" });
    await materials.getByLabel("Worker").selectOption({ index: 1 });
    await expect(materials.getByRole("button", { name: "Gather materials" })).toBeDisabled();
    await expect(materials.getByRole("status")).toContainText("at most 2 total");
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
    await expect(glazing.getByRole("button", { name: "Apply glaze" })).toBeDisabled();
    await expect(glazing.getByRole("status")).toContainText("no Shaped ceramic");

    const kilnYard = guest.locator("details").filter({ hasText: "Kiln Yard" });
    await kilnYard.getByText("Kiln Yard", { exact: true }).click();
    await expect(kilnYard.getByRole("button", { name: "Load kiln" })).toBeEnabled();

    const office = guest.locator("details").filter({ hasText: "Market & Imperial Office" });
    await office.getByText("Market & Imperial Office", { exact: true }).click();
    await office.getByLabel("Worker").selectOption({ index: 1 });
    await expect(office.locator('select[name="officeAction"] option')).toHaveText(["coins", "take one", "sell"]);
    await expect(office.getByRole("button", { name: "Visit the Office" })).toBeEnabled();

    const guild = guest.locator("details").filter({ hasText: "Guild & Academy" });
    await guild.getByText("Guild & Academy", { exact: true }).click();
    await expect(guild.getByRole("button", { name: "Begin Guild action" })).toBeEnabled();
    await guild.getByRole("button", { name: "Begin Guild action" }).click();
    await guest.getByRole("button", { name: "Keep the display" }).click();
    await guest.locator(".choice-stack .primary-button:not(:disabled)").first().click();

    const fullGuild = host.locator("details").filter({ hasText: "Guild & Academy" });
    await expect(fullGuild.getByText("Full", { exact: true })).toBeVisible();
    await fullGuild.getByText("Guild & Academy", { exact: true }).click();
    await expect(fullGuild.getByRole("button", { name: "Begin Guild action" })).toBeDisabled();
    await expect(fullGuild.getByRole("status")).toContainText("Guild & Academy is full");
  } finally {
    await close();
  }
});

test("two workshops complete a firing, Order, reconnect, and five-round game", async ({ browser, request }) => {
  await request.post("http://127.0.0.1:4173/test-api", {
    headers: { "x-e2e-user": "reset" },
    data: { operation: "e2e_reset" },
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

    // The deterministic commissions are M09 (Moon-white Vase) and M10 (carved Celadon Censer).
    await guest.getByText("Forming Studio", { exact: true }).click();
    const guestForming = guest.locator("details").filter({ hasText: "Forming Studio" });
    await guestForming.getByLabel("Worker").selectOption({ index: 1 });
    await guestForming.getByLabel("Second shape (Shifu only)").selectOption("plate");
    await expect(guestForming.getByRole("button", { name: "Form ceramics" })).toBeDisabled();
    await expect(guestForming.getByRole("status")).toContainText("Apprentice may form only one");
    await guestForming.getByLabel("Worker").selectOption({ index: 0 });
    await guestForming.getByLabel("Second shape (Shifu only)").selectOption("");
    await guest.getByLabel("First shape").selectOption("vase");
    await guest.getByRole("button", { name: "Form ceramics" }).click();
    await host.getByText("Forming Studio", { exact: true }).click();
    await host.getByLabel("First shape").selectOption("censer");
    await host.getByRole("button", { name: "Form ceramics" }).click();

    const fullForming = guest.locator("details").filter({ hasText: "Forming Studio" });
    await expect(fullForming.getByText("Full", { exact: true })).toBeVisible();
    await fullForming.getByText("Forming Studio", { exact: true }).click();
    await expect(fullForming.getByRole("button", { name: "Form ceramics" })).toBeDisabled();

    await guest.getByText("Glaze Workshop", { exact: true }).click();
    const guestGlaze = guest.locator("details").filter({ hasText: "Glaze Workshop" });
    await guestGlaze.getByLabel("Shifu mode").selectOption("free_single");
    await expect(guestGlaze.getByRole("button", { name: "Apply glaze" })).toBeDisabled();
    await expect(guestGlaze.getByRole("status")).toContainText("Only the Shifu");
    await guestGlaze.getByLabel("Shifu mode").selectOption("normal");
    await expect(guestGlaze.getByRole("button", { name: "Apply glaze" })).toBeEnabled();
    await guest.getByLabel("First glaze").selectOption("moon_white");
    await guest.getByLabel("First decoration").selectOption("plain");
    await guest.getByRole("button", { name: "Apply glaze" }).click();
    await host.getByText("Glaze Workshop", { exact: true }).click();
    const hostGlaze = host.locator("details").filter({ hasText: "Glaze Workshop" });
    await hostGlaze.getByLabel("First glaze").selectOption("celadon");
    await hostGlaze.getByLabel("First decoration").selectOption("carved");
    await hostGlaze.getByRole("button", { name: "Apply glaze" }).click();

    const fullGlaze = guest.locator("details").filter({ hasText: "Glaze Workshop" });
    await expect(fullGlaze.getByText("Full", { exact: true })).toBeVisible();

    await guest.getByText("Kiln Yard", { exact: true }).click();
    const kilnYard = guest.locator("details").filter({ hasText: "Kiln Yard" });
    await kilnYard.locator('select[name="ceramic1"]').selectOption({ index: 1 });
    await kilnYard.getByLabel("First kiln space").selectOption("high_1");
    await kilnYard.locator('select[name="ceramic2"]').selectOption({ index: 1 });
    await expect(kilnYard.getByRole("button", { name: "Load kiln" })).toBeDisabled();
    await expect(kilnYard.getByRole("status")).toContainText("Apprentice may load at most one");
    await kilnYard.locator('select[name="ceramic2"]').selectOption("");
    await kilnYard.getByRole("button", { name: "Load kiln" }).click();
    await host.getByText("Kiln Yard", { exact: true }).click();
    const hostKilnYard = host.locator("details").filter({ hasText: "Kiln Yard" });
    await hostKilnYard.locator('select[name="ceramic1"]').selectOption({ index: 1 });
    await hostKilnYard.getByLabel("First kiln space").selectOption("middle_1");
    await hostKilnYard.getByRole("button", { name: "Load kiln" }).click();

    // The locked amount is private: the submitter sees 2, while the opponent sees only status.
    await expect(guest.getByRole("heading", { name: "Choose Wood in secret" })).toBeVisible();
    await guest.getByRole("button", { name: "2 Wood" }).click();
    await expect(guest.getByRole("heading", { name: "Contribution locked" })).toBeVisible();
    await expect(guest.locator(".secret-value")).toContainText("2 Wood");
    await expect(host.getByRole("heading", { name: "Choose Wood in secret" })).toBeVisible();
    await expect(host.getByText("Ren: locked")).toBeVisible();
    await expect(host.locator(".secret-value")).toHaveCount(0);
    await host.getByRole("button", { name: "2 Wood" }).click();
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
}
