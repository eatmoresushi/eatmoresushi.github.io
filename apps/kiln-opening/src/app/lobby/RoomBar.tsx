/**
 * RoomBar (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B1 (shell, log, lobby).
 * Source: V1.4 room bar: the room code (with a copy button) and the seat summary in the lobby.
 */
import { useState } from "react";
import { useT } from "../i18n/I18nProvider.tsx";
import { RULE_NUMBERS } from "../i18n/content.ts";
import { Button } from "../kit/Button.tsx";
import { copyText } from "../shell/SessionMenu.tsx";
import { useSession } from "../state/hooks.ts";
import { actionHook, roomCodeHook } from "./driverHooks.ts";

export function RoomBar() {
  const t = useT();
  const session = useSession();
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  const room = session.room;
  if (room === null) return null;
  const copy = () => {
    void copyText(room.code).then((ok) => setCopied(ok ? "yes" : "no"));
  };
  return (
    <div className="room-bar">
      <p className="room-bar-code">
        <span className="room-bar-label">{t("lobby.home.codeLabel")}</span>{" "}
        <strong className="room-bar-value" {...roomCodeHook(room.code)}>
          {room.code}
        </strong>
      </p>
      <Button variant="secondary" size="sm" onClick={copy} {...actionHook("copy-room-code")}>
        {t("lobby.lobby.copy")}
      </Button>
      <span className="room-bar-status" role="status">
        {copied === "yes" ? t("lobby.lobby.copied") : copied === "no" ? t("lobby.lobby.copyFailed", { code: room.code }) : ""}
      </span>
      <p className="room-bar-seats">{t("lobby.lobby.seatCount", { n: session.seats.length, max: RULE_NUMBERS.playersMax })}</p>
    </div>
  );
}
