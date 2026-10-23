/**
 * Helpers for e2e specs that talk to the V1.6.1 local backend directly (UI plan §3.9,
 * §9.6): `tools/localBackendV161.ts`, mounted at `/test-api-v161` on the dev and preview
 * servers when `VITE_E2E_LOCAL_BACKEND=1`.
 *
 * The backend is one in-memory store per server process, so a spec resets it first and the
 * Playwright config runs specs one at a time.
 */

import type { APIRequestContext } from "@playwright/test";

/** Server-root path; the Vite `base` (`/kiln-opening/`) does not apply to the middleware. */
export const LOCAL_BACKEND_V161_PATH = "/test-api-v161";

export interface ResetOptions {
  /** The game seed (and every computer seat's seed). Default 720. */
  seed?: number;
  /** `canonical` for the short `@ci` game, `strategic` (default) otherwise. */
  policy?: "strategic" | "canonical";
}

/** Posts one operation, as `TestHttpGameApi` does. `user` sets `x-e2e-user`. */
export async function backendCall<T = unknown>(
  request: APIRequestContext,
  body: Record<string, unknown>,
  user = "e2e-driver",
): Promise<{ ok: true; value: T } | { ok: false; error: { code: string; message: string } }> {
  const response = await request.post(LOCAL_BACKEND_V161_PATH, {
    data: body,
    headers: { "x-e2e-user": user },
  });
  if (!response.ok()) throw new Error(`local backend HTTP ${response.status()}`);
  return (await response.json()) as { ok: true; value: T } | { ok: false; error: { code: string; message: string } };
}

/** A fresh store and service: `e2e_reset { seed, policy }`. */
export async function resetBackend(request: APIRequestContext, options: ResetOptions = {}): Promise<void> {
  const result = await backendCall(request, { operation: "e2e_reset", ...options });
  if (!result.ok) throw new Error(`e2e_reset failed: ${result.error.code}`);
}
