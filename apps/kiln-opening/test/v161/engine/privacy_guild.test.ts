/**
 * Guild Hall privacy (v1.6.2 L237, B2, DESIGN §4.2): the Shifu's inspection and the bottom
 * order of the untaken Techs are private to the acting player, also while they wait behind a
 * Colour Samples look, and the step never closes itself on private facts. The public projection and the public
 * event log carry the discipline and counts only; the actor's own view and the `secret` of
 * their events carry the identities. Legality never depends on the hidden deck order.
 */

import { describe, expect, it } from "vitest";
import { TECH_IDS } from "../../../src/game/content.ts";
import { validateAction } from "../../../src/game/engine.ts";
import { eventForViewer, projectEvent, projectPublicState } from "../../../src/game/view.ts";
import type { GameAction, GameEvent, GameState, TechId } from "../../../src/game/types.ts";
import { buildState } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";

function table(state: GameState = buildState()): LocalTable {
  return new LocalTable(state, { flow: "halt", pass: ["worker_action_done"] });
}

/** Tech IDs that are public right now: displayed or owned. */
function publicTechIds(state: GameState): Set<TechId> {
  const ids = new Set<TechId>();
  for (const discipline of ["workshop", "glazing_loading", "firing"] as const) {
    for (const id of state.techDisplay[discipline]) ids.add(id);
  }
  for (const playerId of state.playerOrder) {
    for (const tech of state.players[playerId]?.techs ?? []) ids.add(tech.id);
  }
  return ids;
}

function expectNoHiddenTechs(json: string, state: GameState, hidden: readonly TechId[]): void {
  const visible = publicTechIds(state);
  for (const id of hidden) {
    if (!visible.has(id)) {
      expect(json, `${id} must not be public`).not.toContain(`"${id}"`);
    }
  }
}

const INSPECT: GameAction = { type: "PLACE_GUILD_HALL", workerId: "p1:shifu", choice: { kind: "inspect", discipline: "firing" } };

describe("the Shifu inspection is private (L237, B2)", () => {
  it("public state shows only who looks, at which discipline, and how many cards", () => {
    const t = table();
    const events = t.act("p1", INSPECT);
    const inspected = ["T13", "T14"] as const;

    const projected = projectPublicState(t.state);
    expect(projected.counts.pendingLook).toEqual({ playerId: "p1", kind: "guild_inspection", count: 2 });
    expect(projected.counts.techDecks.firing).toBe(2);
    expect(projected.phase).toEqual({
      type: "work_turn",
      activePlayerId: "p1",
      step: { kind: "guild_inspection", workerId: "p1:shifu", discipline: "firing", inspectedCount: 2, takes: [] },
    });
    expectNoHiddenTechs(JSON.stringify(projected), t.state, TECH_IDS);

    expect(t.view("p1").own?.pendingLook).toEqual({ kind: "guild_inspection", playerId: "p1", discipline: "firing", techIds: [...inspected] });
    expect(t.view("p2").own?.pendingLook).toBeNull();
    expect(t.view(null).own).toBeNull();

    const look = events.find((event) => event.type === "PRIVATE_LOOK_OPENED") as GameEvent;
    expect(projectEvent(look)).toEqual({ type: "PRIVATE_LOOK_OPENED", playerId: "p1", kind: "guild_inspection", discipline: "firing", count: 2 });
    expect(eventForViewer(look, "p2")).not.toHaveProperty("secret");
    expect(eventForViewer(look, "p1")).toMatchObject({ secret: { visibleTo: "p1", techIds: [...inspected], orderIds: [] } });
    expectNoHiddenTechs(JSON.stringify(events.map(projectEvent)), t.state, TECH_IDS);
  });

  it("the chosen bottom order stays private; only the count is public", () => {
    const t = table();
    t.act("p1", INSPECT);
    t.act("p1", { type: "GUILD_TAKE", take: { kind: "face_up", techId: "T20" } });
    const events = t.act("p1", { type: "GUILD_FINISH", bottomOrder: ["T14", "T13"] });
    const returned = events.find((event) => event.type === "TECHS_RETURNED_TO_BOTTOM") as GameEvent;
    expect(projectEvent(returned)).toEqual({ type: "TECHS_RETURNED_TO_BOTTOM", playerId: "p1", discipline: "firing", count: 2 });
    expect(eventForViewer(returned, "p1")).toMatchObject({ secret: { visibleTo: "p1", techIds: ["T14", "T13"] } });
    expect(eventForViewer(returned, "p2")).not.toHaveProperty("secret");

    const projected = projectPublicState(t.state);
    expect(projected.counts.pendingLook).toBeNull();
    expect(projected.counts.techDecks.firing).toBe(4);
    expectNoHiddenTechs(JSON.stringify(projected), t.state, ["T13", "T14", "T24", "T25"]);
    expectNoHiddenTechs(JSON.stringify(t.events.map(projectEvent)), t.state, ["T13", "T14", "T24", "T25"]);
    expect(t.view("p2").own?.pendingLook).toBeNull();
    expect(t.view("p1").own?.pendingLook).toBeNull();
  });

  it("a rejected choice reveals nothing to another player", () => {
    const t = table();
    t.act("p1", INSPECT);
    const error = t.expectRuleError("p2", { type: "GUILD_TAKE", take: { kind: "inspected", techId: "T13" } }, "NOT_YOUR_DECISION");
    expect(JSON.stringify(error)).not.toContain("T14");
    const finish = t.expectRuleError("p2", { type: "GUILD_FINISH", bottomOrder: ["T14", "T13"] }, "NOT_YOUR_DECISION");
    expect(JSON.stringify(finish)).not.toContain("T13");
  });

  it("the Techs that wait behind a Colour Samples look stay the Shifu's alone (v1.6.2 L237, L243)", () => {
    const t = table();
    t.act("p1", INSPECT);
    const events = t.act("p1", { type: "GUILD_TAKE", take: { kind: "face_up", techId: "T10" } });
    expect(t.state.phase).toMatchObject({ step: { kind: "colour_samples", resume: { kind: "guild_inspection", discipline: "firing", inspectedCount: 2 } } });
    const projected = projectPublicState(t.state);
    expect(projected.counts.pendingLook).toEqual({ playerId: "p1", kind: "colour_samples", count: 3 });
    expectNoHiddenTechs(JSON.stringify(projected), t.state, TECH_IDS);
    expectNoHiddenTechs(JSON.stringify(events.map(projectEvent)), t.state, TECH_IDS);
    expect(t.view("p1").own?.pendingLook).toMatchObject({ kind: "colour_samples", inspection: { discipline: "firing", techIds: ["T13", "T14"] } });
    expect(t.view("p2").own?.pendingLook).toBeNull();
    expect(JSON.stringify(t.view("p2"))).not.toContain('"T13"');
  });

  it("the inspection closes by itself on public facts only, whatever the inspected Tech costs", () => {
    // 4 players; one Firing Tech is left in the deck: Second Firing (2) on one table, Tribute
    // Ware (4) on the other. After a face-up Kiln Tending (3) p1 has 2 Coins and no affordable
    // face-up Tech, so only the private cost of the inspected Tech decides whether a second take
    // exists. Neither step closes by itself: closing would reveal that cost (DESIGN §4.5).
    const display = { workshop: ["T17", "T18"], firing: ["T11", "T13"] } as const;
    const cheap = table(buildState({ players: [{ resources: { coins: 5 } }, { techs: ["T12"] }, { techs: ["T24"] }, { techs: ["T25"] }], techDisplay: { ...display, workshop: [...display.workshop], firing: [...display.firing] } }));
    const dear = table(buildState({ players: [{ resources: { coins: 5 } }, { techs: ["T12"] }, { techs: ["T24"] }, { techs: ["T14"] }], techDisplay: { ...display, workshop: [...display.workshop], firing: [...display.firing] } }));
    for (const [t, left] of [[cheap, "T14"], [dear, "T25"]] as const) {
      t.act("p1", INSPECT);
      expect(t.state.hidden.pendingLook).toMatchObject({ techIds: [left] });
      t.act("p1", { type: "GUILD_TAKE", take: { kind: "face_up", techId: "T20" } });
      expect(t.player("p1").resources.coins).toBe(2);
      expect(t.state.phase).toMatchObject({ activePlayerId: "p1", step: { kind: "guild_inspection", takes: [{ kind: "face_up", techId: "T20" }] } });
    }
    expect(validateAction(cheap.actorView("p1"), { type: "GUILD_TAKE", take: { kind: "inspected", techId: "T14" } })).toBeNull();
    expect(validateAction(dear.actorView("p1"), { type: "GUILD_TAKE", take: { kind: "inspected", techId: "T25" } })?.code).toBe("INSUFFICIENT_RESOURCES");
    for (const [t, left] of [[cheap, "T14"], [dear, "T25"]] as const) {
      expect(validateAction(t.actorView("p1"), { type: "GUILD_FINISH", bottomOrder: [left] })).toBeNull();
    }
  });
});

describe("legality is independent of the hidden Tech deck order", () => {
  it("every Guild placement and take validates the same way whatever the decks hold", () => {
    const a = buildState({ techDecks: { firing: ["T13", "T14", "T24", "T25"] } });
    const b = buildState({ techDecks: { firing: ["T25", "T24", "T14", "T13"] } });
    const placements: GameAction[] = [
      INSPECT,
      { type: "PLACE_GUILD_HALL", workerId: "p1:apprentice:1", choice: { kind: "buy_face_up", techId: "T11" } },
      { type: "PLACE_GUILD_HALL", workerId: "p1:apprentice:1", choice: { kind: "buy_face_up", techId: "T13" } },
    ];
    for (const action of placements) {
      const tableA = table(a);
      const tableB = table(b);
      expect(validateAction(tableA.actorView("p1"), action)).toEqual(validateAction(tableB.actorView("p1"), action));
    }
    // After the inspection, the public projections agree; only the private looks differ.
    const tableA = table(a);
    const tableB = table(b);
    tableA.act("p1", INSPECT);
    tableB.act("p1", INSPECT);
    expect(projectPublicState(tableA.state)).toEqual(projectPublicState(tableB.state));
    expect(tableA.view("p2")).toEqual(tableB.view("p2"));
    expect(tableA.view("p1").own?.pendingLook).not.toEqual(tableB.view("p1").own?.pendingLook);
  });
});
