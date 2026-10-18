/**
 * Hidden information in the Contribution window (DESIGN §4.2, v1.6.2 L93, L246, L508, L668–669,
 * change 26): sealed cards, Fuel Ledger Bank and Fuel Ledger Stoke included, live only in
 * `PrivateFiringState` until every participant has submitted; nothing public, no other seat's
 * view and no event carries them. Each player's public card list (`contributionCards`) names
 * every card they hold, like the cards in front of them at the table, never which one is
 * sealed: all 14 cards share one back.
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

/** p1 seals Fuel Ledger Stoke, p2 seals Bank; p3 has not submitted. */
function sealedTable(): { table: LocalTable; events: GameEvent[] } {
  const table = openFiringTable(spec());
  const events = [...table.contribute("p1", "FUEL_LEDGER_STOKE"), ...table.contribute("p2", "BANK")];
  return { table, events };
}

const SECRET_MARKERS = ['"STOKE"', '"BANK"', '"FUEL_LEDGER_STOKE"', '"FUEL_LEDGER_BANK"', '"fuelLedger"', '"card"'];

/** JSON without the players' public card lists, which name every card a player holds. */
function withoutCardLists(value: unknown): string {
  return JSON.stringify(value, (key, item: unknown) => (key === "contributionCards" ? undefined : item));
}

function expectNoSealedChoice(value: unknown): void {
  const json = withoutCardLists(value);
  for (const marker of SECRET_MARKERS) {
    expect(json, `public data contains ${marker}`).not.toContain(marker);
  }
}

describe("sealed choices stay out of the public state (DESIGN §4.2)", () => {
  it("the public projection shows only who submitted, never the card (a Fuel Ledger card included)", () => {
    const { table } = sealedTable();
    const projected = projectPublicState(table.state);
    expect(projected.phase).toEqual({
      type: "firing_contributions",
      windowId: WINDOW,
      eligiblePlayerIds: ["p1", "p2", "p3"],
      submittedPlayerIds: ["p1", "p2"],
    });
    expect(projected.firing?.contributions).toBeNull();
    expectNoSealedChoice(projected);
    // The authoritative state itself never holds a sealed choice either (only PrivateFiringState does).
    expectNoSealedChoice(table.state);
    expect(table.privateState.submissions).toEqual({
      p1: { card: "FUEL_LEDGER_STOKE" },
      p2: { card: "BANK" },
    });
    // The public card lists say what each player holds, not what they sealed (one shared back).
    expect(projected.players["p1"]?.contributionCards).toEqual(["BANK", "TEND", "STOKE", "FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"]);
    expect(projected.players["p2"]?.contributionCards).toEqual(["BANK", "TEND", "STOKE"]);
  });

  it("no Wood is set aside before the reveal: the public totals are unchanged (v1.6.2 L508)", () => {
    const { table } = sealedTable();
    expect(projectPublicState(table.state).players["p1"]?.resources.wood).toBe(2);
    expect(projectPublicState(table.state).players["p2"]?.resources.wood).toBe(2);
  });

  it("each seat sees only its own sealed choice; other seats and spectators see none", () => {
    const { table } = sealedTable();
    expect(table.view("p1").own?.pendingContribution).toEqual({ card: "FUEL_LEDGER_STOKE", windowId: WINDOW });
    expect(table.view("p2").own?.pendingContribution).toEqual({ card: "BANK", windowId: WINDOW });
    const p3View = table.view("p3");
    expect(p3View.own?.pendingContribution).toBeNull();
    expectNoSealedChoice(p3View);
    const spectator = table.view(null);
    expect(spectator.own).toBeNull();
    expectNoSealedChoice(spectator);
    // A seat's view never shows another seat's choice.
    expect(withoutCardLists(table.view("p2"))).not.toContain('"FUEL_LEDGER_STOKE"');
    expect(withoutCardLists(table.view("p1"))).not.toContain('"BANK"');
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
    // A Fuel Ledger card and a plain card look the same to everybody else (one shared back).
    const stoke = openFiringTable(spec());
    stoke.contribute("p1", "FUEL_LEDGER_STOKE");
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
    const command: SubmitContributionCommand = { type: "SUBMIT_CONTRIBUTION", windowId: WINDOW, card: "STOKE" };
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
    expect(JSON.stringify(result.error)).not.toContain("FUEL_LEDGER");
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
        // Fuel Ledger Stoke (v1.6.2 L266, L634): +2 for its printed 1 Wood, paid now.
        p1: { card: "FUEL_LEDGER_STOKE", heat: 2, woodPaid: 1 },
        p2: { card: "BANK", heat: -1, woodPaid: 1 },
        p3: { card: "TEND", heat: 0, woodPaid: 0 },
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
