/**
 * Guild Hall placement legality (L140, L142, v1.6.2 L206–212, B2; owner revision 2026-10-17):
 * a placement here, Apprentice or Shifu alike, is legal only if you can afford at least 1
 * face-up Tech from a discipline you do not yet own, at its printed cost. V1.6.2 has no Shifu
 * discount. The Shifu inspects (any discipline, B2) and the Apprentice buys; each choice
 * belongs to one effect.
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

describe("affordability at the printed cost, the same for both workers (v1.6.2 L206–207, L212)", () => {
  it("1 Coin: illegal for the Apprentice and the Shifu (the cheapest face-up Tech costs 2)", () => {
    const spec: StateSpec = { players: [{ resources: { coins: 1 } }, {}] };
    noMainAction(spec, buy("p1:apprentice:1", "T01"));
    for (const discipline of ["workshop", "glazing_loading", "firing"] as const) {
      noMainAction(spec, inspect(discipline));
    }
  });

  it("0 Coins: illegal for both; a cost-2 Tech is no longer free for the Shifu", () => {
    const spec: StateSpec = { players: [{ resources: { coins: 0 } }, {}] };
    noMainAction(spec, buy("p1:apprentice:1", "T01"));
    noMainAction(spec, inspect("workshop"));
  });

  it("2 Coins: legal for both while a cost-2 Tech of an unowned discipline shows", () => {
    const spec: StateSpec = { players: [{ resources: { coins: 2 } }, {}] };
    expect(check(spec, buy("p1:apprentice:1", "T01"))).toBeNull();
    expect(check(spec, inspect("firing"))).toBeNull();
  });

  it("only 3-Coin Techs of unowned disciplines showing: 2 Coins is illegal for both, 3 legal for both", () => {
    // Owns Glazing & Loading; the Workshop and Firing displays show only 3-Coin Techs. A
    // cheaper Tech the Shifu might find by inspecting does not count (v1.6.2 L212: face-up).
    const spec: StateSpec = {
      players: [{ techs: ["T10"], resources: { coins: 2 } }, {}],
      techDisplay: { workshop: ["T17", "T18"], firing: ["T11", "T13"] },
      techDecks: { workshop: ["T01", "T16", "T05", "T19"], firing: ["T12", "T14", "T24", "T25"] },
    };
    noMainAction(spec, buy("p1:apprentice:1", "T17"));
    noMainAction(spec, inspect("workshop"));
    noMainAction(spec, inspect("firing"));
    const richer: StateSpec = { ...spec, players: [{ techs: ["T10"], resources: { coins: 3 } }, {}] };
    expect(check(richer, buy("p1:apprentice:1", "T17"))).toBeNull();
    expect(check(richer, inspect("workshop"))).toBeNull();
  });
});

describe("only Techs from a discipline you do not own count (L211, v1.6.2 L212)", () => {
  it("owning a Tech in every discipline (3 Techs, L211) makes the Guild Hall illegal however rich you are", () => {
    const spec: StateSpec = { players: [{ techs: ["T01", "T20", "T11"], resources: { coins: 20 } }, {}] };
    noMainAction(spec, buy("p1:apprentice:1", "T16"));
    noMainAction(spec, inspect("workshop"));
  });

  it("affordable Techs of an owned discipline do not count", () => {
    // Owns Workshop and Glazing & Loading; their 2-Coin Techs are affordable, the Firing ones cost 3.
    const spec: StateSpec = {
      players: [{ techs: ["T01", "T20"], resources: { coins: 2 } }, {}],
      techDisplay: { firing: ["T11", "T13"] },
      techDecks: { firing: ["T12", "T14", "T24", "T25"] },
    };
    noMainAction(spec, buy("p1:apprentice:1", "T16"));
    noMainAction(spec, buy("p1:apprentice:1", "T11"));
    // The Shifu pays the printed 3 for a Firing Tech too, so it may not place either.
    noMainAction(spec, inspect("firing"));
    // With 3 Coins both may place, and the Shifu may inspect any discipline, even an owned one (B2).
    const richer: StateSpec = { ...spec, players: [{ techs: ["T01", "T20"], resources: { coins: 3 } }, {}] };
    expect(check(richer, buy("p1:apprentice:1", "T11"))).toBeNull();
    expect(check(richer, inspect("workshop"))).toBeNull();
    expect(check(richer, inspect("firing"))).toBeNull();
  });

  it("names the specific reason once the location itself is legal", () => {
    const spec: StateSpec = { players: [{ techs: ["T11"], resources: { coins: 2 } }, {}] };
    expect(check(spec, buy("p1:apprentice:1", "T12"))?.code).toBe("TECH_DISCIPLINE_OWNED");
    expect(check(spec, buy("p1:apprentice:1", "T05"))?.code).toBe("TECH_NOT_AVAILABLE");
    expect(check({ players: [{ resources: { coins: 2 } }, {}] }, buy("p1:apprentice:1", "T11"))?.code).toBe(
      "INSUFFICIENT_RESOURCES",
    );
  });
});

describe("each choice belongs to one effect (L207–208)", () => {
  it("the Shifu inspects instead of buying; the Apprentice cannot inspect", () => {
    const shifuBuy = check({}, buy("p1:shifu", "T01"));
    expect(shifuBuy?.code).toBe("INVALID_CHOICE");
    expect(shifuBuy?.details).toMatchObject({ choice: "buy_face_up", effect: "shifu" });
    expectDocumentedDetails(shifuBuy);
    const apprenticeInspect = check({}, inspect("firing", "p1:apprentice:2"));
    expect(apprenticeInspect?.code).toBe("INVALID_CHOICE");
    expect(apprenticeInspect?.details).toMatchObject({ choice: "inspect", effect: "apprentice" });
  });

  it("the Shifu may inspect every discipline, including an exhausted deck (L208 'or as many as remain')", () => {
    const spec: StateSpec = { players: [{ techs: ["T13"] }, { techs: ["T14"] }, { techs: ["T24"] }, { techs: ["T25"] }] };
    expect(buildState(spec).hidden.techDecks.firing).toEqual([]);
    for (const discipline of ["workshop", "glazing_loading", "firing"] as const) {
      expect(check(spec, inspect(discipline))).toBeNull();
    }
  });
});

describe("shared placement checks at the Guild Hall (L140)", () => {
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

  it("Senior Apprentice never applies at the Guild Hall (v1.6.2 L618)", () => {
    // PLACE_GUILD_HALL carries no Senior Apprentice flag; an Apprentice always resolves the Apprentice effect.
    const spec: StateSpec = { players: [{ techs: ["T18"], resources: { coins: 1 } }, {}] };
    noMainAction(spec, buy("p1:apprentice:1", "T20"));
    // With Senior Apprentice owned, an Apprentice still cannot inspect: it resolves the Apprentice effect.
    expect(check({ players: [{ techs: ["T18"], resources: { coins: 3 } }, {}] }, inspect("firing", "p1:apprentice:1"))?.code).toBe("INVALID_CHOICE");
  });
});
