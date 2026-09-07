import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  createPlaytestDraft,
  reconcileFiringTechniqueOwnership,
  submissionCandidate,
} from "../../src/playtest/model.ts";
import { validatePlaytestSubmission } from "../../src/playtest/schema.ts";
import { PlaytestFormPage } from "../../src/ui/PlaytestFormPage.tsx";
import migration from "../../supabase/migrations/202609050001_playtest_submissions.sql?raw";
import roundDetailsMigration from "../../supabase/migrations/202609060001_playtest_round_details.sql?raw";
import edgeFunction from "../../supabase/functions/playtest-submit/index.ts?raw";

function validCandidate(): unknown {
  const draft = createPlaytestDraft(2);
  draft.playedOn = "2026-09-05";
  draft.players[0] = {
    ...draft.players[0]!,
    kilnId: "RU",
    startingTechniqueId: "ST01",
    completedOrderIds: ["S01", "O01"],
    finalVp: 72,
    recognition: 3,
    coinsRemaining: 4,
    clayRemaining: 2,
    woodRemaining: 1,
  };
  draft.players[1] = {
    ...draft.players[1]!,
    kilnId: "GE",
    startingTechniqueId: "ST03",
    completedOrderIds: ["S02"],
    finalVp: 68,
    recognition: 2,
    coinsRemaining: 1,
    clayRemaining: 3,
    woodRemaining: 2,
  };
  draft.rounds[0]!.players[0] = {
    ...draft.rounds[0]!.players[0]!,
    contribution: "stoke",
    sharedLoaded: 2,
    imperialLoaded: 1,
    kilnAbilityUses: 1,
  };
  draft.rounds[0]!.players[1] = {
    ...draft.rounds[0]!.players[1]!,
    contribution: "tend",
    sharedLoaded: 1,
    kilnAbilityUses: 1,
  };
  draft.rounds[1]!.players[0] = {
    ...draft.rounds[1]!.players[0]!,
    kilnAbilityUses: 1,
  };
  return submissionCandidate(draft);
}

describe("V1.2.4 playtest form", () => {
  it("accepts the concise setup, firing, and end-game metrics", () => {
    const result = validatePlaytestSubmission(validCandidate());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.players).toHaveLength(2);
    expect(result.value.players[0]!.completedOrderIds).toEqual(["S01", "O01"]);
    expect(result.value.players[0]!.orderVp).toBeNull();
    expect(result.value.players[0]!.kilnAbilityUses).toBe(2);
    expect(result.value.players[1]!.kilnAbilityUses).toBe(1);
    expect(result.value.players[0]!.coinsRemaining).toBe(4);
    expect(result.value.rounds).toHaveLength(5);
    expect(result.value.rounds[0]!.players[0]!.contribution).toBe("stoke");
    expect(result.value.rulesVersion).toBe("1.2.4");
    expect(result.value.formVersion).toBe(2);
  });

  it("rejects any client-selected Game ID", () => {
    const result = validatePlaytestSubmission({
      ...(validCandidate() as Record<string, unknown>),
      gameId: "USER-CHOICE",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((entry) => entry.path === "gameId")).toBe(true);
  });

  it("rejects the same physical Order recorded for two players", () => {
    const draft = validCandidate() as Record<string, unknown>;
    const players = draft["players"] as Array<Record<string, unknown>>;
    players[1]!["completedOrderIds"] = ["S01"];
    const result = validatePlaytestSubmission(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((entry) => entry.path === "players")).toBe(true);
  });

  it("rejects a client-tampered Kiln ability total", () => {
    const candidate = validCandidate() as Record<string, unknown>;
    const players = candidate["players"] as Array<Record<string, unknown>>;
    players[0]!["kilnAbilityUses"] = 5;
    const result = validatePlaytestSubmission(candidate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((entry) => entry.path === "players.0.kilnAbilityUses")).toBe(true);
  });

  it("requires Fuel Ledger for an adjusted Contribution", () => {
    const candidate = validCandidate() as Record<string, unknown>;
    const rounds = candidate["rounds"] as Array<Record<string, unknown>>;
    const roundPlayers = rounds[0]!["players"] as Array<Record<string, unknown>>;
    roundPlayers[0]!["contribution"] = "stoke_2";
    const result = validatePlaytestSubmission(candidate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((entry) => entry.path === "rounds.0.firingTechniqueIds")).toBe(true);
  });

  it("accepts a Fuel Ledger adjustment only for its recorded owner", () => {
    const candidate = validCandidate() as Record<string, unknown>;
    const players = candidate["players"] as Array<Record<string, unknown>>;
    players[0]!["advancedTechnique1Id"] = "T12";
    const rounds = candidate["rounds"] as Array<Record<string, unknown>>;
    rounds[0]!["firingTechniqueIds"] = ["T12"];
    const roundPlayers = rounds[0]!["players"] as Array<Record<string, unknown>>;
    roundPlayers[0]!["contribution"] = "stoke_2";
    expect(validatePlaytestSubmission(candidate).ok).toBe(true);

    roundPlayers[0]!["contribution"] = "stoke";
    roundPlayers[1]!["contribution"] = "stoke_2";
    const nonOwnerResult = validatePlaytestSubmission(candidate);
    expect(nonOwnerResult.ok).toBe(false);
    if (nonOwnerResult.ok) return;
    expect(nonOwnerResult.issues.some((entry) => (
      entry.path === "rounds.0.players.1.contribution"
    ))).toBe(true);
  });

  it("rejects a Firing Tech use when nobody owns that Tech", () => {
    const candidate = validCandidate() as Record<string, unknown>;
    const rounds = candidate["rounds"] as Array<Record<string, unknown>>;
    rounds[0]!["firingTechniqueIds"] = ["T11"];
    const result = validatePlaytestSubmission(candidate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((entry) => entry.message.includes("assigning it to a player"))).toBe(true);
  });

  it("clears firing data when its Advanced Tech owner is removed", () => {
    const draft = createPlaytestDraft(2);
    draft.players[0]!.advancedTechnique1Id = "T12";
    draft.rounds[0]!.players[0]!.contribution = "bank_2";
    draft.rounds[0]!.firingTechniqueIds = ["T11", "T12"];
    draft.players[0]!.advancedTechnique1Id = null;
    const reconciled = reconcileFiringTechniqueOwnership(draft);
    expect(reconciled.rounds[0]!.players[0]!.contribution).toBe("bank");
    expect(reconciled.rounds[0]!.firingTechniqueIds).toEqual([]);
  });

  it("renders the simplified sections without Ceramic or Tech logs", () => {
    const markup = renderToStaticMarkup(createElement(PlaytestFormPage));
    expect(markup).toContain("Game and players");
    expect(markup).toContain("Firing by round");
    expect(markup).toContain("End of game");
    expect(markup).toContain("Completed Orders");
    expect(markup).toContain("Fire Contribution");
    expect(markup).toContain("Ceramics Loaded to Shared Kiln");
    expect(markup).toContain("Ceramics Loaded to Imperial Kiln");
    expect(markup).toContain("Orders Completed");
    expect(markup).toContain("Kiln Ability Uses");
    expect(markup).not.toContain("Shifu reposition used");
    expect(markup).not.toContain("firing-tech-fieldset");
    expect(markup).not.toContain("Owner not recorded");
    expect(markup).not.toContain("Bank + Fuel Ledger (−2)");
    expect(markup).not.toContain("Stoke + Fuel Ledger (+2)");
    expect(markup).toContain("Resources remaining");
    expect(markup).toContain("Coins");
    expect(markup).toContain("Clay");
    expect(markup).toContain("Wood");
    expect(markup).not.toContain("Ceramic log");
    expect(markup).not.toContain("Tech and Tradition performance");
    expect(markup).not.toContain("White loaded");
    expect(markup).not.toContain("Celadon loaded");
    expect(markup).not.toContain("Grey-green loaded");
    expect(markup).not.toContain("Moon White loaded");
    expect(markup).not.toContain("Heat conflict");
    expect(markup).not.toContain("Order stolen");
    expect(markup).not.toContain("Duration (minutes)");
    expect(markup).not.toContain("Overall tension");
  });

  it("supports signed Fire modifiers and starts Recognition unrecorded", () => {
    const draft = createPlaytestDraft(2);
    const markup = renderToStaticMarkup(createElement(PlaytestFormPage));
    expect(draft.players[0]!.recognition).toBeNull();
    expect(markup).toContain("<span>Fire modifier</span><select>");
    expect(markup).toContain("<option value=\"-2\">−2</option>");
    expect(markup).not.toContain("min=\"-2\" max=\"2\"");
    expect(markup).toContain("<span>Imperial Recognition</span><select required=\"\">");
  });

  it("shows the derived Imperial Recognition score", () => {
    const markup = renderToStaticMarkup(createElement(PlaytestFormPage));
    expect(markup).toContain("Recognition VP");
    expect(markup).toContain("Imperial Audience awards 6 VP at Recognition 5; otherwise 0.");
    expect(roundDetailsMigration).toContain("add column if not exists recognition_vp smallint");
    expect(roundDetailsMigration).toContain("generated always as");
    expect(roundDetailsMigration).toContain("player.recognition_vp");
  });

  it("renders no editable Game ID field and explains backend assignment", () => {
    const markup = renderToStaticMarkup(createElement(PlaytestFormPage));
    expect(markup).toContain("Tell us what happened at the table.");
    expect(markup).toContain("reference number is created only after a successful submission");
    expect(markup).not.toContain("name=\"gameId\"");
    expect(markup).not.toContain(">Game ID<");
  });

  it("stores concise submissions privately and exposes only a service-role RPC", () => {
    expect(migration).toContain("create table if not exists private.playtest_submissions");
    expect(migration).toContain("create table if not exists private.playtest_players");
    expect(migration).toContain("create table if not exists private.playtest_completed_orders");
    expect(migration).toContain("create table if not exists private.playtest_rounds");
    expect(roundDetailsMigration).toContain("create table if not exists private.playtest_round_players");
    expect(roundDetailsMigration).toContain("coins_remaining");
    expect(roundDetailsMigration).toContain("clay_remaining");
    expect(roundDetailsMigration).toContain("wood_remaining");
    expect(migration).toContain("nextval('private.playtest_game_number_seq')");
    expect(roundDetailsMigration).toContain("revoke all on function public.server_submit_playtest(jsonb, uuid) from public, anon, authenticated");
    expect(migration).toContain("create or replace view private.playtest_player_summary");
    expect(migration).toContain("create or replace view private.playtest_order_log");
    expect(migration).toContain("create or replace view private.playtest_firing_log");
    expect(roundDetailsMigration).toContain("create or replace view private.playtest_firing_player_log");
    expect(migration).not.toContain("private.playtest_ceramics");
    expect(migration).not.toContain("private.playtest_tech_performance");
    expect(edgeFunction).toContain("validatePlaytestSubmission(body[\"payload\"])");
    expect(edgeFunction).toContain("p_submitter_auth_user_id: authUserId");
  });
});
