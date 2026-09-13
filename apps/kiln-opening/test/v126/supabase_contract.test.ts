import { describe, expect, it } from "vitest";
import migration from "../../supabase/migrations/202609100001_v126_rules.sql?raw";
import strategicAiMigration from "../../supabase/migrations/202609120001_v126_strategic_ai.sql?raw";
import orderQueueMigration from "../../supabase/migrations/202609130001_v126_order_queue.sql?raw";
import supabaseStore from "../../supabase/functions/_shared/supabaseStore.ts?raw";

describe("V1.2.6 Supabase contract", () => {
  it("stamps new rooms and rejects old save schemas at both commit boundaries", () => {
    expect(migration).toContain("'1.2.6', '1.2.6', 0, p_content_digest");
    expect(migration).toContain("coalesce((p_state->>'schemaVersion')::integer, -1) <> 4");
    expect(migration).toContain("coalesce((p_public_state->>'schemaVersion')::integer, -1) <> 4");
    expect(migration).toContain("coalesce(p_next_state->>'rulesVersion', '') <> '1.2.6'");
    expect(migration).toContain("!~ '^r14-[0-9a-f]{16}$'");
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
    expect(strategicAiMigration).toContain("'rules-v1.2.6-strategic-002'");
    expect(strategicAiMigration).toContain("create or replace function public.server_add_computer_seat");
    expect(strategicAiMigration).toContain("v_room.rules_version <> '1.2.6'");
    expect(strategicAiMigration).toContain(
      "p_seat_id, p_room_id, 'rules-v1.2.6-strategic-002', p_ai_seed, p_command_id",
    );
    expect(strategicAiMigration).toContain("room.status in ('lobby', 'playing')");
    expect(strategicAiMigration).toContain(
      "revoke all on function public.server_add_computer_seat(uuid, uuid, uuid, text, bigint, uuid) from public, anon, authenticated",
    );
    expect(strategicAiMigration).toContain(
      "grant execute on function public.server_add_computer_seat(uuid, uuid, uuid, text, bigint, uuid) to service_role",
    );
  });

  it("advances the V1.2.6 save boundary for the Main Order queue amendment", () => {
    expect(orderQueueMigration).toContain("'^r(14|15)-[0-9a-f]{16}$'");
    expect(orderQueueMigration).toContain("execute replace(v_definition, '^r14-', '^r15-')");
    expect(orderQueueMigration).toContain("public.server_add_computer_seat");
    expect(orderQueueMigration).toContain("public.server_create_room");
    expect(orderQueueMigration).toContain("public.server_commit_start");
    expect(orderQueueMigration).toContain("public.server_commit_transition");
  });
});
