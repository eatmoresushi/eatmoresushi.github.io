import { describe, expect, it } from "vitest";
import { TECHS } from "../../../src/game/content.ts";
import { InvariantError } from "../../../src/game/errors.ts";
import { availableKilns, hasKiln, kilnAbilityReady, markKilnAbilityUsed } from "../../../src/game/kilns.ts";
import {
  acquisitionError,
  grantTech,
  handLimit,
  markTechUsed,
  ownsTech,
  readyAllAbilities,
  techPrice,
  techReady,
} from "../../../src/game/techs.ts";
import { buildState, testContext } from "./support/fixtures.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

describe("Tech readiness", () => {
  it("a once-per-round Tech is ready until used; one without a limit stays ready", () => {
    const state = buildState({ players: [{ techs: ["T13", "T21"] }, { techs: ["T12"] }] });
    const p1 = state.players["p1"]!;
    expect(ownsTech(p1, "T13")).toBe(true);
    expect(ownsTech(p1, "T12")).toBe(false);
    expect(techReady(p1, "T13")).toBe(true);
    expect(techReady(p1, "T12")).toBe(false);

    const ctx = testContext();
    markTechUsed(state, "p1", "T13", ctx);
    expect(techReady(state.players["p1"]!, "T13")).toBe(false);
    expect(techReady(state.players["p1"]!, "T21")).toBe(true);
    expect(() => markTechUsed(state, "p1", "T13", ctx)).toThrow(InvariantError);

    markTechUsed(state, "p2", "T12", ctx);
    markTechUsed(state, "p2", "T12", ctx);
    expect(state.players["p2"]?.techs[0]?.usedThisRound).toBe(false);
    expect(techReady(state.players["p2"]!, "T12")).toBe(true);
    expect(ctx.events).toEqual([
      { type: "TECH_USED", playerId: "p1", techId: "T13" },
      { type: "TECH_USED", playerId: "p2", techId: "T12" },
      { type: "TECH_USED", playerId: "p2", techId: "T12" },
    ]);
    expect(() => markTechUsed(state, "p2", "T13", ctx)).toThrow(InvariantError);
  });

  it("readyAllAbilities readies every Tech and Kiln Tradition (L131)", () => {
    const state = buildState({
      players: [{ techs: [{ id: "T05", usedThisRound: true }], kilnAbilityUsedThisRound: true }, { techs: [{ id: "T24", usedThisRound: true }] }],
    });
    readyAllAbilities(state);
    expect(state.players["p1"]?.techs[0]?.usedThisRound).toBe(false);
    expect(state.players["p1"]?.kilnAbilityUsedThisRound).toBe(false);
    expect(state.players["p2"]?.techs[0]?.usedThisRound).toBe(false);
  });
});

describe("hand limit (L199, L303, L626)", () => {
  it("is 4, or 5 with Colour Samples", () => {
    const state = buildState({ players: [{ techs: ["T10"] }, {}] });
    expect(handLimit(state.players["p1"]!)).toBe(5);
    expect(handLimit(state.players["p2"]!)).toBe(4);
  });
});

describe("acquisition (L207–213, L374)", () => {
  it("allows at most 1 Tech per discipline and 3 in total", () => {
    const state = buildState({ players: [{ techs: ["T01", "T22"] }, {}] });
    const p1 = state.players["p1"]!;
    expect(acquisitionError(p1, "T16")).toMatchObject({ code: "TECH_DISCIPLINE_OWNED", details: { techId: "T16", discipline: "workshop" } });
    expect(acquisitionError(p1, "T23")?.code).toBe("TECH_DISCIPLINE_OWNED");
    expect(acquisitionError(p1, "T25")).toBeNull();
    const full = buildState({ players: [{ techs: ["T01", "T22", "T25"] }, {}] });
    expect(acquisitionError(full.players["p1"]!, "T11")).toMatchObject({ code: "TECH_LIMIT", details: { techId: "T11", maxOwned: 3 } });
    expectDocumentedDetails(acquisitionError(full.players["p1"]!, "T11"));
    expectDocumentedDetails(acquisitionError(p1, "T16"));
  });

  it("prices at the printed cost, 1 Coin less for the Guild Hall Shifu (L206–207)", () => {
    expect(techPrice("T25", "apprentice")).toBe(TECHS.T25.cost);
    expect(techPrice("T25", "shifu")).toBe(TECHS.T25.cost - 1);
    expect(techPrice("T01", "shifu")).toBe(1);
    expect(techPrice("T17", "apprentice")).toBe(3);
  });

  it("grantTech adds the Tech and unlocks the matching personal space (L211)", () => {
    const state = buildState({ round: 3 });
    const ctx = testContext();
    grantTech(state, "p1", "T16", ctx);
    grantTech(state, "p1", "T20", ctx);
    grantTech(state, "p1", "T11", ctx);
    const p1 = state.players["p1"]!;
    expect(p1.techs).toEqual([
      { id: "T16", acquiredInRound: 3, usedThisRound: false },
      { id: "T20", acquiredInRound: 3, usedThisRound: false },
      { id: "T11", acquiredInRound: 3, usedThisRound: false },
    ]);
    expect(p1.personalSpaces.form_decorate[1].unlocked).toBe(true);
    expect(p1.personalSpaces.glaze_load[1].unlocked).toBe(true);
    expect(ctx.events).toEqual([
      { type: "PERSONAL_SPACE_UNLOCKED", playerId: "p1", locationId: "form_decorate" },
      { type: "PERSONAL_SPACE_UNLOCKED", playerId: "p1", locationId: "glaze_load" },
    ]);
  });

  it("grantTech on an illegal acquisition is an engine bug", () => {
    const state = buildState({ players: [{ techs: ["T14"] }, {}] });
    expect(() => grantTech(state, "p1", "T24", testContext())).toThrow(InvariantError);
  });
});

describe("Kiln Traditions (L453–485, R1)", () => {
  it("tracks the once-per-round Kiln ability", () => {
    const state = buildState({ players: [{ kilnId: "JU" }, { kilnId: "DI" }] });
    const p1 = state.players["p1"]!;
    expect(hasKiln(p1, "JU")).toBe(true);
    expect(kilnAbilityReady(p1, "JU")).toBe(true);
    expect(kilnAbilityReady(p1, "GE")).toBe(false);
    const ctx = testContext();
    markKilnAbilityUsed(state, "p1", ctx);
    expect(kilnAbilityReady(state.players["p1"]!, "JU")).toBe(false);
    expect(ctx.events).toEqual([{ type: "KILN_ABILITY_USED", playerId: "p1", kilnId: "JU" }]);
    expect(() => markKilnAbilityUsed(state, "p1", ctx)).toThrow(InvariantError);
  });

  it("all five Kilns, Ding included, are available until chosen", () => {
    const setup = buildState({ players: 4, phase: { type: "setup_kiln_selection", selectionOrder: ["p4", "p3", "p2", "p1"], index: 0 } });
    expect(availableKilns(setup)).toEqual(["RU", "GU", "GE", "DI", "JU"]);
    setup.players["p4"]!.kilnId = "DI";
    setup.players["p3"]!.kilnId = "RU";
    expect(availableKilns(setup)).toEqual(["GU", "GE", "JU"]);
    expect(() => markKilnAbilityUsed(setup, "p1", testContext())).toThrow(InvariantError);
  });
});
