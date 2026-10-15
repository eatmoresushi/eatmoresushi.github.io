/**
 * The Supabase contract for V1.6.1 (DESIGN §4.6): every gate that hard-coded V1.4 is
 * rewritten, Fuel Ledger is stored and returned, the private event log is seat-checked and
 * service-only, public rows can never carry hidden data, the Edge adapter calls every RPC
 * with exactly its SQL parameters, and the playtest migration accepts only Form V3.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONTRIBUTION_CARD_IDS,
  DISCIPLINES,
  RULES_BEHAVIOUR_REVISION,
  activeKilnSpaces,
  techsOfDiscipline,
} from "../../../src/game/index.ts";
import {
  CANONICAL_COMPUTER_POLICY_VERSION,
  COMPUTER_POLICY_VERSION_PATTERN,
} from "../../../src/multiplayer/index.ts";
import type { MultiplayerStore } from "../../../src/multiplayer/index.ts";
import { SupabaseMultiplayerStore } from "../../../supabase/functions/_shared/supabaseStore.ts";
import gameActionFunction from "../../../supabase/functions/game-action/index.ts?raw";
import playtestFunction from "../../../supabase/functions/playtest-submit/index.ts?raw";
import supabaseStoreSource from "../../../supabase/functions/_shared/supabaseStore.ts?raw";
import migration from "../../../supabase/migrations/202610150001_v161_rules.sql?raw";
import playtestMigration from "../../../supabase/migrations/202610150002_playtest_v161.sql?raw";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const MIGRATION_FILES = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort();
const V161_FILES = new Set(["202610150001_v161_rules.sql", "202610150002_playtest_v161.sql"]);
const R29 = `^r${RULES_BEHAVIOUR_REVISION}-[0-9a-f]{16}$`;

afterEach(() => vi.unstubAllGlobals());

/** The latest `create or replace function public.<name>(` up to the end of its body. */
function functionBody(sql: string, name: string): string {
  const parts = sql.split(`create or replace function public.${name}(`);
  if (parts.length < 2) throw new Error(`${name} is not defined`);
  return parts.at(-1)!.split(/\n\$\$;/)[0]!;
}

/** The statements a migration runs itself, without the bodies of the functions it defines. */
function topLevel(sql: string): string {
  return sql.replace(/\$\$[\s\S]*?\$\$/g, "$$ … $$").replace(/\$migration\$[\s\S]*?\$migration\$/g, "");
}

/** Parameter names of the latest definition of an RPC across every migration. */
function latestParameters(name: string): string[] {
  for (const file of [...MIGRATION_FILES].reverse()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    if (!sql.includes(`create or replace function public.${name}(`)) continue;
    const signature = functionBody(sql, name).split(/\)\s*returns/)[0]!;
    return [...signature.matchAll(/\b(p_\w+)\s/g)].map((match) => match[1]!);
  }
  throw new Error(`${name} is never defined`);
}

/** Every RPC whose latest pre-V1.6.1 definition gates on V1.4 or an r23–r28 fingerprint. */
function v14GatedFunctions(): string[] {
  const gated = new Set<string>();
  for (const file of MIGRATION_FILES.filter((name) => !V161_FILES.has(name))) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const match of sql.matchAll(/'public\.(server_\w+)\([^']*\)'::regprocedure/g)) gated.add(match[1]!);
    for (const match of sql.matchAll(/create or replace function public\.(server_\w+)\(/g)) {
      const body = functionBody(sql, match[1]!);
      if (/'1\.4'|\^r2[3-8]-/.test(body)) gated.add(match[1]!);
    }
  }
  return [...gated].sort();
}

describe("V1.6.1 rules migration", () => {
  it("allows V1.6.1 rooms with an r29 fingerprint and keeps every historical label", () => {
    for (const check of ["rooms_rules_version_check", "rooms_content_version_check"]) {
      const definition = migration.split(`add constraint ${check}`)[1]!.split(";")[0]!;
      expect(definition).toContain("'1.6.1'");
      for (const old of ["0.4", "1.2.7", "1.4"]) expect(definition).toContain(`'${old}'`);
    }
    expect(migration).toContain("add constraint rooms_v161_fingerprint_check");
    expect(migration).toContain(`content_digest, '') ~ '${R29}'`);
    expect(migration).not.toContain("drop constraint if exists rooms_v14_fingerprint_check");
    expect(topLevel(migration)).not.toMatch(/\b(?:update|delete from|truncate)\s+(?:public\.|private\.)/i);
  });

  it("rewrites every RPC gate that hard-coded V1.4", () => {
    const gated = v14GatedFunctions();
    expect(gated).toEqual([
      "server_add_computer_seat",
      "server_commit_start",
      "server_commit_transition",
      "server_create_room",
      "server_join_room",
      "server_submit_playtest",
    ]);
    for (const name of gated) {
      const body = functionBody(name === "server_submit_playtest" ? playtestMigration : migration, name);
      expect(body, name).not.toMatch(/'1\.4'|\^r2[3-8]-/);
      expect(body, name).toContain("'1.6.1'");
      if (name !== "server_submit_playtest") expect(body, name).toContain(R29);
    }
    expect(functionBody(migration, "server_create_room")).toContain("'1.6.1', '1.6.1', 0, p_content_digest");
    for (const name of ["server_commit_start", "server_commit_transition"]) {
      const body = functionBody(migration, name);
      expect(body).toContain("<> 6");
      expect(body).not.toContain("<> 5");
    }
  });

  it("replaces the V1.4 overloads instead of leaving them callable", () => {
    expect(migration).toContain("drop function if exists public.server_add_computer_seat(uuid, uuid, uuid, text, bigint, uuid);");
    expect(migration).toContain("drop function if exists public.server_commit_start(uuid, uuid, text, jsonb, bigint, bigint, text, jsonb, jsonb);");
  });

  it("persists the game start's events and checks the event count at both commit boundaries", () => {
    const start = functionBody(migration, "server_commit_start");
    expect(latestParameters("server_commit_start")).toEqual(expect.arrayContaining(["p_full_events", "p_public_events"]));
    expect(start).toContain("insert into private.game_events");
    expect(start).toContain("insert into public.game_public_events");
    expect(start).toContain("raise exception 'event sequence mismatch'");
    expect(functionBody(migration, "server_commit_transition")).toContain("raise exception 'event sequence mismatch'");
  });

  it("never lets hidden information into a public row", () => {
    for (const name of ["server_commit_start", "server_commit_transition"]) {
      const body = functionBody(migration, name);
      expect(body).toContain("p_public_state ? 'hidden'");
      expect(body).toContain("(p_response->'game') ? 'hidden'");
      expect(body).toContain("where e ? 'secret'");
    }
  });

  it("stores the three V1.6.1 cards and the Fuel Ledger commitment, and returns it", () => {
    const check = migration.split("add constraint private_submissions_contribution_card_check")[1]!.split(";")[0]!;
    const ids = [...check.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]!);
    expect(ids.sort()).toEqual([...CONTRIBUTION_CARD_IDS].sort());
    expect(check).toContain("not valid");
    const commit = functionBody(migration, "server_commit_transition");
    const accepted = [...commit.split("not in (")[1]!.split(")")[0]!.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]!);
    expect(accepted.sort()).toEqual([...CONTRIBUTION_CARD_IDS].sort());
    expect(commit).toContain("v_fuel_ledger := (p_private_submission->>'fuelLedger')::boolean;");
    expect(commit).toContain("contribution_card, use_fuel_ledger");
    expect(commit).toContain("jsonb_typeof(p_private_submission->'fuelLedger')");
    for (const name of ["server_load_private_submissions", "server_find_own_pending"]) {
      expect(functionBody(migration, name)).toContain("'fuelLedger', ps.use_fuel_ledger");
    }
    expect(supabaseStoreSource).not.toContain("useFuelLedger");
  });

  it("serves each seat only its own secrets, by credential, to the service role only", () => {
    const body = functionBody(migration, "server_list_private_events");
    expect(body).toContain("security definer");
    expect(body).toContain("e.full_payload #>> '{secret,visibleTo}' = p_player_id");
    expect(body).toContain("c.token_hash = p_token_hash");
    expect(body).toContain("c.revoked_at is null");
    expect(body).toContain("rp.player_id = p_player_id");
    expect(migration).toContain("revoke all on function public.server_list_private_events(uuid, text, text, bigint) from public, anon, authenticated;");
    expect(migration).toContain("grant execute on function public.server_list_private_events(uuid, text, text, bigint) to service_role;");
  });

  it("accepts exactly the policy labels the service stamps", () => {
    const sqlPattern = migration.match(/policy_version ~ '([^']+)'/)![1]!;
    const pattern = new RegExp(sqlPattern);
    for (const label of [CANONICAL_COMPUTER_POLICY_VERSION, "rules-v1.6.1-strategic-001"]) {
      expect(pattern.test(label), label).toBe(true);
      expect(COMPUTER_POLICY_VERSION_PATTERN.test(label), label).toBe(true);
    }
    for (const label of ["rules-v1.4-strategic-001", "rules-v1.6.1-", "rules-v1.6.1-Bad"]) {
      expect(pattern.test(label), label).toBe(false);
      expect(COMPUTER_POLICY_VERSION_PATTERN.test(label), label).toBe(false);
    }
    expect(functionBody(migration, "server_add_computer_seat")).toContain(`p_policy_version, '') !~ '${sqlPattern}'`);
  });
});

describe("Edge adapter and SQL signatures", () => {
  it("calls every RPC with exactly the parameters of its latest SQL definition", async () => {
    const calls: Array<{ name: string; parameters: string[] }> = [];
    vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
      calls.push({ name: url.split("/rpc/")[1]!, parameters: Object.keys(JSON.parse(init.body) as object) });
      return new Response(JSON.stringify([]), { status: 200 });
    });
    const store: MultiplayerStore = new SupabaseMultiplayerStore("https://example.supabase.co", "service-role-key");
    const any = {} as never;
    const head = { state: {}, revision: 1, rngState: 1, rootSeed: 1, stateHash: "h" };
    await store.createRoom({ room: { id: "r", code: "C", contentDigest: "d" }, hostSeat: { seatId: "s", playerId: "P1", displayName: "H", colour: "c", authUserId: null }, tokenHash: "t" } as never);
    await store.joinRoom({ roomCode: "C", seatId: "s", displayName: "G", colour: "", authUserId: null, tokenHash: "t" });
    await store.addComputerSeat({ roomId: "r", hostSeatId: "h", seatId: "s", displayName: "C", aiSeed: 1, policyVersion: CANONICAL_COMPUTER_POLICY_VERSION, commandId: "c" });
    await store.removeComputerSeat({ roomId: "r", hostSeatId: "h", computerSeatId: "s" });
    await store.authenticate("C", "t");
    await store.getSeats("r");
    await store.loadHead("r");
    await store.loadPublicState("r");
    await store.getProcessed("r", "c");
    await store.endSession({ roomId: "r", hostSeatId: "h", actorId: "P1", commandId: "c" });
    await store.commitStart({ roomId: "r", commandId: "c", actorId: "P1", head, publicState: any, fullEvents: [], publicEvents: [], response: any } as never);
    await store.commitTransition({ roomId: "r", commandId: "c", actorId: "P1", expectedRevision: 0, command: {}, previousHead: head, nextHead: head, fullEvents: [], publicEvents: [], publicState: any, response: any, privateSubmission: null } as never);
    await store.loadPrivateSubmissions("r", "w");
    await store.findOwnPendingSubmission("r", "P1").catch(() => null);
    await store.listPublicEvents("r", 0);
    await store.listPrivateEvents("r", "P1", "t", 0);
    expect(calls.map((call) => call.name)).toEqual([
      "server_create_room",
      "server_join_room",
      "server_add_computer_seat",
      "server_remove_computer_seat",
      "server_authenticate_seat",
      "server_get_seats",
      "server_load_head",
      "server_load_public_state",
      "server_get_processed",
      "server_end_session",
      "server_commit_start",
      "server_commit_transition",
      "server_load_private_submissions",
      "server_find_own_pending",
      "server_list_public_events",
      "server_list_private_events",
    ]);
    for (const call of calls) {
      expect(call.parameters.sort(), call.name).toEqual(latestParameters(call.name).sort());
    }
  });

  it("exposes the private log and passes untrusted commands to the service unparsed", () => {
    expect(gameActionFunction).toContain('case "list_private_events":');
    expect(gameActionFunction).toContain("service.listPrivateEvents(");
    expect(gameActionFunction).toContain('command: body["command"],');
    expect(gameActionFunction).toContain('checkInvariants: Deno.env.get("KILN_ENGINE_INVARIANTS") === "1"');
    // Responses never carry a thrown cause.
    expect(gameActionFunction).not.toMatch(/failure\([^)]*thrown/);
  });
});

describe("V1.6.1 playtest migration", () => {
  it("accepts only Form V3 for rules V1.6.1 and keeps every historical submission", () => {
    expect(playtestMigration).toContain("check (rules_version in ('1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.4', '1.6.1'))");
    expect(playtestMigration).toContain("check (rules_version <> '1.6.1' or form_version = 3)");
    const rpc = functionBody(playtestMigration, "server_submit_playtest");
    expect(rpc).toContain("coalesce(p_payload->>'rulesVersion', '') <> '1.6.1'");
    expect(rpc).toContain("v_form_version <> 3");
    expect(topLevel(playtestMigration)).not.toMatch(/\b(?:truncate|delete from)\s/i);
    expect(playtestMigration).not.toMatch(/set rules_version\s*=/i);
    expect(playtestMigration).toContain("revoke all on function public.server_submit_playtest(jsonb, uuid) from public, anon, authenticated");
    expect(playtestMigration).toContain("alter column starting_technique_id drop not null");
  });

  it("derives its Tech, capacity and Base Heat rules from the V1.6.1 content", () => {
    const columns: Record<string, string> = { workshop: "workshop_tech_id", glazing_loading: "glazing_loading_tech_id", firing: "firing_tech_id" };
    for (const discipline of DISCIPLINES) {
      const column = columns[discipline]!;
      const check = playtestMigration.split(`check (${column} is null or ${column} in (`)[1]!.split(")")[0]!;
      expect([...check.matchAll(/'(T\d+)'/g)].map((match) => match[1]!).sort(), discipline).toEqual([...techsOfDiscipline(discipline)].sort());
    }
    const rpc = functionBody(playtestMigration, "server_submit_playtest");
    expect(rpc).toContain(
      `v_shared_capacity := case v_player_count when 2 then ${activeKilnSpaces(2).length} when 3 then ${activeKilnSpaces(3).length} else ${activeKilnSpaces(4).length} end`,
    );
    expect(rpc).toContain("greatest(0, least(5, v_kiln_die + v_contribution_heat))");
    expect(rpc).toContain("v_firing_techs ? 'T24'");
    expect(rpc).toContain("v_firing_techs ? 'T25'");
    expect(playtestFunction).toContain('validatePlaytestSubmission(body["payload"])');
  });
});
