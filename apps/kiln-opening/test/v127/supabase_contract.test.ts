import { describe, expect, it } from "vitest";
import { activeKilnSpaceIds, CONTRIBUTION_CARD_IDS, RULES_BEHAVIOUR_REVISION } from "../../src/game/index.ts";
import playtestMigration from "../../supabase/migrations/202609260002_playtest_v14.sql?raw";
import migration from "../../supabase/migrations/202609260001_v14_rules.sql?raw";
import startingHandMigration from "../../supabase/migrations/202609270001_v14_starting_orders.sql?raw";
import courtGeMigration from "../../supabase/migrations/202609280001_v14_court_ge_amendment.sql?raw";
import strategicAiMigration from "../../supabase/migrations/202609260001_v14_rules.sql?raw";
import orderQueueMigration from "../../supabase/migrations/202609190001_v127_rules.sql?raw";
import eightStartingOrdersMigration from "../../supabase/migrations/202609200001_v127_eight_starting_orders.sql?raw";
import optionalTechsMigration from "../../supabase/migrations/202609200002_v127_optional_techs.sql?raw";
import shifuGlazeMigration from "../../supabase/migrations/202609200003_v127_shifu_glaze_discount.sql?raw";
import shifuHeatMigration from "../../supabase/migrations/202609200004_v127_shifu_heat_markers.sql?raw";
import supabaseStore from "../../supabase/functions/_shared/supabaseStore.ts?raw";

describe("V1.4 Supabase contract", () => {
  it("installed V1.4 room stamps and rejected old save schemas at both commit boundaries", () => {
    expect(migration).toContain("'1.4', '1.4', 0, p_content_digest");
    expect(migration).toContain("coalesce((p_state->>'schemaVersion')::integer, -1) <> 5");
    expect(migration).toContain("coalesce((p_public_state->>'schemaVersion')::integer, -1) <> 5");
    expect(migration).toContain("coalesce(p_next_state->>'rulesVersion', '') <> '1.4'");
    expect(migration).toContain("!~ '^r23-[0-9a-f]{16}$'");
    expect(migration).not.toMatch(/update public\.rooms[\s\S]{0,240}set rules_version = '1\.2\.6'/);
  });

  it("stores single Fuel Ledger cards privately until simultaneous reveal", () => {
    expect(migration).toContain("alter table private.private_submissions");
    expect(migration).toContain("add column if not exists use_fuel_ledger boolean not null default false");
    expect(migration).not.toContain("'useFuelLedger', ps.use_fuel_ledger");
    expect(migration).toContain("'BANK', 'TEND', 'STOKE', 'BANK_2', 'STOKE_2'");
    expect(migration).toContain("update private.private_submissions set revealed_revision = p_next_revision");
    expect(migration).not.toMatch(/public\.game_public_(?:states|events)[\s\S]{0,160}use_fuel_ledger/i);
    expect(supabaseStore).not.toContain("useFuelLedger");
  });

  it("installs the current computer policy and keeps the function service-role-only", () => {
    expect(strategicAiMigration).toContain("'rules-v1.4-strategic-001'");
    expect(strategicAiMigration).toContain("create or replace function public.server_add_computer_seat");
    expect(strategicAiMigration).toContain("v_room.rules_version <> '1.4'");
    expect(strategicAiMigration).toContain(
      "p_seat_id, p_room_id, 'rules-v1.4-strategic-001', p_ai_seed, p_command_id",
    );
    expect(strategicAiMigration).not.toContain("update private.room_ai_seats");
    expect(strategicAiMigration).toContain(
      "revoke all on function public.server_add_computer_seat(uuid, uuid, uuid, text, bigint, uuid) from public, anon, authenticated",
    );
    expect(strategicAiMigration).toContain(
      "grant execute on function public.server_add_computer_seat(uuid, uuid, uuid, text, bigint, uuid) to service_role",
    );
  });

  it("installed the original V1.2.7 behaviour fingerprint without rewriting old rooms", () => {
    expect(orderQueueMigration).toContain("'^r17-[0-9a-f]{16}$'");
    expect(orderQueueMigration).toContain("public.server_commit_start");
    expect(orderQueueMigration).toContain("public.server_commit_transition");
    expect(orderQueueMigration).not.toContain("set rules_version = '1.2.7'");
  });

  it("advanced every write gate to the eight-Starting-Order fingerprint while preserving historical rooms", () => {
    expect(eightStartingOrdersMigration).toContain("'^r(17|18)-[0-9a-f]{16}$'");
    const replacedFunctions = [...eightStartingOrdersMigration.matchAll(/'public\.(server_\w+)\([^']+\)'::regprocedure/g)]
      .map((match) => match[1]);
    expect(replacedFunctions).toEqual([
      "server_add_computer_seat", "server_create_room", "server_commit_start", "server_commit_transition",
    ]);
    expect(eightStartingOrdersMigration).toContain("if position('^r17-' in v_definition) = 0 then");
    expect(eightStartingOrdersMigration).toContain("execute replace(v_definition, '^r17-', '^r18-')");
    expect(eightStartingOrdersMigration).not.toMatch(/\bupdate\s+(?:public\.|private\.)/i);
  });

  it("advances every current write gate to optional Tech rewards while preserving r17 and r18 rooms", () => {
    expect(optionalTechsMigration).toContain("'^r(17|18|19)-[0-9a-f]{16}$'");
    const replacedFunctions = [...optionalTechsMigration.matchAll(/'public\.(server_\w+)\([^']+\)'::regprocedure/g)]
      .map((match) => match[1]);
    expect(replacedFunctions).toEqual([
      "server_add_computer_seat", "server_create_room", "server_commit_start", "server_commit_transition",
    ]);
    expect(optionalTechsMigration).toContain("if position('^r18-' in v_definition) = 0 then");
    expect(optionalTechsMigration).toContain("execute replace(v_definition, '^r18-', '^r19-')");
    expect(optionalTechsMigration).not.toMatch(/\bupdate\s+(?:public\.|private\.)/i);
  });

  it("advances every write gate to the Shifu two-vessel discount without rewriting previous rooms", () => {
    expect(shifuGlazeMigration).toContain("'^r(17|18|19|20)-[0-9a-f]{16}$'");
    const replacedFunctions = [...shifuGlazeMigration.matchAll(/'public\.(server_\w+)\([^']+\)'::regprocedure/g)]
      .map((match) => match[1]);
    expect(replacedFunctions).toEqual([
      "server_add_computer_seat", "server_create_room", "server_commit_start", "server_commit_transition",
    ]);
    expect(shifuGlazeMigration).toContain("if position('^r19-' in v_definition) = 0 then");
    expect(shifuGlazeMigration).toContain("execute replace(v_definition, '^r19-', '^r20-')");
    expect(shifuGlazeMigration).not.toMatch(/\bupdate\s+(?:public\.|private\.)/i);
  });

  it("requires the heat-marker rules for writes while retaining historical movement-rule rooms", () => {
    expect(shifuHeatMigration).toContain("'^r(17|18|19|20|21)-[0-9a-f]{16}$'");
    const replacedFunctions = [...shifuHeatMigration.matchAll(/'public\.(server_\w+)\([^']+\)'::regprocedure/g)]
      .map((match) => match[1]);
    expect(replacedFunctions).toEqual([
      "server_add_computer_seat", "server_create_room", "server_commit_start", "server_commit_transition",
    ]);
    expect(shifuHeatMigration).toContain("if position('^r20-' in v_definition) = 0 then");
    expect(shifuHeatMigration).toContain("execute replace(v_definition, '^r20-', '^r21-')");
    expect(shifuHeatMigration).not.toMatch(/\bupdate\s+(?:public\.|private\.)/i);
  });

  it("advances all five room write gates to the amended opening hand while retaining r23 history", () => {
    expect(startingHandMigration).toContain("'^r(23|24)-[0-9a-f]{16}$'");
    expect(startingHandMigration).not.toMatch(/\b(?:update|delete from|truncate)\s+(?:public\.|private\.)/i);
    const replacedFunctions = [...startingHandMigration.matchAll(/'public\.(server_\w+)\([^']+\)'::regprocedure/g)]
      .map((match) => match[1]!);
    expect(replacedFunctions).toEqual([
      "server_add_computer_seat", "server_create_room", "server_commit_start", "server_commit_transition", "server_join_room",
    ]);
    const replacement = startingHandMigration.match(/execute replace\(v_definition, '([^']+)', '([^']+)'\)/)!;
    const previousGate = replacement[1]!;
    const currentGate = replacement[2]!;
    expect(previousGate).toBe("^r23-[0-9a-f]{16}$");
    expect(currentGate).toBe("^r24-[0-9a-f]{16}$");
    expect(startingHandMigration).toContain(`if position('${previousGate}' in v_definition) = 0 then`);
    expect(startingHandMigration).toContain("raise exception 'Expected r23 fingerprint gate in %', v_signature");
    for (const name of replacedFunctions) {
      const original = migration.split(`create or replace function public.${name}(`)[1]!.split("create or replace function")[0]!;
      expect(original).toContain(previousGate);
      const amended = original.replaceAll(previousGate, currentGate);
      expect(amended).toContain(currentGate);
      expect(amended).not.toContain(previousGate);
      expect(migration).toContain(`revoke all on function public.${name}(`);
      expect(migration).toContain(`grant execute on function public.${name}(`);
    }
  });

  it("requires the amended Court and Ge rules for all five write gates while preserving room history", () => {
    expect(courtGeMigration).toContain("'^r(23|24|25)-[0-9a-f]{16}$'");
    expect(courtGeMigration).not.toMatch(/\b(?:update|delete from|truncate)\s+(?:public\.|private\.)/i);
    const replacedFunctions = [...courtGeMigration.matchAll(/'public\.(server_\w+)\([^']+\)'::regprocedure/g)]
      .map((match) => match[1]!);
    expect(replacedFunctions).toEqual([
      "server_add_computer_seat", "server_create_room", "server_commit_start", "server_commit_transition", "server_join_room",
    ]);
    const replacement = courtGeMigration.match(/execute replace\(v_definition, '([^']+)', '([^']+)'\)/)!;
    const previousGate = replacement[1]!;
    const currentGate = replacement[2]!;
    expect(previousGate).toBe("^r24-[0-9a-f]{16}$");
    expect(currentGate).toBe(`^r${RULES_BEHAVIOUR_REVISION}-[0-9a-f]{16}$`);
    expect(courtGeMigration).toContain(`if position('${previousGate}' in v_definition) = 0 then`);
    expect(courtGeMigration).toContain("raise exception 'Expected r24 fingerprint gate in %', v_signature");
    for (const name of replacedFunctions) {
      const original = migration.split(`create or replace function public.${name}(`)[1]!.split("create or replace function")[0]!;
      const prior = original.replaceAll("^r23-[0-9a-f]{16}$", previousGate);
      expect(prior).toContain(previousGate);
      const amended = prior.replaceAll(previousGate, currentGate);
      expect(amended).toContain(currentGate);
      expect(amended).not.toContain(previousGate);
    }
  });

  it("guards joining before writing a seat and returns the complete current room and human-seat contract", () => {
    const join = migration.split("create or replace function public.server_join_room(")[1]!;
    expect(join).toContain("v_room.rules_version <> '1.4'");
    expect(join).toContain("v_room.content_version <> '1.4'");
    expect(join).toContain("!~ '^r23-[0-9a-f]{16}$'");
    expect(join.indexOf("'session_not_active'")).toBeLessThan(join.indexOf("insert into public.room_players"));
    for (const key of ["contentDigest", "endedAt", "endedByPlayerId", "isComputer", "aiPolicyVersion", "aiSeed", "aiCreatedCommandId"]) expect(join).toContain(`'${key}'`);
    expect(join).toContain("revoke all on function public.server_join_room(text, uuid, text, uuid, text) from public, anon, authenticated");
    expect(join).toContain("grant execute on function public.server_join_room(text, uuid, text, uuid, text) to service_role");
  });

  it("accepts all and only the engine's five single-card Contribution IDs", () => {
    const declaration = migration.match(/coalesce\(v_card, ''\) not in \(([^)]+)\)/)![1]!;
    const ids = [...declaration.matchAll(/'([^']+)'/g)].map((match) => match[1]!);
    expect(ids.sort()).toEqual([...CONTRIBUTION_CARD_IDS].sort());
    const load = migration.split("create or replace function public.server_load_private_submissions")[1]!.split("create or replace function")[0]!;
    expect(load).toContain("ps.revealed_revision is null");
    expect(load).not.toContain("useFuelLedger");
  });

  it("widens both playtest storage constraints to eight without rewriting historical records", () => {
    for (const table of ["playtest_rounds", "playtest_round_players"]) {
      expect(playtestMigration).toContain(`drop constraint if exists ${table}_shared_loaded_check`);
      expect(playtestMigration).toContain(`add constraint ${table}_shared_loaded_check check (shared_loaded between 0 and 8)`);
    }
    expect(playtestMigration).toContain("check (rules_version in ('1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.4'))");
    expect(playtestMigration).not.toMatch(/\b(?:truncate|delete from)\s/i);
    expect(playtestMigration).not.toMatch(/set rules_version\s*=/i);
  });

  it("enforces current player-count capacities in the playtest RPC and preserves historical occupancy denominators", () => {
    const sqlCapacity = `case v_player_count when 2 then ${activeKilnSpaceIds(2).length} when 3 then ${activeKilnSpaceIds(3).length} else ${activeKilnSpaceIds(4).length} end`;
    expect(playtestMigration).toContain(`v_shared_capacity := ${sqlCapacity}`);
    expect(playtestMigration).toContain("if v_shared_loaded > v_shared_capacity or v_imperial_loaded > v_player_count then");
    expect(playtestMigration).toContain("jsonb_array_length(v_round->'players') <> v_player_count");
    const view = playtestMigration.split("create or replace view private.playtest_firing_log as")[1]!.split("create or replace view")[0]!;
    expect(view).toContain("case when submission.rules_version = '1.4'");
    expect(view).toContain("then case submission.player_count when 2 then 4 when 3 then 6 else 8 end");
    expect(view).toContain("else case submission.player_count when 2 then 5 when 3 then 6 else 7 end");
    expect(view).toContain("nullif(capacity.shared_capacity, 0) as occupancy");
    expect(playtestMigration).toContain("coalesce(p_payload->>'rulesVersion', '') <> '1.4'");
    expect(playtestMigration).toContain("revoke all on function public.server_submit_playtest(jsonb, uuid) from public, anon, authenticated");
  });

});
