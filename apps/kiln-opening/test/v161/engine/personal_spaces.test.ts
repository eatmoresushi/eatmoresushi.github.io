/**
 * Personal spaces (L73, L108, L144, L212): each Form & Decorate and Glaze & Load space is used
 * at most once per round; the second space of each starts locked; a Workshop Tech unlocks the
 * second Form & Decorate space and a Glazing & Loading Tech the second Glaze & Load space;
 * Firing Techs unlock nothing; an unlocked space may be used later the same round.
 */

import { describe, expect, it } from "vitest";
import { grantTech } from "../../../src/game/techs.ts";
import type { GameAction } from "../../../src/game/types.ts";
import { testContext } from "./support/fixtures.ts";
import { reject, table, types, verdict, buildState } from "./workshop_support.ts";

const fd = (workerId: string): GameAction => ({ type: "PLACE_FORM_DECORATE", workerId, vessels: [{ shape: "bowl", decoration: "plain" }] });
const gl = (workerId: string, ceramicId: string, spaceId: "high_1" | "high_2" | "middle_1" | "low_1"): GameAction => ({
  type: "PLACE_GLAZE_LOAD",
  workerId,
  loads: [{ ceramicId, glaze: "white", destination: { kiln: "shared", spaceId } }],
});

const RICH = { resources: { clay: 9, wood: 9, coins: 9 } };

describe("each personal space once per round; the second starts locked (L144, L108)", () => {
  it("Form & Decorate: space 0, then the locked space 1 is refused", () => {
    const t = table({ players: [RICH, {}] });
    const events = t.act("p1", fd("p1:apprentice:1"));
    expect(events[0]).toMatchObject({ type: "WORKER_PLACED", locationId: "form_decorate", spaceIndex: 0 });
    const error = reject(t, "p1", fd("p1:shifu"), "PERSONAL_SPACE_LOCKED");
    expect(error.details).toMatchObject({ locationId: "form_decorate" });
  });

  it("Glaze & Load: space 0, then the locked space 1 is refused", () => {
    const t = table({ players: [RICH, {}], ceramics: [{ owner: "p1", shape: "bowl", stage: "shaped" }, { owner: "p1", shape: "bowl", stage: "shaped" }] });
    t.act("p1", gl("p1:apprentice:1", "c1", "high_1"));
    reject(t, "p1", gl("p1:shifu", "c2", "high_2"), "PERSONAL_SPACE_LOCKED");
  });

  it("with both spaces unlocked, a third use is refused as used, not locked", () => {
    const t = table({ players: [{ ...RICH, techs: ["T01"] }, {}] });
    t.act("p1", fd("p1:apprentice:1"));
    const second = t.act("p1", fd("p1:shifu"));
    expect(second[0]).toMatchObject({ spaceIndex: 1 });
    reject(t, "p1", fd("p1:apprentice:2"), "PERSONAL_SPACE_USED");
  });
});

describe("unlocking by discipline (L212, L376)", () => {
  it("a Workshop Tech unlocks only Form & Decorate", () => {
    const state = buildState({ players: [{ ...RICH, techs: ["T19"] }, {}], placements: [
      { player: "p1", worker: 1, locationId: "form_decorate" },
      { player: "p1", worker: 2, locationId: "glaze_load" },
    ], ceramics: [{ owner: "p1", shape: "bowl", stage: "shaped" }] });
    expect(verdict(state, "p1", fd("p1:shifu"))).toBeNull();
    expect(verdict(state, "p1", gl("p1:shifu", "c1", "high_1"))).toBe("PERSONAL_SPACE_LOCKED");
  });

  it("a Glazing & Loading Tech unlocks only Glaze & Load", () => {
    const state = buildState({ players: [{ ...RICH, techs: ["T23"] }, {}], placements: [
      { player: "p1", worker: 1, locationId: "form_decorate" },
      { player: "p1", worker: 2, locationId: "glaze_load" },
    ], ceramics: [{ owner: "p1", shape: "bowl", stage: "shaped" }] });
    expect(verdict(state, "p1", gl("p1:shifu", "c1", "high_1"))).toBeNull();
    expect(verdict(state, "p1", fd("p1:shifu"))).toBe("PERSONAL_SPACE_LOCKED");
  });

  it("a Firing Tech unlocks nothing", () => {
    const state = buildState({ players: [{ ...RICH, techs: ["T14"] }, {}], placements: [
      { player: "p1", worker: 1, locationId: "form_decorate" },
      { player: "p1", worker: 2, locationId: "glaze_load" },
    ], ceramics: [{ owner: "p1", shape: "bowl", stage: "shaped" }] });
    expect(verdict(state, "p1", fd("p1:shifu"))).toBe("PERSONAL_SPACE_LOCKED");
    expect(verdict(state, "p1", gl("p1:shifu", "c1", "high_1"))).toBe("PERSONAL_SPACE_LOCKED");
  });

  it("a space unlocked mid-round may be used later the same round (L212)", () => {
    const t = table({ players: [RICH, {}] });
    t.act("p1", fd("p1:apprentice:1"));
    reject(t, "p1", fd("p1:apprentice:2"), "PERSONAL_SPACE_LOCKED");
    // The Guild Hall acquisition grants the Tech (`grantTech`), which removes the Cover token.
    const ctx = testContext();
    // Take T16 out of its zone first, as the Guild Hall does, so every Tech stays in exactly one
    // zone (card conservation, DESIGN §8.3).
    t.state.techDisplay.workshop = t.state.techDisplay.workshop.filter((id) => id !== "T16");
    t.state.hidden.techDecks.workshop = t.state.hidden.techDecks.workshop.filter((id) => id !== "T16");
    grantTech(t.state, "p1", "T16", ctx);
    expect(types(ctx.events)).toEqual(["PERSONAL_SPACE_UNLOCKED"]);
    const events = t.act("p1", fd("p1:apprentice:2"));
    expect(events[0]).toMatchObject({ locationId: "form_decorate", spaceIndex: 1 });
  });
});

describe("personal spaces belong to one player (L144)", () => {
  it("another player's use of their own spaces never touches yours", () => {
    const state = buildState({
      players: [RICH, RICH],
      placements: [
        { player: "p2", worker: 1, locationId: "form_decorate" },
        { player: "p2", worker: 2, locationId: "glaze_load" },
      ],
      ceramics: [{ owner: "p1", shape: "bowl", stage: "shaped" }],
    });
    expect(verdict(state, "p1", fd("p1:apprentice:1"))).toBeNull();
    expect(verdict(state, "p1", gl("p1:apprentice:1", "c1", "low_1"))).toBeNull();
  });
});
