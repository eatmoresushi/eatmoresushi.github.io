/**
 * The e2e test-driver hooks of the lobby screens (UI_V1.6.1_ARCHITECTURE §9.6). Owner: B1.
 *
 * `e2e/smoke.spec.ts` and `test/v161/ui/app/canonical_game.test.tsx` drive the lobby through
 * `name="displayName"`, `name="roomCode"`, `data-action="create-room" | "join-room" | "resume" |
 * "forget-seat" | "add-computer" | "remove-computer" | "start-game" | "leave"`, `data-room-code`
 * and one `data-seat-index` per taken seat. Since change request CR-B1-3 (landed by B6, after the
 * kit Button fix CR-B1-4) the real controls carry every hook, once each (Playwright locators are
 * strict), with dev tools on and off; the phase A dev session panel is gone.
 */

/** Whether the real lobby screens carry the driver hooks (CR-B1-3: always, since B6 flipped it). */
export const REAL_LOBBY_HOOKS: boolean = true;

export type LobbyAction =
  | "create-room"
  | "join-room"
  | "resume"
  | "forget-seat"
  | "add-computer"
  | "remove-computer"
  | "start-game"
  | "leave"
  | "end-session"
  | "keep-playing"
  | "copy-room-code"
  | "return-home";

/** `data-action` for a real control, when the hooks are on. */
export function actionHook(action: LobbyAction): { "data-action"?: LobbyAction } {
  return REAL_LOBBY_HOOKS ? { "data-action": action } : {};
}

/** `name` for a real input, when the hooks are on (the field still has its label and id). */
export function nameHook(name: "displayName" | "roomCode"): { name?: string } {
  return REAL_LOBBY_HOOKS ? { name } : {};
}

/** `data-room-code` on the shown room code, when the hooks are on. */
export function roomCodeHook(code: string): { "data-room-code"?: string } {
  return REAL_LOBBY_HOOKS ? { "data-room-code": code } : {};
}

/** `data-seat-index` on a taken seat, when the hooks are on. */
export function seatHook(seatIndex: number): { "data-seat-index"?: number } {
  return REAL_LOBBY_HOOKS ? { "data-seat-index": seatIndex } : {};
}
