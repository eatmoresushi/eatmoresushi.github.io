/**
 * A ceramic waiting in an Imperial Kiln for a later firing (owner revision 5, owner ruling R28):
 * Imperial Priority spent in the Order Phase loads after this round's firing, so the ceramic is
 * fired in the next round's firing, and in the last round never. `imperialWait` reads public facts
 * only; the Imperial Kiln tile says it in words, in both languages.
 */
import { describe, expect, it } from "vitest";
import { imperialWait } from "../../../../src/app/kiln/imperialWait.ts";
import { ImperialKilns } from "../../../../src/app/kiln/ImperialKilns.tsx";
import { RULE_NUMBERS } from "../../../../src/app/i18n/content.ts";
import { FixtureGameSource } from "../../../../src/app/session/fixtureSource.ts";
import { fixture, fixtureSource } from "../support/fixtures.ts";
import { renderComponent } from "../support/render.tsx";

const load = (loadedBy: "imperial_priority" | "glaze_load", loadedInRound: number) => ({ loadedBy, loadedInRound }) as Parameters<typeof imperialWait>[0];
const LAST = RULE_NUMBERS.rounds as 5;

describe("imperialWait", () => {
  it("is null for a ceramic of this round's firing: a Glaze & Load load, or Imperial Priority before the firing", () => {
    expect(imperialWait(load("glaze_load", 2), 2, "work_turn")).toBeNull();
    expect(imperialWait(load("glaze_load", 2), 2, "firing_contributions")).toBeNull();
    expect(imperialWait(load("imperial_priority", 2), 2, "work_turn")).toBeNull();
    expect(imperialWait(load("imperial_priority", 2), 2, "firing_heat_adjustment")).toBeNull();
  });

  it("after this round's firing: the next round's firing, or never in the last round (R28)", () => {
    for (const phase of ["orders", "cleanup_hand_limit"] as const) expect(imperialWait(load("imperial_priority", 2), 2, phase)).toBe("next_round");
    for (const phase of ["orders", "finished"] as const) expect(imperialWait(load("imperial_priority", LAST), LAST, phase)).toBe("never");
  });

  it("loaded in an earlier round: this round's firing", () => {
    expect(imperialWait(load("imperial_priority", 2), 3, "round_start_setters_mark")).toBe("this_round");
    expect(imperialWait(load("imperial_priority", 2), 3, "work_turn")).toBe("this_round");
    expect(imperialWait(load("imperial_priority", 2), 3, "firing_contributions")).toBe("this_round");
  });
});

describe("the Imperial Kiln tile", () => {
  it("says a carried ceramic is fired in this round's firing, in both languages (t-imperial-priority-carried)", () => {
    const en = renderComponent(fixtureSource("t-imperial-priority-carried"), <ImperialKilns />);
    expect(en).toContain('data-imperial-wait="this_round"');
    expect(en).toContain("Loaded after last round’s firing: fired in this round’s firing");
    const zh = renderComponent(fixtureSource("t-imperial-priority-carried"), <ImperialKilns />, { locale: "zh-CN" });
    expect(zh).toContain("上一轮烧窑之后装进：本轮烧窑时烧成");
  });

  it("says when a load made in the Order Phase is fired, and plainly when it never is", () => {
    const edited = (round: 2 | 5) => {
      const entry = structuredClone(fixture("t-imperial-priority-carried"));
      const game = entry.playerView.game;
      game.round = round;
      game.phase = { type: "orders", turnOrder: ["p2", "p1"], index: 0 };
      const ceramic = game.ceramics["c1"];
      if (ceramic?.stage !== "loaded") throw new Error("fixture changed");
      ceramic.loadedInRound = round;
      return new FixtureGameSource(entry);
    };
    expect(renderComponent(edited(2), <ImperialKilns />)).toContain("Loaded after this round’s firing: fired in the next round’s firing");
    expect(renderComponent(edited(2), <ImperialKilns />, { locale: "zh-CN" })).toContain("本轮烧窑之后装进：下一轮烧窑时烧成");
    expect(renderComponent(edited(5), <ImperialKilns />)).toContain("Loaded after the last firing: never fired");
    expect(renderComponent(edited(5), <ImperialKilns />, { locale: "zh-CN" })).toContain("最后一次烧窑之后装进：不会烧成");
  });

  it("says nothing of the kind for a ceramic of this round's firing or an empty kiln", () => {
    expect(renderComponent(fixtureSource("t-imperial-only-firing"), <ImperialKilns />)).not.toContain("data-imperial-wait");
    expect(renderComponent(fixtureSource("m1_work_phase_r2_3p"), <ImperialKilns />)).not.toContain("data-imperial-wait");
  });
});
