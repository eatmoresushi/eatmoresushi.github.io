import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  createPlaytestDraft,
  submissionCandidate,
} from "../../src/playtest/model.ts";
import { validatePlaytestSubmission } from "../../src/playtest/schema.ts";
import { PlaytestFormPage } from "../../src/ui/PlaytestFormPage.tsx";
import migration from "../../supabase/migrations/202609050001_playtest_submissions.sql?raw";
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
    kilnAbilityUses: 2,
  };
  draft.players[1] = {
    ...draft.players[1]!,
    kilnId: "GE",
    startingTechniqueId: "ST03",
    completedOrderIds: ["S02"],
    finalVp: 68,
    recognition: 2,
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
    expect(result.value.rounds).toEqual([]);
    expect(result.value.rulesVersion).toBe("1.2.4");
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

  it("renders the simplified sections without Ceramic or Tech logs", () => {
    const markup = renderToStaticMarkup(createElement(PlaytestFormPage));
    expect(markup).toContain("Game and players");
    expect(markup).toContain("Firing by round");
    expect(markup).toContain("End of game");
    expect(markup).toContain("Completed Orders");
    expect(markup).toContain("Kiln ability uses");
    expect(markup).not.toContain("Ceramic log");
    expect(markup).not.toContain("Tech and Tradition performance");
    expect(markup).not.toContain("Duration (minutes)");
    expect(markup).not.toContain("Overall tension");
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
    expect(migration).toContain("nextval('private.playtest_game_number_seq')");
    expect(migration).toContain("revoke all on function public.server_submit_playtest(jsonb, uuid) from public, anon, authenticated");
    expect(migration).toContain("create or replace view private.playtest_player_summary");
    expect(migration).toContain("create or replace view private.playtest_order_log");
    expect(migration).toContain("create or replace view private.playtest_firing_log");
    expect(migration).not.toContain("private.playtest_ceramics");
    expect(migration).not.toContain("private.playtest_tech_performance");
    expect(edgeFunction).toContain("validatePlaytestSubmission(body[\"payload\"])");
    expect(edgeFunction).toContain("p_submitter_auth_user_id: authUserId");
  });
});
