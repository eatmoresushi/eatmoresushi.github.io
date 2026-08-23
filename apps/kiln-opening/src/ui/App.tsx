import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createGameApi } from "../multiplayer/client";
import { computerPolicyLabel } from "../multiplayer/computerPlayer.ts";
import type { GameApi } from "../multiplayer/client";
import type {
  AuthoritativeCommand,
  CommandSuccess,
  MultiplayerError,
  PublicEventRecord,
  RoomConnection,
} from "../multiplayer";
import { ORDER_DEFINITIONS, TECHNIQUE_DEFINITIONS, currentDecisionActor } from "../game";
import { PlaytestExperience } from "./PlaytestExperience";
import { localizeMultiplayerError, useI18n } from "./i18n";
import type { Locale } from "./i18n";

const LAST_SEAT_KEY = "kiln-opening:last-seat";

interface SavedSeat {
  roomCode: string;
  seatToken: string;
}

export function imperialOrderNotice(result: CommandSuccess, locale: Locale = "en"): string | null {
  const completed = result.events.find(
    (event) => event.type === "ORDER_COMPLETED" && event.orderId.startsWith("I"),
  );
  if (completed?.type !== "ORDER_COMPLETED") return null;
  const player = result.game.players[result.actorId];
  const definition = ORDER_DEFINITIONS[completed.orderId];
  const parts = [locale === "zh-CN"
    ? `玩家完成了${completed.orderId}。+${definition?.vp ?? 0}分。`
    : `Player completed ${completed.orderId}. +${definition?.vp ?? 0} VP.`];
  const progress = result.events.find((event) => event.type === "IMPERIAL_PROGRESS_ADVANCED");
  if (progress?.type === "IMPERIAL_PROGRESS_ADVANCED") {
    const capped = progress.to - progress.from < progress.reward ? " (capped at space 5)" : "";
    parts.push(locale === "zh-CN"
      ? `御用进度+${progress.reward}：${progress.from} → ${progress.to}${progress.to - progress.from < progress.reward ? "（上限为5）" : ""}。`
      : `Imperial Progress +${progress.reward}: ${progress.from} → ${progress.to}${capped}.`);
    if (progress.from < 1 && progress.to >= 1) parts.push(locale === "zh-CN" ? "到达地方声望。1名学徒将在清理阶段解锁。" : "Local Renown reached. 1 Apprentice will unlock during Cleanup.");
    if (progress.from < 2 && progress.to >= 2) {
      parts.push(locale === "zh-CN"
        ? "到达州府举荐；终局展陈容量提升至2件。"
        : "Prefectural Recommendation reached. End-game Exhibition capacity increases to 2.");
    }
    if (progress.from < 3 && progress.to >= 3) parts.push(locale === "zh-CN" ? "到达入朝考核。1名学徒将在清理阶段解锁。" : "Court Examination reached. 1 Apprentice will unlock during Cleanup.");
    if (progress.from < 4 && progress.to >= 4) {
      parts.push(locale === "zh-CN"
        ? "到达候见天听；终局展陈容量提升至3件，并可获得多样性奖励。"
        : "Awaiting Audience reached. End-game Exhibition capacity increases to 3 with diversity bonuses.");
    }
    if (progress.from < 5 && progress.to >= 5) {
      const claimed = result.events.some((event) => event.type === "IMPERIAL_SEAL_CLAIMED");
      parts.push(locale === "zh-CN"
        ? claimed ? "到达御前召见。你获得御印：游戏结束时+2分。" : "到达御前召见。御印已被领取。"
        : claimed ? "Imperial Audience reached. You claim the Imperial Seal: +2 VP at game end." : "Imperial Audience reached. The Imperial Seal has already been claimed.");
    }
  } else if (player?.imperialProgress === 5) {
    parts.push(locale === "zh-CN" ? "御用进度已达到最高的5格。" : "Imperial Progress is already at the maximum space 5.");
  } else {
    parts.push(locale === "zh-CN" ? "御用进度无法前进。" : "Imperial Progress could not advance.");
  }
  return parts.join(" ");
}

export function commandNotice(result: CommandSuccess, locale: Locale = "en"): string | null {
  const order = result.events.find((event) => event.type === "ORDER_TAKEN");
  if (order?.type === "ORDER_TAKEN") {
    const deck = order.deck === "market" ? (locale === "zh-CN" ? "市场" : "Market") : (locale === "zh-CN" ? "御用" : "Imperial");
    return order.acquisition === "blind_top"
      ? locale === "zh-CN" ? `已确认并公开盲抽的${deck}订单：${order.orderId}。` : `Blind ${deck} draw committed and revealed: ${order.orderId}.`
      : locale === "zh-CN" ? `拿取正面的${deck}订单${order.orderId}。` : `Took face-up ${deck} Order ${order.orderId}.`;
  }
  const colour = result.events.find((event) => event.type === "COLOUR_SAMPLES_USED");
  if (colour?.type === "COLOUR_SAMPLES_USED") {
    const deck = colour.deck === "market" ? (locale === "zh-CN" ? "市场" : "Market") : (locale === "zh-CN" ? "御用" : "Imperial");
    return locale === "zh-CN"
      ? `使用釉色样本：拿取${colour.selectedOrderId ?? "1张订单"}；${colour.bottomedOrderId}移至${deck}订单牌堆底。`
      : `Used Colour Samples: took ${colour.selectedOrderId ?? "one Order"}; ${colour.bottomedOrderId} moved to the bottom of the ${deck} deck.`;
  }
  const patronage = result.events.find((event) => event.type === "COURT_PATRONAGE_USED");
  if (patronage?.type === "COURT_PATRONAGE_USED") {
    return locale === "zh-CN" ? `使用朝廷赞助：支付5铜钱；御用进度${patronage.from} → ${patronage.to}。` : `Used Court Patronage: paid 5 Coins; Imperial Progress ${patronage.from} → ${patronage.to}.`;
  }
  const technique = result.events.find((event) => event.type === "TECHNIQUE_ACQUIRED");
  if (technique?.type === "TECHNIQUE_ACQUIRED") {
    const definition = TECHNIQUE_DEFINITIONS[technique.techniqueId];
    return locale === "zh-CN"
      ? `以${technique.cost}铜钱获得${definition?.nameZh ?? technique.techniqueId}。`
      : `Acquired ${definition?.name ?? technique.techniqueId} for ${technique.cost} Coins.`;
  }
  return imperialOrderNotice(result, locale);
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
  const { locale, setLocale, t } = useI18n();
  const configured = useMemo(configurationApi, []);
  const api = configured.api;
  const [connection, setConnection] = useState<RoomConnection | null>(null);
  const [busy, setBusy] = useState(false);
  const [computerThinking, setComputerThinking] = useState(false);
  const [error, setError] = useState<MultiplayerError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [eventLog, setEventLog] = useState<PublicEventRecord[]>([]);
  const [confirmEndSession, setConfirmEndSession] = useState(false);
  const [savedSeat, setSavedSeat] = useState<SavedSeat | null>(() => readSavedSeat());
  const reconnecting = useRef(false);
  const advancingComputers = useRef(false);

  const applyCommand = useCallback((result: CommandSuccess) => {
    setConnection((current) => current === null ? current : {
      ...current,
      room: result.room,
      game: result.game,
      ownPendingContribution: result.ownPendingContribution,
      ownPrivateDecision: result.ownPrivateDecision,
    });
    setNotice(commandNotice(result, locale));
  }, [locale]);

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

  useEffect(() => {
    if (api === null || connection === null || connection.game === null || busy || advancingComputers.current) {
      return;
    }
    const phase = connection.game.phase;
    const actorId = phase.type === "firing_contributions" || phase.type === "presentation"
      ? phase.eligiblePlayerIds.find((id) => !phase.submittedPlayerIds.includes(id)) ?? null
      : currentDecisionActor(phase);
    const actorSeat = connection.seats.find((seat) => seat.playerId === actorId);
    if (actorSeat?.isComputer !== true) return;

    advancingComputers.current = true;
    setComputerThinking(true);
    setError(null);
    void api.advanceComputers(
      connection.room.code,
      connection.seatToken,
      connection.game.revision,
    ).then(async (result) => {
      if (!result.ok) {
        setError(result.error);
        if (result.error.code === "STALE_REVISION") await reconnect();
        return;
      }
      setConnection((current) => current === null ? current : {
        ...current,
        room: result.value.room,
        game: result.value.game,
        ownPendingContribution: result.value.ownPendingContribution,
        ownPrivateDecision: result.value.ownPrivateDecision,
      });
      if (result.value.advancedActions > 0) {
        const uniqueActors = new Set(result.value.actorIds).size;
        setNotice(uniqueActors === 1
          ? t("Computer player completed {count} actions.", { count: result.value.advancedActions })
          : t("Computer players completed {count} actions.", { count: result.value.advancedActions }));
      }
    }).finally(() => {
      advancingComputers.current = false;
      setComputerThinking(false);
    });
  }, [api, busy, computerThinking, connection, reconnect]);

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

  async function addComputer(): Promise<void> {
    if (api === null || connection === null || !connection.seat.isHost) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.addComputerSeat(
        connection.room.code,
        connection.seatToken,
        crypto.randomUUID(),
      );
      if (!result.ok) setError(result.error);
      else setConnection((current) => current === null ? current : {
        ...current,
        room: result.value.room,
        seats: result.value.seats,
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeComputer(computerSeatId: string): Promise<void> {
    if (api === null || connection === null || !connection.seat.isHost) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.removeComputerSeat(
        connection.room.code,
        connection.seatToken,
        computerSeatId,
      );
      if (!result.ok) setError(result.error);
      else setConnection((current) => current === null ? current : {
        ...current,
        room: result.value.room,
        seats: result.value.seats,
      });
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
      <a className="skip-link" href="#main-content">{t("Skip to game controls")}</a>
      <header className="masthead">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label={t("Kiln Opening")}>
          <span className="brand-mark" aria-hidden="true">窑</span>
          <span><strong>{t("Kiln Opening")}</strong><small>{locale === "zh-CN" ? "Kiln Opening" : "开窑"} · {t("Song workshop strategy")}</small></span>
        </a>
        <div className="language-toggle" role="group" aria-label="Language / 语言">
          <button type="button" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>EN</button>
          <button type="button" aria-pressed={locale === "zh-CN"} onClick={() => setLocale("zh-CN")}>中文</button>
        </div>
        {connection !== null && (
          <div className="room-meta">
            <span>{t("Room")} <strong data-testid="room-code">{connection.room.code}</strong></span>
            <span className={`connection-dot status-${connection.room.status}`}>
              {connection.room.status === "abandoned"
                ? t("Ended")
                : connection.room.status === "finished" ? t("Complete") : t("Live")}
            </span>
            <span
              className={`room-role ${connection.seat.isHost ? "is-host" : "is-guest"}`}
              title={connection.seat.isHost ? t("You control this room") : t("Only the room host can end the session")}
            >
              {connection.seat.isHost ? t("Host") : t("Guest")}
            </span>
            {connection.room.status !== "abandoned" && (
              <button className="text-button" type="button" onClick={() => void reconnect()} disabled={busy}>
                {t("Reconnect")}
              </button>
            )}
            {connection.seat.isHost && (connection.room.status === "lobby" || connection.room.status === "playing") && (
              <button
                className="text-button end-session-button"
                type="button"
                onClick={() => setConfirmEndSession(true)}
                disabled={busy}
              >
                {t("End session")}
              </button>
            )}
            <button className="text-button" type="button" onClick={leaveView}>{t("Leave view")}</button>
          </div>
        )}
      </header>

      <main id="main-content">
        {configured.message !== null && (
          <div className="banner banner-warning" role="status">{t(configured.message)}</div>
        )}
        {error !== null && (
          <div className="banner banner-error" role="alert">
            <strong>{locale === "zh-CN" ? t("Action could not be completed") : error.code.replaceAll("_", " ")}</strong> {localizeMultiplayerError(locale, error.code, error.message)}
          </div>
        )}
        {notice !== null && <div className="banner banner-info" role="status" aria-live="polite">{notice}</div>}
        {(busy || computerThinking) && <div className="progress-line" role="progressbar" aria-label={t("Waiting for server")} />}
        {computerThinking && (
          <div className="banner banner-info" role="status" aria-live="polite">{t("Computer is choosing…")}</div>
        )}

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
          <LobbyScreen
            connection={connection}
            busy={busy}
            onStart={startGame}
            onAddComputer={addComputer}
            onRemoveComputer={removeComputer}
          />
        ) : (
          <PlaytestExperience
            game={connection.game}
            ownPlayerId={connection.seat.playerId}
            ownPendingContribution={connection.ownPendingContribution}
            ownPrivateDecision={connection.ownPrivateDecision}
            events={eventLog}
            busy={busy || computerThinking}
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
        <span>{t("Kiln Opening")} V1.1.5</span>
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
  const { t } = useI18n();
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
        <p className="eyebrow">{t("A strategic game of earth, glaze, and fire")}</p>
        <h1>{t("Shape a workshop worthy of the imperial court.")}</h1>
        <p className="hero-lead">
          {t("A synchronous 2–4 player adaptation of the medium-weight Euro game set among Song Dynasty ceramic workshops.")}
        </p>
        <div className="hero-facts" aria-label={t("Game summary")}>
          <span><strong>2–4</strong> {t("players")}</span>
          <span><strong>5</strong> {t("rounds")}</span>
          <span><strong>90–120</strong> {t("minutes")}</span>
        </div>
      </div>
      <div className="entry-card">
        {savedSeat !== null && (
          <aside className="saved-session" aria-label={t("Saved session")}>
            <div>
              <span>{t("Saved session")}</span>
              <strong>{t("Room")} {savedSeat.roomCode}</strong>
            </div>
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={onResume} disabled={disabled}>{t("Resume")}</button>
              <button className="text-button" type="button" onClick={onForget}>{t("Forget seat")}</button>
            </div>
          </aside>
        )}
        <div className="segmented" role="tablist" aria-label={t("Room action")}>
          <button type="button" role="tab" aria-selected={mode === "create"} onClick={() => setMode("create")}>{t("Create game")}</button>
          <button type="button" role="tab" aria-selected={mode === "join"} onClick={() => setMode("join")}>{t("Join game")}</button>
        </div>
        <form onSubmit={submit}>
          {mode === "join" && (
            <label>{t("Room code")}
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
          <label>{t("Workshop name")}
            <input
              name="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="name"
              maxLength={40}
              placeholder={t("Your name")}
              required
            />
          </label>
          <button className="primary-button full-width" type="submit" disabled={disabled}>
            {mode === "create" ? t("Create a room") : t("Join the workshop")}
          </button>
        </form>
        <p className="privacy-note">{t("Your seat is restored on this device if the connection drops.")}</p>
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
  const { locale, t } = useI18n();
  const endedBy = connection.seats.find(
    (seat) => seat.playerId === connection.room.endedByPlayerId,
  )?.displayName ?? (locale === "zh-CN" ? "房主" : "the host");
  return (
    <section className="session-ended" aria-labelledby="session-ended-title">
      <p className="eyebrow">{t("Session closed")}</p>
      <h1 id="session-ended-title">{t("This workshop session has ended.")}</h1>
      <p>
        {locale === "zh-CN" ? <>{endedBy}已为所有人结束房间<strong>{connection.room.code}</strong>。</> : <>{endedBy} ended room <strong>{connection.room.code}</strong> for everyone.</>}
        {" "}{t("The game can no longer accept actions.")}
      </p>
      <p className="muted">{t("The session record is retained temporarily for recovery and debugging.")}</p>
      <div className="button-row">
        <button className="primary-button" type="button" onClick={onLeave}>{t("Return home")}</button>
        <button className="secondary-button" type="button" onClick={onForget}>{t("Forget this seat")}</button>
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
  const { locale, t } = useI18n();
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="end-session-title">
        <p className="eyebrow">{t("Host action")}</p>
        <h2 id="end-session-title">{locale === "zh-CN" ? `为所有人结束房间${roomCode}？` : `End room ${roomCode} for everyone?`}</h2>
        <p>{t("All players will be removed from active play immediately. This cannot be undone.")}</p>
        <div className="button-row">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>{t("Keep playing")}</button>
          <button className="danger-button" type="button" onClick={() => void onConfirm()} disabled={busy}>
            {t("End session for everyone")}
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
  onAddComputer,
  onRemoveComputer,
}: {
  connection: RoomConnection;
  busy: boolean;
  onStart: () => Promise<void>;
  onAddComputer: () => Promise<void>;
  onRemoveComputer: (computerSeatId: string) => Promise<void>;
}) {
  const { locale, t } = useI18n();
  return (
    <section className="lobby-screen">
      <div className="section-heading">
        <p className="eyebrow">{t("Workshop gathering")}</p>
        <h1>{t("Room")} {connection.room.code}</h1>
        <p>{t("Share this six-character code. Seats stay attached to each player through refreshes and reconnects.")}</p>
      </div>
      <div className="seat-grid" aria-label={t("Players in lobby")}>
        {[0, 1, 2, 3].map((index) => {
          const seat = connection.seats.find((candidate) => candidate.seatIndex === index);
          return (
            <article className={`seat-card ${seat === undefined ? "seat-empty" : ""}`} key={index}>
              <span className={`seat-swatch colour-${seat?.colour ?? "empty"}`} aria-hidden="true" />
              <span className="seat-number">{t("Seat")} {index + 1}</span>
              <strong>{seat?.displayName ?? t("Open seat")}</strong>
              <small>
                {seat?.isHost
                  ? t("Host")
                  : seat?.isComputer
                    ? `${t("Computer")} · ${computerPolicyLabel(seat.aiPolicyVersion)}`
                    : seat === undefined ? t("Waiting") : t("Connected")}
              </small>
              {connection.seat.isHost && seat?.isComputer === true && (
                <button
                  className="text-button remove-computer-button"
                  type="button"
                  disabled={busy}
                  onClick={() => void onRemoveComputer(seat.seatId)}
                >
                  {t("Remove")}
                </button>
              )}
            </article>
          );
        })}
      </div>
      <div className="lobby-actions">
        {connection.seat.isHost ? (
          <>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void onAddComputer()}
              disabled={busy || connection.seats.length >= 4}
            >
              {t("Add computer player")}
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => void onStart()}
              disabled={busy || connection.seats.length < 2}
            >
              {t("Start with {count} players", { count: connection.seats.length })}
            </button>
          </>
        ) : <p>{t("Waiting for {name} to start…", { name: connection.seats.find((seat) => seat.isHost)?.displayName ?? (locale === "zh-CN" ? "房主" : "the host") })}</p>}
      </div>
    </section>
  );
}
