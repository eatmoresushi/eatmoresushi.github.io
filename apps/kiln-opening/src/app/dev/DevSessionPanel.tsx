/**
 * The dev session panel (A2, phase A only): create, join or resume a room, add and remove
 * computers, start, leave. The lobby stubs (`lobby/HomeScreen`, `LobbyScreen`, `EndedScreen`)
 * render it until B1 lands the real screens, so `npm run dev:local` → `/kiln-opening/next/` is
 * playable from the first phase A commit. Removed with the other dev tools in phase C1 at the
 * latest.
 *
 * It is a dev tool like `CanonicalMoveButton` and is gated the same way (`DEV_TOOLS_BUILD &&
 * useDevTools()`): it renders only in the dev server, vitest and `build:e2e` bundles, and a
 * production build drops it entirely (the deployed `next/` page shows the lobby placeholders until
 * B1 lands the real screens).
 *
 * Its text is English developer text. Its test-driver hooks are what `e2e/smoke.spec.ts` drives,
 * and the real lobby screens keep them: inputs `name="displayName"` and `name="roomCode"`;
 * buttons `data-action="create-room" | "join-room" | "resume" | "forget-seat" | "add-computer" |
 * "remove-computer" | "start-game" | "leave"`; the room code in `data-room-code`.
 */
import { useState } from "react";
import type { FormEvent } from "react";
import { DEV_TOOLS_BUILD, useDevTools, useSession } from "../state/hooks.ts";
import "./DevSessionPanel.css";

export interface DevSessionPanelProps {
  screen: "home" | "lobby" | "ended";
}

const MAX_SEATS = 4;
const MIN_SEATS = 2;

/** The panel, in dev-tool builds with dev tools on; nothing otherwise. */
export function DevSessionPanel({ screen }: DevSessionPanelProps) {
  const devTools = useDevTools();
  return DEV_TOOLS_BUILD && devTools ? <DevSessionPanelBody screen={screen} /> : null;
}

function DevSessionPanelBody({ screen }: DevSessionPanelProps) {
  const session = useSession();
  const [name, setName] = useState("Lin");
  const [code, setCode] = useState("");
  const busy = session.status.lobbyAction !== null;
  const error = session.status.error;
  const errorLine = error === null ? null : error.kind === "rule" ? error.error.code : error.code;

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || name.trim() === "") return;
    void session.create(name.trim());
  };

  return (
    <div className="dev-session" lang="en" translate="no" aria-busy={busy ? true : undefined}>
      {screen === "home" ? (
        <>
          <form className="dev-session-row" onSubmit={create}>
            <label className="dev-session-field">
              <span>Your name</span>
              <input name="displayName" value={name} autoComplete="nickname" onChange={(event) => setName(event.target.value)} />
            </label>
            <button type="submit" className="dev-session-button" data-action="create-room" aria-disabled={busy ? true : undefined}>
              Create room
            </button>
          </form>
          <form
            className="dev-session-row"
            onSubmit={(event) => {
              event.preventDefault();
              if (busy || code.trim() === "" || name.trim() === "") return;
              void session.join(code.trim(), name.trim());
            }}
          >
            <label className="dev-session-field">
              <span>Room code</span>
              <input name="roomCode" value={code} autoComplete="off" onChange={(event) => setCode(event.target.value)} />
            </label>
            <button type="submit" className="dev-session-button" data-action="join-room" aria-disabled={busy ? true : undefined}>
              Join room
            </button>
          </form>
          {session.savedRoomCode === null ? null : (
            <div className="dev-session-row">
              <span>Saved seat in room {session.savedRoomCode}</span>
              <button type="button" className="dev-session-button" data-action="resume" onClick={() => void session.resume(session.savedRoomCode ?? undefined)}>
                Resume
              </button>
              <button type="button" className="dev-session-button" data-action="forget-seat" onClick={() => session.forgetSeat(session.savedRoomCode ?? undefined)}>
                Forget seat
              </button>
            </div>
          )}
        </>
      ) : null}
      {screen === "lobby" && session.room !== null ? (
        <>
          <p className="dev-session-row">
            Room <strong data-room-code={session.room.code}>{session.room.code}</strong>
            {session.isHost ? " · you are the host" : ""}
          </p>
          <ol className="dev-session-seats">
            {session.seats.map((seat) => (
              <li key={seat.seatId} data-seat-index={seat.seatIndex} data-computer={seat.isComputer ? "" : undefined}>
                {seat.displayName}
                {seat.isComputer ? " (computer)" : ""}
                {seat.seatId === session.seat?.seatId ? " (you)" : ""}
                {seat.isComputer && session.isHost ? (
                  <button type="button" className="dev-session-button" data-action="remove-computer" onClick={() => void session.removeComputer(seat.seatId)}>
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ol>
          {session.isHost ? (
            <div className="dev-session-row">
              <button
                type="button"
                className="dev-session-button"
                data-action="add-computer"
                aria-disabled={busy || session.seats.length >= MAX_SEATS ? true : undefined}
                onClick={() => {
                  if (busy || session.seats.length >= MAX_SEATS) return;
                  void session.addComputer();
                }}
              >
                Add computer
              </button>
              <button
                type="button"
                className="dev-session-button"
                data-action="start-game"
                aria-disabled={busy || session.seats.length < MIN_SEATS ? true : undefined}
                onClick={() => {
                  if (busy || session.seats.length < MIN_SEATS) return;
                  void session.start();
                }}
              >
                Start game
              </button>
            </div>
          ) : (
            <p className="dev-session-row">Waiting for the host to start.</p>
          )}
        </>
      ) : null}
      {screen === "ended" ? <p className="dev-session-row">The host ended this session.</p> : null}
      {screen === "home" ? null : (
        <div className="dev-session-row">
          <button type="button" className="dev-session-button" data-action="leave" onClick={() => session.leave()}>
            Leave
          </button>
        </div>
      )}
      {errorLine === null ? null : (
        <p className="dev-session-error" data-error-code={errorLine}>
          {errorLine}
        </p>
      )}
    </div>
  );
}
