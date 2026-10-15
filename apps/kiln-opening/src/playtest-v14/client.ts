import { FunctionsHttpError, createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlaytestSubmission, PlaytestSubmitResult } from "./types.ts";

let browserClient: SupabaseClient | null = null;

function configuredClient(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (url === undefined || anonKey === undefined) return null;
  browserClient ??= createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return browserClient;
}

async function functionError(error: FunctionsHttpError): Promise<PlaytestSubmitResult | null> {
  const context = error.context as { json?: () => Promise<unknown> };
  if (typeof context.json !== "function") return null;
  try {
    const value = await context.json();
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    if (record["ok"] !== false || typeof record["error"] !== "object" || record["error"] === null) {
      return null;
    }
    const failure = record["error"] as Record<string, unknown>;
    if (typeof failure["code"] !== "string" || typeof failure["message"] !== "string") return null;
    return { ok: false, code: failure["code"], message: failure["message"] };
  } catch {
    return null;
  }
}

export async function submitPlaytest(payload: PlaytestSubmission): Promise<PlaytestSubmitResult> {
  const client = configuredClient();
  if (client === null) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message: "This deployment is not connected to its playtest database yet.",
    };
  }

  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session === null) {
    const { error } = await client.auth.signInAnonymously();
    if (error !== null) {
      return { ok: false, code: "AUTHENTICATION_FAILED", message: "Could not start a secure submission session." };
    }
  }

  const { data, error } = await client.functions.invoke("playtest-submit", {
    body: { payload, website: "" },
  });
  if (error !== null) {
    if (error instanceof FunctionsHttpError) {
      const parsed = await functionError(error);
      if (parsed !== null) return parsed;
    }
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: "The playtest service could not be reached. Your draft is still saved on this device.",
    };
  }
  if (typeof data !== "object" || data === null || data.ok !== true || typeof data.gameId !== "string") {
    return { ok: false, code: "INVALID_RESPONSE", message: "The server returned an unexpected response." };
  }
  return { ok: true, gameId: data.gameId };
}
