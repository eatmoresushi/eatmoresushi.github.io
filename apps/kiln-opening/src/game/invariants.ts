/**
 * State invariants for tests, development and the fuzz loop (DESIGN §8.3).
 *
 * STUB written by P0; owned by P7. Until P7 fills it in, `assertInvariants` is a no-op so
 * the dispatcher's invariant check (DESIGN §2.5 step 4) never blocks Phase 2 tests.
 */

import type { GameState } from "./types.ts";

export function assertInvariants(_state: GameState): void {
  // No-op until P7 lands.
}
