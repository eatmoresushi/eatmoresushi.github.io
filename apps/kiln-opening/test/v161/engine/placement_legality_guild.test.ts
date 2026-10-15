/**
 * Guild Hall placement legality (L139, L141, L207, L210, L212, B2): an Apprentice placement is
 * legal only if you can afford at least 1 face-up Tech from a discipline you do not yet own;
 * a Shifu placement only if you can afford such a Tech after the Shifu discount. The Shifu
 * inspects (any discipline, B2) and the Apprentice buys; each choice belongs to one effect.
 */

import { describe, expect, it } from "vitest";
import { validateAction } from "../../../src/game/engine.ts";
import { actorViewOf } from "../../../src/game/view.ts";
import type { GameAction, GameRuleError, TechDiscipline, TechId } from "../../../src/game/types.ts";
import { type StateSpec, buildState } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

function buy(workerId: string, techId: TechId): GameAction {
  return { type: "PLACE_GUILD_HALL", workerId, choice: { kind: "buy_face_up", techId } };
}

function inspect(discipline: TechDiscipline, workerId = "p1:shifu"): GameAction {
  return { type: "PLACE_GUILD_HALL", workerId, choice: { kind: "inspect", discipline } };
}

function check(spec: StateSpec, action: GameAction): GameRuleError | null {
  return validateAction(actorViewOf(buildState(spec), "p1"), action);
}

function noMainAction(spec: StateSpec, action: GameAction): void {
  const error = check(spec, action);
  expect(error?.code).toBe("NO_MAIN_ACTION_POSSIBLE");
  expect(error?.details).toMatchObject({ locationId: "guild_hall" });
  expectDocumentedDetails(error);
  // The dispatcher rejects it without touching the state.
  new LocalTable(buildState(spec)).expectRuleError("p1", action, "NO_MAIN_ACTION_POSSIBLE");
}

describe("affordability after the Shifu discount (L212)", () => {
  it("1 Coin: illegal for the Apprentice (cheapest face-up Tech costs 2), legal for the Shifu (2 − 1)", () => {
    const spec: StateSpec = { players: [{ resources: { coins: 1 } }, {}] };
    noMainAction(spec, buy("p1:apprentice:1", "T01"));
    expect(check(spec, inspect("firing"))).toBeNull();
  });

  it("0 Coins: illegal for both workers", () => {
    const spec: StateSpec = { players: [{ resources: { coins: 0 } }, {}] };
    noMainAction(spec, buy("p1:apprentice:1", "T01"));
    noMainAction(spec, inspect("workshop"));
  });

  it("2 Coins: legal for the Apprentice", () => {
    expect(check({ players: [{ resources: { coins: 2 } }, {}] }, buy("p1:apprentice:1", "T01"))).toBeNull();
  });
});

describe("only Techs from a discipline you do not own count (L210, L212)", () => {
  it("owning a Tech in every discipline (3 Techs, L210) makes the Guild Hall illegal however rich you are", () => {
    const spec: StateSpec = { players: [{ techs: ["T01", "T20", "T11"], resources: { coins: 20 } }, {}] };
    noMainAction(spec, buy("p1:apprentice:1", "T16"));
    noMainAction(spec, inspect("workshop"));
  });

  it("affordable Techs of an owned discipline do not count", () => {
    // Owns Workshop and Glazing & Loading; their 2-Coin Techs are affordable, the Firing ones cost 3.
    const spec: StateSpec = {
      players: [{ techs: ["T01", "T20"], resources: { coins: 2 } }, {}],
      techDisplay: { firing: ["T12", "T13"] },
      techDecks: { firing: ["T11", "T14", "T24", "T25"] },
    };
    noMainAction(spec, buy("p1:apprentice:1", "T16"));
    noMainAction(spec, buy("p1:apprentice:1", "T12"));
    // The Shifu pays 2 for a Firing Tech, so it may place and inspect any discipline, even an owned one (B2).
    expect(check(spec, inspect("workshop"))).toBeNull();
    expect(check(spec, inspect("firing"))).toBeNull();
  });

  it("names the specific reason once the location itself is legal", () => {
    const spec: StateSpec = { players: [{ techs: ["T11"], resources: { coins: 2 } }, {}] };
    expect(check(spec, buy("p1:apprentice:1", "T12"))?.code).toBe("TECH_DISCIPLINE_OWNED");
    expect(check(spec, buy("p1:apprentice:1", "T05"))?.code).toBe("TECH_NOT_AVAILABLE");
    expect(check({ players: [{ resources: { coins: 2 } }, {}] }, buy("p1:apprentice:1", "T12"))?.code).toBe(
      "INSUFFICIENT_RESOURCES",
    );
  });
});

describe("each choice belongs to one effect (L206–207)", () => {
  it("the Shifu inspects instead of buying; the Apprentice cannot inspect", () => {
    const shifuBuy = check({}, buy("p1:shifu", "T01"));
    expect(shifuBuy?.code).toBe("INVALID_CHOICE");
    expect(shifuBuy?.details).toMatchObject({ choice: "buy_face_up", effect: "shifu" });
    expectDocumentedDetails(shifuBuy);
    const apprenticeInspect = check({}, inspect("firing", "p1:apprentice:2"));
    expect(apprenticeInspect?.code).toBe("INVALID_CHOICE");
    expect(apprenticeInspect?.details).toMatchObject({ choice: "inspect", effect: "apprentice" });
  });

  it("the Shifu may inspect every discipline, including an exhausted deck (L207 'or as many as remain')", () => {
    const spec: StateSpec = { players: [{ techs: ["T13"] }, { techs: ["T14"] }, { techs: ["T24"] }, { techs: ["T25"] }] };
    expect(buildState(spec).hidden.techDecks.firing).toEqual([]);
    for (const discipline of ["workshop", "glazing_loading", "firing"] as const) {
      expect(check(spec, inspect(discipline))).toBeNull();
    }
  });
});

describe("shared placement checks at the Guild Hall (L139)", () => {
  it("capacity is absolute: 2 / 3 / 4 spaces", () => {
    for (const players of [2, 3, 4] as const) {
      const placements = Array.from({ length: players }, (_, index) => ({
        player: `p${index + 1}`,
        worker: (index === 0 ? 2 : 1) as 1 | 2,
        locationId: "guild_hall" as const,
      }));
      const error = check({ players, placements }, inspect("firing"));
      expect(error?.code, `${players} players`).toBe("LOCATION_FULL");
      expect(check({ players, placements: placements.slice(1) }, inspect("firing"))).toBeNull();
    }
  });

  it("Senior Apprentice never applies at the Guild Hall (L619)", () => {
    // PLACE_GUILD_HALL carries no Senior Apprentice flag; an Apprentice always resolves the Apprentice effect.
    const spec: StateSpec = { players: [{ techs: ["T18"], resources: { coins: 1 } }, {}] };
    noMainAction(spec, buy("p1:apprentice:1", "T20"));
  });
});
