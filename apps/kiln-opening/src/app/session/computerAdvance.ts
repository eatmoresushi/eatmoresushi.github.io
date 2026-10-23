/**
 * Computer-seat advancement for `SessionStore` (UI plan §3.8), ported from the V1.4
 * `App.tsx` `advanceComputerTurns` loop.
 *
 * - Routing: `shouldAdvanceComputers(game, seats)` from `client.ts`, which reads only
 *   `decisionPrompt(game).actorIds`; never a phase rule of its own.
 * - Host first: the host's client advances at once; any other client only if the same
 *   revision is still current after `NON_HOST_ADVANCE_DELAY_MS` (a host who left).
 * - One request at a time, with an `AbortController` and a 20s timeout.
 * - Another client winning the race (`STALE_REVISION`, `PERSISTENCE_CONFLICT`,
 *   `DUPLICATE_COMMAND`) reconnects without a latch or banner; `COMPUTER_TURN_FAILED`, a
 *   timeout or a transport error latches the failure for that revision.
 */

import type { GameApi } from "../../multiplayer/client.ts";
import type { ComputerAdvanceSuccess, MultiplayerError, MultiplayerErrorCode, MultiplayerResult } from "../../multiplayer/types.ts";

export const COMPUTER_TURN_TIMEOUT_MS = 20_000;
export const NON_HOST_ADVANCE_DELAY_MS = 2_000;

/** Time source, injectable for tests. */
export interface Clock {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const SYSTEM_CLOCK: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

/** Codes meaning another client advanced first: reconnect, no latch, no banner. */
export const COMPUTER_RACE_CODES: ReadonlySet<MultiplayerErrorCode> = new Set<MultiplayerErrorCode>([
  "STALE_REVISION",
  "PERSISTENCE_CONFLICT",
  "DUPLICATE_COMMAND",
]);

export type AdvanceOutcome =
  | { kind: "success"; value: ComputerAdvanceSuccess }
  | { kind: "race" }
  | { kind: "ended" }
  | { kind: "failed"; error: MultiplayerError; timedOut: boolean };

export function computerTurnTimeoutError(revision: number): MultiplayerError {
  return {
    code: "COMPUTER_TURN_FAILED",
    message: "The computer turn request timed out.",
    details: { reason: "timeout" },
    currentRevision: revision,
  };
}

export function transportError(operation: string): MultiplayerError {
  return {
    code: "SERVICE_UNAVAILABLE",
    message: `The multiplayer service could not be reached (${operation}).`,
    details: { operation },
    currentRevision: null,
  };
}

export function classifyAdvanceResult(result: MultiplayerResult<ComputerAdvanceSuccess>): AdvanceOutcome {
  if (result.ok) return { kind: "success", value: result.value };
  if (COMPUTER_RACE_CODES.has(result.error.code)) return { kind: "race" };
  if (result.error.code === "SESSION_ENDED") return { kind: "ended" };
  return { kind: "failed", error: result.error, timedOut: false };
}

/** The delay before this client advances computers at `revision` (§3.8 "host first"). */
export function advanceDelayMs(isHost: boolean): number {
  return isHost ? 0 : NON_HOST_ADVANCE_DELAY_MS;
}

/**
 * One `advance_computers` request with an abort and a timeout. Never throws: a thrown
 * transport error and a timeout become `failed`.
 */
export async function requestComputerAdvance(input: {
  api: Pick<GameApi, "advanceComputers">;
  roomCode: string;
  seatToken: string;
  expectedRevision: number;
  clock: Clock;
  timeoutMs?: number;
  controller?: AbortController;
}): Promise<AdvanceOutcome> {
  const controller = input.controller ?? new AbortController();
  const timeoutMs = input.timeoutMs ?? COMPUTER_TURN_TIMEOUT_MS;
  let timer: unknown = null;
  let timedOut = false;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = input.clock.setTimeout(() => {
      timedOut = true;
      controller.abort();
      resolve("timeout");
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([
      input.api.advanceComputers(input.roomCode, input.seatToken, input.expectedRevision, controller.signal),
      timeout,
    ]);
    if (result === "timeout" || timedOut) {
      return { kind: "failed", error: computerTurnTimeoutError(input.expectedRevision), timedOut: true };
    }
    return classifyAdvanceResult(result);
  } catch {
    if (timedOut) return { kind: "failed", error: computerTurnTimeoutError(input.expectedRevision), timedOut: true };
    return { kind: "failed", error: transportError("advance_computers"), timedOut: false };
  } finally {
    if (timer !== null) input.clock.clearTimeout(timer);
  }
}
