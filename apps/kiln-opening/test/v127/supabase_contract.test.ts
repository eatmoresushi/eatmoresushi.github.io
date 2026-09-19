import { describe, expect, it } from "vitest";
import migration from "../../supabase/migrations/202609190001_v127_rules.sql?raw";
import strategicAiMigration from "../../supabase/migrations/202609190001_v127_rules.sql?raw";
import orderQueueMigration from "../../supabase/migrations/202609190001_v127_rules.sql?raw";
import supabaseStore from "../../supabase/functions/_shared/supabaseStore.ts?raw";

describe("V1.2.7 Supabase contract", () => {
  it("stamps new rooms and rejects old save schemas at both commit boundaries", () => {
    expect(migration).toContain("'1.2.7', '1.2.7', 0, p_content_digest");
    expect(migration).toContain("coalesce((p_state->>'schemaVersion')::integer, -1) <> 4");
    expect(migration).toContain("coalesce((p_public_state->>'schemaVersion')::integer, -1) <> 4");
    expect(migration).toContain("coalesce(p_next_state->>'rulesVersion', '') <> '1.2.7'");
    expect(migration).toContain("!~ '^r17-[0-9a-f]{16}$'");
    expect(migration).not.toMatch(/update public\.rooms[\s\S]{0,240}set rules_version = '1\.2\.6'/);
  });

  it("stores the Fuel Ledger commitment only in the private schema until reveal", () => {
    expect(migration).toContain("alter table private.private_submissions");
    expect(migration).toContain("add column if not exists use_fuel_ledger boolean not null default false");
    expect(migration).toContain("'useFuelLedger', ps.use_fuel_ledger");
    expect(migration).toContain("contribution_card, use_fuel_ledger");
    expect(migration).toContain("update private.private_submissions set revealed_revision = p_next_revision");
    expect(migration).not.toMatch(/public\.game_public_(?:states|events)[\s\S]{0,160}use_fuel_ledger/i);
    expect(supabaseStore).toContain("useFuelLedger: input.privateSubmission.useFuelLedger");
  });

  it("installs the current computer policy and keeps the function service-role-only", () => {
    expect(strategicAiMigration).toContain("'rules-v1.2.7-strategic-002'");
    expect(strategicAiMigration).toContain("create or replace function public.server_add_computer_seat");
    expect(strategicAiMigration).toContain("v_room.rules_version <> '1.2.7'");
    expect(strategicAiMigration).toContain(
      "p_seat_id, p_room_id, 'rules-v1.2.7-strategic-002', p_ai_seed, p_command_id",
    );
    expect(strategicAiMigration).not.toContain("update private.room_ai_seats");
    expect(strategicAiMigration).toContain(
      "revoke all on function public.server_add_computer_seat(uuid, uuid, uuid, text, bigint, uuid) from public, anon, authenticated",
    );
    expect(strategicAiMigration).toContain(
      "grant execute on function public.server_add_computer_seat(uuid, uuid, uuid, text, bigint, uuid) to service_role",
    );
  });

  it("requires the current behaviour fingerprint without rewriting old rooms", () => {
    expect(orderQueueMigration).toContain("'^r17-[0-9a-f]{16}$'");
    expect(orderQueueMigration).toContain("public.server_commit_start");
    expect(orderQueueMigration).toContain("public.server_commit_transition");
    expect(orderQueueMigration).not.toContain("set rules_version = '1.2.7'");
  });
});
