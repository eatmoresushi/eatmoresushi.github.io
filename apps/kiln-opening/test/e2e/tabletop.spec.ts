import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

test("graphical tabletop places a selected Apprentice through the authoritative Materials action", async ({ browser, request }) => {
  await request.post("http://127.0.0.1:4173/test-api", {
    headers: { "x-e2e-user": "reset" },
    data: { operation: "e2e_reset", seed: 2 },
  });

  const { host, guest, close } = await openTwoWorkshops(browser);
  try {
    await host.goto("./?tabletop=true");
    await host.getByLabel("Workshop name").fill("Mei");
    await host.getByRole("button", { name: "Create a room" }).click();
    const roomCode = (await host.getByTestId("room-code").textContent())?.trim() ?? "";

    await guest.goto("./?tabletop=true");
    await guest.getByRole("tab", { name: "Join game" }).click();
    await guest.getByLabel("Room code").fill(roomCode);
    await guest.getByLabel("Workshop name").fill("Ren");
    await guest.getByRole("button", { name: "Join the workshop" }).click();
    await host.getByRole("button", { name: "Start with 2 players" }).click();

    await host.getByRole("button", { name: /Ru Kiln/ }).click();
    await guest.getByRole("button", { name: /Guan Kiln/ }).click();
    await host.getByRole("button", { name: "Redraw" }).click();

    for (const page of [host, guest]) {
      await expect(page.getByTestId("tabletop-scene")).toBeVisible();
      await expect(page.getByRole("region", { name: "Central Action Board, Shared Kiln, and Imperial Progress" })).toBeVisible();
      expect(await page.locator(".central-board-art").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
      await expect(page.locator(".visual-order-card").first()).toBeVisible();
      await expect(page.locator(".visual-technique-tile").first()).toBeVisible();
    }

    const apprentice = guest.getByRole("button", { name: /^Select apprentice/ }).first();
    const workerId = await apprentice.getAttribute("data-worker-id");
    await apprentice.click();
    await expect(apprentice).toHaveAttribute("aria-pressed", "true");
    await expect(guest.locator(".action-hotspot.is-valid")).toHaveCount(6);

    await guest.locator('[data-location-id="materials_yard"] .hotspot-target').click();
    await expect(guest.getByRole("heading", { name: "Materials Yard" })).toBeVisible();
    await expect(guest.locator('[data-location-id="materials_yard"] .tabletop-meeple.is-preview')).toHaveCount(1);
    await expect(guest.locator('.action-rail select[name="worker"]')).toHaveValue(workerId ?? "");

    await guest.getByRole("button", { name: "Gather materials" }).click();
    await expect(guest.locator('[data-location-id="materials_yard"] .tabletop-meeple.status-placed')).toHaveCount(1);
    await expect(guest.locator('[data-location-id="materials_yard"] .tabletop-meeple.is-preview')).toHaveCount(0);
    await expect(host.locator('[data-location-id="materials_yard"] .tabletop-meeple.status-placed')).toHaveCount(1);
    await expect(host.getByTestId("decision-player")).toHaveText("Mei");

    await host.setViewportSize({ width: 390, height: 844 });
    await expect(host.locator(".tabletop-quick-tray")).toBeVisible();
    await expect(host.locator(".central-board-shell")).toBeVisible();
    expect(await host.locator(".tabletop-main-stage").evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    await expect(host.locator(".action-hotspot .hotspot-target")).toHaveCount(6);
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
