import { describe, expect, it } from "vitest";
import migration from "../supabase/migrations/202608070001_multiplayer_backend.sql?raw";
import v05Migration from "../supabase/migrations/202608070002_v05_guild_rules.sql?raw";
import lifecycleMigration from "../supabase/migrations/202608080001_session_lifecycle.sql?raw";
import v061Migration from "../supabase/migrations/202608080002_v061_rules.sql?raw";
import v063Migration from "../supabase/migrations/202608080003_v063_rules.sql?raw";
import v065Migration from "../supabase/migrations/202608090001_v065_rules.sql?raw";
import v100Migration from "../supabase/migrations/202608090002_v100_rules.sql?raw";
import v101Migration from "../supabase/migrations/202608090003_v101_fire_deck.sql?raw";
import v102Migration from "../supabase/migrations/202608100001_v102_rules.sql?raw";
import v104Migration from "../supabase/migrations/202608110001_v104_rules.sql?raw";
import v109Migration from "../supabase/migrations/202608140001_v109_rules.sql?raw";
import createRoomSeatKeyMigration from "../supabase/migrations/202608150001_fix_create_room_seat_key.sql?raw";
import createRoomSeatColumnsMigration from "../supabase/migrations/202608150002_fix_create_room_seat_columns.sql?raw";
import v111Migration from "../supabase/migrations/202608160001_v111_rules.sql?raw";
import v114Migration from "../supabase/migrations/202608220001_v114_rules.sql?raw";
import onlineAiV114Migration from "../supabase/migrations/202608220002_online_ai_v114.sql?raw";
import onlineAiMigration from "../supabase/migrations/202608100002_online_ai_v003.sql?raw";
import edgeFunction from "../supabase/functions/game-action/index.ts?raw";
import service from "../src/multiplayer/service.ts?raw";

describe("Supabase security contract", () => {
  it("keeps credentials, authoritative state, audit events, and Wood values in a denied private schema", () => {
    for (const table of [
      "room_seat_credentials",
      "room_memberships",
      "game_heads",
      "game_snapshots",
      "game_commands",
      "game_events",
      "private_submissions",
      "processed_commands",
    ]) {
      expect(migration).toContain(`create table private.${table}`);
      expect(migration).toContain(`alter table private.${table} enable row level security`);
    }
    expect(migration).toContain("revoke all on schema private from anon, authenticated");
    expect(migration).toContain("revoke all on all tables in schema private from public, anon, authenticated");
    expect(migration).not.toMatch(/create policy[\s\S]{0,200}private\./i);
  });

  it("exposes only room-member public projections as read-only Realtime sources", () => {
    for (const table of ["rooms", "room_players", "game_public_states", "game_public_events"]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`grant select on public.${table} to authenticated`);
      expect(migration).toContain(`alter publication supabase_realtime add table public.${table}`);
    }
    expect(migration).toContain("public.is_room_member(room_id)");
    expect(migration).toContain("revoke insert, update, delete on public.game_public_states");
  });

  it("makes CAS/idempotency and private reveal commits service-role-only", () => {
    expect(migration).toContain("create or replace function public.server_commit_transition");
    expect(migration).toContain("v_head.revision <> p_expected_revision");
    expect(migration).toContain("private.processed_commands");
    expect(migration).toContain("private.private_window_reveals");
    expect(migration).toContain("grant execute on function public.server_commit_transition");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("from public, anon, authenticated");
  });

  it("keeps the service-role key inside the Edge Function and never trusts a body actor ID", () => {
    expect(edgeFunction).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(edgeFunction).not.toContain('body["actorId"]');
    expect(edgeFunction).not.toContain("console.log");
    expect(edgeFunction).toContain("AuthoritativeGameService");
    expect(edgeFunction).toContain("seatToken");
  });

  it("creates new rooms as V1.1.1 while preserving explicit legacy-room versioning", () => {
    expect(v05Migration).toContain("rules_version in ('0.4', '0.5')");
    expect(v061Migration).toContain("rules_version in ('0.4', '0.5', '0.6.1')");
    expect(v061Migration).toContain("where status = 'lobby'");
    expect(v061Migration).toContain("p_room_id, upper(p_code), 'lobby', p_seat_id, '0.6.1', '0.6.1', 0");
    expect(v061Migration).toContain("to service_role");
    expect(v063Migration).toContain("rules_version in ('0.4', '0.5', '0.6.1', '0.6.3')");
    expect(v063Migration).toContain("where status = 'lobby'");
    expect(v063Migration).toContain("p_room_id, upper(p_code), 'lobby', p_seat_id, '0.6.3', '0.6.3', 0");
    expect(v063Migration).toContain("to service_role");
    expect(v065Migration).toContain("rules_version in ('0.4', '0.5', '0.6.1', '0.6.3', '0.6.5')");
    expect(v065Migration).toContain("where status = 'lobby'");
    expect(v065Migration).toContain("p_room_id, upper(p_code), 'lobby', p_seat_id, '0.6.5', '0.6.5', 0");
    expect(v065Migration).toContain("to service_role");
    expect(v100Migration).toContain("rules_version in ('0.4', '0.5', '0.6.1', '0.6.3', '0.6.5', '1.0.0')");
    expect(v100Migration).toContain("where status = 'lobby'");
    expect(v100Migration).toContain("p_room_id, upper(p_code), 'lobby', p_seat_id, '1.0.0', '1.0.0', 0");
    expect(v100Migration).toContain("to service_role");
    expect(v101Migration).toContain("rules_version in ('0.4', '0.5', '0.6.1', '0.6.3', '0.6.5', '1.0.0', '1.0.1')");
    expect(v101Migration).toContain("where status = 'lobby'");
    expect(v101Migration).toContain("p_room_id, upper(p_code), 'lobby', p_seat_id, '1.0.1', '1.0.1', 0");
    expect(v101Migration).toContain("to service_role");
    expect(v102Migration).toContain("rules_version in ('0.4', '0.5', '0.6.1', '0.6.3', '0.6.5', '1.0.0', '1.0.1', '1.0.2')");
    expect(v102Migration).toContain("where status = 'lobby'");
    expect(v102Migration).toContain("p_room_id, upper(p_code), 'lobby', p_seat_id, '1.0.2', '1.0.2', 0");
    expect(v102Migration).toContain("to service_role");
    expect(v104Migration).toContain("rules_version in ('0.4', '0.5', '0.6.1', '0.6.3', '0.6.5', '1.0.0', '1.0.1', '1.0.2', '1.0.4')");
    expect(v104Migration).toContain("where status = 'lobby'");
    expect(v104Migration).toContain("p_room_id, upper(p_code), 'lobby', p_seat_id, '1.0.4', '1.0.4', 0");
    expect(v104Migration).toContain("to service_role");
    expect(v109Migration).toContain("rules_version in ('0.4', '0.5', '0.6.1', '0.6.3', '0.6.5', '1.0.0', '1.0.1', '1.0.2', '1.0.4', '1.0.9')");
    expect(v109Migration).toContain("where status = 'lobby'");
    expect(v109Migration).toContain("p_room_id, upper(p_code), 'lobby', p_seat_id, '1.0.9', '1.0.9', 0");
    expect(v109Migration).toContain("to service_role");
    expect(v111Migration).toContain("rules_version in ('0.4', '0.5', '0.6.1', '0.6.3', '0.6.5', '1.0.0', '1.0.1', '1.0.2', '1.0.4', '1.0.9', '1.1.1')");
    expect(v111Migration).toContain("where status = 'lobby'");
    expect(v111Migration).toContain("p_room_id, upper(p_code), 'lobby', p_seat_id, '1.1.1', '1.1.1', 0");
    expect(v111Migration).toContain("to service_role");
  });

  // 202608140001 shipped `hostSeat` here while the service reads `created.value.seat`,
  // so every create_room threw inside publicSeat and surfaced as INTERNAL_SERVER_ERROR.
  // tsc cannot see into SQL and the suite exercises the in-memory store, so nothing
  // caught it. Pin the payload key against the reader that consumes it.
  it("returns the seat key that the service reads from the room-creation RPC", () => {
    expect(service).toContain("publicSeat(created.value.seat)");
    expect(service).toContain("publicSeat(joined.value.seat)");

    // The live definition is the newest one applied, so that is what has to be right.
    // These migrations document the bugs they fix, so assert against executable SQL.
    const live = v111Migration.replaceAll(/--[^\n]*/g, "");
    expect(live).toContain("create or replace function public.server_create_room");
    expect(live).toContain("'room', v_room, 'seat', v_seat");
    expect(live).not.toContain("'hostSeat'");
    expect(live).toContain("'isComputer', rp.is_ai");
    expect(live).not.toContain("rp.is_computer");
    expect(live).not.toContain("rp.ai_policy_version");
    expect(live).toContain("p_room_id, upper(p_code), 'lobby', p_seat_id, '1.1.1', '1.1.1', 0");
    expect(live).toContain("to service_role");

    // Every room-authenticating RPC hands back the same envelope shape.
    for (const sql of [migration, createRoomSeatKeyMigration, createRoomSeatColumnsMigration, v111Migration]) {
      expect(sql).toMatch(/'room', v_room, 'seat', v_seat/);
    }
  });

  // PL/pgSQL resolves column names at run time, so a function selecting a column that
  // does not exist is created without complaint and raises on first call. That is how
  // `rp.is_computer` and `rp.ai_policy_version` reached production twice. Rebuild the
  // schema from the migrations and check every qualified reference against it.
  it("selects only columns that the migrations actually create", () => {
    const files = import.meta.glob("../supabase/migrations/*.sql", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;

    const columns = new Map<string, Set<string>>();
    const add = (table: string, column: string): void => {
      const existing = columns.get(table) ?? new Set<string>();
      existing.add(column);
      columns.set(table, existing);
    };
    const types = "uuid|text|boolean|smallint|bigint|integer|jsonb|timestamptz|numeric";
    for (const sql of Object.keys(files).sort().map((key) => files[key]!)) {
      for (const table of sql.matchAll(
        /create table (?:if not exists )?((?:public|private)\.\w+)\s*\(([\s\S]*?)\n\);/g,
      )) {
        for (const line of table[2]!.split("\n")) {
          const column = new RegExp(`^\\s*(\\w+)\\s+(?:${types})`).exec(line);
          if (column !== null) add(table[1]!, column[1]!);
        }
      }
      // A single ALTER may add several columns, so scan the whole statement.
      for (const alter of sql.matchAll(/alter table ((?:public|private)\.\w+)([\s\S]*?);/g)) {
        for (const column of alter[2]!.matchAll(/add column (?:if not exists )?(\w+)/g)) {
          add(alter[1]!, column[1]!);
        }
      }
    }

    expect(columns.get("public.room_players")).toContain("is_ai");
    expect(columns.get("public.room_players")?.has("is_computer")).toBe(false);
    expect(columns.get("public.room_players")?.has("ai_policy_version")).toBe(false);

    const aliases: Record<string, string> = {
      rp: "public.room_players",
      r: "public.rooms",
      ps: "private.private_submissions",
      ai: "private.room_ai_seats",
    };
    // Both of these are applied and therefore immutable, and 202608150002 supersedes
    // their server_create_room. The bad references stay recorded here rather than
    // hidden, so the exemption is visible and narrow.
    const supersededFiles = ["202608140001", "202608150001"];
    const supersededReferences = new Set(["rp.is_computer", "rp.ai_policy_version"]);

    const offenders: string[] = [];
    for (const [path, sql] of Object.entries(files)) {
      const name = path.slice(path.lastIndexOf("/") + 1);
      // Comments explain past mistakes by naming them, so scan executable SQL only.
      const executable = sql.replaceAll(/--[^\n]*/g, "");
      for (const reference of executable.matchAll(/\b(rp|r|ps|ai)\.(\w+)/g)) {
        const table = aliases[reference[1]!]!;
        const known = columns.get(table);
        if (known === undefined || known.has(reference[2]!)) continue;
        const qualified = `${reference[1]}.${reference[2]}`;
        const exempt = supersededFiles.some((prefix) => name.startsWith(prefix));
        if (exempt && supersededReferences.has(qualified)) continue;
        offenders.push(`${name}: ${qualified} is not a column of ${table}`);
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });

  it("keeps a server-side record when the function converts a throw into a 500", () => {
    // The client is deliberately told nothing beyond the code, so the operator's only
    // route to the cause is the function log. An empty catch erased it entirely.
    expect(edgeFunction).toMatch(/catch\s*\(\s*\w+\s*\)\s*\{/);
    expect(edgeFunction).toContain("console.error");
    expect(edgeFunction).toContain("INTERNAL_SERVER_ERROR");
    // The response body must still carry no diagnostic detail.
    expect(edgeFunction).not.toMatch(/error:\s*\{[^}]*stack/i);
  });

  it("stamps new rooms v1.1.4 and hard-cuts older started games", () => {
    expect(v114Migration).toContain("'1.1.1', '1.1.4'");
    expect(v114Migration).toContain("set rules_version = '1.1.4', content_version = '1.1.4'");
    expect(v114Migration).toContain("where status = 'lobby'");
    // Only unstarted lobbies move. A started pre-v1.1.4 board is never reinterpreted.
    expect(v114Migration).not.toMatch(/update public\.rooms[\s\S]{0,400}where status <> 'lobby'/);
    expect(v114Migration).toContain("values (p_room_id, upper(p_code), 'lobby', p_seat_id, '1.1.4', '1.1.4', 0)");
  });

  it("persists a Contribution card rather than a numeric bid, with no sealed Fuel Ledger", () => {
    expect(v114Migration).toContain("add column if not exists contribution_card text");
    expect(v114Migration).toContain("contribution_card in ('BANK', 'TEND', 'STOKE')");
    // Exactly one of the legacy amount and the card is present on any row.
    expect(v114Migration).toContain("num_nonnulls(contribution, contribution_card) = 1");
    expect(v114Migration).toContain("alter column contribution drop not null");
    expect(v114Migration).toContain("'card', ps.contribution_card");
    expect(v114Migration).toContain("room_id, window_id, player_id, command_id, contribution_card");
    expect(v114Migration).toContain("p_private_submission->>'card'");
    // v1.1.4 resolves Fuel Ledger after the reveal, so it is never sealed with the card.
    expect(v114Migration).not.toContain("useFuelLedger");
    expect(v114Migration).not.toContain("use_fuel_ledger");
  });

  it("promotes online computer seats to the v1.1.4 Contribution policy", () => {
    expect(onlineAiV114Migration).toContain("'rules-v1.1.4-contribution-001'");
    expect(onlineAiV114Migration).toContain("set policy_version = 'rules-v1.1.4-contribution-001'");
    expect(onlineAiV114Migration).toContain("where r.id = ai.room_id and r.status = 'lobby'");
    // Older values stay legal so stored rows still read, but are never dispatched.
    expect(onlineAiV114Migration).toContain("'selfplay-003', 'rules-v1.1.1-wood-001', 'rules-v1.1.4-contribution-001'");
  });

  /** Historical: the v1.0.9 migration's own shape, superseded by 202608220001. */
  it("persists Fuel Ledger with the sealed Wood submission", () => {
    expect(v109Migration).toContain("add column if not exists use_fuel_ledger boolean not null default false");
    expect(v109Migration).toContain("'useFuelLedger', ps.use_fuel_ledger");
    expect(v109Migration).toContain("contribution, use_fuel_ledger");
    expect(v109Migration).toContain("p_private_submission->>'useFuelLedger'");
  });

  it("ends sessions through a host-only service RPC and rejects late game commands", () => {
    expect(lifecycleMigration).toContain("'lobby', 'playing', 'finished', 'abandoned'");
    expect(lifecycleMigration).toContain("ended_at timestamptz");
    expect(lifecycleMigration).toContain("ended_by_player_id text");
    expect(lifecycleMigration).toContain("create or replace function public.server_end_session");
    expect(lifecycleMigration).toContain("v_room.host_seat_id <> p_host_seat_id");
    expect(lifecycleMigration).toContain("create trigger guard_active_session_command");
    expect(lifecycleMigration).toContain("v_status in ('finished', 'abandoned')");
    expect(lifecycleMigration).toContain("revoke all on function public.server_end_session");
    expect(lifecycleMigration).toContain("grant execute on function public.server_end_session");
    expect(lifecycleMigration).toContain("to service_role");
    expect(edgeFunction).toContain('case "end_session"');
  });

  it("deletes abandoned and finished sessions on bounded retention schedules", () => {
    expect(lifecycleMigration).toContain("create or replace function private.cleanup_expired_game_sessions");
    expect(lifecycleMigration).toContain("status = 'abandoned' and ended_at < now() - interval '7 days'");
    expect(lifecycleMigration).toContain("status = 'finished' and updated_at < now() - interval '30 days'");
    expect(lifecycleMigration).toContain("create extension if not exists pg_cron");
    expect(lifecycleMigration).toContain("kiln-opening-session-retention");
    expect(lifecycleMigration).toContain("select private.cleanup_expired_game_sessions();");
  });

  it("keeps V003 computer seats server-authoritative and their deterministic seeds private", () => {
    expect(onlineAiMigration).toContain("add column if not exists is_ai boolean not null default false");
    expect(onlineAiMigration).toContain("create table if not exists private.room_ai_seats");
    expect(onlineAiMigration).toContain("policy_version text not null check (policy_version = 'selfplay-003')");
    expect(onlineAiMigration).toContain("ai_seed bigint not null check (ai_seed between 0 and 4294967295)");
    expect(onlineAiMigration).toContain("alter table private.room_ai_seats enable row level security");
    expect(onlineAiMigration).toContain("revoke all on private.room_ai_seats from public, anon, authenticated");
    expect(onlineAiMigration).toContain("create or replace function public.server_add_computer_seat");
    expect(onlineAiMigration).toContain("create or replace function public.server_remove_computer_seat");
    expect(onlineAiMigration).toContain("v_room.host_seat_id <> p_host_seat_id");
    expect(onlineAiMigration).toContain("to service_role");
    expect(edgeFunction).toContain('case "add_computer"');
    expect(edgeFunction).toContain('case "remove_computer"');
    expect(edgeFunction).toContain('case "advance_computers"');
  });
});
