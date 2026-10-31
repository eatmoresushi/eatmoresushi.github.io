/**
 * The Supabase contract for V1.6.2 (DESIGN §4.6; ENGINE_V1.6.2_DELTA.md §9, §16.18): the V1.6.1
 * migrations, edited in place up to owner revision 4 (rules `1.6.2`, schema 9, `r32-`), are
 * applied to the live database and never edited again; owner revision 5's migration
 * (`202610300001_v162_rev5_rules.sql`) re-creates every gate with schema 10 and `r33-` while the
 * room constraint keeps the r32 rows as history. Every gate that hard-coded V1.4 is rewritten,
 * the five Contribution cards (Fuel Ledger's 2 included, change 26) are stored and returned, the
 * private event log is seat-checked and service-only, public rows can never carry hidden data,
 * the Edge adapter calls every RPC with exactly its SQL parameters, and the playtest migration
 * accepts only Form V3.
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
import rev5Migration from "../../../supabase/migrations/202610300001_v162_rev5_rules.sql?raw";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const MIGRATION_FILES = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort();
/** The V1.6.1-and-later files: the two applied ones and owner revision 5's. */
const V161_FILES = new Set(["202610150001_v161_rules.sql", "202610150002_playtest_v161.sql", "202610300001_v162_rev5_rules.sql"]);
/** The applied file's room gate (owner revision 4, history since revision 5). */
const R32 = "^r32-[0-9a-f]{16}$";
/** The current room gate (owner revision 5). */
const R33 = `^r${RULES_BEHAVIOUR_REVISION}-[0-9a-f]{16}$`;
/** The five RPCs that pin the room fingerprint; the two commits also pin the state schema. */
const FINGERPRINT_GATED = ["server_add_computer_seat", "server_commit_start", "server_commit_transition", "server_create_room", "server_join_room"];

/** The latest definition of an RPC across every migration, with the file that holds it. */
function latestDefinition(name: string): { file: string; body: string } {
  for (const file of [...MIGRATION_FILES].reverse()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    if (sql.includes(`create or replace function public.${name}(`)) return { file, body: functionBody(sql, name) };
  }
  throw new Error(`${name} is never defined`);
}

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

describe("V1.6.2 rules migration (applied; owner revision 4's gates kept as history)", () => {
  it("allows V1.6.2 rooms with an r32 fingerprint, keeps every deployed historical label and drops V1.6.1", () => {
    for (const check of ["rooms_rules_version_check", "rooms_content_version_check"]) {
      const definition = migration.split(`add constraint ${check}`)[1]!.split(";")[0]!;
      expect(definition).toContain("'1.6.2'");
      // V1.6.1 was never deployed, so no stored row carries it.
      expect(definition).not.toContain("'1.6.1'");
      for (const old of ["0.4", "1.2.7", "1.4"]) expect(definition).toContain(`'${old}'`);
    }
    expect(migration).toContain("add constraint rooms_v162_fingerprint_check");
    expect(migration).toContain(`content_digest, '') ~ '${R32}'`);
    expect(migration).not.toMatch(/'1\.6\.1'|\^r29-|\^r30-|\^r31-|rules-v1\\\.6\\\.1-/);
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
      expect(body, name).toContain("'1.6.2'");
      expect(body, name).not.toContain("'1.6.1'");
      if (name !== "server_submit_playtest") expect(body, name).toContain(R32);
    }
    expect(FINGERPRINT_GATED).toEqual(gated.filter((name) => name !== "server_submit_playtest"));
    expect(functionBody(migration, "server_create_room")).toContain("'1.6.2', '1.6.2', 0, p_content_digest");
    for (const name of ["server_commit_start", "server_commit_transition"]) {
      const body = functionBody(migration, name);
      expect(body).toContain("<> 9");
      expect(body).not.toMatch(/<> [5678]\b/);
    }
  });
});

describe("V1.6.2 owner revision 5 migration (schema 10, r33; the applied files untouched)", () => {
  it("is the latest migration and runs only the constraint, the five gates and their privileges", () => {
    expect(RULES_BEHAVIOUR_REVISION).toBe(33);
    expect(MIGRATION_FILES.at(-1)).toBe("202610300001_v162_rev5_rules.sql");
    const defined = [...rev5Migration.matchAll(/create or replace function public\.(\w+)\(/g)].map((match) => match[1]!).sort();
    expect(defined).toEqual(FINGERPRINT_GATED);
    expect(rev5Migration).not.toMatch(/drop function/i);
    const constraints = [...rev5Migration.matchAll(/add constraint (\w+)/g)].map((match) => match[1]!);
    expect(constraints).toEqual(["rooms_v162_fingerprint_check"]);
    // No statement of its own rewrites a row (comments stripped).
    const statements = topLevel(rev5Migration).replace(/--.*$/gm, "");
    expect(statements).not.toMatch(/\b(?:update|delete from|truncate)\s/i);
    for (const name of FINGERPRINT_GATED) {
      const signature = functionBody(migration, name).split(/\)\s*returns/)[0]!;
      expect(rev5Migration, name).toContain(`revoke all on function public.${name}(`);
      expect(rev5Migration, name).toContain(`grant execute on function public.${name}(`);
      expect(functionBody(rev5Migration, name).split(/\)\s*returns/)[0], name).toBe(signature);
    }
  });

  it("keeps the r32 rows valid as history while every write path requires r33", () => {
    const definition = rev5Migration.split("add constraint rooms_v162_fingerprint_check")[1]!.split(";")[0]!;
    expect(definition).toContain("content_digest, '') ~ '^r3[23]-[0-9a-f]{16}$'");
    expect(definition).toContain("rules_version <> '1.6.2'");
    expect(definition).toContain("content_version = '1.6.2'");
    const pattern = new RegExp("^r3[23]-[0-9a-f]{16}$");
    expect(pattern.test("r32-0123456789abcdef")).toBe(true);
    expect(pattern.test("r33-0123456789abcdef")).toBe(true);
    for (const old of ["r29-0123456789abcdef", "r30-0123456789abcdef", "r31-0123456789abcdef", "r34-0123456789abcdef"]) expect(pattern.test(old), old).toBe(false);
  });

  it("re-creates each gate verbatim from the applied file with only r33 and schema 10 changed", () => {
    for (const name of FINGERPRINT_GATED) {
      const applied = functionBody(migration, name);
      const current = functionBody(rev5Migration, name);
      expect(current, name).toBe(applied.split(`'${R32}'`).join(`'${R33}'`).replace(/<> 9\b/g, "<> 10"));
      expect(current, name).toContain(R33);
      expect(current, name).not.toContain("^r32-");
      expect(current, name).not.toMatch(/<> 9\b/);
    }
    for (const name of ["server_commit_start", "server_commit_transition"]) {
      expect(functionBody(rev5Migration, name)).toContain("<> 10");
    }
  });

  it("leaves the latest definition of every gated RPC on r33 and schema 10", () => {
    for (const name of FINGERPRINT_GATED) {
      const latest = latestDefinition(name);
      expect(latest.file, name).toBe("202610300001_v162_rev5_rules.sql");
      expect(latest.body, name).toContain(R33);
      expect(latest.body, name).not.toMatch(/\^r3[0-2]-|\^r2\d-|<> [5-9]\b/);
    }
    // The other RPCs pin neither a fingerprint nor a schema, so the applied definitions stay.
    for (const name of ["server_load_private_submissions", "server_find_own_pending", "server_list_private_events"]) {
      const latest = latestDefinition(name);
      expect(latest.file, name).toBe("202610150001_v161_rules.sql");
      expect(latest.body, name).not.toMatch(/\^r\d\d-|schemaVersion/);
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

  it("stores the five V1.6.2 cards (Fuel Ledger's 2 included) and returns them, with no Fuel Ledger flag (change 26)", () => {
    const check = migration.split("add constraint private_submissions_contribution_card_check")[1]!.split(";")[0]!;
    const ids = [...check.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]!);
    expect(ids.sort()).toEqual([...CONTRIBUTION_CARD_IDS].sort());
    expect(check).toContain("not valid");
    const commit = functionBody(migration, "server_commit_transition");
    const accepted = [...commit.split("not in (")[1]!.split(")")[0]!.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]!);
    expect(accepted.sort()).toEqual([...CONTRIBUTION_CARD_IDS].sort());
    expect(accepted).toContain("FUEL_LEDGER_BANK");
    expect(accepted).toContain("FUEL_LEDGER_STOKE");
    // The retired commitment is refused, never stored or returned.
    expect(commit).toContain("or p_private_submission ? 'fuelLedger' then");
    expect(commit).not.toContain("v_fuel_ledger");
    expect(commit).toContain("room_id, window_id, player_id, command_id, contribution_card\n");
    for (const name of ["server_load_private_submissions", "server_find_own_pending"]) {
      expect(functionBody(migration, name)).toContain("'card', ps.contribution_card");
      expect(functionBody(migration, name)).not.toContain("fuelLedger");
    }
    expect(supabaseStoreSource).not.toContain("useFuelLedger");
    expect(supabaseStoreSource).not.toContain("fuelLedger");
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
    for (const label of [CANONICAL_COMPUTER_POLICY_VERSION, "rules-v1.6.2-strategic-001"]) {
      expect(pattern.test(label), label).toBe(true);
      expect(COMPUTER_POLICY_VERSION_PATTERN.test(label), label).toBe(true);
    }
    for (const label of ["rules-v1.4-strategic-001", "rules-v1.6.1-strategic-001", "rules-v1.6.2-", "rules-v1.6.2-Bad"]) {
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

describe("V1.6.2 playtest migration (edited in place, file name kept)", () => {
  it("accepts only Form V3 for rules V1.6.2 and keeps every historical submission", () => {
    expect(playtestMigration).toContain("check (rules_version in ('1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.4', '1.6.2'))");
    expect(playtestMigration).toContain("check (rules_version <> '1.6.2' or form_version = 3)");
    expect(playtestMigration).not.toContain("'1.6.1'");
    const rpc = functionBody(playtestMigration, "server_submit_playtest");
    expect(rpc).toContain("coalesce(p_payload->>'rulesVersion', '') <> '1.6.2'");
    expect(rpc).toContain("v_form_version <> 3");
    expect(topLevel(playtestMigration)).not.toMatch(/\b(?:truncate|delete from)\s/i);
    expect(playtestMigration).not.toMatch(/set rules_version\s*=/i);
    expect(playtestMigration).toContain("revoke all on function public.server_submit_playtest(jsonb, uuid) from public, anon, authenticated");
    expect(playtestMigration).toContain("alter column starting_technique_id drop not null");
  });

  it("derives its Tech, capacity and Base Heat rules from the V1.6.2 content", () => {
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
