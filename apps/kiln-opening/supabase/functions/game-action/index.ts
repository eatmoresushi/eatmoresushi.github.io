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

/**
 * Emit a complete MultiplayerError envelope. The client only accepts failures carrying
 * code, message, details and currentRevision; a bare `{ code }` was discarded there and
 * reported as a generic persistence conflict, which hid authentication and
 * configuration faults behind a misleading message. Messages stay operator-readable and
 * must never carry stack traces, command payloads, seat tokens or Contribution values.
 */
function failure(code: string, message: string, status: number): Response {
  return json({ ok: false, error: { code, message, details: {}, currentRevision: null } }, status);
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
  if (request.method !== "POST") {
    return failure("METHOD_NOT_ALLOWED", "The multiplayer endpoint accepts POST only.", 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (supabaseUrl === undefined || serviceRoleKey === undefined) {
    return failure(
      "SERVER_CONFIGURATION_ERROR",
      "The multiplayer function is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
      500,
    );
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
        if (authUserId === null) {
          return failure("AUTHENTICATION_FAILED", "The multiplayer session token was not accepted.", 401);
        }
        result = await service.createRoom({ displayName: String(body["displayName"] ?? ""), authUserId });
        break;
      }
      case "join_room": {
        const authUserId = await authenticatedUserId(request, supabaseUrl, serviceRoleKey);
        if (authUserId === null) {
          return failure("AUTHENTICATION_FAILED", "The multiplayer session token was not accepted.", 401);
        }
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
      case "add_computer":
        result = await service.addComputerSeat({
          roomCode: String(body["roomCode"] ?? ""),
          seatToken: String(body["seatToken"] ?? ""),
          commandId: String(body["commandId"] ?? ""),
        });
        break;
      case "remove_computer":
        result = await service.removeComputerSeat({
          roomCode: String(body["roomCode"] ?? ""),
          seatToken: String(body["seatToken"] ?? ""),
          computerSeatId: String(body["computerSeatId"] ?? ""),
        });
        break;
      case "advance_computers":
        result = await service.advanceComputerTurns({
          roomCode: String(body["roomCode"] ?? ""),
          seatToken: String(body["seatToken"] ?? ""),
          expectedRevision: Number(body["expectedRevision"]),
        });
        break;
      case "end_session":
        result = await service.endSession({
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
        return failure("INVALID_REQUEST", "Unknown operation.", 400);
    }
    const status = typeof result === "object" && result !== null && "ok" in result && result.ok === false ? 409 : 200;
    return json(result, status);
  } catch {
    // Never return stack traces, full command payloads, seat tokens, or private Contribution values.
    // The generic message is deliberate; the operator diagnoses the cause from the
    // function logs, but the client still receives a code it can name accurately.
    return failure(
      "INTERNAL_SERVER_ERROR",
      "The multiplayer function failed while handling the request.",
      500,
    );
  }
});
