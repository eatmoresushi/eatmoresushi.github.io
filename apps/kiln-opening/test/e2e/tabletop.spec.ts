import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

test("simple playtest UI exposes state and places an Apprentice through authoritative controls", async ({ browser, request }) => {
  await request.post("http://127.0.0.1:4173/test-api", {
    headers: { "x-e2e-user": "reset" },
    data: { operation: "e2e_reset", seed: 2 },
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
    await host.getByRole("button", { name: "Start with 2 players" }).click();

    await host.getByRole("button", { name: /Ru Kiln/ }).click();
    await guest.getByRole("button", { name: /Guan Kiln/ }).click();
    await host.getByRole("button", { name: "Redraw" }).click();

    for (const page of [host, guest]) {
      await expect(page.getByTestId("playtest-ui")).toBeVisible();
      await expect(page.getByTestId("tabletop-scene")).toHaveCount(0);
      await expect(page.getByText("V1.0.0", { exact: true }).first()).toBeVisible();
      await expect(page.getByRole("region", { name: "Player Workshops" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Worker Placement" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Kiln Spaces" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Firing Inspector" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Orders", exact: true })).toContainText("Market display (4)");
      await expect(page.getByRole("region", { name: "Orders", exact: true })).toContainText("Imperial display (3)");
      await expect(page.getByRole("region", { name: "Face-up Techniques" }).locator(".technique-tile")).toHaveCount(6);
      await expect(page.getByRole("region", { name: "Game Log" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Playtest Debug" })).toBeVisible();
      await expect(page.locator('[data-space="middle_3"]')).toContainText("No — covered");
      await expect(page.locator('[data-space="low_3"]')).toContainText("No — covered");
    }

    const materials = guest.locator("details").filter({ hasText: "Materials Yard" });
    await materials.getByLabel("Worker").selectOption({ index: 1 });
    await materials.getByRole("button", { name: "Gather materials" }).click();

    const guestMaterialsRow = guest.locator('tr[data-location-id="materials_yard"]');
    await expect(guestMaterialsRow).toContainText("Ren");
    await expect(guestMaterialsRow).toContainText("Apprentice");
    await expect(host.locator('tr[data-location-id="materials_yard"]')).toContainText("Ren");
    await expect(host.getByTestId("decision-player")).toHaveText("Mei");
    await expect(guest.getByRole("region", { name: "Game Log" })).toContainText("placed worker");
    await expect(guest.getByRole("region", { name: "Game Log" })).toContainText("resources changed");

    await host.setViewportSize({ width: 390, height: 844 });
    await expect(host.getByTestId("playtest-ui")).toBeVisible();
    await expect(host.getByRole("complementary", { name: "Game controls" })).toBeVisible();
    expect(await host.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
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
