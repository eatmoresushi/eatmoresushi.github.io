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
});
