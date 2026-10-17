/**
 * Hidden information in the Contribution window (DESIGN §4.2, L504, L638, L672–673):
 * sealed cards and Fuel Ledger commitments live only in `PrivateFiringState` until every
 * participant has submitted; nothing public, no other seat's view and no event carries them.
 */

import { describe, expect, it } from "vitest";
import { legalContributions, validateContribution } from "../../../src/game/firing/contributions.ts";
import type { GameEvent, PrivateFiringState, SubmitContributionCommand } from "../../../src/game/types.ts";
import { eventForViewer, projectEvent, projectPublicState, viewOf } from "../../../src/game/view.ts";
import type { StateSpec } from "./support/fixtures.ts";
import { eventsOfType, openFiringTable } from "./support/firing.ts";
import type { LocalTable } from "./support/localTable.ts";

const WINDOW = "test-game:r1:contributions";

function spec(): StateSpec {
  return {
    players: [{ techs: ["T12"] }, { techs: ["T13"] }, {}],
    fireDeck: [0],
    ceramics: [
      { owner: "p1", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1" },
      { owner: "p2", stage: "loaded", shape: "plate", glaze: "celadon", at: "middle_2" },
      { owner: "p3", stage: "loaded", shape: "washer", glaze: "moon_white", at: "low_1" },
    ],
  };
}

/** p1 seals Stoke + Fuel Ledger, p2 seals Bank; p3 has not submitted. */
function sealedTable(): { table: LocalTable; events: GameEvent[] } {
  const table = openFiringTable(spec());
  const events = [...table.contribute("p1", "STOKE", true), ...table.contribute("p2", "BANK")];
  return { table, events };
}

const SECRET_MARKERS = ['"STOKE"', '"BANK"', '"fuelLedger"', '"card"'];

function expectNoSealedChoice(json: string): void {
  for (const marker of SECRET_MARKERS) {
    expect(json, `public data contains ${marker}`).not.toContain(marker);
  }
}

describe("sealed choices stay out of the public state (DESIGN §4.2)", () => {
  it("the public projection shows only who submitted, never the card or the Fuel Ledger commitment", () => {
    const { table } = sealedTable();
    const projected = projectPublicState(table.state);
    expect(projected.phase).toEqual({
      type: "firing_contributions",
      windowId: WINDOW,
      eligiblePlayerIds: ["p1", "p2", "p3"],
      submittedPlayerIds: ["p1", "p2"],
    });
    expect(projected.firing?.contributions).toBeNull();
    expectNoSealedChoice(JSON.stringify(projected));
    // The authoritative state itself never holds a sealed choice either (only PrivateFiringState does).
    expectNoSealedChoice(JSON.stringify(table.state));
    expect(table.privateState.submissions).toEqual({
      p1: { card: "STOKE", fuelLedger: true },
      p2: { card: "BANK", fuelLedger: false },
    });
  });

  it("committed Wood stays in the public totals until the reveal (L504)", () => {
    const { table } = sealedTable();
    expect(projectPublicState(table.state).players["p1"]?.resources.wood).toBe(2);
    expect(projectPublicState(table.state).players["p2"]?.resources.wood).toBe(2);
  });

  it("each seat sees only its own sealed choice; other seats and spectators see none", () => {
    const { table } = sealedTable();
    expect(table.view("p1").own?.pendingContribution).toEqual({ card: "STOKE", fuelLedger: true, windowId: WINDOW });
    expect(table.view("p2").own?.pendingContribution).toEqual({ card: "BANK", fuelLedger: false, windowId: WINDOW });
    const p3View = table.view("p3");
    expect(p3View.own?.pendingContribution).toBeNull();
    expectNoSealedChoice(JSON.stringify(p3View));
    const spectator = table.view(null);
    expect(spectator.own).toBeNull();
    expectNoSealedChoice(JSON.stringify(spectator));
    // A seat's view never shows another seat's choice.
    expect(JSON.stringify(table.view("p2"))).not.toContain('"STOKE"');
    expect(JSON.stringify(table.view("p1"))).not.toContain('"BANK"');
  });

  it("CONTRIBUTION_SUBMITTED carries no card at all and is entirely public", () => {
    const { events } = sealedTable();
    expect(events).toEqual([
      { type: "CONTRIBUTION_SUBMITTED", playerId: "p1", windowId: WINDOW },
      { type: "CONTRIBUTION_SUBMITTED", playerId: "p2", windowId: WINDOW },
    ]);
    for (const event of events) {
      expect(projectEvent(event)).toEqual(event);
      expect(eventForViewer(event, "p3")).toEqual(event);
    }
  });
});

describe("legality never depends on another seat's sealed choice (DESIGN §1.3)", () => {
  it("p3's view, options and validation are identical whatever the others sealed", () => {
    const stoke = openFiringTable(spec());
    stoke.contribute("p1", "STOKE", true);
    stoke.contribute("p2", "BANK");
    const tend = openFiringTable(spec());
    tend.contribute("p1", "TEND");
    tend.contribute("p2", "TEND");
    expect(projectPublicState(stoke.state)).toEqual(projectPublicState(tend.state));
    expect(stoke.view("p3")).toEqual(tend.view("p3"));
    expect(legalContributions(stoke.view("p3"))).toEqual(legalContributions(tend.view("p3")));
  });

  it("validateContribution ignores other seats' entries in the private state", () => {
    const { table } = sealedTable();
    const command: SubmitContributionCommand = { type: "SUBMIT_CONTRIBUTION", windowId: WINDOW, card: "STOKE", fuelLedger: false };
    const onlyOwn: PrivateFiringState = { gameId: "test-game", windowId: WINDOW, submissions: {} };
    const view = viewOf(table.state, "p3", onlyOwn);
    if (view.viewerId === null || view.own === null) throw new Error("p3 is seated");
    const actor = { ...view, viewerId: "p3", own: view.own };
    expect(validateContribution(actor, table.privateState, command)).toEqual(validateContribution(actor, onlyOwn, command));
    expect(validateContribution(actor, onlyOwn, command)).toBeNull();
  });

  it("a rejected resubmission reveals nothing about the sealed card", () => {
    const { table } = sealedTable();
    const result = table.tryContribute("p1", "BANK");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CONTRIBUTION_ALREADY_SUBMITTED");
    expect(JSON.stringify(result.error)).not.toContain("STOKE");
  });
});

describe("the reveal (L673)", () => {
  it("reveals every sealed choice in one public event, then clears the private state", () => {
    const { table } = sealedTable();
    const events = table.contribute("p3", "TEND");
    const [revealed] = eventsOfType(events, "CONTRIBUTIONS_REVEALED");
    expect(revealed).toEqual({
      type: "CONTRIBUTIONS_REVEALED",
      windowId: WINDOW,
      contributions: {
        // Fuel Ledger (v1.6.2 L637): the owner's Stoke costs no Wood; the commitment 1.
        p1: { card: "STOKE", fuelLedger: true, heat: 2, woodPaid: 1 },
        p2: { card: "BANK", fuelLedger: false, heat: -1, woodPaid: 1 },
        p3: { card: "TEND", fuelLedger: false, heat: 0, woodPaid: 0 },
      },
    });
    expect(revealed !== undefined && projectEvent(revealed)).toEqual(revealed);
    expect(table.privateState).toEqual({ gameId: "test-game", windowId: null, submissions: {} });
    expect(projectPublicState(table.state).firing?.contributions).toEqual(revealed?.contributions);
    // After the window closes no seat has a pending sealed choice.
    for (const pid of ["p1", "p2", "p3"]) {
      expect(table.view(pid).own?.pendingContribution).toBeNull();
    }
  });
});
