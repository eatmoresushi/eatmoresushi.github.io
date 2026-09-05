import { validatePlaytestSubmission } from "../../../src/playtest/schema.ts";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};
const MAX_BODY_BYTES = 256_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function failure(code: string, message: string, status: number): Response {
  return json({ ok: false, error: { code, message } }, status);
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
    return failure("METHOD_NOT_ALLOWED", "The playtest endpoint accepts POST only.", 405);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return failure("PAYLOAD_TOO_LARGE", "This playtest record is too large to submit.", 413);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (supabaseUrl === undefined || serviceRoleKey === undefined) {
    return failure("SERVER_CONFIGURATION_ERROR", "The playtest service is not configured.", 500);
  }

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return failure("PAYLOAD_TOO_LARGE", "This playtest record is too large to submit.", 413);
    }
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return failure("INVALID_REQUEST", "The request body must be valid JSON.", 400);
    }
    if (!isRecord(parsedBody)) {
      return failure("INVALID_REQUEST", "The request body must be a JSON object.", 400);
    }
    const body = parsedBody;
    // A populated field is a bot signal. Return a generic success so it cannot tune around it.
    if (typeof body["website"] === "string" && body["website"].trim() !== "") {
      return json({ ok: true, gameId: "KO-RECEIVED" });
    }

    const authUserId = await authenticatedUserId(request, supabaseUrl, serviceRoleKey);
    if (authUserId === null) {
      return failure("AUTHENTICATION_FAILED", "The secure submission session was not accepted.", 401);
    }

    const validation = validatePlaytestSubmission(body["payload"]);
    if (!validation.ok) {
      return json({
        ok: false,
        error: {
          code: "INVALID_PLAYTEST",
          message: "Some playtest fields are missing or invalid.",
          issues: validation.issues.slice(0, 20),
        },
      }, 400);
    }

    const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/server_submit_playtest`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        p_payload: validation.value,
        p_submitter_auth_user_id: authUserId,
      }),
    });
    const rpcBody = await rpcResponse.json() as Record<string, unknown>;
    if (!rpcResponse.ok) {
      const databaseMessage = typeof rpcBody["message"] === "string" ? rpcBody["message"] : "";
      if (databaseMessage.includes("PLAYTEST_RATE_LIMIT")) {
        return failure("RATE_LIMITED", "Too many playtests were submitted from this session. Try again later.", 429);
      }
      console.error("playtest submission RPC failed", {
        code: rpcBody["code"],
        message: databaseMessage,
      });
      return failure("PERSISTENCE_ERROR", "The playtest could not be stored. Your local draft is unchanged.", 500);
    }
    if (typeof rpcBody["gameId"] !== "string") {
      return failure("INVALID_RESPONSE", "The playtest database returned an unexpected response.", 500);
    }
    return json({ ok: true, gameId: rpcBody["gameId"] });
  } catch (thrown) {
    console.error("playtest-submit failed", {
      error: thrown instanceof Error ? thrown.message : String(thrown),
    });
    return failure("INTERNAL_SERVER_ERROR", "The playtest service failed while handling the submission.", 500);
  }
});
