import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createGameApi } from "../multiplayer/client";
import type { GameApi } from "../multiplayer/client";
import type {
  AuthoritativeCommand,
  CommandSuccess,
  MultiplayerError,
  PublicEventRecord,
  RoomConnection,
} from "../multiplayer";
import { ORDER_DEFINITIONS, TECHNIQUE_DEFINITIONS } from "../game";
import { PlaytestExperience } from "./PlaytestExperience";

const LAST_SEAT_KEY = "kiln-opening:last-seat";

interface SavedSeat {
  roomCode: string;
  seatToken: string;
}

export function imperialOrderNotice(result: CommandSuccess): string | null {
  const completed = result.events.find(
    (event) => event.type === "ORDER_COMPLETED" && event.orderId.startsWith("I"),
  );
  if (completed?.type !== "ORDER_COMPLETED") return null;
  const player = result.game.players[result.actorId];
  const definition = ORDER_DEFINITIONS[completed.orderId];
  const parts = [`Player completed ${completed.orderId}. +${definition?.vp ?? 0} VP.`];
  const progress = result.events.find((event) => event.type === "IMPERIAL_PROGRESS_ADVANCED");
  if (progress?.type === "IMPERIAL_PROGRESS_ADVANCED") {
    const capped = progress.to - progress.from < progress.reward ? " (capped at space 5)" : "";
    parts.push(`Imperial Progress +${progress.reward}: ${progress.from} → ${progress.to}${capped}.`);
    if (progress.from < 1 && progress.to >= 1) parts.push("Local Renown reached. 1 Apprentice will unlock during Cleanup.");
    if (progress.from < 3 && progress.to >= 3) parts.push("Court Examination reached. 1 Apprentice will unlock during Cleanup.");
    if (progress.from < 4 && progress.to >= 4) parts.push("Awaiting Audience reached. You are now eligible for the Imperial Presentation.");
    if (progress.from < 5 && progress.to >= 5) {
      const claimed = result.events.some((event) => event.type === "IMPERIAL_SEAL_CLAIMED");
      parts.push(claimed
        ? "Imperial Audience reached. You claim the Imperial Seal: +2 VP at game end."
        : "Imperial Audience reached. The Imperial Seal has already been claimed.");
    }
  } else if (player?.imperialProgress === 5) {
    parts.push("Imperial Progress is already at the maximum space 5.");
  } else {
    parts.push("Imperial Progress could not advance.");
  }
  return parts.join(" ");
}

export function commandNotice(result: CommandSuccess): string | null {
  const order = result.events.find((event) => event.type === "ORDER_TAKEN");
  if (order?.type === "ORDER_TAKEN") {
    const deck = order.deck === "market" ? "Market" : "Imperial";
    return order.acquisition === "blind_top"
      ? `Blind ${deck} draw committed and revealed: ${order.orderId}.`
      : `Took face-up ${deck} Order ${order.orderId}.`;
  }
  const colour = result.events.find((event) => event.type === "COLOUR_SAMPLES_USED");
  if (colour?.type === "COLOUR_SAMPLES_USED") {
    const deck = colour.deck === "market" ? "Market" : "Imperial";
    return `Used Colour Samples: ${colour.bottomedOrderId} moved to the bottom of the ${deck} deck; ${colour.revealedOrderId ?? "no replacement"} was revealed.`;
  }
  const patronage = result.events.find((event) => event.type === "COURT_PATRONAGE_USED");
  if (patronage?.type === "COURT_PATRONAGE_USED") {
    return `Used Court Patronage: paid 5 Coins; Imperial Progress ${patronage.from} → ${patronage.to}.`;
  }
  const technique = result.events.find((event) => event.type === "TECHNIQUE_ACQUIRED");
  if (technique?.type === "TECHNIQUE_ACQUIRED") {
    return `Acquired ${TECHNIQUE_DEFINITIONS[technique.techniqueId]?.name ?? technique.techniqueId} for ${technique.cost} Coins.`;
  }
  return imperialOrderNotice(result);
}

function readSavedSeat(): SavedSeat | null {
  try {
    const value = localStorage.getItem(LAST_SEAT_KEY);
    return value === null ? null : JSON.parse(value) as SavedSeat;
  } catch {
    return null;
  }
}

function saveSeat(connection: RoomConnection): SavedSeat {
  const savedSeat = { roomCode: connection.room.code, seatToken: connection.seatToken };
  localStorage.setItem(
    LAST_SEAT_KEY,
    JSON.stringify(savedSeat),
  );
  return savedSeat;
}

function configurationApi(): { api: GameApi | null; message: string | null } {
  try {
    return { api: createGameApi(), message: null };
  } catch {
    return {
      api: null,
      message: "This deployment still needs its public Supabase URL and anonymous key.",
    };
  }
}

export function App() {
  const configured = useMemo(configurationApi, []);
  const api = configured.api;
  const [connection, setConnection] = useState<RoomConnection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MultiplayerError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [eventLog, setEventLog] = useState<PublicEventRecord[]>([]);
  const [confirmEndSession, setConfirmEndSession] = useState(false);
  const [savedSeat, setSavedSeat] = useState<SavedSeat | null>(() => readSavedSeat());
  const reconnecting = useRef(false);

  const applyCommand = useCallback((result: CommandSuccess) => {
    setConnection((current) => current === null ? current : {
      ...current,
      room: result.room,
      game: result.game,
      ownPendingContribution: result.ownPendingContribution,
    });
    setNotice(commandNotice(result));
  }, []);

  const reconnect = useCallback(async (saved?: SavedSeat, announce = false) => {
    if (api === null || reconnecting.current) return;
    const target = saved ?? (connection === null
      ? readSavedSeat()
      : { roomCode: connection.room.code, seatToken: connection.seatToken });
    if (target === null) return;
    reconnecting.current = true;
    try {
      const result = await api.reconnect(target.roomCode, target.seatToken);
      if (!result.ok) {
        if (saved !== undefined) {
          localStorage.removeItem(LAST_SEAT_KEY);
          setSavedSeat(null);
        }
        setError(result.error);
        return;
      }
      setConnection({
        ...result.value,
        seatToken: target.seatToken,
      });
      setSavedSeat(target);
      setError(null);
      if (announce) setNotice("Reconnected to the latest authoritative state.");
    } finally {
      reconnecting.current = false;
    }
  }, [api, connection]);

  useEffect(() => {
    const saved = readSavedSeat();
    if (saved !== null) void reconnect(saved);
    // Restore once on first render; subsequent refreshes use the saved credential.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  useEffect(() => {
    if (api === null || connection === null) return;
    return api.subscribe(connection.room.id, () => {
      void reconnect();
    });
  }, [api, connection?.room.id, reconnect]);

  useEffect(() => {
    if (api === null || connection?.game === null || connection === null) {
      setEventLog([]);
      return;
    }
    let active = true;
    void api.listPublicEvents(connection.room.id).then((events) => {
      if (active) setEventLog(events);
    });
    return () => {
      active = false;
    };
  }, [api, connection?.room.id, connection?.game?.eventSequence]);

  async function createRoom(displayName: string): Promise<void> {
    if (api === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.createRoom(displayName);
      if (!result.ok) setError(result.error);
      else {
        setSavedSeat(saveSeat(result.value));
        setConnection(result.value);
      }
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom(roomCode: string, displayName: string): Promise<void> {
    if (api === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.joinRoom(roomCode, displayName);
      if (!result.ok) setError(result.error);
      else {
        setSavedSeat(saveSeat(result.value));
        setConnection(result.value);
      }
    } finally {
      setBusy(false);
    }
  }

  async function startGame(): Promise<void> {
    if (api === null || connection === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.startGame(
        connection.room.code,
        connection.seatToken,
        crypto.randomUUID(),
      );
      if (!result.ok) setError(result.error);
      else applyCommand(result.value);
    } finally {
      setBusy(false);
    }
  }

  async function send(command: AuthoritativeCommand): Promise<boolean> {
    if (
      api === null ||
      connection?.game === null ||
      connection === null ||
      connection.room.status === "abandoned" ||
      connection.room.status === "finished"
    ) return false;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.executeCommand({
        roomCode: connection.room.code,
        seatToken: connection.seatToken,
        commandId: crypto.randomUUID(),
        expectedRevision: connection.game.revision,
        command,
      });
      if (!result.ok) {
        setError(result.error);
        if (result.error.code === "STALE_REVISION") await reconnect();
        return false;
      }
      applyCommand(result.value);
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function endSession(): Promise<void> {
    if (api === null || connection === null || !connection.seat.isHost) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.endSession(
        connection.room.code,
        connection.seatToken,
        crypto.randomUUID(),
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConnection((current) => current === null ? current : {
        ...current,
        room: result.value.room,
        ownPendingContribution: null,
      });
      setNotice(null);
      setConfirmEndSession(false);
    } finally {
      setBusy(false);
    }
  }

  function leaveView(): void {
    setConnection(null);
    setEventLog([]);
    setNotice(null);
    setError(null);
    setConfirmEndSession(false);
  }

  function forgetSeat(): void {
    localStorage.removeItem(LAST_SEAT_KEY);
    setSavedSeat(null);
    leaveView();
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to game controls</a>
      <header className="masthead">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="Kiln Opening home">
          <span className="brand-mark" aria-hidden="true">窑</span>
          <span><strong>Kiln Opening</strong><small>开窑 · Song workshop strategy</small></span>
        </a>
        {connection !== null && (
          <div className="room-meta">
            <span>Room <strong data-testid="room-code">{connection.room.code}</strong></span>
            <span className={`connection-dot status-${connection.room.status}`}>
              {connection.room.status === "abandoned"
                ? "Ended"
                : connection.room.status === "finished" ? "Complete" : "Live"}
            </span>
            <span
              className={`room-role ${connection.seat.isHost ? "is-host" : "is-guest"}`}
              title={connection.seat.isHost ? "You control this room" : "Only the room host can end the session"}
            >
              {connection.seat.isHost ? "Host" : "Guest"}
            </span>
            {connection.room.status !== "abandoned" && (
              <button className="text-button" type="button" onClick={() => void reconnect(undefined, true)} disabled={busy}>
                Reconnect
              </button>
            )}
            {connection.seat.isHost && (connection.room.status === "lobby" || connection.room.status === "playing") && (
              <button
                className="text-button end-session-button"
                type="button"
                onClick={() => setConfirmEndSession(true)}
                disabled={busy}
              >
                End session
              </button>
            )}
            <button className="text-button" type="button" onClick={leaveView}>Leave view</button>
          </div>
        )}
      </header>

      <main id="main-content">
        {configured.message !== null && (
          <div className="banner banner-warning" role="status">{configured.message}</div>
        )}
        {error !== null && (
          <div className="banner banner-error" role="alert">
            <strong>{error.code.replaceAll("_", " ")}</strong> {error.message}
          </div>
        )}
        {notice !== null && <div className="banner banner-info" role="status" aria-live="polite">{notice}</div>}
        {busy && <div className="progress-line" role="progressbar" aria-label="Waiting for server" />}

        {connection === null ? (
          <HomeScreen
            disabled={busy || api === null}
            onCreate={createRoom}
            onJoin={joinRoom}
            savedSeat={connection === null ? savedSeat : null}
            onResume={() => savedSeat === null ? undefined : void reconnect(savedSeat)}
            onForget={forgetSeat}
          />
        ) : connection.room.status === "abandoned" ? (
          <EndedSessionScreen connection={connection} onLeave={leaveView} onForget={forgetSeat} />
        ) : connection.game === null ? (
          <LobbyScreen connection={connection} busy={busy} onStart={startGame} />
        ) : (
          <PlaytestExperience
            game={connection.game}
            ownPlayerId={connection.seat.playerId}
            ownPendingContribution={connection.ownPendingContribution}
            events={eventLog}
            busy={busy}
            send={send}
          />
        )}
      </main>
      {confirmEndSession && connection !== null && (
        <EndSessionDialog
          roomCode={connection.room.code}
          busy={busy}
          onCancel={() => setConfirmEndSession(false)}
          onConfirm={endSession}
        />
      )}
      <footer className="site-footer">
        <span>Kiln Opening V1.0.2</span>
        <a href="https://luyuan.me/">Luyuan He</a>
      </footer>
    </div>
  );
}

function HomeScreen({
  disabled,
  onCreate,
  onJoin,
  savedSeat,
  onResume,
  onForget,
}: {
  disabled: boolean;
  onCreate: (displayName: string) => Promise<void>;
  onJoin: (roomCode: string, displayName: string) => Promise<void>;
  savedSeat: SavedSeat | null;
  onResume: () => void;
  onForget: () => void;
}) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [displayName, setDisplayName] = useState("");
  const [roomCode, setRoomCode] = useState("");

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (mode === "create") void onCreate(displayName);
    else void onJoin(roomCode, displayName);
  }

  return (
    <section className="home-screen">
      <div className="hero-copy">
        <p className="eyebrow">A strategic game of earth, glaze, and fire</p>
        <h1>Shape a workshop worthy of the imperial court.</h1>
        <p className="hero-lead">
          A synchronous 2–4 player adaptation of the medium-weight Euro game set among Song Dynasty ceramic workshops.
        </p>
        <div className="hero-facts" aria-label="Game summary">
          <span><strong>2–4</strong> players</span>
          <span><strong>5</strong> rounds</span>
          <span><strong>90–120</strong> minutes</span>
        </div>
      </div>
      <div className="entry-card">
        {savedSeat !== null && (
          <aside className="saved-session" aria-label="Saved session">
            <div>
              <span>Saved session</span>
              <strong>Room {savedSeat.roomCode}</strong>
            </div>
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={onResume} disabled={disabled}>Resume</button>
              <button className="text-button" type="button" onClick={onForget}>Forget seat</button>
            </div>
          </aside>
        )}
        <div className="segmented" role="tablist" aria-label="Room action">
          <button type="button" role="tab" aria-selected={mode === "create"} onClick={() => setMode("create")}>Create game</button>
          <button type="button" role="tab" aria-selected={mode === "join"} onClick={() => setMode("join")}>Join game</button>
        </div>
        <form onSubmit={submit}>
          {mode === "join" && (
            <label>Room code
              <input
                name="roomCode"
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                autoComplete="off"
                maxLength={6}
                required
              />
            </label>
          )}
          <label>Workshop name
            <input
              name="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="name"
              maxLength={40}
              placeholder="Your name"
              required
            />
          </label>
          <button className="primary-button full-width" type="submit" disabled={disabled}>
            {mode === "create" ? "Create a room" : "Join the workshop"}
          </button>
        </form>
        <p className="privacy-note">Your seat is restored on this device if the connection drops.</p>
      </div>
    </section>
  );
}

function EndedSessionScreen({
  connection,
  onLeave,
  onForget,
}: {
  connection: RoomConnection;
  onLeave: () => void;
  onForget: () => void;
}) {
  const endedBy = connection.seats.find(
    (seat) => seat.playerId === connection.room.endedByPlayerId,
  )?.displayName ?? "the host";
  return (
    <section className="session-ended" aria-labelledby="session-ended-title">
      <p className="eyebrow">Session closed</p>
      <h1 id="session-ended-title">This workshop session has ended.</h1>
      <p>
        {endedBy} ended room <strong>{connection.room.code}</strong> for everyone.
        The game can no longer accept actions.
      </p>
      <p className="muted">The session record is retained temporarily for recovery and debugging.</p>
      <div className="button-row">
        <button className="primary-button" type="button" onClick={onLeave}>Return home</button>
        <button className="secondary-button" type="button" onClick={onForget}>Forget this seat</button>
      </div>
    </section>
  );
}

function EndSessionDialog({
  roomCode,
  busy,
  onCancel,
  onConfirm,
}: {
  roomCode: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="end-session-title">
        <p className="eyebrow">Host action</p>
        <h2 id="end-session-title">End room {roomCode} for everyone?</h2>
        <p>All players will be removed from active play immediately. This cannot be undone.</p>
        <div className="button-row">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>Keep playing</button>
          <button className="danger-button" type="button" onClick={() => void onConfirm()} disabled={busy}>
            End session for everyone
          </button>
        </div>
      </section>
    </div>
  );
}

function LobbyScreen({
  connection,
  busy,
  onStart,
}: {
  connection: RoomConnection;
  busy: boolean;
  onStart: () => Promise<void>;
}) {
  return (
    <section className="lobby-screen">
      <div className="section-heading">
        <p className="eyebrow">Workshop gathering</p>
        <h1>Room {connection.room.code}</h1>
        <p>Share this six-character code. Seats stay attached to each player through refreshes and reconnects.</p>
      </div>
      <div className="seat-grid" aria-label="Players in lobby">
        {[0, 1, 2, 3].map((index) => {
          const seat = connection.seats.find((candidate) => candidate.seatIndex === index);
          return (
            <article className={`seat-card ${seat === undefined ? "seat-empty" : ""}`} key={index}>
              <span className={`seat-swatch colour-${seat?.colour ?? "empty"}`} aria-hidden="true" />
              <span className="seat-number">Seat {index + 1}</span>
              <strong>{seat?.displayName ?? "Open seat"}</strong>
              <small>{seat?.isHost ? "Host" : seat === undefined ? "Waiting" : "Connected"}</small>
            </article>
          );
        })}
      </div>
      <div className="lobby-actions">
        {connection.seat.isHost ? (
          <button
            className="primary-button"
            type="button"
            onClick={() => void onStart()}
            disabled={busy || connection.seats.length < 2}
          >
            Start with {connection.seats.length} players
          </button>
        ) : <p>Waiting for {connection.seats.find((seat) => seat.isHost)?.displayName ?? "the host"} to start…</p>}
      </div>
    </section>
  );
}
