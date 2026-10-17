/**
 * The world's composition after the owner review of 2026-10-17 (item 8; B1).
 *
 * - The Orders section has no public-hands block ("Hands: counts are public, cards are not"): the
 *   seat chips already show every player's hand count.
 * - Someone else's private look at Orders, which that block used to say, is still said where it
 *   already was: the decision pane's waiting note ("Zhao is looking at 3 cards in private"); the
 *   Orders section says nothing of it and shows no card of it.
 * - The full screen renders the turn-toast host after the top bar and banner and before the world
 *   (where the toast is drawn: the world's top right; owner review 2026-10-17, item 3), empty at
 *   mount.
 */
import { describe, expect, it } from "vitest";
import { createTranslator } from "../../../../src/app/i18n/translator.ts";
import { FixtureGameSource } from "../../../../src/app/session/fixtureSource.ts";
import { WorldSections } from "../../../../src/app/shell/WorldSections.tsx";
import { fixture, fixtureSource, secretIds } from "../support/fixtures.ts";
import { renderComponent, renderScreen, renderWindow } from "../support/render.tsx";
import { withoutRulesPanels } from "../kiln/support.ts";
import { attr, perceivable, seatChips } from "./support.tsx";

const en = createTranslator("en", { strict: true });
const zh = createTranslator("zh-CN", { strict: true });

/** The markup of one world section (`<section … data-section="orders">`). */
function section(html: string, id: string): string {
  const start = html.indexOf(`data-section="${id}"`);
  if (start < 0) throw new Error(`no ${id} section`);
  const from = html.lastIndexOf("<section", start);
  let depth = 0;
  const pattern = /<(\/?)section\b[^>]*>/g;
  pattern.lastIndex = from;
  for (let match = pattern.exec(html); match !== null; match = pattern.exec(html)) {
    depth += match[1] === "/" ? -1 : 1;
    if (depth === 0) return html.slice(from, match.index + match[0].length);
  }
  return html.slice(from);
}

describe("the Orders section", () => {
  it.each(["m1_work_phase_r2_3p", "m2_commission_market_look_r3_4p", "m6_order_phase_crackle_3p", "m7_cleanup_hand_limit_3p", "m12_guild_shifu_inspection"])(
    "%s has no public-hands block, in either language",
    (id) => {
      for (const locale of ["en", "zh-CN"] as const) {
        const html = renderComponent(fixtureSource(id), <WorldSections />, { locale });
        const orders = section(html, "orders");
        expect(orders).not.toMatch(/hands-public|hands-title|hands-looking/);
        // Outside the rules-details panels: an Order clarification may say the deck count is public.
        const text = perceivable(withoutRulesPanels(orders));
        expect(text).not.toContain("counts are public");
        expect(text).not.toContain("张数公开");
        expect(text).not.toMatch(locale === "en" ? /is looking at/ : /正在(?:私看|查看)/);
      }
    },
  );

  it("leaves the hand counts to the seat chips", () => {
    const id = "m2_commission_market_look_r3_4p";
    const game = fixture(id).playerView.game;
    const chips = seatChips(renderScreen(fixtureSource(id)));
    expect(chips).toHaveLength(game.playerOrder.length);
    for (const playerId of game.playerOrder) {
      const chip = chips.find((markup) => attr(markup, "data-player-id") === playerId);
      const n = game.counts.orderHands[playerId] ?? 0;
      expect(attr(chip ?? "", "aria-label"), playerId).toContain(en("common.piece.ordersInHand", { n }));
    }
  });
});

describe("someone else's private look", () => {
  /** m2 seen by someone who is not the looker: a spectator (no own view, no own secrets). */
  function watching(id: string): FixtureGameSource {
    const entry = structuredClone(fixture(id));
    return new FixtureGameSource({ ...entry, ownSecrets: [], playerView: { ...entry.playerView, viewerId: null, own: null } });
  }

  it("is said by the waiting pane, never which cards (m2)", () => {
    const id = "m2_commission_market_look_r3_4p";
    const look = fixture(id).playerView.game.counts.pendingLook!;
    expect(look.kind).toBe("commission_market");
    const name = fixture(id).playerView.game.players[look.playerId]!.displayName;
    const pane = renderWindow(watching(id));
    expect(pane).toContain('data-window="waiting"');
    expect(perceivable(pane)).toContain(en("firing.wait.looking", { name, n: look.count }));
    expect(perceivable(renderWindow(watching(id), { locale: "zh-CN" }))).toContain(zh("firing.wait.looking", { name, n: look.count }));
    const screen = renderScreen(watching(id));
    expect(perceivable(section(screen, "orders"))).not.toContain("is looking at");
    expect(section(screen, "orders")).not.toContain("ordwrap--look");
    for (const secret of secretIds(id)) expect(screen).not.toMatch(new RegExp(`\\b${secret}\\b`));
  });
});

describe("the turn-toast host", () => {
  it("sits after the top bar and banner and before the world, empty when the screen opens", () => {
    const html = renderScreen(fixtureSource("m1_work_phase_r2_3p"));
    const banner = html.indexOf('<div class="shell-banner"');
    const toasts = html.indexOf('<div class="shell-toasts"></div>');
    const world = html.indexOf('<main class="shell-world"');
    expect(banner).toBeGreaterThan(html.indexOf("</header>"));
    expect(toasts).toBeGreaterThan(banner);
    expect(world).toBeGreaterThan(toasts);
    expect(html.slice(toasts, world)).toBe('<div class="shell-toasts"></div>');
    expect(html).not.toContain("turn-toast\"");
  });
});
