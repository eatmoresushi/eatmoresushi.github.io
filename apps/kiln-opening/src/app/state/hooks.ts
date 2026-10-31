/**
 * The hook layer (UI_V1.6.1_ARCHITECTURE §3.3). Frozen after phase A; changes go through B6.
 *
 * Components read state only through these hooks. Every hook that reads an external store
 * calls `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)`, so
 * `renderToStaticMarkup` works (the harness test renders every hook).
 *
 * - `useSession()`: room, seats, seat, status and the lobby/session actions.
 * - `useLog()`: the game log (public records plus this seat's own secret ones) and the last
 *   batch of new public events with its origin, for `GameLog` and `LiveAnnouncer` (§4.1, §8.3).
 * - `useSnapshot()` / `useGameContext()`: the raw snapshot (it carries the raw `PlayerView`) and
 *   the provider's stores. **Only in `state/**`, `decision/**`, `dev/**` and `App.tsx`** (§2,
 *   checked by `import_boundaries.test.ts`); everyone else reads the hooks below.
 * - `useGame()` / `useModel(pick)`: the `GameModel` (no Fire-deck count, no firing context).
 * - `useEngineView()`: the raw `PlayerView` and `ActorView`. **Only in `decision/**`,
 *   `state/**` and `dev/**`** (§2, checked by `import_boundaries.test.ts`).
 * - `useDecision()`: the open window, its spec, sending state and errors, `validate`, `submit`,
 *   `resend`.
 * - `useDraft()`: the open window's draft and its dispatcher (§3.5).
 * - `useTableSelection()`: table targets derived from the draft, and `act` for table clicks.
 * - `useUi()`: board shown (D1), phone section, sheet, log, theme, and the §8.1 actions.
 * - `useLayoutMode()`: `desktop | tablet | phone | phone-landscape`, for event handlers.
 *
 * `useT()` is exported by `i18n/I18nProvider.tsx` (A3).
 *
 * `GameProvider` wires one `GameSource` (the live `SessionStore`, or a `FixtureGameSource`),
 * the window registry (`decision/windows.ts`, injected so `state/**` never imports
 * `decision/**`), the draft store, the UI store and the layout source.
 */

import { createContext, createElement, useCallback, useContext, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { AuthoritativeCommand, GameRuleError, PlayerId } from "../../game/index.ts";
import type { PublicRoom, PublicSeat } from "../../multiplayer/types.ts";
import { checkCommand } from "../session/fixtureSource.ts";
import type { EventBatch, GameSnapshot, GameSource, LogEntry, SessionStatus, StoredError, SubmitOutcome } from "../session/gameSource.ts";
import type { LobbyOutcome, SessionActions } from "../session/sessionStore.ts";
import { windowDraftKey } from "./decisionWindow.ts";
import type { DecisionWindow } from "./decisionWindow.ts";
import { DraftStore } from "./draftStore.ts";
import type { AnyWindowSpec, DraftAction, DraftActionBase, DraftModel, WindowRegistry } from "./draftStore.ts";
import { fixedLayoutSource } from "./layoutMode.ts";
import type { LayoutMode, LayoutSource } from "./layoutMode.ts";
import { engineViewOf, gameModelOf } from "./model.ts";
import type { EngineView, GameModel } from "./model.ts";
import { INERT_SELECTION, selectTable } from "./tableSelection.ts";
import type { TableAction, TableSelection } from "./tableSelection.ts";
import { UiStore } from "./uiStore.ts";
import type { UiActions, UiState } from "./uiStore.ts";

// ── Context ───────────────────────────────────────────────────────────────────────────────

export interface GameContextValue {
  source: GameSource;
  /** The lobby and session actions; null for a fixture (they then fail harmlessly). */
  session: SessionActions | null;
  registry: WindowRegistry;
  drafts: DraftStore;
  ui: UiStore;
  layout: LayoutSource;
  /** Dev tools (the canonical-move button): dev server and e2e builds only. */
  devTools: boolean;
}

const GameContext = createContext<GameContextValue | null>(null);

/**
 * Dev tools exist in the dev server, vitest and `build:e2e` bundles, never in a production build:
 * Vite replaces both values at build time, so a production bundle drops the dev code entirely.
 */
export const DEV_TOOLS_BUILD: boolean = import.meta.env.DEV || import.meta.env.VITE_E2E_LOCAL_BACKEND === "1";

/** The provider's default for `devTools`. */
export const DEV_TOOLS_DEFAULT: boolean = DEV_TOOLS_BUILD;

export interface GameProviderProps {
  source: GameSource;
  session?: SessionActions | null;
  registry: WindowRegistry;
  drafts?: DraftStore;
  ui?: UiStore;
  layout?: LayoutSource;
  devTools?: boolean;
  children?: ReactNode;
}

export function GameProvider({ source, session = null, registry, drafts, ui, layout, devTools = DEV_TOOLS_DEFAULT, children }: GameProviderProps) {
  const [ownDrafts] = useState(() => drafts ?? new DraftStore());
  const [ownLayout] = useState(() => layout ?? fixedLayoutSource("desktop"));
  const [ownUi] = useState(() => ui ?? new UiStore({ layout: ownLayout }));
  const value = useMemo<GameContextValue>(
    () => ({ source, session, registry, drafts: drafts ?? ownDrafts, ui: ui ?? ownUi, layout: layout ?? ownLayout, devTools }),
    [source, session, registry, drafts, ownDrafts, ui, ownUi, layout, ownLayout, devTools],
  );
  return createElement(GameContext.Provider, { value }, children);
}

/** The provider's value. Only in `state/**`, `decision/**`, `dev/**` and `App.tsx` (§2). */
export function useGameContext(): GameContextValue {
  const value = useContext(GameContext);
  if (value === null) throw new Error("Game hooks need a <GameProvider> above them.");
  return value;
}

// ── Snapshot ──────────────────────────────────────────────────────────────────────────────

/**
 * The source's current snapshot. It carries the raw `PlayerView`, so it is restricted like
 * `useEngineView`: only `state/**`, `decision/**`, `dev/**` and `App.tsx` (§2).
 */
export function useSnapshot(): GameSnapshot {
  const { source } = useGameContext();
  return useSyncExternalStore(source.subscribe, source.getSnapshot, source.getServerSnapshot);
}

// ── Session ───────────────────────────────────────────────────────────────────────────────

export interface SessionApi extends SessionActions {
  room: PublicRoom | null;
  seats: readonly PublicSeat[];
  seat: PublicSeat | null;
  status: SessionStatus;
  savedRoomCode: string | null;
  isHost: boolean;
  /** Reconnects now (Retry in the ConnectionBanner). */
  reconnect(): Promise<void>;
  /** Retries a latched computer turn (§3.8). */
  retryComputers(): void;
  /** Resends `status.unsent` ("Send again", §3.6). */
  resend(): Promise<SubmitOutcome>;
}

const UNAVAILABLE: LobbyOutcome = Object.freeze({ ok: false, error: { kind: "mp", code: "SERVICE_UNAVAILABLE" } }) as LobbyOutcome;

/** Lobby actions for a source without a session (fixtures, the gallery): they do nothing. */
export const NO_SESSION_ACTIONS: SessionActions = Object.freeze({
  restore: async () => null,
  create: async () => UNAVAILABLE,
  join: async () => UNAVAILABLE,
  resume: async () => UNAVAILABLE,
  start: async () => UNAVAILABLE,
  addComputer: async () => UNAVAILABLE,
  removeComputer: async () => UNAVAILABLE,
  endSession: async () => UNAVAILABLE,
  leave: () => undefined,
  forgetSeat: () => undefined,
  clearError: () => undefined,
});

export function useSession(): SessionApi {
  const { source, session } = useGameContext();
  const snapshot = useSnapshot();
  const actions = session ?? NO_SESSION_ACTIONS;
  return useMemo<SessionApi>(
    () => ({
      restore: () => actions.restore(),
      create: (name) => actions.create(name),
      join: (code, name) => actions.join(code, name),
      resume: (code) => actions.resume(code),
      start: () => actions.start(),
      addComputer: () => actions.addComputer(),
      removeComputer: (seatId) => actions.removeComputer(seatId),
      endSession: () => actions.endSession(),
      leave: () => actions.leave(),
      forgetSeat: (code) => actions.forgetSeat(code),
      clearError: () => actions.clearError(),
      room: snapshot.room,
      seats: snapshot.seats,
      seat: snapshot.seat,
      status: snapshot.status,
      savedRoomCode: snapshot.savedRoomCode,
      isHost: snapshot.seat !== null && snapshot.room !== null && snapshot.seat.seatId === snapshot.room.hostSeatId,
      reconnect: () => source.reconnect(),
      retryComputers: () => source.retryComputers(),
      resend: () => source.resend(),
    }),
    [actions, source, snapshot],
  );
}

// ── Log ───────────────────────────────────────────────────────────────────────────────────

export interface LogApi {
  /** Public records merged with this seat's own secret records, by sequence, oldest first. */
  log: readonly LogEntry[];
  /** The last batch of new public events and where it came from (§3.2, §8.3), or null. */
  lastBatch: EventBatch | null;
}

/** The game log and the last event batch, for `GameLog` and `LiveAnnouncer`. */
export function useLog(): LogApi {
  const snapshot = useSnapshot();
  const { log, lastBatch } = snapshot;
  return useMemo<LogApi>(() => ({ log, lastBatch }), [log, lastBatch]);
}

// ── Game model ────────────────────────────────────────────────────────────────────────────

/** The model, or null outside a game (home, lobby, a game still loading). */
export function useOptionalGame(): GameModel | null {
  const snapshot = useSnapshot();
  return snapshot.view === null ? null : gameModelOf(snapshot.view, snapshot.seats);
}

/** The model of the open game. Throws outside a game: render game components only in one. */
export function useGame(): GameModel {
  const model = useOptionalGame();
  if (model === null) throw new Error("useGame() needs an open game (snapshot.view is null).");
  return model;
}

/** One value of the model. */
export function useModel<T>(pick: (model: GameModel) => T): T {
  return pick(useGame());
}

/** The raw view. Only in `decision/**`, `state/**` and `dev/**` (§2). */
export function useEngineView(): EngineView {
  const snapshot = useSnapshot();
  if (snapshot.view === null) throw new Error("useEngineView() needs an open game (snapshot.view is null).");
  return engineViewOf(snapshot.view);
}

// ── Decision ──────────────────────────────────────────────────────────────────────────────

export interface DecisionApi {
  window: DecisionWindow;
  spec: AnyWindowSpec;
  /** A command is in flight; the form fields are inert and Confirm is busy (§3.6). */
  sending: boolean;
  /** A command whose outcome is unknown is waiting for "Send again". */
  unsent: boolean;
  /** The last rejection or failure, as a code (formatted at render time). */
  error: StoredError | null;
  /** The check ConfirmBar runs before sending (`validateAction`; Contribution affordability). */
  validate(command: AuthoritativeCommand): GameRuleError | null;
  submit(command: AuthoritativeCommand): Promise<SubmitOutcome>;
  resend(): Promise<SubmitOutcome>;
}

function specFor(registry: WindowRegistry, window: DecisionWindow): AnyWindowSpec {
  return registry[window.kind];
}

export function useDecision(): DecisionApi {
  const { source, registry, drafts } = useGameContext();
  const snapshot = useSnapshot();
  const view = snapshot.view;
  if (view === null) throw new Error("useDecision() needs an open game (snapshot.view is null).");
  const model = gameModelOf(view, snapshot.seats);
  const window = model.window;
  const validate = useCallback((command: AuthoritativeCommand) => checkCommand(view, command), [view]);
  const submit = useCallback(
    async (command: AuthoritativeCommand) => {
      const outcome = await source.submit(command);
      if (outcome.kind === "success") drafts.reset();
      return outcome;
    },
    [source, drafts],
  );
  const resend = useCallback(async () => {
    const outcome = await source.resend();
    if (outcome.kind === "success") drafts.reset();
    return outcome;
  }, [source, drafts]);
  return {
    window,
    spec: specFor(registry, window),
    sending: snapshot.status.sending,
    unsent: snapshot.status.unsent !== null,
    error: snapshot.status.error,
    validate,
    submit,
    resend,
  };
}

// ── Draft ─────────────────────────────────────────────────────────────────────────────────

/**
 * The open window's draft and its dispatcher. The type parameters are the window's own (a
 * window component knows which spec it belongs to).
 */
export function useDraft<D, A extends DraftActionBase = never>(): [D, (action: DraftAction<D, A>) => void] {
  const { registry, drafts, session } = useGameContext();
  const snapshot = useSnapshot();
  useSyncExternalStore(drafts.subscribe, drafts.getVersion, drafts.getVersion);
  const view = snapshot.view;
  if (view === null) throw new Error("useDraft() needs an open game (snapshot.view is null).");
  const model = gameModelOf(view, snapshot.seats);
  const engine = engineViewOf(view);
  const key = windowDraftKey(model.window);
  const spec = specFor(registry, model.window).draft as unknown as DraftModel<D, A, unknown>;
  const draft = drafts.read(key, spec, model, engine);
  const hasError = snapshot.status.error !== null;
  const dispatch = useCallback(
    (action: DraftAction<D, A>) => {
      drafts.dispatch(key, spec, model, engine, action);
      if (hasError) session?.clearError();
    },
    [drafts, key, spec, model, engine, hasError, session],
  );
  return [draft, dispatch];
}

// ── Table selection ───────────────────────────────────────────────────────────────────────

const INERT_TABLE: TableSelection = Object.freeze({ ...INERT_SELECTION, interactive: false, act: () => undefined });

/** Table targets from the open window's draft (§3.5); inert outside a game or without an adapter. */
export function useTableSelection(): TableSelection {
  const { registry, drafts, ui } = useGameContext();
  const snapshot = useSnapshot();
  useSyncExternalStore(drafts.subscribe, drafts.getVersion, drafts.getVersion);
  const view = snapshot.view;
  const model = view === null ? null : gameModelOf(view, snapshot.seats);
  const engine = view === null ? null : engineViewOf(view);
  const spec = model === null ? null : specFor(registry, model.window);
  const adapter = spec?.table;
  const key = model === null ? "" : windowDraftKey(model.window);
  const draft = model !== null && engine !== null && spec !== null && adapter !== undefined ? drafts.read(key, spec.draft, model, engine) : null;
  const data = model !== null && engine !== null && adapter !== undefined ? selectTable(adapter, draft, model, engine) : null;
  const act = useCallback(
    (action: TableAction) => {
      if (model === null || engine === null || spec === null || adapter === undefined) return;
      const current = drafts.read(key, spec.draft, model, engine);
      const next = adapter.act(current, action, model, engine);
      // A Place shortcut, a piece's own button (Sell, Deliver, Use: owner UI decision D21) or any
      // other target that brings the hidden pane up: like a chip (D14), it opens on phones, with
      // that choice for Confirm.
      const bringsPaneUp = next !== null && spec.pane?.(current, model, engine).hidden === true;
      const piece =
        next !== null &&
        (action.type === "sell" || action.type === "imperial_priority" || (action.type === "order" && selectTable(adapter, current, model, engine).orderTargets.get(action.key)?.state === "completable"));
      if (action.type === "place" || piece || bringsPaneUp) ui.actions.placeShortcut();
      if (next !== null) drafts.dispatch(key, spec.draft, model, engine, next);
    },
    [model, engine, spec, adapter, drafts, key, ui],
  );
  return useMemo<TableSelection>(() => (data === null ? INERT_TABLE : { ...data, interactive: true, act }), [data, act]);
}

// ── UI and layout ─────────────────────────────────────────────────────────────────────────

export function useUi(): UiState & UiActions {
  const { ui } = useGameContext();
  useSyncExternalStore(ui.subscribe, ui.getStored, ui.getStored);
  const model = useOptionalGame();
  const state = ui.stateFor({ window: model?.window ?? null, phase: model?.roundPhase ?? null });
  return useMemo(() => ({ ...state, ...ui.actions }), [state, ui]);
}

export function useLayoutMode(): LayoutMode {
  const { layout } = useGameContext();
  return useSyncExternalStore(layout.subscribe, layout.getSnapshot, layout.getServerSnapshot);
}

/** Whether the dev tools (canonical-move button) render: never in a production build. */
export function useDevTools(): boolean {
  const { devTools } = useGameContext();
  return DEV_TOOLS_BUILD && devTools;
}

/** The viewer's display name for a player ID ("you" is the caller's business). */
export function usePlayerName(): (playerId: PlayerId) => string {
  const model = useOptionalGame();
  return useCallback(
    (playerId: PlayerId) => model?.players.find((summary) => summary.playerId === playerId)?.displayName ?? "",
    [model],
  );
}
