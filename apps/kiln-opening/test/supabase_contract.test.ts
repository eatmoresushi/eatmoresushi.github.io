import { describe, expect, it } from "vitest";
import migration from "../supabase/migrations/202608070001_multiplayer_backend.sql?raw";
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
});
