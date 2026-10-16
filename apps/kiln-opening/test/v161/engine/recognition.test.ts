/**
 * P6 `recognition.ts` (L425–440, L285, L293, R13; DESIGN §8.2 "Crowns one at a time, every
 * milestone, 0–4 cap, +1 VP beyond 4", "Fixed Grant, Imperial Kiln at 2, Imperial Priority
 * at 3, Audience 6 VP at 4", "Tribute Ware bonus Crown (R13)").
 */

import { describe, expect, it } from "vitest";
import { IMPERIAL_TRACK, LOCATIONS } from "../../../src/game/content.ts";
import { InvariantError } from "../../../src/game/errors.ts";
import { resolveOrderCompletion } from "../../../src/game/orders/completion.ts";
import { advanceRecognitionStep, gainCrown, magistratesHallOpen } from "../../../src/game/recognition.ts";
import { player } from "../../../src/game/state.ts";
import type { GameEvent, GameState, Recognition } from "../../../src/game/types.ts";
import { projectEvent } from "../../../src/game/view.ts";
import { buildState, stageCeramic, testContext } from "./support/fixtures.ts";

function at(recognition: Recognition, resources = { clay: 0, wood: 0, coins: 0 }): GameState {
  return buildState({ players: [{ recognition, resources }, {}] });
}

describe("milestones (L429–436)", () => {
  it("the data is the printed track: Grant 1/1/1, Imperial Kiln, Imperial Priority, Audience 6 VP, +1 VP beyond", () => {
    expect(IMPERIAL_TRACK.track.map((space) => space.reward)).toEqual([
      null,
      { kind: "resources", clay: 1, wood: 1, coins: 1 },
      { kind: "imperial_kiln" },
      { kind: "imperial_priority" },
      { kind: "vp", vp: 6 },
    ]);
    expect(IMPERIAL_TRACK.overflowVpPerCrown).toBe(1);
  });

  it("Recognition 1: Imperial Grant of 1 Clay, 1 Wood and 1 Coin", () => {
    const state = at(0);
    const ctx = testContext();
    gainCrown(state, "p1", "printed_crown", "O17", ctx);
    const p1 = player(state, "p1");
    expect(p1.imperial).toEqual({ recognition: 1, grantReceived: true, kilnGained: false, priority: "on_track", audienceReceived: false });
    expect(p1.resources).toEqual({ clay: 1, wood: 1, coins: 1 });
    expect(ctx.events).toEqual([
      { type: "RECOGNITION_ADVANCED", playerId: "p1", from: 0, to: 1, source: "printed_crown", orderId: "O17" },
      { type: "IMPERIAL_GRANT_RECEIVED", playerId: "p1", clay: 1, wood: 1, coins: 1 },
      { type: "RESOURCES_CHANGED", playerId: "p1", clay: 1, wood: 1, coins: 1, reason: "imperial_grant" },
    ]);
  });

  it("Recognition 2: the Imperial Kiln tile (L285)", () => {
    const state = at(1);
    const ctx = testContext();
    gainCrown(state, "p1", "printed_crown", "O35", ctx);
    expect(player(state, "p1").imperial).toMatchObject({ recognition: 2, kilnGained: true, priority: "on_track" });
    expect(player(state, "p1").resources).toEqual({ clay: 0, wood: 0, coins: 0 });
    expect(ctx.events).toEqual([
      { type: "RECOGNITION_ADVANCED", playerId: "p1", from: 1, to: 2, source: "printed_crown", orderId: "O35" },
      { type: "IMPERIAL_KILN_GAINED", playerId: "p1" },
    ]);
  });

  it("Recognition 3: the Imperial Priority token (L293)", () => {
    const state = at(2);
    const ctx = testContext();
    gainCrown(state, "p1", "printed_crown", null, ctx);
    expect(player(state, "p1").imperial).toMatchObject({ recognition: 3, priority: "held" });
    expect(ctx.events).toEqual([
      { type: "RECOGNITION_ADVANCED", playerId: "p1", from: 2, to: 3, source: "printed_crown", orderId: null },
      { type: "IMPERIAL_PRIORITY_GAINED", playerId: "p1" },
    ]);
  });

  it("Recognition 4: Imperial Audience, 6 VP recorded", () => {
    const state = at(3);
    const ctx = testContext();
    gainCrown(state, "p1", "printed_crown", "O47", ctx);
    const p1 = player(state, "p1");
    expect(p1.imperial).toMatchObject({ recognition: 4, audienceReceived: true });
    expect(p1.score.imperialAudience).toBe(6);
    expect(ctx.events).toEqual([
      { type: "RECOGNITION_ADVANCED", playerId: "p1", from: 3, to: 4, source: "printed_crown", orderId: "O47" },
      { type: "IMPERIAL_AUDIENCE_GAINED", playerId: "p1", vp: 6 },
    ]);
  });
});

describe("Crowns one at a time (L416, L438–440)", () => {
  it("three Crowns from 0 cross every milestone in order", () => {
    const state = at(0);
    const ctx = testContext();
    for (let crown = 0; crown < 3; crown += 1) {
      gainCrown(state, "p1", "printed_crown", "O47", ctx);
    }
    expect(player(state, "p1").imperial).toEqual({ recognition: 3, grantReceived: true, kilnGained: true, priority: "held", audienceReceived: false });
    expect(ctx.events.map((e) => e.type)).toEqual([
      "RECOGNITION_ADVANCED",
      "IMPERIAL_GRANT_RECEIVED",
      "RESOURCES_CHANGED",
      "RECOGNITION_ADVANCED",
      "IMPERIAL_KILN_GAINED",
      "RECOGNITION_ADVANCED",
      "IMPERIAL_PRIORITY_GAINED",
    ]);
  });

  it("a multi-Crown Order reaches 4 and scores the remaining Crowns as 1 VP each (L439)", () => {
    const state = at(2);
    const ctx = testContext();
    for (let crown = 0; crown < 3; crown += 1) {
      gainCrown(state, "p1", "printed_crown", "O47", ctx);
    }
    const p1 = player(state, "p1");
    expect(p1.imperial.recognition).toBe(4);
    expect(p1.score).toMatchObject({ imperialAudience: 6, recognitionOverflow: 1 });
    expect(ctx.events.map((e) => e.type)).toEqual([
      "RECOGNITION_ADVANCED",
      "IMPERIAL_PRIORITY_GAINED",
      "RECOGNITION_ADVANCED",
      "IMPERIAL_AUDIENCE_GAINED",
      "CROWN_OVERFLOW_VP",
    ]);
    expect(ctx.events.at(-1)).toEqual({ type: "CROWN_OVERFLOW_VP", playerId: "p1", source: "printed_crown", vp: 1 });
  });

  it("Recognition is capped at 4; every further Crown scores 1 VP immediately", () => {
    const state = at(4);
    const ctx = testContext();
    for (let crown = 0; crown < 5; crown += 1) {
      gainCrown(state, "p1", "printed_crown", null, ctx);
    }
    const p1 = player(state, "p1");
    expect(p1.imperial.recognition).toBe(4);
    expect(p1.score.recognitionOverflow).toBe(5);
    expect(p1.score.imperialAudience).toBe(6);
    expect(ctx.events.every((e) => e.type === "CROWN_OVERFLOW_VP")).toBe(true);
    expect(() => advanceRecognitionStep(state, "p1", "printed_crown", null, ctx)).toThrow(InvariantError);
  });

  it("each milestone reward is gained only once (L440)", () => {
    const state = buildState({
      players: [
        {
          recognition: 0,
          imperial: { grantReceived: true, kilnGained: true, priority: "spent", audienceReceived: true },
          resources: { clay: 0, wood: 0, coins: 0 },
        },
        {},
      ],
    });
    const ctx = testContext();
    for (let crown = 0; crown < 4; crown += 1) {
      gainCrown(state, "p1", "printed_crown", null, ctx);
    }
    const p1 = player(state, "p1");
    expect(p1.imperial).toEqual({ recognition: 4, grantReceived: true, kilnGained: true, priority: "spent", audienceReceived: true });
    expect(p1.resources).toEqual({ clay: 0, wood: 0, coins: 0 });
    // The fixture records the Audience VP already received; it is not scored a second time.
    expect(p1.score.imperialAudience).toBe(6);
    expect(ctx.events.map((e) => e.type)).toEqual(Array(4).fill("RECOGNITION_ADVANCED"));
  });

  it("Tribute Ware's bonus Crown advances Recognition, or scores past 4 (R13)", () => {
    const state = buildState({ players: [{ recognition: 3 }, { recognition: 4 }] });
    const ctx = testContext();
    gainCrown(state, "p1", "tribute_crown", "O17", ctx);
    gainCrown(state, "p2", "tribute_crown", "O18", ctx);
    expect(player(state, "p1").imperial.recognition).toBe(4);
    expect(player(state, "p2").score.recognitionOverflow).toBe(1);
    expect(ctx.events).toEqual([
      { type: "RECOGNITION_ADVANCED", playerId: "p1", from: 3, to: 4, source: "tribute_crown", orderId: "O17" },
      { type: "IMPERIAL_AUDIENCE_GAINED", playerId: "p1", vp: 6 },
      { type: "CROWN_OVERFLOW_VP", playerId: "p2", source: "tribute_crown", vp: 1 },
    ]);
  });

  it("only the named player changes", () => {
    const state = at(0);
    const before = structuredClone(player(state, "p2"));
    gainCrown(state, "p1", "printed_crown", null, testContext());
    expect(player(state, "p2")).toEqual(before);
  });
});

describe("Magistrate's Hall steps (L225, L229–233, L427)", () => {
  it("is open at Recognition 0–2 only", () => {
    expect(LOCATIONS.magistrates_hall.usableAtRecognition).toEqual([0, 1, 2]);
    const open = ([0, 1, 2, 3, 4] as const).map((r) => magistratesHallOpen(player(at(r), "p1")));
    expect(open).toEqual([true, true, true, false, false]);
  });

  it("advances one step and resolves the milestone reached; never to 4", () => {
    const state = at(2);
    const ctx = testContext();
    advanceRecognitionStep(state, "p1", "magistrates_hall", null, ctx);
    expect(player(state, "p1").imperial).toMatchObject({ recognition: 3, priority: "held" });
    expect(ctx.events).toEqual([
      { type: "RECOGNITION_ADVANCED", playerId: "p1", from: 2, to: 3, source: "magistrates_hall", orderId: null },
      { type: "IMPERIAL_PRIORITY_GAINED", playerId: "p1" },
    ]);
    // From 3 the Hall cannot be used; calling it is an engine bug, never a 4th step.
    expect(() => advanceRecognitionStep(state, "p1", "magistrates_hall", null, testContext())).toThrow(InvariantError);
    expect(player(state, "p1").imperial.recognition).toBe(3);

    const grant = at(0);
    const grantCtx = testContext();
    advanceRecognitionStep(grant, "p1", "magistrates_hall", null, grantCtx);
    expect(player(grant, "p1").resources).toEqual({ clay: 1, wood: 1, coins: 1 });
  });
});

describe("via Order completion (L410–417)", () => {
  it("resolves each printed Crown of the Order, then Tribute Ware's, in order", () => {
    // O47 has 3 printed Crowns. From Recognition 1 with Tribute Ware: 2, 3, 4, then +1 VP.
    const state = buildState({ players: [{ kilnId: "GE", recognition: 1, techs: ["T25"], hand: ["O47"] }, {}] });
    const ids = [
      stageCeramic(state, { owner: "p1", stage: "finished", shape: "bowl", glaze: "white", decoration: "plain", quality: "masterpiece" }).id,
      stageCeramic(state, { owner: "p1", stage: "finished", shape: "plate", glaze: "celadon", decoration: "carved", quality: "masterpiece" }).id,
      stageCeramic(state, { owner: "p1", stage: "finished", shape: "vase", glaze: "grey_green", decoration: "impressed", quality: "fine" }).id,
    ];
    const ctx = testContext();
    const record = resolveOrderCompletion(state, "p1", { orderId: "O47", ceramicIds: ids }, "order_phase", ctx);
    expect(record).toMatchObject({ printedCrowns: 3, bonusCrowns: 1 });
    const p1 = player(state, "p1");
    expect(p1.imperial).toEqual({ recognition: 4, grantReceived: true, kilnGained: true, priority: "held", audienceReceived: true });
    // Tribute Ware's 1 VP was recorded when it was gained (owner amendment A1).
    expect(p1.score).toEqual({ orders: 22, kilnAbilities: 0, recognitionOverflow: 1, imperialAudience: 6, techs: 1 });
    const crownEvents = ctx.events.filter(
      (e): e is Extract<GameEvent, { type: "RECOGNITION_ADVANCED" | "CROWN_OVERFLOW_VP" }> =>
        e.type === "RECOGNITION_ADVANCED" || e.type === "CROWN_OVERFLOW_VP",
    );
    expect(crownEvents.map((e) => [e.type, e.source])).toEqual([
      ["RECOGNITION_ADVANCED", "printed_crown"],
      ["RECOGNITION_ADVANCED", "printed_crown"],
      ["RECOGNITION_ADVANCED", "printed_crown"],
      ["CROWN_OVERFLOW_VP", "tribute_crown"],
    ]);
  });

  it("emits only public events (no secret payloads)", () => {
    const state = at(0);
    const ctx = testContext();
    for (let crown = 0; crown < 6; crown += 1) {
      gainCrown(state, "p1", "printed_crown", "O47", ctx);
    }
    for (const event of ctx.events) {
      expect(event).not.toHaveProperty("secret");
      expect(projectEvent(event)).toEqual(event);
    }
  });
});
