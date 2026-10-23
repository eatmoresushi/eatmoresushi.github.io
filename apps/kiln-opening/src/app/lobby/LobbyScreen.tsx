/**
 * LobbyScreen (UI_V1.6.1_ARCHITECTURE §1.1, §3.8, §4.2). Owner: B1 (shell, log, lobby).
 * Source: V1.4 `App.tsx` `LobbyScreen`: seats, add and remove computers, start with 2–4.
 *
 * - The room code to share (RoomBar), then every seat in seat order: taken seats show the
 *   player's name, "you", Host, or "Computer player" (the raw strategy version only in that
 *   seat's details, §3.8); open seats say so.
 * - The host adds and removes computer players and starts the game once enough players sit;
 *   the reason a control is unavailable is said next to it. A guest waits for the host.
 * - Leave keeps the seat saved on this device. The host may also end the session for everyone.
 * - Seat counts come from content (`RULE_NUMBERS`); the service decides what is allowed.
 */
import { useId, useState } from "react";
import { useT } from "../i18n/I18nProvider.tsx";
import { RULE_NUMBERS } from "../i18n/content.ts";
import { storedErrorText } from "../i18n/errors.ts";
import { Button } from "../kit/Button.tsx";
import { Disclosure } from "../kit/Disclosure.tsx";
import { useSession } from "../state/hooks.ts";
import type { CSSProperties } from "react";
import { EndSessionDialog } from "./EndSessionDialog.tsx";
import { LobbyFrame } from "./LobbyFrame.tsx";
import { RoomBar } from "./RoomBar.tsx";
import { actionHook, seatHook } from "./driverHooks.ts";

export function LobbyScreen() {
  const t = useT();
  const session = useSession();
  const id = useId();
  const [ending, setEnding] = useState(false);
  const room = session.room;
  const action = session.status.lobbyAction;
  const busy = action !== null;
  const seats = session.seats;
  const full = seats.length >= RULE_NUMBERS.playersMax;
  const enough = seats.length >= RULE_NUMBERS.playersMin;
  const host = seats.find((seat) => room !== null && seat.seatId === room.hostSeatId) ?? seats.find((seat) => seat.isHost) ?? null;
  const error = session.status.error;
  const titleId = `${id}-title`;
  const startNote = `${id}-start-note`;
  const addNote = `${id}-add-note`;

  return (
    <LobbyFrame screen="lobby" labelledBy={titleId}>
      <section className="lobby-room">
        <p className="lobby-eyebrow">{t("lobby.lobby.eyebrow")}</p>
        <h1 id={titleId} className="lobby-title">
          {t("lobby.lobby.title", { code: room?.code ?? "" })}
        </h1>
        <p className="lobby-note">{t("lobby.lobby.share")}</p>
        <RoomBar />
      </section>

      <section className="lobby-card" aria-labelledby={`${id}-seats`}>
        <h2 id={`${id}-seats`} className="lobby-card-title">
          {t("lobby.lobby.seatsLabel")}
        </h2>
        <ol className="lobby-seats">
          {Array.from({ length: RULE_NUMBERS.playersMax }, (_, index) => {
            const seat = seats.find((candidate) => candidate.seatIndex === index) ?? null;
            const style = { "--seat": `var(--seat-${index})` } as CSSProperties;
            if (seat === null) {
              return (
                <li key={`open-${index}`} className="lobby-seat" data-open="" style={style}>
                  <span className="lobby-seat-swatch" aria-hidden="true" />
                  <div className="lobby-seat-body">
                    <span className="lobby-seat-number">{t("lobby.lobby.seatN", { n: index + 1 })}</span>
                    <span className="lobby-seat-name lobby-seat-name--open">{t("lobby.lobby.openSeat")}</span>
                  </div>
                </li>
              );
            }
            const me = seat.seatId === session.seat?.seatId;
            const isHost = host !== null && seat.seatId === host.seatId;
            const policy = seat.isComputer ? seat.aiPolicyVersion : null;
            const removable = seat.isComputer && session.isHost;
            return (
              <li key={seat.seatId} className="lobby-seat" style={style} data-computer={seat.isComputer ? "" : undefined} {...seatHook(seat.seatIndex)}>
                <span className="lobby-seat-swatch" aria-hidden="true" />
                <div className="lobby-seat-body">
                  <span className="lobby-seat-number">{t("lobby.lobby.seatN", { n: index + 1 })}</span>
                  <span className="lobby-seat-name">
                    {me ? t("common.nameYou", { name: seat.displayName }) : seat.displayName}
                  </span>
                  <span className="lobby-seat-role">
                    {seat.isComputer ? t("lobby.lobby.computer") : isHost ? t("lobby.lobby.host") : t("lobby.lobby.player")}
                  </span>
                  {policy !== null || removable ? (
                    <div className="lobby-seat-actions">
                      {policy !== null ? (
                        <Disclosure className="lobby-seat-details" summary={t("common.kit.details")}>
                          <p className="lobby-note">{t("lobby.lobby.policy", { version: policy })}</p>
                        </Disclosure>
                      ) : null}
                      {removable ? (
                        <Button
                          variant="quiet"
                          size="sm"
                          className="lobby-seat-remove"
                          disabled={busy}
                          aria-label={t("lobby.lobby.removeName", { name: seat.displayName })}
                          onClick={() => {
                            if (!busy) void session.removeComputer(seat.seatId);
                          }}
                          {...actionHook("remove-computer")}
                        >
                          {t("lobby.lobby.remove")}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="lobby-card lobby-controls">
        {session.isHost ? (
          <>
            <div className="lobby-actions">
              <Button
                variant="secondary"
                disabled={busy || full}
                busy={action === "add_computer"}
                aria-describedby={full ? addNote : undefined}
                onClick={() => {
                  if (!busy && !full) void session.addComputer();
                }}
                {...actionHook("add-computer")}
              >
                {t("lobby.lobby.addComputer")}
              </Button>
              <Button
                variant="primary"
                disabled={busy || !enough}
                busy={action === "start"}
                aria-describedby={enough ? undefined : startNote}
                onClick={() => {
                  if (!busy && enough) void session.start();
                }}
                {...actionHook("start-game")}
              >
                {t("lobby.lobby.start", { n: seats.length })}
              </Button>
            </div>
            {full ? (
              <p id={addNote} className="lobby-note">
                {t("lobby.lobby.full")}
              </p>
            ) : null}
            {enough ? null : (
              <p id={startNote} className="lobby-note">
                {t("lobby.lobby.needPlayers", { min: RULE_NUMBERS.playersMin })}
              </p>
            )}
          </>
        ) : (
          <p className="lobby-waiting" role="status">
            {host === null ? t("lobby.lobby.waitingAnyHost") : t("lobby.lobby.waitingHost", { name: host.displayName })}
          </p>
        )}
        <div className="lobby-actions lobby-actions--secondary">
          <Button variant="quiet" disabled={busy} onClick={() => session.leave()} {...actionHook("leave")}>
            {t("lobby.lobby.leave")}
          </Button>
          {session.isHost ? (
            <Button variant="danger" size="sm" disabled={busy} onClick={() => setEnding(true)}>
              {t("lobby.lobby.endSession")}
            </Button>
          ) : null}
        </div>
        {error === null ? null : (
          <p className="lobby-error" role="alert">
            {storedErrorText(error, t)}
          </p>
        )}
      </section>
      {session.isHost ? <EndSessionDialog open={ending} onClose={() => setEnding(false)} /> : null}
    </LobbyFrame>
  );
}
