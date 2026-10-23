/**
 * Seat chips (UI_V1.6.1_ARCHITECTURE §4.1, §8.1, §9.2; D1, D2; B1). Ports the still-valid intent
 * of test/v127 `tabletop_turn_order`: turn order is shown correctly.
 *
 * - chips in `turnOrder` (First Player, then clockwise) with the First Player badge;
 * - name, Kiln short name, VP (`recordedVp`, then the final total once finished), Clay, Wood
 *   and Coins with their icons, hand count;
 * - the acting badge, said in the chip's accessible name; a computer seat is said in the name
 *   only, with no visible pill (owner review, 2026-10-17);
 * - `aria-pressed` on the board shown (D1), the viewer's own by default.
 */
import { describe, expect, it } from "vitest";
import { kilnShortName } from "../../../../src/app/i18n/content.ts";
import { SeatChips } from "../../../../src/app/shell/SeatChips.tsx";
import { fixtureSource } from "../support/fixtures.ts";
import { renderComponent } from "../support/render.tsx";
import { attr, modelOf, seatChips } from "./support.tsx";

const RESOURCES = ["clay", "wood", "coins"] as const;

/** "0 Clay · 2 Wood · 3 Coins": a player's resources as the chip's accessible name says them. */
function resourcesEn(resources: Readonly<Record<(typeof RESOURCES)[number], number>>): string {
  return `${resources.clay} Clay · ${resources.wood} Wood · ${resources.coins} ${resources.coins === 1 ? "Coin" : "Coins"}`;
}

/** The chip's visible resource counts, in order: each an icon (svg.ri) and a number. */
function resourceItems(chip: string): Array<{ kind: string; icon: boolean; count: string }> {
  return [...chip.matchAll(/<span class="seat-chip-res-item" data-resource="(\w+)">(.*?)<span class="num">([^<]*)<\/span><\/span>/g)].map((match) => ({
    kind: match[1]!,
    icon: new RegExp(`<svg class="ri" data-resource="${match[1]}"[^>]*aria-hidden="true"`).test(match[2]!),
    count: match[3]!,
  }));
}

describe("seat chips", () => {
  it("follow the work order, First Player first, with every D2 element", () => {
    const model = modelOf("m1_work_phase_r2_3p");
    const html = renderComponent(fixtureSource("m1_work_phase_r2_3p"), <SeatChips />);
    const chips = seatChips(html);
    expect(chips).toHaveLength(model.players.length);
    expect(model.players[0]?.playerId).toBe(model.board.firstPlayerId);
    model.players.forEach((player, index) => {
      const chip = chips[index] ?? "";
      expect(attr(chip, "data-player-id")).toBe(player.playerId);
      expect(chip).toContain(`>${player.displayName}</span>`);
      expect(chip).toContain(kilnShortName(player.kilnId!, "en"));
      expect(chip).toContain(`<strong>${player.recordedVp}</strong> VP`);
      expect(chip).toContain(`class="seat-chip-hand"`);
      expect(chip.includes("seat-chip-first")).toBe(player.isFirstPlayer);
      expect(chip.includes("data-acting")).toBe(model.prompt.actorIds.includes(player.playerId));
    });
    // The first chip has no separator; the others do.
    expect(chips[0]).not.toContain("seat-chips-sep");
    expect(chips[1]).toContain("seat-chips-sep");
  });

  it("names the whole strip in the chip's accessible name", () => {
    const model = modelOf("m1_work_phase_r2_3p");
    const html = renderComponent(fixtureSource("m1_work_phase_r2_3p"), <SeatChips />);
    const chips = seatChips(html);
    const me = model.players.find((player) => player.playerId === model.viewerId)!;
    const mine = chips.find((chip) => attr(chip, "data-player-id") === me.playerId);
    const tail = [...(me.isFirstPlayer ? ["First Player"] : []), ...(model.prompt.actorIds.includes(me.playerId) ? ["deciding now"] : [])];
    expect(tail).toContain("deciding now");
    expect(attr(mine ?? "", "aria-label")).toBe(
      [`Your workshop · ${kilnShortName(me.kilnId!, "en")} · ${me.recordedVp} VP · ${resourcesEn(me.resources)} · ${me.orderHandCount} ${me.orderHandCount === 1 ? "Order" : "Orders"} in hand`, ...tail].join(" · "),
    );
    const other = model.players.find((player) => player.playerId !== me.playerId)!;
    const next = chips.find((chip) => attr(chip, "data-player-id") === other.playerId);
    expect(attr(next ?? "", "aria-label")).toMatch(new RegExp(`^Open ${other.displayName}’s board · ${kilnShortName(other.kilnId!, "en")} · `));
    // The First Player's chip says so.
    const first = chips.find((chip) => attr(chip, "data-player-id") === model.board.firstPlayerId);
    expect(attr(first ?? "", "aria-label")).toContain("First Player");
  });

  it("marks the board shown (D1): your own by default, else the chosen one", () => {
    const model = modelOf("m1_work_phase_r2_3p");
    const pressed = (html: string) => seatChips(html).map((chip) => attr(chip, "aria-pressed"));
    expect(pressed(renderComponent(fixtureSource("m1_work_phase_r2_3p"), <SeatChips />))).toEqual(model.players.map((p) => String(p.playerId === model.viewerId)));
    const other = model.players[2]!.playerId;
    expect(pressed(renderComponent(fixtureSource("m1_work_phase_r2_3p"), <SeatChips />, { ui: { boardShown: other } }))).toEqual(
      model.players.map((p) => String(p.playerId === other)),
    );
  });

  it("says a computer seat in its name only, with no visible pill, and shows each seat's resources with icons", () => {
    const model = modelOf("m1_work_phase_r2_3p");
    const computer = model.players[1]!;
    const html = renderComponent(fixtureSource("m1_work_phase_r2_3p", { computerPlayerIds: [computer.playerId] }), <SeatChips />);
    const chips = seatChips(html);
    const chip = chips[1] ?? "";
    // The visible "computer" pill was removed (owner review, 2026-10-17); the name still says it.
    for (const each of chips) expect(each).not.toContain("seat-chip-computer");
    expect(attr(chip, "aria-label")).toMatch(/ · computer player$/);
    expect(attr(chips[0] ?? "", "aria-label")).not.toContain("computer player");
    // Clay, Wood and Coins, each an icon and its count, right after the VP.
    model.players.forEach((player, index) => {
      const each = chips[index] ?? "";
      expect(each.indexOf("seat-chip-vp")).toBeLessThan(each.indexOf("seat-chip-res"));
      expect(each).toContain('<span class="seat-chip-res" aria-hidden="true">');
      expect(resourceItems(each)).toEqual(RESOURCES.map((kind) => ({ kind, icon: true, count: String(player.resources[kind]) })));
      expect(attr(each, "aria-label")).toContain(` VP · ${resourcesEn(player.resources)} · `);
    });
  });

  it("shows several acting players in a simultaneous window", () => {
    const model = modelOf("w-secret-contributions-with-fuel-ledger");
    const html = renderComponent(fixtureSource("w-secret-contributions-with-fuel-ledger"), <SeatChips />);
    const acting = seatChips(html).filter((chip) => chip.includes("data-acting")).map((chip) => attr(chip, "data-player-id"));
    expect(acting.sort()).toEqual([...model.prompt.actorIds].sort());
    expect(acting.length).toBeGreaterThan(1);
  });

  it("shows the final total once the game is finished, and nobody acting", () => {
    const model = modelOf("t-final-2p");
    const html = renderComponent(fixtureSource("t-final-2p"), <SeatChips />);
    const scores = model.finalResult!.scores;
    for (const [index, player] of model.players.entries()) {
      const chip = seatChips(html)[index] ?? "";
      const total = scores[player.playerId]!.total;
      expect(chip).toContain(`<strong>${total}</strong> VP<span class="seat-chip-final">final</span>`);
      expect(attr(chip, "aria-label")).toContain(`final total ${total} VP`);
      expect(chip).not.toContain("data-acting");
    }
  });

  it("shows no Kiln before Kiln selection, in the chip or its name (owner review, 2026-10-17)", () => {
    const html = renderComponent(fixtureSource("m15_kiln_selection"), <SeatChips />);
    const chips = seatChips(html);
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) {
      expect(chip).not.toContain("seat-chip-kiln");
      expect(attr(chip, "aria-label")).not.toMatch(/Kiln yet/);
    }
  });

  it("renders in Chinese with the glossary words", () => {
    const model = modelOf("m1_work_phase_r2_3p");
    const html = renderComponent(fixtureSource("m1_work_phase_r2_3p"), <SeatChips />, { locale: "zh-CN" });
    const chips = seatChips(html);
    const me = model.players.find((player) => player.playerId === model.viewerId)!;
    const mine = chips.find((chip) => attr(chip, "data-player-id") === me.playerId);
    const tail = [...(me.isFirstPlayer ? ["起始玩家"] : []), "正在决断"];
    expect(attr(mine ?? "", "aria-label")).toBe(
      [`你的作坊 · ${kilnShortName(me.kilnId!, "zh-CN")} · ${me.recordedVp}分 · ${me.resources.clay}泥 · ${me.resources.wood}柴 · ${me.resources.coins}铜钱 · 手中${me.orderHandCount}张委托`, ...tail].join(" · "),
    );
    const other = model.players.find((player) => player.playerId !== me.playerId)!;
    const next = chips.find((chip) => attr(chip, "data-player-id") === other.playerId);
    expect(attr(next ?? "", "aria-label")).toMatch(new RegExp(`^查看${other.displayName}的窑口板`));
    expect(html).toContain(`<strong>${me.recordedVp}</strong>分`);
    expect(html).not.toMatch(/VP/);
  });
});
