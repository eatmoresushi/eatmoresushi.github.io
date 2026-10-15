/**
 * EndedScreen (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B1 (shell, log, lobby).
 * Source: V1.4 `App.tsx` `EndedSessionScreen`: the host ended the session.
 *
 * Phase A stub created by A2 (§4.3 rule 1): it has its final export name and props and renders
 * a `Placeholder` until its owner lands the component.
 *
 * Until then it also renders the dev session panel (`dev/DevSessionPanel.tsx`), so a room can be
 * created, filled with computers and started in `npm run dev:local`. Its test-driver hooks
 * (`name="displayName"`, `name="roomCode"`, `data-action="create-room" | "join-room" | "resume" |
 * "add-computer" | "start-game" | "leave"`) are what `e2e/smoke.spec.ts` drives; the real screen keeps them.
 */
import { DevSessionPanel } from "../dev/DevSessionPanel.tsx";
import { Placeholder } from "../screens/Placeholder.tsx";

export function EndedScreen() {
  return (
    <Placeholder name="EndedScreen">
      <DevSessionPanel screen="ended" />
    </Placeholder>
  );
}
