import { FunctionsHttpError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { parseMultiplayerFunctionFailure } from "../src/multiplayer/client";

describe("Supabase Edge Function failures", () => {
  it("preserves a typed rule failure returned with a non-2xx status", async () => {
    const failure = {
      ok: false as const,
      error: {
        code: "INVALID_SELECTION" as const,
        message: "Choose exactly 3 total Clay and Wood.",
        details: { clay: 3, wood: 1 },
        currentRevision: 5,
      },
    };
    const response = new Response(JSON.stringify(failure), {
      status: 409,
      headers: { "content-type": "application/json" },
    });

    await expect(parseMultiplayerFunctionFailure(new FunctionsHttpError(response))).resolves.toEqual(failure);
  });

  it("leaves network and malformed HTTP failures to the availability fallback", async () => {
    await expect(parseMultiplayerFunctionFailure(new Error("offline"))).resolves.toBeNull();
    await expect(
      parseMultiplayerFunctionFailure(
        new FunctionsHttpError(new Response("not json", { status: 500 })),
      ),
    ).resolves.toBeNull();
  });

  // A backend fault must never be reported as a persistence conflict: the operator has to
  // be able to tell an undeployed function, a missing service-role key and a rejected
  // session apart from a genuine revision conflict.
  it.each([
    ["AUTHENTICATION_FAILED", 401],
    ["SERVER_CONFIGURATION_ERROR", 500],
    ["INTERNAL_SERVER_ERROR", 500],
    ["METHOD_NOT_ALLOWED", 405],
  ] as const)("preserves a bare %s envelope from an older deployed function", async (code, status) => {
    const response = new Response(JSON.stringify({ ok: false, error: { code } }), {
      status,
      headers: { "content-type": "application/json" },
    });

    const parsed = await parseMultiplayerFunctionFailure(new FunctionsHttpError(response));

    expect(parsed?.error.code).toBe(code);
    expect(parsed?.error.code).not.toBe("PERSISTENCE_CONFLICT");
    expect(typeof parsed?.error.message).toBe("string");
    expect(parsed?.error.details).toEqual({});
    expect(parsed?.error.currentRevision).toBeNull();
  });

  it("ignores a JSON body that carries no usable error code", async () => {
    const bodies = [
      { ok: false, error: {} },
      { ok: false, error: { code: "" } },
      { ok: false },
      { ok: true, value: {} },
    ];
    for (const body of bodies) {
      const response = new Response(JSON.stringify(body), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
      await expect(
        parseMultiplayerFunctionFailure(new FunctionsHttpError(response)),
      ).resolves.toBeNull();
    }
  });
});
