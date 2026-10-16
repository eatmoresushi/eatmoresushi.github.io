/**
 * EndedScreen (UI_V1.6.1_ARCHITECTURE §1.1, §4.2). Owner: B1 (shell, log, lobby).
 * Source: V1.4 `App.tsx` `EndedSessionScreen`: the host ended the session.
 *
 * Says who ended which room, that the game takes no more moves, and offers Return home (the
 * seat stays saved) or Forget this seat.
 */
import { useId } from "react";
import { useT } from "../i18n/I18nProvider.tsx";
import { Button } from "../kit/Button.tsx";
import { useSession } from "../state/hooks.ts";
import { LobbyFrame } from "./LobbyFrame.tsx";
import { actionHook } from "./driverHooks.ts";

export function EndedScreen() {
  const t = useT();
  const session = useSession();
  const id = useId();
  const room = session.room;
  const code = room?.code ?? "";
  const endedBy = room?.endedByPlayerId === null || room === null ? null : session.seats.find((seat) => seat.playerId === room.endedByPlayerId) ?? null;
  return (
    <LobbyFrame screen="ended" labelledBy={`${id}-title`}>
      <section className="lobby-card lobby-ended">
        <p className="lobby-eyebrow">{t("lobby.ended.eyebrow")}</p>
        <h1 id={`${id}-title`} className="lobby-title">
          {t("lobby.ended.title")}
        </h1>
        <p>{endedBy === null ? t("lobby.ended.byHost", { code }) : t("lobby.ended.by", { name: endedBy.displayName, code })}</p>
        <p className="lobby-note">{t("lobby.ended.noMoves")}</p>
        <div className="lobby-actions">
          <Button variant="primary" onClick={() => session.leave()} {...actionHook("return-home")}>
            {t("lobby.ended.home")}
          </Button>
          <Button variant="quiet" onClick={() => session.forgetSeat(code === "" ? undefined : code)} {...actionHook("forget-seat")}>
            {t("lobby.ended.forget")}
          </Button>
        </div>
      </section>
    </LobbyFrame>
  );
}
