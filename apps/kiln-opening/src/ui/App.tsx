import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createGameApi } from "../multiplayer/client";
import type { GameApi } from "../multiplayer/client";
import type {
  AuthoritativeCommand,
  CommandSuccess,
  MultiplayerError,
  RoomConnection,
} from "../multiplayer";
import { ActionPanel } from "./ActionPanel";
import { GameTable } from "./GameTable";

const LAST_SEAT_KEY = "kiln-opening:last-seat";

interface SavedSeat {
  roomCode: string;
  seatToken: string;
}

function readSavedSeat(): SavedSeat | null {
  try {
    const value = localStorage.getItem(LAST_SEAT_KEY);
    return value === null ? null : JSON.parse(value) as SavedSeat;
  } catch {
    return null;
  }
}

function saveSeat(connection: RoomConnection): void {
  localStorage.setItem(
    LAST_SEAT_KEY,
    JSON.stringify({ roomCode: connection.room.code, seatToken: connection.seatToken }),
  );
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
  const reconnecting = useRef(false);

  const applyCommand = useCallback((result: CommandSuccess) => {
    setConnection((current) => current === null ? current : {
      ...current,
      room: result.room,
      game: result.game,
      ownPendingContribution: result.ownPendingContribution,
    });
  }, []);

  const reconnect = useCallback(async (saved?: SavedSeat) => {
    if (api === null || reconnecting.current) return;
    const target = saved ?? (connection === null
      ? readSavedSeat()
      : { roomCode: connection.room.code, seatToken: connection.seatToken });
    if (target === null) return;
    reconnecting.current = true;
    try {
      const result = await api.reconnect(target.roomCode, target.seatToken);
      if (!result.ok) {
        if (saved !== undefined) localStorage.removeItem(LAST_SEAT_KEY);
        setError(result.error);
        return;
      }
      setConnection({
        ...result.value,
        seatToken: target.seatToken,
      });
      setError(null);
      if (saved === undefined) setNotice("Reconnected to the latest authoritative state.");
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

  async function createRoom(displayName: string): Promise<void> {
    if (api === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.createRoom(displayName);
      if (!result.ok) setError(result.error);
      else {
        saveSeat(result.value);
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
        saveSeat(result.value);
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
    if (api === null || connection?.game === null || connection === null) return false;
    setBusy(true);
    setError(null);
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

  function leaveView(): void {
    localStorage.removeItem(LAST_SEAT_KEY);
    setConnection(null);
    setNotice(null);
    setError(null);
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
            <span className="connection-dot">Live</span>
            <button className="text-button" type="button" onClick={() => void reconnect()} disabled={busy}>
              Reconnect
            </button>
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
        {notice !== null && <div className="sr-only" role="status">{notice}</div>}
        {busy && <div className="progress-line" role="progressbar" aria-label="Waiting for server" />}

        {connection === null ? (
          <HomeScreen
            disabled={busy || api === null}
            onCreate={createRoom}
            onJoin={joinRoom}
          />
        ) : connection.game === null ? (
          <LobbyScreen connection={connection} busy={busy} onStart={startGame} />
        ) : (
          <div className="game-layout">
            <GameTable game={connection.game} ownPlayerId={connection.seat.playerId} />
            <ActionPanel
              game={connection.game}
              ownPlayerId={connection.seat.playerId}
              ownPendingContribution={connection.ownPendingContribution}
              busy={busy}
              send={send}
            />
          </div>
        )}
      </main>
      <footer className="site-footer">
        <span>Kiln Opening V0.4</span>
        <a href="https://luyuan.me/">Luyuan He</a>
      </footer>
    </div>
  );
}

function HomeScreen({
  disabled,
  onCreate,
  onJoin,
}: {
  disabled: boolean;
  onCreate: (displayName: string) => Promise<void>;
  onJoin: (roomCode: string, displayName: string) => Promise<void>;
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
