import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

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
    await guest.getByLabel("First shape").selectOption("vase");
    await guest.getByRole("button", { name: "Form ceramics" }).click();
    await host.getByText("Forming Studio", { exact: true }).click();
    await host.getByLabel("First shape").selectOption("censer");
    await host.getByRole("button", { name: "Form ceramics" }).click();

    await guest.getByText("Glaze Workshop", { exact: true }).click();
    await guest.getByLabel("First glaze").selectOption("moon_white");
    await guest.getByLabel("First decoration").selectOption("plain");
    await guest.getByRole("button", { name: "Apply glaze" }).click();
    await host.getByText("Glaze Workshop", { exact: true }).click();
    const hostGlaze = host.locator("details").filter({ hasText: "Glaze Workshop" });
    await hostGlaze.getByLabel("First glaze").selectOption("celadon");
    await hostGlaze.getByLabel("First decoration").selectOption("carved");
    await hostGlaze.getByRole("button", { name: "Apply glaze" }).click();

    await guest.getByText("Kiln Yard", { exact: true }).click();
    const kilnYard = guest.locator("details").filter({ hasText: "Kiln Yard" });
    await kilnYard.getByLabel("First ceramic", { exact: true }).selectOption({ index: 1 });
    await kilnYard.getByLabel("First kiln space").selectOption("high_1");
    await kilnYard.getByRole("button", { name: "Load kiln" }).click();
    await host.getByText("Kiln Yard", { exact: true }).click();
    const hostKilnYard = host.locator("details").filter({ hasText: "Kiln Yard" });
    await hostKilnYard.getByLabel("First ceramic", { exact: true }).selectOption({ index: 1 });
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
