/**
 * Seat chips (UI_V1.6.1_ARCHITECTURE §4.1, §8.1, §9.2; D1, D2; B1). Ports the still-valid intent
 * of test/v127 `tabletop_turn_order`: turn order is shown correctly.
 *
 * - chips in `turnOrder` (First Player, then clockwise) with the First Player badge;
 * - name, Kiln short name, VP (`recordedVp`, then the final total once finished), hand count;
 * - acting and computer badges, said in the chip's accessible name;
 * - `aria-pressed` on the board shown (D1), the viewer's own by default.
 */
import { describe, expect, it } from "vitest";
import { kilnShortName } from "../../../../src/app/i18n/content.ts";
import { SeatChips } from "../../../../src/app/shell/SeatChips.tsx";
import { fixtureSource } from "../support/fixtures.ts";
import { renderComponent } from "../support/render.tsx";
import { attr, modelOf, seatChips } from "./support.tsx";

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
    const [mine, next] = seatChips(html);
    const me = model.players[0]!;
    expect(me.playerId).toBe(model.viewerId);
    expect(attr(mine ?? "", "aria-label")).toBe(
      `Your workshop · ${kilnShortName(me.kilnId!, "en")} · ${me.recordedVp} VP · ${me.orderHandCount} ${me.orderHandCount === 1 ? "Order" : "Orders"} in hand · First Player · deciding now`,
    );
    const other = model.players[1]!;
    expect(attr(next ?? "", "aria-label")).toMatch(new RegExp(`^Open ${other.displayName}’s board · ${kilnShortName(other.kilnId!, "en")} · `));
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

  it("shows a computer badge and says it", () => {
    const model = modelOf("m1_work_phase_r2_3p");
    const computer = model.players[1]!;
    const html = renderComponent(fixtureSource("m1_work_phase_r2_3p", { computerPlayerIds: [computer.playerId] }), <SeatChips />);
    const chip = seatChips(html)[1] ?? "";
    expect(chip).toContain('class="seat-chip-computer"');
    expect(attr(chip, "aria-label")).toMatch(/ · computer player$/);
    expect(seatChips(html)[0]).not.toContain("seat-chip-computer");
  });

  it("shows several acting players in a simultaneous window", () => {
    const model = modelOf("m9_contributions_step1_3p");
    const html = renderComponent(fixtureSource("m9_contributions_step1_3p"), <SeatChips />);
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

  it("says when no Kiln is chosen yet", () => {
    const html = renderComponent(fixtureSource("m15_kiln_selection"), <SeatChips />);
    for (const chip of seatChips(html)) expect(chip).toContain(">no Kiln yet</span>");
  });

  it("renders in Chinese with the glossary words", () => {
    const model = modelOf("m1_work_phase_r2_3p");
    const html = renderComponent(fixtureSource("m1_work_phase_r2_3p"), <SeatChips />, { locale: "zh-CN" });
    const [mine, next] = seatChips(html);
    const me = model.players[0]!;
    expect(attr(mine ?? "", "aria-label")).toBe(`你的作坊 · ${kilnShortName(me.kilnId!, "zh-CN")} · ${me.recordedVp}分 · 手中${me.orderHandCount}张委托 · 起始玩家 · 正在决断`);
    expect(attr(next ?? "", "aria-label")).toMatch(new RegExp(`^查看${model.players[1]!.displayName}的窑口板`));
    expect(html).toContain(`<strong>${me.recordedVp}</strong>分`);
    expect(html).not.toMatch(/VP/);
  });
});
