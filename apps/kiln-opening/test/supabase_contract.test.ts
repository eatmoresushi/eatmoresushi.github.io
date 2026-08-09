import { describe, expect, it } from "vitest";
import migration from "../supabase/migrations/202608070001_multiplayer_backend.sql?raw";
import v05Migration from "../supabase/migrations/202608070002_v05_guild_rules.sql?raw";
import lifecycleMigration from "../supabase/migrations/202608080001_session_lifecycle.sql?raw";
import v061Migration from "../supabase/migrations/202608080002_v061_rules.sql?raw";
import v063Migration from "../supabase/migrations/202608080003_v063_rules.sql?raw";
import v065Migration from "../supabase/migrations/202608090001_v065_rules.sql?raw";
import v100Migration from "../supabase/migrations/202608090002_v100_rules.sql?raw";
import v101Migration from "../supabase/migrations/202608090003_v101_fire_deck.sql?raw";
import edgeFunction from "../supabase/functions/game-action/index.ts?raw";

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

  it("creates new rooms as V1.0.1 while preserving explicit legacy-room versioning", () => {
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
});
