/**
 * Playtest Form V3 for rules V1.6.1 (`src/playtest`): the version gate, the V1.6.1 option
 * lists from the content API, per-discipline Techs, the Kiln Die and Base Heat, and the
 * Fuel Ledger and ownership cross-checks. The V1.6.1 form page is the UI phase's job.
 */

import { describe, expect, it } from "vitest";
import {
  FIRING,
  GAME_CONFIG,
  KILN_IDS,
  activeKilnSpaces,
  techsOfDiscipline,
} from "../../../src/game/index.ts";
import {
  createPlaytestDraft,
  reconcileFiringTechOwnership,
  resizePlayers,
  restorePlaytestDraft,
  roundBaseHeat,
  sharedKilnCapacity,
  submissionCandidate,
} from "../../../src/playtest/model.ts";
import { FIRING_TECH_IDS, KILN_DIE_FACES, MAX_RECOGNITION, validatePlaytestSubmission } from "../../../src/playtest/schema.ts";
import type { PlaytestDraft } from "../../../src/playtest/types.ts";

function validDraft(): PlaytestDraft {
  const draft = createPlaytestDraft(2);
  draft.playedOn = "2026-10-15";
  draft.players[0] = {
    ...draft.players[0]!,
    kilnId: "DI",
    workshopTechId: "T16",
    firingTechId: "T12",
    completedOrderIds: ["S01", "O01"],
    finalVp: 41,
    recognition: 3,
    coinsRemaining: 4,
    clayRemaining: 2,
    woodRemaining: 1,
  };
  draft.players[1] = {
    ...draft.players[1]!,
    kilnId: "JU",
    glazingLoadingTechId: "T22",
    completedOrderIds: ["S02"],
    finalVp: 37,
    recognition: 2,
    coinsRemaining: 1,
    clayRemaining: 3,
    woodRemaining: 2,
  };
  for (const round of draft.rounds) round.kilnDie = 2;
  draft.rounds[0]!.players[0] = { ...draft.rounds[0]!.players[0]!, contribution: "stoke_2", sharedLoaded: 2, imperialLoaded: 0, kilnAbilityUses: 1 };
  draft.rounds[0]!.players[1] = { ...draft.rounds[0]!.players[1]!, contribution: "tend", sharedLoaded: 1, kilnAbilityUses: 1 };
  draft.rounds[0]!.firingTechIds = ["T12"];
  draft.rounds[0]!.fireModifier = 1;
  return draft;
}

function issuesOf(candidate: unknown): string[] {
  const result = validatePlaytestSubmission(candidate);
  return result.ok ? [] : result.issues.map((issue) => `${issue.path}: ${issue.message}`);
}

describe("Playtest Form V3 (rules V1.6.1)", () => {
  it("accepts a complete V1.6.1 record", () => {
    const result = validatePlaytestSubmission(submissionCandidate(validDraft()));
    expect(result.ok, JSON.stringify(result.ok ? null : result.issues)).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ formVersion: 3, rulesVersion: "1.6.1", playerCount: 2 });
    expect(result.value.players[0]).toMatchObject({ kilnId: "DI", workshopTechId: "T16", glazingLoadingTechId: null, firingTechId: "T12", kilnAbilityUses: 1 });
    expect(result.value.rounds[0]).toMatchObject({ kilnDie: 2, firingTechIds: ["T12"] });
  });

  it("uses the V1.6.1 content for every option list", () => {
    expect(KILN_IDS).toContain("DI");
    expect(FIRING_TECH_IDS).toEqual(techsOfDiscipline("firing"));
    expect(KILN_DIE_FACES).toEqual([...new Set(FIRING.kilnDie.faces)].sort());
    expect(MAX_RECOGNITION).toBe(4);
    for (const playerCount of [2, 3, 4] as const) {
      expect(sharedKilnCapacity(playerCount)).toBe(activeKilnSpaces(playerCount).length);
    }
    expect(createPlaytestDraft(3).rounds).toHaveLength(GAME_CONFIG.rounds);
  });

  it("refuses older form or rules versions and V1.4-only fields", () => {
    const candidate = submissionCandidate(validDraft()) as Record<string, unknown>;
    expect(issuesOf({ ...candidate, formVersion: 2 })).toContain("formVersion: Unsupported form version.");
    expect(issuesOf({ ...candidate, rulesVersion: "1.4" })).toContain("rulesVersion: This form records rules V1.6.1.");
    const players = (candidate["players"] as Array<Record<string, unknown>>).map((player, index) =>
      index === 0 ? { ...player, startingTechniqueId: "ST01" } : player,
    );
    expect(issuesOf({ ...candidate, players })).toContain("players.0.startingTechniqueId: V1.6.1 has no Starting Techs.");
  });

  it("keeps each Tech in its own discipline and each tile with one player", () => {
    const wrongDiscipline = validDraft();
    wrongDiscipline.players[0]!.workshopTechId = "T22";
    expect(issuesOf(submissionCandidate(wrongDiscipline))).toContain("players.0.workshopTechId: Choose one of the available options.");
    const shared = validDraft();
    shared.players[1]!.workshopTechId = "T16";
    expect(issuesOf(submissionCandidate(shared))).toContain("players: A Tech tile can only belong to one player.");
  });

  it("ties Fuel Ledger's −2/+2 to its owner and to the round's Fuel Ledger record", () => {
    const notOwner = validDraft();
    notOwner.rounds[1]!.players[1]!.contribution = "bank_2";
    notOwner.rounds[1]!.firingTechIds = ["T12"];
    expect(issuesOf(submissionCandidate(notOwner))).toContain(
      "rounds.1.players.1.contribution: Only the player who owns Fuel Ledger can record a −2 or +2 Contribution.",
    );
    const unrecorded = validDraft();
    unrecorded.rounds[0]!.firingTechIds = [];
    expect(issuesOf(submissionCandidate(unrecorded))).toContain("rounds.0.firingTechIds: Check Fuel Ledger when a −2 or +2 Contribution was used.");
    const unowned = validDraft();
    unowned.rounds[2]!.firingTechIds = ["T24"];
    expect(issuesOf(submissionCandidate(unowned))).toContain("rounds.2.firingTechIds: A Firing Tech can only be used after assigning it to a player.");
  });

  it("checks the Kiln Die, Shared Kiln capacity and the derived totals", () => {
    const badDie = validDraft();
    badDie.rounds[0]!.kilnDie = 6;
    expect(issuesOf(submissionCandidate(badDie))).toContain("rounds.0.kilnDie: Enter a whole number from 1 to 3.");
    const overfull = validDraft();
    overfull.rounds[1]!.players[0]!.sharedLoaded = 3;
    overfull.rounds[1]!.players[1]!.sharedLoaded = 2;
    expect(issuesOf(submissionCandidate(overfull))).toContain(`rounds.1.players: Shared Kiln loading cannot exceed ${activeKilnSpaces(2).length} ceramics.`);
    const mismatch = validDraft() as unknown as { players: Array<Record<string, unknown>> };
    const candidate = submissionCandidate(mismatch as unknown as PlaytestDraft) as { players: Array<Record<string, unknown>> };
    candidate.players[0]!["kilnAbilityUses"] = 4;
    expect(issuesOf(candidate)).toContain("players.0.kilnAbilityUses: Kiln ability total must match the five round counters.");
  });

  it("computes Base Heat from the Kiln Die and the revealed Contributions, clamped 0–5", () => {
    const draft = validDraft();
    expect(roundBaseHeat(draft.rounds[0]!)).toBe(4);
    draft.rounds[0]!.players[0]!.contribution = "bank_2";
    draft.rounds[0]!.players[1]!.contribution = "bank";
    draft.rounds[0]!.kilnDie = 1;
    expect(roundBaseHeat(draft.rounds[0]!)).toBe(0);
    draft.rounds[0]!.kilnDie = null;
    expect(roundBaseHeat(draft.rounds[0]!)).toBeNull();
  });

  it("clears Fuel Ledger data without an owner and restores only Form V3 drafts", () => {
    const draft = validDraft();
    draft.players[0]!.firingTechId = null;
    const reconciled = reconcileFiringTechOwnership(draft);
    expect(reconciled.rounds[0]!.players[0]!.contribution).toBe("stoke");
    expect(reconciled.rounds[0]!.firingTechIds).toEqual([]);
    expect(restorePlaytestDraft(JSON.stringify(validDraft()))?.formVersion).toBe(3);
    expect(restorePlaytestDraft(JSON.stringify({ ...validDraft(), formVersion: 2, rulesVersion: "1.4" }))).toBeNull();
    expect(resizePlayers(validDraft(), 4).rounds[4]!.players).toHaveLength(4);
  });
});
