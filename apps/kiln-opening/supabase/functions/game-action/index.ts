import { AuthoritativeGameService } from "../../../src/multiplayer/service.ts";
import { EdgeSecurityProvider } from "../_shared/security.ts";
import { SupabaseMultiplayerStore } from "../_shared/supabaseStore.ts";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

async function authenticatedUserId(
  request: Request,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<string | null> {
  const authorization = request.headers.get("authorization");
  if (authorization === null) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { authorization, apikey: serviceRoleKey },
  });
  if (!response.ok) return null;
  const user = await response.json() as { id?: string };
  return user.id ?? null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (supabaseUrl === undefined || serviceRoleKey === undefined) {
    return json({ ok: false, error: { code: "SERVER_CONFIGURATION_ERROR" } }, 500);
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const operation = body["operation"];
    const store = new SupabaseMultiplayerStore(supabaseUrl, serviceRoleKey);
    const service = new AuthoritativeGameService(store, new EdgeSecurityProvider());
    let result: unknown;
    switch (operation) {
      case "create_room": {
        const authUserId = await authenticatedUserId(request, supabaseUrl, serviceRoleKey);
        if (authUserId === null) return json({ ok: false, error: { code: "AUTHENTICATION_FAILED" } }, 401);
        result = await service.createRoom({ displayName: String(body["displayName"] ?? ""), authUserId });
        break;
      }
      case "join_room": {
        const authUserId = await authenticatedUserId(request, supabaseUrl, serviceRoleKey);
        if (authUserId === null) return json({ ok: false, error: { code: "AUTHENTICATION_FAILED" } }, 401);
        result = await service.joinRoom({
          roomCode: String(body["roomCode"] ?? ""),
          displayName: String(body["displayName"] ?? ""),
          authUserId,
        });
        break;
      }
      case "reconnect":
        result = await service.reconnect({
          roomCode: String(body["roomCode"] ?? ""),
          seatToken: String(body["seatToken"] ?? ""),
        });
        break;
      case "start_game":
        result = await service.startGame({
          roomCode: String(body["roomCode"] ?? ""),
          seatToken: String(body["seatToken"] ?? ""),
          commandId: String(body["commandId"] ?? ""),
        });
        break;
      case "game_action":
        result = await service.executeCommand({
          roomCode: String(body["roomCode"] ?? ""),
          seatToken: String(body["seatToken"] ?? ""),
          commandId: String(body["commandId"] ?? ""),
          expectedRevision: Number(body["expectedRevision"]),
          command: body["command"] as Parameters<AuthoritativeGameService["executeCommand"]>[0]["command"],
        });
        break;
      default:
        return json({ ok: false, error: { code: "INVALID_REQUEST", message: "Unknown operation." } }, 400);
    }
    const status = typeof result === "object" && result !== null && "ok" in result && result.ok === false ? 409 : 200;
    return json(result, status);
  } catch {
    // Never return stack traces, full command payloads, seat tokens, or private Contribution values.
    return json({ ok: false, error: { code: "INTERNAL_SERVER_ERROR" } }, 500);
  }
});
